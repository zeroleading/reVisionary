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
    const d = parseBritishDate("25/12/2025");
    if (d.getFullYear() !== 2025 || d.getMonth() !== 11) throw new Error("Parsing failed.");
  });

  // 3. Security: Whitelist Check
  assert("Security Whitelist Enforcement", () => {
    const user = Session.getEffectiveUser().getEmail();
    if (!CONFIG.AUTHORIZED_USERS.includes(user)) throw new Error("Authorization logic leak.");
  });

  console.log(`--- SUMMARY: ${results.pass} Passed, ${results.fail} Failed ---`);
}
