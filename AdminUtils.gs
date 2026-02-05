/**
 * Hijacks Form Submission to check for clashes and log bookings.
 * Now captures the Edit Response URL for future notifications.
 */
function onFormSubmitHandler(e) {
  const responses = e.response.getItemResponses();
  const studentEmail = e.response.getRespondentEmail();
  const editUrl = e.response.getEditResponseUrl(); // 🔗 Capture the edit link
  
  const selectedSessionIds = [];
  responses.forEach(response => {
    const item = response.getItem();
    if (item.getType() === FormApp.ItemType.CHECKBOX) {
      const answers = response.getResponse();
      answers.forEach(ans => {
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
      sessionMap.set(id, {
        id: id,
        subject: row[col("Subject")],
        topic: row[col("Revision topic")],
        clashes: row[col("Potential clash(es)")] ? row[col("Potential clash(es)")].toString().split(',').map(s => s.trim()) : []
      });
    });

    selectedSessionIds.forEach(id => {
      const session = sessionMap.get(id);
      if (session) {
        selectedSessions.push(session);
        selectedSessionIds.forEach(otherId => {
          if (id !== otherId && session.clashes.includes(otherId)) {
            clashedIds.add(id);
            clashedIds.add(otherId);
          }
        });
      }
    });
  }

  // Pass the editUrl to be logged
  logBookings(studentEmail, selectedSessionIds, clashedIds, editUrl);

  if (selectedSessionIds.length > 0) {
    sendConfirmationEmail(studentEmail, selectedSessions, clashesFound, clashedIds);
  }
}

/**
 * Logs IDs to Bookings sheet. 
 * Column 5 is now the Edit URL.
 */
function logBookings(email, ids, clashedIds, editUrl) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.BOOKINGS_SHEET);
    sheet.appendRow(["Timestamp", "Email", "SessionID", "Clash Status", "EditURL"]);
  }
  
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === email) {
      sheet.deleteRow(i + 1);
    }
  }

  if (ids.length > 0) {
    const timestamp = new Date();
    const rows = ids.map(id => [
      timestamp, 
      email, 
      id, 
      clashedIds.has(id.toString()) ? "CLASH" : "",
      editUrl
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  }
}
