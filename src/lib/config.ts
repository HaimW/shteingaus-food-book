// Site settings that are not secrets.

/**
 * URL of the family's Google Apps Script web app (apps-script/Code.gs). It edits a
 * recipe's Google Doc (e.g. the "נוסה" row) as the signed-in family member and then
 * starts the Drive sync. Empty = the buttons that need it are hidden.
 * Setup: docs/apps-script-setup.md.
 */
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz5F5hHQa_A1Ex5yEjy4Mzr52Q_noXYasBiXDYUdthYC03UGK7_C-pcHdspWsog-BcH2Q/exec';

/**
 * Public URL of the "הוסף מתכון" Google Form (created by createRecipeForm() in
 * apps-script/Code.gs). Empty = the "הוסף מתכון" button is hidden.
 */
export const FORM_URL = '';

/** Absolute URL of the live site (for "back to the recipe" links from Apps Script). */
export const SITE_URL = 'https://haimw.github.io/shteingaus-food-book/';
