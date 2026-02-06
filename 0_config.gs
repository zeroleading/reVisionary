/**
 * GLOBAL CONFIGURATION
 */
const CONFIG = {
  FORMS: {
    "Y11": "1r66B_d72pi34nWioCIMH0ybs_cZZvbYy4ig6d_VYVkM",
    "Y13": "1woPODf5h-d6J-ATCOfA04f_xkWGQT-EC8lNAYFMyyfo"
  },
  SHEET_NAME: "sessions",
  BOOKINGS_SHEET: "bookings",
  AUDIT_SHEET: "notificationAudit",
  HEADER_ROW: 3,
  ADMIN_EMAIL: Session.getEffectiveUser().getEmail(),
  
  AUTHORIZED_USERS: [
    "jappleton@csg.school",
    "tnayagam@csg.school",
    "cblack@csg.school",
    "jtani@csg.school"
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
