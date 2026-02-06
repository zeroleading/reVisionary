/**
 * Generates tomorrow's registers and closes those sessions.
 */
function generateDailyRegisters() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessionSheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const bookingSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET);
  let stats = { registersSent: 0 };

  const tomorrowStr = new Date(new Date().setDate(new Date().getDate() + 1)).toLocaleDateString();
  const sData = sessionSheet.getRange(CONFIG.HEADER_ROW, 1, sessionSheet.getLastRow() - (CONFIG.HEADER_ROW - 1), sessionSheet.getLastColumn()).getValues();
  const sHeaders = sData.shift();
  const col = (name) => sHeaders.indexOf(name);
  const bData = bookingSheet.getDataRange().getValues(); bData.shift();

  sData.forEach((row) => {
    const dateMatch = parseBritishDate(row[col("Date")]).toLocaleDateString() === tomorrowStr;
    if (dateMatch && row[col("Status")] === "Published") {
      const attendeeData = bData.filter(b => b[2].toString() === row[col("sessionID")].toString()).map(b => ({ email: b[1], isClashed: b[3] === "CLASH" }));

      if (attendeeData.length > 0) {
        if (createAndSendRegister(row, attendeeData, col, row[col("teacherEmail")] || CONFIG.ADMIN_EMAIL)) {
          row[col("registerEmailed")] = "Sent";
          row[col("Status")] = "Register Created";
          stats.registersSent++;
        }
      } else {
        row[col("Status")] = "Register Created";
      }
    }
  });

  sessionSheet.getRange(CONFIG.HEADER_ROW + 1, col("registerEmailed") + 1, sData.length, 1).setValues(sData.map(r => [r[col("registerEmailed")]]));
  return stats;
}

function createAndSendRegister(sessionRow, attendees, colFunc, recipient) {
  try {
    let html = HtmlService.createHtmlOutputFromFile('RegisterTemplate').getContent();
    const attendeeRows = attendees.map(s => `<tr><td>${s.email} ${s.isClashed ? '<span style="color:red">⚠️ CLASH</span>' : ''}</td><td style="border:1px solid #000;width:30px;height:20px;"></td></tr>`).join('');
    
    const replacements = { 
      "{{Subject}}": sessionRow[colFunc("Subject")], 
      "{{Topic}}": sessionRow[colFunc("Revision topic")], 
      "{{AttendeeRows}}": attendeeRows, 
      "{{Room}}": sessionRow[colFunc("Room")] 
    };
    for (let key in replacements) { html = html.split(key).join(replacements[key]); }

    const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
    blob.setName(`Register_${sessionRow[colFunc("Subject")]}.pdf`);
    MailApp.sendEmail({ to: recipient, subject: `📋 Register: ${sessionRow[colFunc("Subject")]}`, body: `Please find the register for your session tomorrow attached.`, attachments: [blob] });
    return true;
  } catch (e) { return false; }
}
