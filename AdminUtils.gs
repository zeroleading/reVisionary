/**
 * Hijacks Form Submission to check for clashes and log bookings.
 * Refactored for O(1) lookup performance and HTML email generation.
 */
function onFormSubmitHandler(e) {
  const responses = e.response.getItemResponses();
  const studentEmail = e.response.getRespondentEmail();
  
  const selectedSessionIds = [];
  
  // 1. Gather all selected IDs
  responses.forEach(response => {
    const item = response.getItem();
    if (item.getType() === FormApp.ItemType.CHECKBOX) {
      const answers = response.getResponse();
      answers.forEach(ans => {
        const id = extractSessionId(ans); // Helper in Helpers.gs
        if (id) selectedSessionIds.push(id.toString());
      });
    }
  });

  // 2. Log Bookings FIRST (even if empty, to handle edits/unsubscribes)
  // We determine clashes later for the email
  const clashedIds = new Set();
  const selectedSessions = [];
  const clashesFound = [];

  if (selectedSessionIds.length > 0) {
    // 3. Fetch Master Data for Clash Check
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    const data = sheet.getRange(CONFIG.HEADER_ROW, 1, sheet.getLastRow() - (CONFIG.HEADER_ROW - 1), sheet.getLastColumn()).getValues();
    const headers = data.shift();
    
    const col = (name) => headers.indexOf(name);
    const idIdx = col("sessionID");
    const clashIdx = col("Potential clash(es)");
    const subIdx = col("Subject");
    const topicIdx = col("Revision topic");
    const dateIdx = col("Date");
    const startIdx = col("Start");

    const sessionMap = new Map();
    data.forEach(row => {
      const id = row[idIdx].toString();
      const rawDate = row[dateIdx];
      const displayDate = rawDate instanceof Date ? rawDate.toLocaleDateString('en-GB') : rawDate;
      const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();

      sessionMap.set(id, {
        id: id,
        subject: row[subIdx],
        topic: row[topicIdx],
        dateTime: `${displayDate} @ ${formatTime(row[startIdx])}`,
        clashes: row[clashIdx] ? row[clashIdx].toString().split(',').map(s => s.trim()) : []
      });
    });

    const reportedPairs = new Set();
    selectedSessionIds.forEach(id => {
      const session = sessionMap.get(id);
      if (session) {
        selectedSessions.push(session);
        selectedSessionIds.forEach(otherId => {
          if (id !== otherId && session.clashes.includes(otherId)) {
            const otherSession = sessionMap.get(otherId);
            if (otherSession) {
              clashedIds.add(id);
              clashedIds.add(otherId);
              const sortedPair = [id, otherId].sort().join('_');
              if (!reportedPairs.has(sortedPair)) {
                clashesFound.push(`${session.subject} (${id}) vs ${otherSession.subject} (${otherId})`);
                reportedPairs.add(sortedPair);
              }
            }
          }
        });
      }
    });
  }

  // 4. Always run logBookings to handle the "Wipe and Rewrite" (handles edits/empty submissions)
  logBookings(studentEmail, selectedSessionIds, clashedIds);

  // 5. Only send email if they actually have sessions selected
  if (selectedSessionIds.length > 0) {
    sendConfirmationEmail(studentEmail, selectedSessions, clashesFound, clashedIds);
  } else {
    // Optional: Send a "You have unsubscribed" email
    MailApp.sendEmail(studentEmail, "Update: Revision Session Sign-up", "You have updated your response and are no longer signed up for any sessions.");
  }
}

/**
 * Sends a detailed HTML Confirmation email.
 */
function sendConfirmationEmail(email, sessions, clashes, clashedIds) {
  const subject = "Confirmation: Your Revision Session Schedule";
  
  let htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
      <p>Hello,</p>
      <p>This email confirms that your revision session choices have been updated.</p>
      
      <h3 style="color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">Your Updated Schedule:</h3>
      <ul style="list-style: none; padding-left: 0;">
  `;

  sessions.forEach(s => {
    const isClashed = clashedIds.has(s.id);
    const style = isClashed ? 'background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 8px;' : 'padding: 8px;';
    
    htmlBody += `
      <li style="margin-bottom: 10px; ${style}">
        <strong>${s.subject}</strong>: ${s.topic}<br>
        <span style="font-size: 0.9em; color: #666;">${s.dateTime} (Ref: ${s.id})</span>
        ${isClashed ? '<br><em style="color: #856404; font-size: 0.85em;">Note: Potential overlap detected</em>' : ''}
      </li>
    `;
  });

  htmlBody += `</ul>`;

  if (clashes.length > 0) {
    htmlBody += `
      <div style="margin-top: 25px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
        <p style="margin-top: 0;"><strong>P.S. A quick heads-up:</strong></p>
        <p>We noticed that the following sessions in your updated list appear to overlap:</p>
        <ul style="color: #555;">
          ${clashes.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  htmlBody += `<p style="margin-top: 20px;">Best regards,<br><strong>The School Revision Team</strong></p></div>`;
          
  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      htmlBody: htmlBody
    });
  } catch (e) {
    console.error(`Email Error: ${e.message}`);
  }
}

/**
 * Logs IDs to Bookings sheet. Wipes previous entries to support edited responses.
 */
function logBookings(email, ids, clashedIds) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.BOOKINGS_SHEET);
    sheet.appendRow(["Timestamp", "Email", "SessionID", "Clash Status"]);
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
      clashedIds.has(id.toString()) ? "CLASH" : ""
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  }
}
