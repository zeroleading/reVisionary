/**
 * UTILITY FUNCTIONS
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

function extractSessionId(label) {
  const match = label.match(/ID:([A-Za-z0-9]+)\)$/);
  return match ? match[1] : null;
}

/**
 * Loads the HTML signature from the EmailSignature.html file.
 */
function getEmailSignature() {
  try {
    return HtmlService.createHtmlOutputFromFile(CONFIG.SIGNATURE_FILE).getContent();
  } catch (e) {
    console.error(`Signature Load Error: ${e.message}`);
    return "<p>Kind regards,<br>Assessment Team</p>";
  }
}
