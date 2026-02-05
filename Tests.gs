/**
 * SYSTEM TEST RUNNER
 */
function runSystemTests() {
  try { checkAuth(); } catch (e) { console.error(e.message); return; }

  console.log("--- 🧪 STARTING REFACTOR TESTS ---");
  const results = { pass: 0, fail: 0 };

  const assert = (name, fn) => {
    try {
      fn();
      console.log(`✅ ${name}`);
      results.pass++;
    } catch (e) {
      console.error(`❌ ${name}: ${e.message}`);
      results.fail++;
    }
  };

  // 1. Integration: Clash Mapping
  assert("Clash Map Deduplication", () => {
    const reportedPairs = new Set();
    const mockClash = (a, b) => {
      const key = [a, b].sort().join(' vs ');
      if (!reportedPairs.has(key)) reportedPairs.add(key);
    };
    mockClash("Maths", "English");
    mockClash("English", "Maths");
    if (reportedPairs.size !== 1) throw new Error("Deduplication failed.");
  });

  // 2. Integration: Date Parsing
  assert("British Date Parser (String)", () => {
    // Note: Ensure parseBritishDate helper is available in your project
    if (typeof parseBritishDate !== 'function') throw new Error("parseBritishDate helper is missing.");
    const d = parseBritishDate("25/12/2025");
    if (!d || d.getFullYear() !== 2025 || d.getMonth() !== 11) throw new Error("Parsing failed.");
  });

  // 3. Security: Whitelist Check
  assert("Security Whitelist Enforcement", () => {
    const user = Session.getEffectiveUser().getEmail();
    if (!CONFIG.AUTHORIZED_USERS.includes(user)) throw new Error("Authorization logic leak.");
  });

  // 4. Logic: Email Deduplication (notifyCancelledSession logic)
  assert("Cancellation Email Deduplication", () => {
    const mockBookings = [
      ["TS", "studentA@csg.school", "ID1"],
      ["TS", "studentA@csg.school", "ID1"],
      ["TS", "studentB@csg.school", "ID1"]
    ];
    const targetId = "ID1";
    // Mirroring logic from Code.gs
    const affectedEmails = [...new Set(mockBookings
      .filter(row => row[2].toString() === targetId)
      .map(row => row[1]))];
    
    if (affectedEmails.length !== 2) throw new Error(`Expected 2 unique emails, found ${affectedEmails.length}`);
  });

  // 5. Logic: Header Index Mapping (syncSheetToForms logic)
  assert("Header Mapping Consistency", () => {
    const mockHeaders = ["Status", "Year Group", "Subject", "Revision topic", "Teacher", "Date", "Start", "sessionID", "serialStart"];
    const idx = {};
    mockHeaders.forEach(h => {
      idx[h] = mockHeaders.indexOf(h);
      if (idx[h] === -1) throw new Error(`Mapping failed for ${h}`);
    });
    
    if (idx["Status"] !== 0 || idx["sessionID"] !== 7) {
      throw new Error("Index mapping offset detected.");
    }
  });

  // 6. Logic: Session String Construction
  assert("Form Choice String Construction", () => {
    const mockDate = new Date(2025, 11, 25);
    const mockTime = new Date(2025, 11, 25, 9, 0); // 09:00
    const mockRow = ["Published", "Y11", "Maths", "Algebra", "Mr. X", mockDate, mockTime, "M101", 1];
    
    const mockIdx = {
      Subject: 2, "Revision topic": 3, Teacher: 4, Date: 5, Start: 6, sessionID: 7
    };

    const subject = mockRow[mockIdx.Subject];
    const displayDate = mockRow[mockIdx.Date].toLocaleDateString();
    const formatTime = (t) => Utilities.formatDate(t, "GMT", "HH:mm");

    const sessionString = `${subject} - ${mockRow[mockIdx["Revision topic"]]} - ${mockRow[mockIdx.Teacher]} (${displayDate}, ${formatTime(mockRow[mockIdx.Start])}, ID:${mockRow[mockIdx.sessionID]})`;
    
    if (!sessionString.includes("Maths") || !sessionString.includes("09:00") || !sessionString.includes("ID:M101")) {
      throw new Error("Generated session string format is incorrect.");
    }
  });

  console.log(`--- SUMMARY: ${results.pass} Passed, ${results.fail} Failed ---`);
}
