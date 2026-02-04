/**
 * Syncs Sheet data to Forms. 
 * Uses parseBritishDate for date safety.
 */
function syncSheetToForms() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(CONFIG.HEADER_ROW, 1, lastRow - (CONFIG.HEADER_ROW - 1), sheet.getLastColumn()).getValues();
  const headers = data.shift();

  const col = (name) => headers.indexOf(name);
  const statusIdx = col("Status");

  const collections = { "Y11": {}, "Y13": {} };
  let publishedCount = 0;

  data.forEach((row) => {
    const status = row[statusIdx];
    const year = row[col("Year group")];
    
    if ((status === "Published" || status === "Ready to Publish") && collections[year]) {
      const subject = row[col("Subject")];
      const parsedDate = parseBritishDate(row[col("Date")]);
      const displayDate = parsedDate ? parsedDate.toLocaleDateString('en-GB') : "TBC";
      
      const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();

      const sessionString = `${subject} - ${row[col("Revision topic")]} - ${row[col("Teacher")]} (${displayDate}, ${formatTime(row[col("Start")])}, ID:${row[col("sessionID")]})`;
      
      if (!collections[year][subject]) collections[year][subject] = [];
      collections[year][subject].push({ text: sessionString, sort: row[col("serialStart")] });
      
      if (status === "Ready to Publish") {
        row[statusIdx] = "Published";
        publishedCount++;
      }
    }
  });

  // Rebuild Forms
  for (let year in collections) {
    if (CONFIG.FORMS[year]) {
      for (let sub in collections[year]) {
        collections[year][sub].sort((a, b) => a.sort - b.sort);
      }
      updateSingleForm(CONFIG.FORMS[year], collections[year]);
    }
  }

  // Batch update statuses
  const statusValues = data.map(row => [row[statusIdx]]);
  sheet.getRange(CONFIG.HEADER_ROW + 1, statusIdx + 1, data.length, 1).setValues(statusValues);
}

function updateSingleForm(formId, subjectMap) {
  try {
    const form = FormApp.openById(formId);
    const items = form.getItems();
    items.forEach(item => form.deleteItem(item));

    const navItem = form.addMultipleChoiceItem()
      .setTitle("Which subject would you like to view sessions for?")
      .setRequired(true);

    const sortedSubjects = Object.keys(subjectMap).sort();
    const choices = [];

    sortedSubjects.forEach(subject => {
      const section = form.addPageBreakItem().setTitle(subject);
      form.addCheckboxItem()
        .setTitle(`Available ${subject} Sessions`)
        .setChoices(subjectMap[subject].map(s => form.createChoice(s.text)));
      choices.push(navItem.createChoice(subject, section));
    });

    navItem.setChoices(choices);
  } catch (e) { console.error(`Sync Error: ${e.message}`); }
}
