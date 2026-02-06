/**
 * HANDLES LIVE FORM SUBMISSIONS
 * Logs bookings, checks clashes, and sends CHRONOLOGICAL confirmation emails.
 */
function onFormSubmitHandler(e) {
  const responses = e.response.getItemResponses();
  const studentEmail = e.response.getRespondentEmail();
  const editUrl = e.response.getEditResponseUrl();
  const selectedSessionIds = [];
  
  responses.forEach(response => {
    const item = response.getItem();
    if (item.getType() === FormApp.ItemType.CHECKBOX) {
      response.getResponse().forEach(ans => {
        const id = extractSessionId(ans);
        if (id) selectedSessionIds.push(id.toString());
      });
    }
  });

  const clashedIds = new Set();
  const selectedSessions = [];
  const clashesFound = [];

  if (selectedSessionIds.length > 0) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    const data = sheet.getRange(CONFIG.HEADER_ROW, 1, sheet.getLastRow() - (CONFIG.HEADER_ROW - 1), sheet.getLastColumn()).getValues();
    const headers = data.shift();
    const col = (name) => headers.indexOf(name);

    const sessionMap = new Map();
    data.forEach(row => {
      const id = row[col("sessionID")].toString();
      const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();
      sessionMap.set(id, {
        id: id, subject: row[col("Subject")], topic: row[col("Revision topic")],
        dateTime: `${parseBritishDate(row[col("Date")]).toLocaleDateString('en-GB')} @ ${formatTime(row[col("Start")])}`,
        serialStart: row[col("serialStart")],
        clashes: row[col("Potential clash(es)")] ? row[col("Potential clash(es)")].toString().split(',').map(s => s.trim()) : []
      });
    });

    selectedSessionIds.forEach(id => {
      const s = sessionMap.get(id);
      if (s) {
        selectedSessions.push(s);
        selectedSessionIds.forEach(otherId => {
          if (id !== otherId && s.clashes.includes(otherId)) {
            clashedIds.add(id); clashedIds.add(otherId);
            const sortedPair = [id, otherId].sort().join('_');
            if (!clashesFound.includes(sortedPair)) {
              clashesFound.push(`${s.subject} vs ${sessionMap.get(otherId).subject}`);
            }
          }
        });
      }
    });

    // Sort CHRONOLOGICALLY based on the sheet serial value
    selectedSessions.sort((a, b) => a.serialStart - b.serialStart);
  }

  logBookings(studentEmail, selectedSessionIds, clashedIds, editUrl);

  if (selectedSessionIds.length > 0) {
    sendConfirmationEmail(studentEmail, selectedSessions, clashesFound, clashedIds, editUrl);
  }
}

function sendConfirmationEmail(email, sessions, clashes, clashedIds, editUrl) {
  const subject = "Confirmation: Your Revision Schedule";
  let htmlBody = `<div style="font-family: Arial; line-height: 1.6;"><h3>Your Chronological Schedule:</h3><ul>`;

  sessions.forEach(s => {
    const style = clashedIds.has(s.id) ? 'background: #fff3cd; border-left: 4px solid #ffc107; padding: 5px;' : 'padding: 5px;';
    htmlBody += `<li style="${style}"><strong>${s.subject}</strong>: ${s.topic}<br><small>${s.dateTime} (ID:${s.id})</small></li>`;
  });

  htmlBody += `</ul><div style="background: #e9ecef; padding: 15px; border-radius: 8px; border: 1px solid #ccc; margin-top: 20px;">
    <strong>Need to change your sessions?</strong><br>
    Use your personal link to update your choices: <br>
    <a href="${editUrl}" style="font-weight: bold; color: #007bff;">Update My Selections</a></div></div>`;
  
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: htmlBody });
}

function logBookings(email, ids, clashedIds, editUrl) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) { if (data[i][1] === email) sheet.deleteRow(i + 1); }

  if (ids.length > 0) {
    const timestamp = new Date();
    const rows = ids.map(id => [timestamp, email, id, clashedIds.has(id.toString()) ? "CLASH" : "", editUrl]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  }
}
