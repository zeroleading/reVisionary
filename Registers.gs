/**
 * Generates PDF registers and updates session statuses to 'Register Created'.
 * Returns stats for the master report.
 */
function generateDailyRegisters() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const bookingSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  
  let stats = { registersSent: 0, studentsNotified: 0 };
  if (!sessionSheet || !bookingSheet) return stats;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString();

  const lastRow = sessionSheet.getLastRow();
  const fullRange = sessionSheet.getRange(CONFIG.HEADER_ROW, 1, lastRow - (CONFIG.HEADER_ROW - 1), sessionSheet.getLastColumn());
  const sData = fullRange.getValues();
  const sHeaders = sData.shift();
  
  const col = (name) => sHeaders.indexOf(name);
  const statusIdx = col("Status");
  const regSentIdx = col("registerEmailed");
  const dateIdx = col("Date");
  const idIdx = col("sessionID");

  const bData = bookingSheet.getDataRange().getValues();
  bData.shift(); 

  sData.forEach((row) => {
    const d = row[dateIdx];
    const parsedDate = parseBritishDate(d);
    const dateMatch = parsedDate ? parsedDate.toLocaleDateString() === tomorrowStr : false;
    
    // Only generate for tomorrow's Published sessions
    if (dateMatch && row[statusIdx] === "Published") {
      const sessionId = row[idIdx].toString();
      const attendeeData = bData
        .filter(b => b[2].toString() === sessionId)
        .map(b => ({ email: b[1], isClashed: b[3] === "CLASH" }));

      if (attendeeData.length > 0) {
        const teacherEmail = row[col("teacherEmail")] || CONFIG.ADMIN_EMAIL;
        if (createAndSendRegister(row, attendeeData, col, teacherEmail)) {
          row[regSentIdx] = "Sent";
          row[statusIdx] = "Register Created"; // STATUS UPDATE
          stats.registersSent++;
        }
      } else {
        // If no one signed up, we still close the session
        row[statusIdx] = "Register Created";
      }
    }
  });

  // Write back the Register Emailed status only (Master Sync handles the main Status write-back)
  const regSentValues = sData.map(row => [row[regSentIdx]]);
  sessionSheet.getRange(CONFIG.HEADER_ROW + 1, regSentIdx + 1, sData.length, 1).setValues(regSentValues);

  return stats;
}

/**
 * Creates the HTML/PDF and emails it.
 */
function createAndSendRegister(sessionRow, attendees, colFunc, recipient) {
  try {
    let html = HtmlService.createHtmlOutputFromFile('RegisterTemplate').getContent();
    const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();
    const displayDate = parseBritishDate(sessionRow[colFunc("Date")]).toLocaleDateString('en-GB');

    const attendeeRows = attendees.map(student => `
      <tr>
        <td style="padding: 10px;">
          ${student.email} 
          ${student.isClashed ? '<span style="color: #d9534f; font-weight: bold; font-size: 0.8em; margin-left: 10px;">⚠️ CLASH</span>' : ''}
        </td>
        <td style="text-align: center;"><div style="width: 20px; height: 20px; border: 1px solid #333; margin: auto;"></div></td>
      </tr>
    `).join('');

    const replacements = {
      "{{Subject}}": sessionRow[colFunc("Subject")],
      "{{Teacher}}": sessionRow[colFunc("Teacher")],
      "{{Topic}}": sessionRow[colFunc("Revision topic")],
      "{{Room}}": sessionRow[colFunc("Room")],
      "{{Date}}": displayDate,
      "{{Time}}": `${formatTime(sessionRow[colFunc("Start")])} - ${formatTime(sessionRow[colFunc("End")])}`,
      "{{AttendeeRows}}": attendeeRows,
      "{{GeneratedDate}}": new Date().toLocaleString()
    };

    for (let key in replacements) {
      html = html.split(key).join(replacements[key]);
    }

    const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
    blob.setName(`Register_${sessionRow[colFunc("Subject")]}_${displayDate.replace(/\//g, '-')}.pdf`);

    MailApp.sendEmail({
      to: recipient,
      subject: `📋 Register: ${sessionRow[colFunc("Subject")]} - ${sessionRow[colFunc("Revision topic")]}`,
      body: `Attached is the register for your revision session tomorrow.`,
      attachments: [blob]
    });
    return true;
  } catch (e) { return false; }
}
