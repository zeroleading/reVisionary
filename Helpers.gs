/**
 * Parses dd/MM/yyyy strings or Date objects safely.
 */
function parseBritishDate(dateInput) {
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput !== 'string') return new Date(0);
  const parts = dateInput.split('/');
  if (parts.length === 3) {
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return new Date(dateInput);
}

/**
 * Extracts sessionID from a form label e.g., "... (ID:ABC12345)"
 */
function extractSessionId(label) {
  const match = label.match(/ID:([A-Za-z0-9]+)\)$/);
  return match ? match[1] : null;
}
