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
    if (response.getItem().getType() === FormApp.ItemType.CHECKBOX) {
      response.getResponse().forEach(ans => {
        const id = extractSessionId(ans);
        if (id) selectedSessionIds.push(id.toString());
      });
    }
  });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const data = sheet.getRange(CONFIG.HEADER_ROW, 1, sheet.getLastRow() - (CONFIG.HEADER_ROW - 1), sheet.getLastColumn()).getValues();
  const headers = data.shift();
  const col = (name) => headers.indexOf(name);

  const sessionMap = new Map();
  const statusMap = new Map(); // Needed for surgical log logic

  data.forEach(row => {
    const id = row[col("sessionID")].toString();
    const status = row[col("Status")];
    statusMap.set(id, status);

    const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();
    sessionMap.set(id, {
      id: id, subject: row[col("Subject")], topic: row[col("Revision topic")], teacher: row[col("Teacher")],
      dateTime: `${parseBritishDate(row[col("Date")]).toLocaleDateString('en-GB')} @ ${formatTime(row[col("Start")])}`,
      serialStart: row[col("serialStart")],
      clashes: row[col("Potential clash(es)")] ? row[col("Potential clash(es)")].toString().split(',').map(s => s.trim()) : []
    });
  });

  const clashedIds = new Set();
  const selectedSessions = [];
  const clashesFoundStrings = [];
  const reportedPairs = new Set();

  selectedSessionIds.forEach(id => {
    const s = sessionMap.get(id);
    if (s) {
      selectedSessions.push(s);
      selectedSessionIds.forEach(otherId => {
        if (id !== otherId && s.clashes.includes(otherId)) {
          clashedIds.add(id); clashedIds.add(otherId);
          const pairKey = [id, otherId].sort().join('_');
          if (!reportedPairs.has(pairKey)) {
            const other = sessionMap.get(otherId);
            clashesFoundStrings.push(`${s.subject} (${id}) vs ${other.subject} (${otherId})`);
            reportedPairs.add(pairKey);
          }
        }
      });
    }
  });

  selectedSessions.sort((a, b) => a.serialStart - b.serialStart);

  // Perform Surgical Booking Update
  logBookings(studentEmail, selectedSessionIds, clashedIds, editUrl, statusMap);

  if (selectedSessionIds.length > 0) {
    sendConfirmationEmail(studentEmail, selectedSessions, clashesFoundStrings, clashedIds, editUrl);
  }
}

function sendConfirmationEmail(email, sessions, clashes, clashedIds, editUrl) {
  const subject = "Confirmation: Your Revision Session Schedule";
  let htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
      <p>Hello,</p>
      <p>Thank you for signing up for your upcoming revision sessions. We have successfully recorded your choices.</p>
      
      <div style="background-color: #e7f3ff; border-left: 5px solid #2196F3; padding: 15px; margin: 20px 0;">
        <p style="margin-top: 0;"><strong>⚠️ Important Note for Future Edits:</strong></p>
        <p style="margin-bottom: 0; font-size: 0.95em;">If you use the link below to change your choices, please ensure you <strong>re-tick every session</strong> you want to keep. The form acts as your final schedule; anything left unticked will be removed from your list (unless the session is happening tomorrow and already closed for changes).</p>
      </div>

      <h3 style="color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">Your Selected Schedule:</h3>
      <ul style="list-style: none; padding-left: 0;">
  `;

  sessions.forEach(s => {
    const isClashed = clashedIds.has(s.id);
    const style = isClashed ? 'background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin-bottom: 10px;' : 'padding: 5px; margin-bottom: 5px;';
    htmlBody += `
      <li style="${style}">
        <strong>${s.subject}</strong>: ${s.topic} with ${s.teacher}<br>
        <span style="font-size: 0.9em; color: #666;">${s.dateTime} (Ref: ${s.id})</span>
        ${isClashed ? '<br><em style="color: #856404; font-size: 0.85em;">Note: Potential overlap detected</em>' : ''}
      </li>
    `;
  });

  htmlBody += `</ul>`;

  if (clashes.length > 0) {
    htmlBody += `
      <div style="margin-top: 25px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
        <p style="margin-top: 0;"><strong>⚠️ A quick heads-up:</strong></p>
        <p>We noticed that the following sessions in your list appear to overlap or happen at the same time:</p>
        <ul style="color: #555;">
          ${clashes.map(c => `<li>${c}</li>`).join('')}
        </ul>
        <p style="margin-bottom: 0; font-size: 0.9em;">You may want to review these dates with your teachers to decide which session to prioritize.</p>
      </div>
    `;
  }

  htmlBody += `
      <div style="margin-top: 25px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #ccc; text-align: center;">
        <p style="margin-top: 0;"><strong>Need to change your sessions?</strong></p>
        <a href="${editUrl}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Update My Selections</a>
      </div>
      <p style="margin-top: 20px;">Best regards,<br><strong>Assessment Team</strong></p>
    </div>
  `;
          
  try { MailApp.sendEmail({ to: email, subject: subject, htmlBody: htmlBody }); } catch (e) { console.error(`Email Error: ${e.message}`); }
}

/**
 * Surgical Booking Update:
 * Deletes only 'Published' session bookings for a student. 
 * Preserves 'Register Created' (tomorrow's) bookings because they are hidden from the form.
 */
function logBookings(email, ids, clashedIds, editUrl, statusMap) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  // Identify rows to delete (Only those where session is currently 'Published')
  // We go backwards to delete safely
  for (let i = data.length - 1; i >= 1; i--) { 
    const bookingEmail = data[i][1];
    const bookingSessionId = data[i][2].toString();
    const sessionStatus = statusMap.get(bookingSessionId);

    if (bookingEmail === email && sessionStatus === "Published") {
      sheet.deleteRow(i + 1);
    } 
  }

  // Add the new bookings
  if (ids.length > 0) {
    const rows = ids.map(id => [new Date(), email, id, clashedIds.has(id.toString()) ? "CLASH" : "", editUrl]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  }
}
