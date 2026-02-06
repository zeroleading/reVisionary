/**
 * THE MASTER SYNC: Runs at 10 PM.
 */
function masterDailyUpdate() {
  checkAuth();
  const stats = generateDailyRegisters(); 
  rebuildFormsFromSheet(true); 
  console.log(`Master Update Complete: ${stats.registersSent} registers sent.`);
}

/**
 * MANUAL SYNC: Updates 'Ready to publish' sessions and refreshes forms immediately.
 */
function manualFormSync() {
  checkAuth();
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Manual Sync', 'This will publish "Ready to publish" sessions, process "Cancelled" sessions, and refresh forms. Proceed?', ui.ButtonSet.YES_NO);
  
  if (response == ui.Button.YES) {
    rebuildFormsFromSheet(true); 
    ui.alert('Sync Complete', 'Forms updated and notifications sent.', ui.ButtonSet.OK);
  }
}

/**
 * CORE LOGIC: Processes row statuses and rebuilds the Google Forms.
 */
function rebuildFormsFromSheet(handleNotifications) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.HEADER_ROW) return;

  const fullRange = sheet.getRange(CONFIG.HEADER_ROW, 1, lastRow - (CONFIG.HEADER_ROW - 1), sheet.getLastColumn());
  const data = fullRange.getValues();
  const headers = data.shift();

  const col = (name) => headers.indexOf(name);
  const statusIdx = col("Status");
  const notifiedIdx = col("notifiedCount"); // NEW COLUMN INDEX
  const collections = { "Y11": {}, "Y13": {} };

  data.forEach((row) => {
    let status = row[statusIdx];
    const year = row[col("Year group")];
    
    if (status === "Ready to publish") {
      status = "Published";
      row[statusIdx] = "Published";
    }

    if (handleNotifications && status === "Cancelled") {
      const sessionId = row[col("sessionID")].toString();
      const sessionDetails = {
        subject: row[col("Subject")],
        topic: row[col("Revision topic")],
        date: parseBritishDate(row[col("Date")]).toLocaleDateString('en-GB'),
        time: (row[col("Start")] instanceof Date) ? Utilities.formatDate(row[col("Start")], Session.getScriptTimeZone(), "HH:mm") : row[col("Start")]
      };
      
      const count = performCancellationNotifications(sessionId, sessionDetails);
      
      // LOGIC UPDATE:
      // We write the count to the new column instead of the status column
      if (notifiedIdx !== -1) {
        row[notifiedIdx] = `${count} Notified`;
      }
      row[statusIdx] = "Cancelled"; 
    }

    if (status === "Published" && collections[year]) {
      const subject = row[col("Subject")];
      const parsedDate = parseBritishDate(row[col("Date")]);
      const displayDate = parsedDate ? parsedDate.toLocaleDateString('en-GB') : "TBC";
      const formatTime = (t) => (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "HH:mm") : t.toString();

      const sessionString = `${displayDate}, ${formatTime(row[col("Start")])} to ${formatTime(row[col("End")])} - ${row[col("Revision topic")]} with ${row[col("Teacher")]} (ID:${row[col("sessionID")]})`;
      
      if (!collections[year][subject]) collections[year][subject] = [];
      collections[year][subject].push({ text: sessionString, sort: row[col("serialStart")] });
    }
  });

  // Batch update statuses AND notified counts
  const updatedColumns = data.map(row => {
    const rowOutput = new Array(headers.length).fill(null);
    rowOutput[statusIdx] = row[statusIdx];
    if (notifiedIdx !== -1) rowOutput[notifiedIdx] = row[notifiedIdx];
    return rowOutput;
  });

  // To be safe and efficient, we update the whole range with the new data array values
  sheet.getRange(CONFIG.HEADER_ROW + 1, 1, data.length, headers.length).setValues(data);

  for (let year in collections) {
    if (CONFIG.FORMS[year]) {
      for (let sub in collections[year]) {
        collections[year][sub].sort((a, b) => a.sort - b.sort);
      }
      updateSingleForm(CONFIG.FORMS[year], collections[year]);
    }
  }
}

// ... updateSingleForm and performCancellationNotifications remain the same ...
