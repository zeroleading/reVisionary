/**
 * Sends a personalized summary email to students for their sessions tomorrow.
 */
function sendStudentTomorrowSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const bookingSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-GB');
  
  const sData = sessionSheet.getRange(CONFIG.HEADER_ROW, 1, sessionSheet.getLastRow() - (CONFIG.HEADER_ROW - 1), sessionSheet.getLastColumn()).getValues();
  const sHeaders = sData.shift();
  const col = (name) => sHeaders.indexOf(name);
  
  const tomorrowSessions = new Map();
  sData.forEach(row => {
    const rowDate = parseBritishDate(row[col("Date")]);
    if (rowDate && rowDate.toLocaleDateString('en-GB') === tomorrowStr) {
      const id = row[col("sessionID")].toString();
      const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();
      tomorrowSessions.set(id, { subject: row[col("Subject")], topic: row[col("Revision topic")], teacher: row[col("Teacher")], room: row[col("Room")], time: `${formatTime(row[col("Start")])} to ${formatTime(row[col("End")])}` });
    }
  });
  if (tomorrowSessions.size === 0) return;

  const bData = bookingSheet.getDataRange().getValues(); bData.shift();
  const studentMap = new Map();
  bData.forEach(row => {
    const email = row[1]; const id = row[2].toString();
    if (tomorrowSessions.has(id)) {
      if (!studentMap.has(email)) studentMap.set(email, []);
      studentMap.get(email).push({ ...tomorrowSessions.get(id), clash: row[3] === "CLASH" });
    }
  });

  studentMap.forEach((sessions, email) => {
    let htmlBody = `<div style="font-family: Arial, sans-serif; color: #333;"><p>Hello,</p><p>Summary of your revision sessions for tomorrow, <strong>${tomorrowStr}</strong>:</p><table style="width: 100%; border-collapse: collapse;">`;
    sessions.forEach(s => {
      htmlBody += `<tr style="${s.clash ? 'background-color: #fff3cd;' : ''}"><td style="border: 1px solid #ddd; padding: 10px;">${s.time}</td><td style="border: 1px solid #ddd; padding: 10px;"><strong>${s.subject}</strong>: ${s.topic}</td><td style="border: 1px solid #ddd; padding: 10px;">Room: ${s.room} (${s.teacher}) ${s.clash ? '<br><small>⚠️ CLASH</small>' : ''}</td></tr>`;
    });
    htmlBody += `</table><p>Sign-ups are now closed for these sessions. Your place is confirmed.</p>${getEmailSignature()}</div>`;
    try { MailApp.sendEmail({ to: email, subject: `Revision Session(s) booked for ${tomorrowStr}`, htmlBody: htmlBody }); } catch (e) {}
  });
}

/**
 * ADMIN TOOL: Force a notification for a specific session ID.
 */
function adminForceSessionNotification() {
  checkAuth();
  const ui = SpreadsheetApp.getUi();
  
  const idPrompt = ui.prompt('Force Notification', 'Enter the Session ID (e.g., 101):', ui.ButtonSet.OK_CANCEL);
  if (idPrompt.getSelectedButton() !== ui.Button.OK) return;
  const sessionId = idPrompt.getResponseText().trim();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const data = sessionSheet.getRange(CONFIG.HEADER_ROW, 1, sessionSheet.getLastRow() - (CONFIG.HEADER_ROW - 1), sessionSheet.getLastColumn()).getValues();
  const headers = data.shift();
  const col = (name) => headers.indexOf(name);
  const sessionRow = data.find(row => row[col("sessionID")].toString() === sessionId);

  if (!sessionRow) {
    ui.alert('Error', 'Session ID "' + sessionId + '" not found.', ui.ButtonSet.OK);
    return;
  }

  const template = HtmlService.createTemplateFromFile('NotificationDialog');
  template.sessionId = sessionId;
  template.sessionName = sessionRow[col("Subject")] + " (" + sessionRow[col("Revision topic")] + ")";

  const html = template.evaluate()
      .setWidth(400)
      .setHeight(300); // Increased height to accommodate new button
  
  ui.showModalDialog(html, 'Notification Dispatcher');
}

/**
 * Server-side handler for the Modal Dialog choices.
 * Supports 'student', 'teacher', or 'both'.
 */
function executeForcedNotification(sessionId, type) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const data = sessionSheet.getRange(CONFIG.HEADER_ROW, 1, sessionSheet.getLastRow() - (CONFIG.HEADER_ROW - 1), sessionSheet.getLastColumn()).getValues();
  const headers = data.shift();
  const col = (name) => headers.indexOf(name);
  const sessionRow = data.find(row => row[col("sessionID")].toString() === sessionId);

  // 1. Notify Students
  if (type === 'student' || type === 'both') {
    forceSendStudentSummary(sessionRow, col, sessionId);
  } 
  
  // 2. Notify Teacher
  if (type === 'teacher' || type === 'both') {
    const attendees = getAttendeesForSession(sessionId);
    if (attendees.length > 0) {
      const recipient = sessionRow[col("teacherEmail")] || CONFIG.ADMIN_EMAIL;
      createAndSendRegister(sessionRow, attendees, col, recipient);
    }
  }
}

/**
 * Private helper to send summary for a single session regardless of date.
 */
function forceSendStudentSummary(sessionRow, colFunc, sessionId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bookingSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  const bData = bookingSheet.getDataRange().getValues(); bData.shift();
  
  const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();
  const sessionInfo = {
    subject: sessionRow[colFunc("Subject")],
    topic: sessionRow[colFunc("Revision topic")],
    teacher: sessionRow[colFunc("Teacher")],
    room: sessionRow[colFunc("Room")],
    time: `${formatTime(sessionRow[colFunc("Start")])} to ${formatTime(sessionRow[colFunc("End")])}`,
    date: parseBritishDate(sessionRow[colFunc("Date")]).toLocaleDateString('en-GB')
  };

  bData.filter(row => row[2].toString() === sessionId).forEach(row => {
    const email = row[1];
    const isClash = row[3] === "CLASH";
    
    let htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <p>Hello,</p>
        <p>This is a notification regarding your revision session scheduled for <strong>${sessionInfo.date}</strong>:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="${isClash ? 'background-color: #fff3cd;' : ''}">
            <td style="border: 1px solid #ddd; padding: 10px;">${sessionInfo.time}</td>
            <td style="border: 1px solid #ddd; padding: 10px;"><strong>${sessionInfo.subject}</strong>: ${sessionInfo.topic}</td>
            <td style="border: 1px solid #ddd; padding: 10px;">Room: ${sessionInfo.room} (${sessionInfo.teacher})${isClash ? '<br><small>⚠️ CLASH</small>' : ''}</td>
          </tr>
        </table>
        <p>Your place is confirmed. Please attend as scheduled.</p>
        ${getEmailSignature()}
      </div>
    `;
    
    try {
      MailApp.sendEmail({ to: email, subject: `Session Update: ${sessionInfo.subject} (${sessionInfo.date})`, htmlBody: htmlBody });
      logAudit(email, sessionId, "FORCED_STUDENT_SUMMARY");
    } catch (e) {}
  });
}
