/**
 * GLOBAL CONFIGURATION & WHITELIST
 */
const CONFIG = {
  FORMS: {
    "Y11": "1HDgee17bZTrJXQIjgCRU3LwYNyETRMvbDTYuYrC5WRQ",
    "Y13": "1DoCO23m5bfoDld2BBmWBu5tsP_F1kRW-Lowu3Ou_fEo"
  },
  SHEET_NAME: "sessions",
  BOOKINGS_SHEET: "bookings",
  AUDIT_SHEET: "notificationAudit",
  HEADER_ROW: 3,
  ADMIN_EMAIL: Session.getEffectiveUser().getEmail(),
  SIGNATURE_FILE: "EmailSignature",
  
  AUTHORIZED_USERS: [
    "assessment@csg.school",
    "jappleton@csg.school",
    "tnayagam@csg.school",
    "cblack@csg.school",
    "jtani@csg.school"
  ]
};

/**
 * Creates the Custom Menu.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛡️ Revision Admin')
    .addItem('Sync Forms Now (Manual)', 'manualFormSync')
    .addSeparator()
    .addItem('Preview Specific Register', 'previewRegister')
    .addSeparator()
    .addItem('Run Master 10PM Update (Manual)', 'masterDailyUpdate')
    .addSeparator()
    .addItem('Run Logic Tests', 'runSystemTests')
    .addItem('Send Visual Email Tests', 'testEmailSystem')
    .addToUi();
}

/**
 * Security Middleware.
 */
function checkAuth() {
  const user = Session.getEffectiveUser().getEmail();
  if (!CONFIG.AUTHORIZED_USERS.includes(user)) {
    throw new Error(`🚫 Unauthorized Access: ${user} does not have permission.`);
  }
  return true;
}

/**
 * Trigger Initialization.
 */
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
