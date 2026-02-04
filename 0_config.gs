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
  
  // 🔒 SECURITY WHITELIST
  AUTHORIZED_USERS: [
    "jappleton@csg.school",
    "tnayagam@csg.school",
    "cblack@csg.school"
  ]
};

/**
 * Security Guard
 */
function checkAuth() {
  const user = Session.getEffectiveUser().getEmail();
  if (!CONFIG.AUTHORIZED_USERS.includes(user)) {
    throw new Error(`🚫 Unauthorized Access: ${user} does not have permission.`);
  }
  return true;
}

/**
 * Setup Daily Triggers and Form Submission Triggers
 */
function setupSystemTriggers() {
  checkAuth();
  const triggers = ScriptApp.getProjectTriggers();
  
  // Clear all existing
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  
  // 1. Daily Sync (Forms)
  ScriptApp.newTrigger('syncSheetToForms')
    .timeBased().everyDays(1).atHour(4).create();
    
  // 2. Daily Registers (5 PM for next day)
  ScriptApp.newTrigger('generateDailyRegisters')
    .timeBased().everyDays(1).atHour(17).create();

  // 3. Form Submit Triggers (Clash Detection)
  // You must run this once to link the forms
  Object.values(CONFIG.FORMS).forEach(id => {
    if (id && id !== "YOUR_Y11_FORM_ID_HERE") {
      FormApp.openById(id); // Ensure access
      ScriptApp.newTrigger('onFormSubmitHandler')
        .forForm(id)
        .onFormSubmit()
        .create();
    }
  });
}
