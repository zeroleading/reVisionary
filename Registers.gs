/**
 * Generates PDF registers for all sessions happening tomorrow.
 */
function generateDailyRegisters() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const bookingSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  
  if (!sessionSheet || !bookingSheet) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString();

  const lastRow = sessionSheet.getLastRow();
  const lastCol = sessionSheet.getLastColumn();
  const fullRange = sessionSheet.getRange(CONFIG.HEADER_ROW, 1, lastRow - (CONFIG.HEADER_ROW - 1), lastCol);
  const sData = fullRange.getValues();
  const sHeaders = sData.shift();
  
  const col = (name) => sHeaders.indexOf(name);
  const statusIdx = col("Status");
  const regSentIdx = col("registerEmailed");
  const teacherEmailIdx = col("teacherEmail");
  const dateIdx = col("Date");
  const idIdx = col("sessionID");

  // Fetch Bookings with the new 4th column (Clash Status)
  const bData = bookingSheet.getDataRange().getValues();
  bData.shift(); 

  let sentCount = 0;

  sData.forEach((row) => {
    const d = row[dateIdx];
    const dateMatch = d instanceof Date ? d.toLocaleDateString() === tomorrowStr : d === tomorrowStr;
    const isReady = dateMatch && row[statusIdx] === "Published" && row[regSentIdx] !== "Sent";

    if (isReady) {
      const sessionId = row[idIdx].toString();
      
      // Pull student info and whether they have a clash recorded
      const attendeeData = bData
        .filter(b => b[2].toString() === sessionId)
        .map(b => ({
          email: b[1],
          isClashed: b[3] === "CLASH" // Check the 4th column
        }));

      if (attendeeData.length > 0) {
        const teacherEmail = row[teacherEmailIdx] || CONFIG.ADMIN_EMAIL;
        const success = createAndSendRegister(row, attendeeData, col, teacherEmail);
        
        if (success) {
          row[regSentIdx] = "Sent";
          sentCount++;
        }
      }
    }
  });

  const statusValues = sData.map(row => [row[regSentIdx]]);
  sessionSheet.getRange(CONFIG.HEADER_ROW + 1, regSentIdx + 1, sData.length, 1).setValues(statusValues);
}

/**
 * Creates the HTML/PDF and emails it.
 */
function createAndSendRegister(sessionRow, attendees, colFunc, recipient) {
  try {
    let html = HtmlService.createHtmlOutputFromFile('RegisterTemplate').getContent();
    
    const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();
    const displayDate = sessionRow[colFunc("Date")] instanceof Date ? sessionRow[colFunc("Date")].toLocaleDateString('en-GB') : sessionRow[colFunc("Date")];

    // Build attendee rows with a visual indicator for clashes
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
  } catch (e) {
    console.error(`Error sending register: ${e.message}`);
    return false;
  }
}
