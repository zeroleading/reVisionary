/**
 * GENERATES TOMORROW'S REGISTERS (Automated 10 PM Sync)
 */
function generateDailyRegisters() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-GB');

  const lastRow = sessionSheet.getLastRow();
  if (lastRow < CONFIG.HEADER_ROW) return { registersSent: 0 };

  const sData = sessionSheet.getRange(CONFIG.HEADER_ROW, 1, lastRow - (CONFIG.HEADER_ROW - 1), sessionSheet.getLastColumn()).getValues();
  const sHeaders = sData.shift();
  const col = (name) => sHeaders.indexOf(name);
  
  let stats = { registersSent: 0 };

  sData.forEach((row, index) => {
    const rowDate = parseBritishDate(row[col("Date")]).toLocaleDateString('en-GB');
    const status = row[col("Status")];

    if (rowDate === tomorrowStr && status === "Published") {
      const sessionId = row[col("sessionID")].toString();
      const attendees = getAttendeesForSession(sessionId);

      if (attendees.length > 0) {
        const recipient = row[col("teacherEmail")] || CONFIG.ADMIN_EMAIL;
        if (createAndSendRegister(row, attendees, col, recipient)) {
          stats.registersSent++;
          sessionSheet.getRange(CONFIG.HEADER_ROW + index + 1, col("registerEmailed") + 1).setValue("Sent");
        }
      }
      sessionSheet.getRange(CONFIG.HEADER_ROW + index + 1, col("Status") + 1).setValue("Register Created");
    }
  });
  return stats;
}

/**
 * MANUAL PREVIEW: Prompts for ID and sends PDF without status change.
 */
function previewRegister() {
  checkAuth();
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Preview Register', 'Enter Session ID (e.g. 104):', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const sessionId = response.getResponseText().trim();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const data = sessionSheet.getRange(CONFIG.HEADER_ROW, 1, sessionSheet.getLastRow() - (CONFIG.HEADER_ROW - 1), sessionSheet.getLastColumn()).getValues();
  const headers = data.shift();
  const col = (name) => headers.indexOf(name);
  
  const sessionRow = data.find(row => row[col("sessionID")].toString() === sessionId);
  if (!sessionRow) {
    ui.alert('Not Found', 'ID not found.', ui.ButtonSet.OK);
    return;
  }

  const attendees = getAttendeesForSession(sessionId);
  if (attendees.length === 0) {
    ui.alert('No Bookings', 'No students registered for ' + sessionId, ui.ButtonSet.OK);
    return;
  }

  if (createAndSendRegister(sessionRow, attendees, col, Session.getActiveUser().getEmail())) {
    ui.alert('Preview Sent', 'PDF emailed.', ui.ButtonSet.OK);
  }
}

function getAttendeesForSession(sessionId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  const data = bSheet.getDataRange().getValues(); data.shift();

  const attendees = data
    .filter(row => row[2].toString() === sessionId)
    .map(row => ({
      name: row[5] || "Unknown Student", 
      unpaid: (row[6] === "Yes" || row[6] === true) ? "PLEASE CHECK" : "", 
      clash: row[3] === "CLASH" ? "⚠️" : "" 
    }));

  attendees.sort((a, b) => a.name.localeCompare(b.name));
  return attendees;
}

function createAndSendRegister(sessionRow, attendees, colFunc, recipient) {
  try {
    const template = HtmlService.createHtmlOutputFromFile('RegisterTemplate').getContent();
    const sessionDate = parseBritishDate(sessionRow[colFunc("Date")]).toLocaleDateString('en-GB');
    const productionDate = new Date().toLocaleDateString('en-GB');
    const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();
    
    const attendeeRows = attendees.map(s => `<tr><td class="cell-name">${s.name}</td><td class="cell-unpaid">${s.unpaid}</td><td class="cell-clash">${s.clash}</td><td class="cell-attendance"></td></tr>`).join('');
    
    const replacements = { 
      "{{Subject}}": sessionRow[colFunc("Subject")], "{{Teacher}}": sessionRow[colFunc("Teacher")],
      "{{Topic}}": sessionRow[colFunc("Revision topic")], "{{AttendeeRows}}": attendeeRows, 
      "{{Room}}": sessionRow[colFunc("Room")], "{{Date}}": sessionDate,
      "{{StartTime}}": formatTime(sessionRow[colFunc("Start")]), "{{EndTime}}": formatTime(sessionRow[colFunc("End")]),
      "{{ProductionDate}}": productionDate
    };
    
    let html = template;
    for (let key in replacements) { html = html.split(key).join(replacements[key]); }
    const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
    blob.setName(`Register_${sessionRow[colFunc("Subject")]}_${sessionDate}.pdf`);
    
    MailApp.sendEmail({ to: recipient, subject: `📋 Register: ${sessionRow[colFunc("Subject")]} (${sessionDate})`, htmlBody: `<p>Register attached.</p>${getEmailSignature()}`, attachments: [blob] });
    return true;
  } catch (e) { return false; }
}
