/**
 * THE MASTER SYNC ENGINE - "Scalpel" Logic
 */
function masterDailyUpdate() {
  checkAuth();
  generateDailyRegisters(); 
  sendStudentTomorrowSummary();
  rebuildFormsFromSheet(true); 
}

function manualFormSync() {
  checkAuth();
  if (SpreadsheetApp.getUi().alert('Manual Sync', 'Refresh forms and process cancellations?', SpreadsheetApp.getUi().ButtonSet.YES_NO) == SpreadsheetApp.getUi().Button.YES) {
    rebuildFormsFromSheet(true); 
  }
}

function rebuildFormsFromSheet(handleNotifications) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const data = sheet.getRange(CONFIG.HEADER_ROW, 1, sheet.getLastRow() - (CONFIG.HEADER_ROW - 1), sheet.getLastColumn()).getValues();
  const headers = data.shift();
  const col = (name) => headers.indexOf(name);
  const collections = { "Y11": {}, "Y13": {} };

  data.forEach((row) => {
    let status = row[col("Status")];
    if (status === "Ready to publish") { status = "Published"; row[col("Status")] = "Published"; }

    if (handleNotifications && status === "Cancelled") {
      const details = { subject: row[col("Subject")], topic: row[col("Revision topic")], teacher: row[col("Teacher")], date: parseBritishDate(row[col("Date")]).toLocaleDateString('en-GB'), time: (row[col("Start")] instanceof Date) ? Utilities.formatDate(row[col("Start")], Session.getScriptTimeZone(), "HH:mm") : row[col("Start")] };
      const count = performCancellationNotifications(row[col("sessionID")].toString(), details);
      if (col("notifiedCount") !== -1) row[col("notifiedCount")] = `${count} Notified`;
      row[col("Status")] = "Cancelled"; 
    }

    const yearGrp = row[col("Year group")];
    if (status === "Published" && collections[yearGrp]) {
      const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();
      const sessionString = `${parseBritishDate(row[col("Date")]).toLocaleDateString('en-GB')}, ${formatTime(row[col("Start")])} to ${formatTime(row[col("End")])} - ${row[col("Revision topic")]} with ${row[col("Teacher")]} (ID:${row[col("sessionID")]})`;
      if (!collections[yearGrp][row[col("Subject")]]) collections[yearGrp][row[col("Subject")] ] = [];
      collections[yearGrp][row[col("Subject")]].push({ text: sessionString, sort: row[col("serialStart")] });
    }
  });

  sheet.getRange(CONFIG.HEADER_ROW + 1, 1, data.length, headers.length).setValues(data);

  const formIds = [...new Set(Object.values(CONFIG.FORMS).filter(id => id && id !== "YOUR_Y11_FORM_ID_HERE"))];

  try {
    formIds.forEach(id => {
      const form = FormApp.openById(id);
      form.setAcceptingResponses(false);
      try { form.setCustomClosedFormMessage("The form is currently being updated. Please try again in a few minutes."); } catch (e) {}
    });

    for (let year in collections) { 
      if (CONFIG.FORMS[year]) updateSingleForm(CONFIG.FORMS[year], collections[year]); 
    }
  } finally {
    formIds.forEach(id => { try { FormApp.openById(id).setAcceptingResponses(true); } catch (e) {} });
  }
}

