/**
 * GLOBAL CONFIGURATION
 */
const CONFIG = {
  FORMS: {
    "Y11": "YOUR_Y11_FORM_ID_HERE",
    "Y13": "YOUR_Y13_FORM_ID_HERE"
  },
  SHEET_NAME: "sessions",
  BOOKINGS_SHEET: "Bookings",
  AUDIT_SHEET: "NotificationAudit",
  HEADER_ROW: 3,
  ADMIN_EMAIL: Session.getEffectiveUser().getEmail(),
  
  AUTHORIZED_USERS: [
    "jappleton@csg.school",
    "tnayagam@csg.school",
    "cblack@csg.school"
  ]
};

/**
 * Creates the Custom Menu when the sheet is opened.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛡️ Revision Admin')
    .addItem('Sync Forms Now (Manual)', 'manualFormSync')
    .addSeparator()
    .addItem('Run Master 10PM Update (Manual)', 'masterDailyUpdate')
    .addSeparator()
    .addItem('Run System Tests', 'runSystemTests')
    .addToUi();
}

function checkAuth() {
  const user = Session.getEffectiveUser().getEmail();
  if (!CONFIG.AUTHORIZED_USERS.includes(user)) {
    throw new Error(`🚫 Unauthorized Access: ${user} does not have permission.`);
  }
  return true;
}

function setupSystemTriggers() {
  checkAuth();
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  
  ScriptApp.newTrigger('masterDailyUpdate')
    .timeBased().everyDays(1).atHour(22).create();

  Object.values(CONFIG.FORMS).forEach(id => {
    if (id && id !== "YOUR_Y11_FORM_ID_HERE") {
      ScriptApp.newTrigger('onFormSubmitHandler')
        .forForm(id)
        .onFormSubmit()
        .create();
    }
  });
}
