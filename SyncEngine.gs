/**
 * THE MASTER SYNC: Runs at 10 PM.
 * Workflow: Registers -> Statuses -> Cancellation Emails -> Form Rebuild.
 */
function masterDailyUpdate() {
  checkAuth();
  const stats = generateDailyRegisters(); 
  rebuildFormsFromSheet(true); // true = handle cancellations and notifications
  console.log(`Master Update Complete: ${stats.registersSent} registers sent.`);
}

/**
 * MANUAL SYNC: Updates 'Ready to publish' sessions and refreshes forms immediately.
 */
function manualFormSync() {
  checkAuth();
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Manual Sync', 'This will publish "Ready to publish" sessions and refresh forms. Proceed?', ui.ButtonSet.YES_NO);
  
  if (response == ui.Button.YES) {
    rebuildFormsFromSheet(false); 
    ui.alert('Sync Complete', 'Forms updated.', ui.ButtonSet.OK);
  }
}

/**
 * CORE LOGIC: Processes row statuses and rebuilds the Google Forms.
 */
function rebuildFormsFromSheet(handleNotifications) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.HEADER_ROW) return;

  const fullRange = sheet.getRange(CONFIG.HEADER_ROW, 1, lastRow - (CONFIG.HEADER_ROW - 1), sheet.getLastColumn());
  const data = fullRange.getValues();
  const headers = data.shift();

  const col = (name) => headers.indexOf(name);
  const statusIdx = col("Status");
  const collections = { "Y11": {}, "Y13": {} };

  data.forEach((row) => {
    let status = row[statusIdx];
    const year = row[col("Year group")];
    
    // Check for lowercase 'p' in status
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

    if (status === "Published" && collections[year]) {
      const subject = row[col("Subject")];
      const parsedDate = parseBritishDate(row[col("Date")]);
      const displayDate = parsedDate ? parsedDate.toLocaleDateString('en-GB') : "TBC";
      const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();

      // FORMAT: 16/04/2026, 15:30 to 17:30 - topic with Teacher (ID:...)
      const sessionString = `${displayDate}, ${formatTime(row[col("Start")])} to ${formatTime(row[col("End")])} - ${row[col("Revision topic")]} with ${row[col("Teacher")]} (ID:${row[col("sessionID")]})`;
      
      if (!collections[year][subject]) collections[year][subject] = [];
      collections[year][subject].push({ text: sessionString, sort: row[col("serialStart")] });
    }
  });

  // Write back status updates
  const statusValues = data.map(row => [row[statusIdx]]);
  sheet.getRange(CONFIG.HEADER_ROW + 1, statusIdx + 1, data.length, 1).setValues(statusValues);

  // Rebuild Forms
  for (let year in collections) {
    if (CONFIG.FORMS[year]) {
      for (let sub in collections[year]) {
        collections[year][sub].sort((a, b) => a.sort - b.sort);
      }
      updateSingleForm(CONFIG.FORMS[year], collections[year]);
    }
  }
}

/**
 * Rebuilds the Form structure with navigation loops.
 */
function updateSingleForm(formId, subjectMap) {
  try {
    const form = FormApp.openById(formId);
    const items = form.getItems();
    items.forEach(item => form.deleteItem(item));

    const sortedSubjects = Object.keys(subjectMap).sort();
    if (sortedSubjects.length === 0) {
      form.addSectionHeaderItem().setTitle("No Sessions Available").setHelpText("Please check back later.");
      return;
    }

    const navItem = form.addMultipleChoiceItem().setTitle("Which subject would you like to view?").setRequired(true);
    const choices = [];

    sortedSubjects.forEach(subject => {
      const section = form.addPageBreakItem().setTitle(subject);
      const checkboxItem = form.addCheckboxItem().setTitle(`Available ${subject} Sessions`);
      checkboxItem.setChoices(subjectMap[subject].map(s => checkboxItem.createChoice(s.text)));

      // Add navigation loop back to menu or submit
      const loopBackItem = form.addMultipleChoiceItem().setTitle(`Finished with ${subject}?`).setRequired(true);
      loopBackItem.setChoices([
        loopBackItem.createChoice("Select another subject", FormApp.PageNavigationType.RESTART),
        loopBackItem.createChoice("Finish and Submit", FormApp.PageNavigationType.SUBMIT)
      ]);
      
      choices.push(navItem.createChoice(subject, section));
    });
    navItem.setChoices(choices);
  } catch (e) { console.error(`Form Error: ${e.message}`); }
}

function performCancellationNotifications(sessionId, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  if (!bSheet) return 0;
  const bData = bSheet.getDataRange().getValues();
  bData.shift();
  const affected = bData.filter(row => row[2].toString() === sessionId);
  let count = 0;

  affected.forEach(row => {
    const body = `Hi,\n\nThe session "${details.subject}: ${details.topic}" on ${details.date} is CANCELLED.\n\nYou can update your choices to pick a replacement using your edit link here: ${row[4]}`;
    try {
      MailApp.sendEmail(row[1], `CANCELLED: ${details.subject}`, body);
      count++;
    } catch (e) {}
  });
  return count;
}
