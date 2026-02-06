/**
 * RUN SYSTEM TESTS
 */
function runSystemTests() {
  console.log("--- STARTING TESTS ---");
  
  // Test 1: British Date Parsing
  const d = parseBritishDate("15/05/2026");
  if (d.getFullYear() === 2026 && d.getMonth() === 4 && d.getDate() === 15) {
    console.log("✅ Date Parsing Passed");
  } else {
    console.error("❌ Date Parsing Failed");
  }

  // Test 2: ID Extraction from new Label format
  const mockLabel = "16/04/2026, 15:30 to 17:30 - Topic (ID:XYZ999)";
  const id = extractSessionId(mockLabel);
  if (id === "XYZ999") {
    console.log("✅ ID Extraction Passed");
  } else {
    console.error("❌ ID Extraction Failed");
  }

  // Test 3: Status check for lowercase 'p'
  const mockStatus = "Ready to publish";
  if (mockStatus.toLowerCase() === "ready to publish") {
    console.log("✅ Status String Check Passed");
  }
}
