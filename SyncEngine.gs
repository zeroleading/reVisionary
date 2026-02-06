/**
 * THE MASTER SYNC: Runs at 10 PM.
 */
function masterDailyUpdate() {
  checkAuth();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;

  const stats = generateDailyRegisters(); 
  rebuildFormsFromSheet(true); 

  console.log(`Master Update Complete: ${stats.registersSent} registers sent.`);
}

/**
 * MANUAL SYNC: Triggered via the "🛡️ Revision Admin" menu.
 */
function manualFormSync() {
  checkAuth();
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Manual Sync', 'This will publish all "Ready to publish" sessions and refresh the Google Forms. Proceed?', ui.ButtonSet.YES_NO);
  
  if (response == ui.Button.YES) {
    rebuildFormsFromSheet(false); 
    ui.alert('Sync Complete', 'Forms have been updated. Check "Execution Log" if items are missing.', ui.ButtonSet.OK);
  }
}

/**
 * CORE LOGIC: Reusable function to handle row statuses and Form rebuilding.
 */
function rebuildFormsFromSheet(handleNotifications) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < CONFIG.HEADER_ROW) {
    console.warn("Sheet is empty or only contains headers.");
    return;
  }

  const fullRange = sheet.getRange(CONFIG.HEADER_ROW, 1, lastRow - (CONFIG.HEADER_ROW - 1), sheet.getLastColumn());
  const data = fullRange.getValues();
  const headers = data.shift();

  const col = (name) => headers.indexOf(name);
  const statusIdx = col("Status");
  const yearIdx = col("Year group");
  const collections = { "Y11": {}, "Y13": {} };

  let foundCount = 0;

  data.forEach((row, index) => {
    let status = row[statusIdx];
    const year = row[yearIdx] ? row[yearIdx].toString().trim() : "";
    
    // Updated to lowercase "p"
    if (status === "Ready to publish") {
      status = "Published";
      row[statusIdx] = "Published";
    }

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

    if (status === "Published") {
      if (collections[year]) {
        foundCount++;
        const subject = row[col("Subject")];
        const parsedDate = parseBritishDate(row[col("Date")]);
        const displayDate = parsedDate ? parsedDate.toLocaleDateString('en-GB') : "TBC";
        const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();

        const sessionString = `${subject} - ${row[col("Revision topic")]} - ${row[col("Teacher")]} (${displayDate}, ${formatTime(row[col("Start")])}, ID:${row[col("sessionID")]})`;
        
        if (!collections[year][subject]) collections[year][subject] = [];
        collections[year][subject].push({ text: sessionString, sort: row[col("serialStart")] });
      } else {
        console.warn(`Row ${index + CONFIG.HEADER_ROW + 2}: Skipped. Invalid Year Group: "${year}"`);
      }
    }
  });

  console.log(`Sync Stats: Found ${foundCount} sessions to add to forms.`);

  const statusValues = data.map(row => [row[statusIdx]]);
  sheet.getRange(CONFIG.HEADER_ROW + 1, statusIdx + 1, data.length, 1).setValues(statusValues);

  for (let year in collections) {
    if (CONFIG.FORMS[year]) {
      for (let sub in collections[year]) {
        collections[year][sub].sort((a, b) => a.sort - b.sort);
      }
      updateSingleForm(CONFIG.FORMS[year], collections[year]);
    }
  }
}

function updateSingleForm(formId, subjectMap) {
  try {
    const form = FormApp.openById(formId);
    const items = form.getItems();
    items.forEach(item => form.deleteItem(item));

    const sortedSubjects = Object.keys(subjectMap).sort();

    if (sortedSubjects.length === 0) {
      form.addSectionHeaderItem()
        .setTitle("No Sessions Available")
        .setHelpText("There are currently no sessions published for this year group.");
      return;
    }

    // Page 1: Navigation
    const navItem = form.addMultipleChoiceItem()
      .setTitle("Which subject would you like to view sessions for?")
      .setRequired(true);

    const choices = [];
    sortedSubjects.forEach(subject => {
      // Create a section for each subject
      const section = form.addPageBreakItem().setTitle(subject);
      
      const checkboxItem = form.addCheckboxItem()
        .setTitle(`Available ${subject} Sessions`);
      
      const sessionChoices = subjectMap[subject].map(s => checkboxItem.createChoice(s.text));
      checkboxItem.setChoices(sessionChoices);

      // Add navigation at the bottom of the subject section
      const loopBackItem = form.addMultipleChoiceItem()
        .setTitle(`Have you finished picking sessions for ${subject}?`)
        .setRequired(true);

      loopBackItem.setChoices([
        loopBackItem.createChoice("I want to select another subject", FormApp.PageNavigationType.RESTART),
        loopBackItem.createChoice("No, I am finished and want to submit my choices", FormApp.PageNavigationType.SUBMIT)
      ]);
      
      choices.push(navItem.createChoice(subject, section));
    });

    navItem.setChoices(choices);
    console.log(`Successfully updated Form: ${form.getTitle()}`);
  } catch (e) { 
    console.error(`Form Sync Error: ${e.message}`); 
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
    const editUrl = row[4]; 

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

function logAudit(email, sessionId, action) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const audit = ss.getSheetByName(CONFIG.AUDIT_SHEET) || ss.insertSheet(CONFIG.AUDIT_SHEET);
  audit.appendRow([new Date(), email, sessionId, action]);
}
