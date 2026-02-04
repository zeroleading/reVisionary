/**
 * Helper to safely parse "dd/MM/yyyy" strings into Date objects.
 */
function parseBritishDate(dateInput) {
  if (dateInput instanceof Date) {
    return new Date(dateInput); 
  }

  if (typeof dateInput === 'string') {
    const parts = dateInput.split('/');
    if (parts.length === 3) {
      return new Date(parts[2], parts[1] - 1, parts[0]);
    }
  }

  console.warn("Could not parse date:", dateInput);
  return null; 
}

/**
 * Extracts sessionID from a form checkbox string using Regex.
 * Example: "Maths - Algebra (25/12, 09:00, ID:101)" -> "101"
 */
function extractSessionId(itemString) {
  const match = itemString.match(/ID:(\w+)\)/);
  return match ? match[1] : null;
}
