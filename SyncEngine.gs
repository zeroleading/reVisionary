/**
 * THE MASTER SYNC: Runs at 10 PM.
 * Executes full workflow: Registers -> Statuses -> Cancellation Emails -> Forms.
 */
function masterDailyUpdate() {
  checkAuth();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;

  // 1. Generate Registers for tomorrow (Updates statuses to 'Register Created')
  const stats = generateDailyRegisters(); 

  // 2. Run the Core Sync Logic (Ready -> Published, Notify Cancellations, Rebuild Forms)
  rebuildFormsFromSheet(true); // true = include cancellation notifications

  // 3. Admin Summary (Optional helper function to notify you)
  // sendAdminSummary(stats.registersSent, stats.studentsNotified);
  console.log(`Master Update Complete: ${stats.registersSent} registers sent.`);
}

/**
 * MANUAL SYNC: Triggered via the "🛡️ Revision Admin" menu.
 * Only updates 'Ready' sessions and refreshes forms.
 */
function manualFormSync() {
  checkAuth();
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Manual Sync', 'This will publish all "Ready" sessions and refresh the Google Forms immediately. Proceed?', ui.ButtonSet.YES_NO);
  
  if (response == ui.Button.YES) {
    rebuildFormsFromSheet(false); // false = skip cancellation emails for mid-day manual syncs
    ui.alert('Sync Complete', 'Forms have been updated.', ui.ButtonSet.OK);
  }
}

/**
 * CORE LOGIC: Reusable function to handle row statuses and Form rebuilding.
 * @param {boolean} handleNotifications Whether to process cancellations.
 */
function rebuildFormsFromSheet(handleNotifications) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const fullRange = sheet.getRange(CONFIG.HEADER_ROW, 1, lastRow - (CONFIG.HEADER_ROW - 1), sheet.getLastColumn());
  const data = fullRange.getValues();
  const headers = data.shift();

  const col = (name) => headers.indexOf(name);
  const statusIdx = col("Status");
  const collections = { "Y11": {}, "Y13": {} };

  data.forEach((row) => {
    let status = row[statusIdx];
    const year = row[col("Year group")];
    
    // Logic: Ready -> Published
    if (status === "Ready to Publish") {
      status = "Published";
      row[statusIdx] = "Published";
    }

    // Logic: Cancellation Check (Option B)
    if (handleNotifications && status === "Cancelled") {
      const sessionId = row[col("sessionID")].toString();
      const sessionDetails = {
        subject: row[col("Subject")],
        topic: row[col("Revision topic")],
        date: parseBritishDate(row[col("Date")]).toLocaleDateString('en-GB')
      };
      
      const notifyCount = performCancellationNotifications(sessionId, sessionDetails);
      row[statusIdx] = `Cancelled (${notifyCount} Notified)`;
      status = row[statusIdx];
    }

    // Populate Collections ONLY for Published sessions
    // Note: 'Register Created' and 'Cancelled' sessions are filtered out here
    if (status === "Published" && collections[year]) {
      const subject = row[col("Subject")];
      const parsedDate = parseBritishDate(row[col("Date")]);
      const displayDate = parsedDate ? parsedDate.toLocaleDateString('en-GB') : "TBC";
      const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();

      const sessionString = `${subject} - ${row[col("Revision topic")]} - ${row[col("Teacher")]} (${displayDate}, ${formatTime(row[col("Start")])}, ID:${row[col("sessionID")]})`;
      
      if (!collections[year][subject]) collections[year][subject] = [];
      collections[year][subject].push({ text: sessionString, sort: row[col("serialStart")] });
    }
  });

  // Step 3: Write all Status updates back to the sheet in one batch
  const statusValues = data.map(row => [row[statusIdx]]);
  sheet.getRange(CONFIG.HEADER_ROW + 1, statusIdx + 1, data.length, 1).setValues(statusValues);

  // Step 4: Update the Google Forms
  for (let year in collections) {
    if (CONFIG.FORMS[year]) {
      // Sort sessions by the serialStart value
      for (let sub in collections[year]) {
        collections[year][sub].sort((a, b) => a.sort - b.sort);
      }
      updateSingleForm(CONFIG.FORMS[year], collections[year]);
    }
  }
}

/**
 * Rebuilds the physical structure of a Google Form.
 */
function updateSingleForm(formId, subjectMap) {
  try {
    const form = FormApp.openById(formId);
    const items = form.getItems();
    
    // Clear the form
    items.forEach(item => form.deleteItem(item));

    // Create Navigation
    const navItem = form.addMultipleChoiceItem()
      .setTitle("Which subject would you like to view sessions for?")
      .setRequired(true);

    const sortedSubjects = Object.keys(subjectMap).sort();
    const choices = [];

    // Create a Section/Page for each Subject
    sortedSubjects.forEach(subject => {
      const section = form.addPageBreakItem().setTitle(subject);
      form.addCheckboxItem()
        .setTitle(`Available ${subject} Sessions`)
        .setChoices(subjectMap[subject].map(s => form.createChoice(s.text)));
      
      choices.push(navItem.createChoice(subject, section));
    });

    navItem.setChoices(choices);
  } catch (e) { 
    console.error(`Form Sync Error for ${formId}: ${e.message}`); 
  }
}

/**
 * Finds affected students and sends cancellation emails with Edit Links.
 */
function performCancellationNotifications(sessionId, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  if (!bSheet) return 0;

  const bData = bSheet.getDataRange().getValues();
  bData.shift();

  const affected = bData.filter(row => row[2].toString() === sessionId);
  let count = 0;

  affected.forEach(row => {
    const email = row[1];
    const editUrl = row[4]; // Saved Edit URL from Bookings Column 5

    const subject = `IMPORTANT: Session Cancellation - ${details.subject}`;
    const body = `Hi,\n\n` +
                 `Please be aware that the following revision session has been cancelled:\n` +
                 `- ${details.subject}: ${details.topic} (${details.date})\n\n` +
                 `If you would like to choose an alternative session, you can update your choices here:\n` +
                 `${editUrl}\n\n` +
                 `Best regards,\nSchool Revision Team`;

    try {
      MailApp.sendEmail(email, subject, body);
      logAudit(email, sessionId, "Cancellation Notified");
      count++;
    } catch (e) {
      console.error(`Failed to notify ${email}: ${e.message}`);
    }
  });

  return count;
}

/**
 * Simple audit logger for notifications.
 */
function logAudit(email, sessionId, action) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const audit = ss.getSheetByName(CONFIG.AUDIT_SHEET) || ss.insertSheet(CONFIG.AUDIT_SHEET);
  audit.appendRow([new Date(), email, sessionId, action]);
}
