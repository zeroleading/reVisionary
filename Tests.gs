/**
 * SYSTEM TESTS
 */
function runSystemTests() {
  console.log("--- STARTING TESTS ---");
  const d = parseBritishDate("15/05/2026");
  if (d.getFullYear() === 2026) console.log("✅ Date Parsing Passed");
  const id = extractSessionId("Topic (ID:XYZ999)");
  if (id === "XYZ999") console.log("✅ ID Extraction Passed");
}

function testEmailSystem() {
  checkAuth();
  const targetEmail = Session.getActiveUser().getEmail();
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Test Emails', 'Send visual tests to ' + targetEmail + '?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  // Confirmation
  sendConfirmationEmail(targetEmail, [{ id: "T1", subject: "Test Subject", topic: "Test Topic", teacher: "Test Staff", dateTime: "15:30", serialStart: 1 }], [], new Set(), "http://editlink");

  // Summary
  const summarySessions = [{ time: "15:30", subject: "History", topic: "Cold War", room: "H1", teacher: "Mr Staff", clash: true }];
  let html = `<div style="font-family: Arial;"><p>Tomorrow's Summary (Test):</p><table>`;
  summarySessions.forEach(s => html += `<tr style="background:#fff3cd;"><td>${s.time}</td><td>${s.subject}</td></tr>`);
  html += `</table>${getEmailSignature()}</div>`;
  MailApp.sendEmail({ to: targetEmail, subject: "Daily Summary Test", htmlBody: html });

  // Register
  createAndSendRegister(["15/05/2026", "15:30", "16:30", "R1", "Y11", "Biology", "Dr Darwin", "Genetics"], [{name: "Test Student", unpaid: "PLEASE CHECK", clash: "⚠️"}], (n)=>({"Subject":5, "Teacher":6, "Revision topic":7, "Room":3, "Date":0, "Start":1, "End":2}[n]), targetEmail);

  ui.alert('Tests Sent');
}
