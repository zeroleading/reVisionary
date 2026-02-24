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
