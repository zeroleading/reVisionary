/**
 * THE MASTER SYNC: Runs at 10 PM.
 */
function masterDailyUpdate() {
  checkAuth();
  const stats = generateDailyRegisters(); 
  rebuildFormsFromSheet(true); 
  console.log(`Master Update Complete: ${stats.registersSent} registers sent.`);
}

/**
 * MANUAL SYNC: Updates 'Ready to publish' sessions and refreshes forms immediately.
 */
function manualFormSync() {
  checkAuth();
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Manual Sync', 'This will publish "Ready to publish" sessions, process "Cancelled" sessions, and refresh forms. Proceed?', ui.ButtonSet.YES_NO);
  
  if (response == ui.Button.YES) {
    rebuildFormsFromSheet(true); 
    ui.alert('Sync Complete', 'Forms updated and notifications sent.', ui.ButtonSet.OK);
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
  const notifiedIdx = col("notifiedCount");
  const collections = { "Y11": {}, "Y13": {} };

  data.forEach((row) => {
    let status = row[statusIdx];
    const year = row[col("Year group")];
    
    if (status === "Ready to publish") {
      status = "Published";
      row[statusIdx] = "Published";
    }

    if (handleNotifications && status === "Cancelled") {
      const sessionId = row[col("sessionID")].toString();
      const sessionDetails = {
        subject: row[col("Subject")],
        topic: row[col("Revision topic")],
        teacher: row[col("Teacher")],
        date: parseBritishDate(row[col("Date")]).toLocaleDateString('en-GB'),
        time: (row[col("Start")] instanceof Date) ? Utilities.formatDate(row[col("Start")], Session.getScriptTimeZone(), "HH:mm") : row[col("Start")]
      };
      
      const count = performCancellationNotifications(sessionId, sessionDetails);
      if (notifiedIdx !== -1) row[notifiedIdx] = `${count} Notified`;
      row[statusIdx] = "Cancelled"; 
      status = "Cancelled";
    }

    if (status === "Published" && collections[year]) {
      const subject = row[col("Subject")];
      const parsedDate = parseBritishDate(row[col("Date")]);
      const displayDate = parsedDate ? parsedDate.toLocaleDateString('en-GB') : "TBC";
      const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();

      const sessionString = `${displayDate}, ${formatTime(row[col("Start")])} to ${formatTime(row[col("End")])} - ${row[col("Revision topic")]} with ${row[col("Teacher")]} (ID:${row[col("sessionID")]})`;
      
      if (!collections[year][subject]) collections[year][subject] = [];
      collections[year][subject].push({ text: sessionString, sort: row[col("serialStart")] });
    }
  });

  sheet.getRange(CONFIG.HEADER_ROW + 1, 1, data.length, headers.length).setValues(data);

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

    // DYNAMIC DESCRIPTION: Managing the "Final Schedule" concept
    form.setDescription("INSTRUCTION FOR UPDATING RESPONSES: This form acts as your final schedule. If you are changing your choices, you must ensure every session you wish to attend is currently ticked. Anything left unticked will be removed (unless the session is now closed for new bookings).");

    const sortedSubjects = Object.keys(subjectMap).sort();
    if (sortedSubjects.length === 0) {
      form.addSectionHeaderItem().setTitle("No Sessions Available").setHelpText("Please check back later.");
      return;
    }

    const navItem = form.addMultipleChoiceItem().setTitle("Which subject would you like to view sessions for?").setRequired(true);
    const navChoices = [];

    sortedSubjects.forEach(subject => {
      const section = form.addPageBreakItem().setTitle(subject);
      const checkboxItem = form.addCheckboxItem()
        .setTitle(`Available ${subject} Sessions`)
        .setHelpText("Please select all sessions you wish to attend. Ensure previous choices are still ticked if you want to keep them.");
      
      checkboxItem.setChoices(subjectMap[subject].map(s => checkboxItem.createChoice(s.text)));

      const loopBackItem = form.addMultipleChoiceItem().setTitle(`Finished with ${subject}?`).setRequired(true);
      loopBackItem.setChoices([
        loopBackItem.createChoice("Select another subject", FormApp.PageNavigationType.RESTART),
        loopBackItem.createChoice("Finish and Submit my choices", FormApp.PageNavigationType.SUBMIT)
      ]);
      navChoices.push(navItem.createChoice(subject, section));
    });
    navItem.setChoices(navChoices);
  } catch (e) { console.error(`Form Error: ${e.message}`); }
}

function performCancellationNotifications(sessionId, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  if (!bSheet) return 0;
  const bData = bSheet.getDataRange().getValues();
  bData.shift();
  
  const studentMap = new Map();
  bData.filter(row => row[2].toString() === sessionId).forEach(row => studentMap.set(row[1], row[4]));

  let count = 0;
  studentMap.forEach((editUrl, email) => {
    const subject = `CANCELLED: Revision Session - ${details.subject}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        <p>Hello,</p>
        <p>Please note that a revision session you signed up for has been <strong>CANCELLED</strong>.</p>
        <div style="background-color: #f8d7da; border-left: 5px solid #dc3545; padding: 15px; margin: 20px 0;">
          <h3 style="color: #721c24; margin-top: 0;">Cancelled Session:</h3>
          <p style="margin: 5px 0;"><strong>${details.subject}</strong>: ${details.topic} with ${details.teacher}</p>
          <p style="margin: 5px 0; font-size: 0.9em; color: #721c24;">${details.date} @ ${details.time} (Ref: ${sessionId})</p>
        </div>
        <div style="margin: 25px 0; padding: 20px; background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; text-align: center;">
          <p style="margin-top: 0;"><strong>Want to pick a replacement session?</strong></p>
          <p>You can update your choices immediately using your personal link below:</p>
          <a href="${editUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">Update My Selections</a>
        </div>
        <p style="margin-top: 20px;">Best regards,<br><strong>Assessment Team</strong></p>
      </div>
    `;
    try {
      MailApp.sendEmail({ to: email, subject: subject, htmlBody: htmlBody });
      logAudit(email, sessionId, "Cancellation Notified");
      count++;
    } catch (e) { console.error(`Failed to notify ${email}: ${e.message}`); }
  });
  return count;
}

function logAudit(email, sessionId, action) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const audit = ss.getSheetByName(CONFIG.AUDIT_SHEET) || ss.insertSheet(CONFIG.AUDIT_SHEET);
  if (audit.getLastRow() === 0) audit.appendRow(["Timestamp", "Student", "SessionID", "Action"]);
  audit.appendRow([new Date(), email, sessionId, action]);
}