function updateSingleForm(formId, subjectMap) {
  try {
    const form = FormApp.openById(formId);
    const items = form.getItems();
    const itemMap = {};
    items.forEach(item => { itemMap[`${item.getType()}:${item.getTitle()}`] = item; });

    const navTitle = "Which subject would you like to view sessions for?";
    let navItem = itemMap[`${FormApp.ItemType.MULTIPLE_CHOICE}:${navTitle}`] ? itemMap[`${FormApp.ItemType.MULTIPLE_CHOICE}:${navTitle}`].asMultipleChoiceItem() : form.addMultipleChoiceItem().setTitle(navTitle).setRequired(true);
    
    form.setDescription("INSTRUCTION FOR UPDATING RESPONSES:\n\nThis form acts as your final schedule. If you are changing your choices, you must ensure every session you wish to attend is currently ticked.\n\nAnything left unticked will be removed (unless the session is now closed for new bookings).");

    const validSubjects = Object.keys(subjectMap).filter(s => subjectMap[s].length > 0).sort();
    if (validSubjects.length === 0) { navItem.setChoices([navItem.createChoice("No sessions currently available")]); return; }

    const navChoices = [];
    validSubjects.forEach(subject => {
      let section = itemMap[`${FormApp.ItemType.PAGE_BREAK}:${subject}`] ? itemMap[`${FormApp.ItemType.PAGE_BREAK}:${subject}`].asPageBreakItem() : form.addPageBreakItem().setTitle(subject);
      let cbTitle = `Available ${subject} Sessions`;
      let cbItem = itemMap[`${FormApp.ItemType.CHECKBOX}:${cbTitle}`] ? itemMap[`${FormApp.ItemType.CHECKBOX}:${cbTitle}`].asCheckboxItem() : form.addCheckboxItem().setTitle(cbTitle).setHelpText("Please re-tick every session you want to keep.");
      cbItem.setChoices(subjectMap[subject].sort((a,b)=> (a.sort||0) - (b.sort||0)).map(s => cbItem.createChoice(s.text)));
      let loopTitle = `Finished with ${subject}?`;
      let loopItem = itemMap[`${FormApp.ItemType.MULTIPLE_CHOICE}:${loopTitle}`] ? itemMap[`${FormApp.ItemType.MULTIPLE_CHOICE}:${loopTitle}`].asMultipleChoiceItem() : form.addMultipleChoiceItem().setTitle(loopTitle).setRequired(true);
      loopItem.setChoices([loopItem.createChoice("Select another subject", FormApp.PageNavigationType.RESTART), loopItem.createChoice("Finish and Submit my choices", FormApp.PageNavigationType.SUBMIT)]);
      navChoices.push(navItem.createChoice(subject, section));
    });
    navItem.setChoices(navChoices);
  } catch (e) { console.error(`Sync Error: ${e.message}`); }
}

function performCancellationNotifications(sessionId, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bData = ss.getSheetByName(CONFIG.BOOKINGS_SHEET).getDataRange().getValues(); bData.shift();
  const studentMap = new Map();
  bData.filter(row => row[2].toString() === sessionId).forEach(row => studentMap.set(row[1], row[4]));
  let count = 0;
  studentMap.forEach((editUrl, email) => {
    const htmlBody = `<div style="font-family: Arial;"><p>Hello,</p><p>Please note that a revision session you signed up for has been <strong>CANCELLED</strong>.</p><div style="background-color: #f8d7da; border-left: 5px solid #dc3545; padding: 15px; margin: 20px 0;"><h3 style="color: #721c24; margin-top: 0;">Cancelled Session:</h3><p><strong>${details.subject}</strong>: ${details.topic} with ${details.teacher}</p><p>${details.date} @ ${details.time}</p></div><div style="margin: 25px 0; padding: 20px; background-color: #f8f9fa; border: 1px solid #dee2e6; text-align: center;"><a href="${editUrl}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Update My Selections</a></div>${getEmailSignature()}</div>`;
    try { MailApp.sendEmail({ to: email, subject: `CANCELLED: ${details.subject}`, htmlBody: htmlBody }); count++; logAudit(email, sessionId, "Cancellation Notified"); } catch (e) {}
  });
  return count;
}

function logAudit(email, sessionId, action) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const audit = ss.getSheetByName(CONFIG.AUDIT_SHEET) || ss.insertSheet(CONFIG.AUDIT_SHEET);
  audit.appendRow([new Date(), email, sessionId, action]);
}
