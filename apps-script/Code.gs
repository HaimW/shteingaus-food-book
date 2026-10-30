/**
 * Shteingaus food book — family actions web app (Google Apps Script).
 *
 * Deployed as a web app that runs AS THE PERSON WHO OPENS IT, so it can only edit
 * recipe docs that person may edit (the "מתכונים לאתר" folder is shared with the family).
 *
 *   ?action=tested&doc=<docId>&value=yes|no&back=<recipe page URL>
 *       sets the "נוסה" row in the doc's details table, then starts the site sync.
 *   ?action=rate&doc=<docId>&value=1..5&back=<recipe page URL>
 *       sets the "דירוג" (1–5 stars) row, then starts the site sync.
 *   ?action=sync&back=<url>
 *       starts the site sync (the "סנכרן עכשיו" button).
 *
 * Script properties (Project settings → Script properties):
 *   GITHUB_TOKEN  fine-grained GitHub token: repo HaimW/shteingaus-food-book only,
 *                 permission "Actions: Read and write". Never put it in the website.
 * Setup guide: docs/apps-script-setup.md
 */

var ROOT_FOLDER_ID = '1bX6rcnwoGFKlD3V5OZ88zYeef_d2LMPI'; // "מתכונים לאתר"
var REPO = 'HaimW/shteingaus-food-book';
var WORKFLOW = 'sync.yml';
var SITE = 'https://haimw.github.io/shteingaus-food-book/';
var TESTED_LABEL = 'נוסה';
var RATING_LABEL = 'דירוג';

function doGet(e) {
  var p = (e && e.parameter) || {};
  var back = safeBack(p.back);
  try {
    if (p.action === 'tested') {
      var tested = p.value === 'yes';
      var title = setRow(p.doc, TESTED_LABEL, tested ? 'כן' : 'לא');
      var synced = startSync();
      return page(
        tested ? '✓ סומן כנוסה' : 'סומן כ"טרם נוסה"',
        '"' + title + '" עודכן במסמך. ' + (synced ? 'האתר יתעדכן בעוד כ-3 דקות.' : 'האתר יתעדכן בסנכרון הקרוב.'),
        back
      );
    }
    if (p.action === 'rate') {
      var stars = parseInt(p.value, 10);
      if (!(stars >= 1 && stars <= 5)) throw new Error('דירוג לא תקין.');
      var rated = setRow(p.doc, RATING_LABEL, String(stars));
      var syncedRate = startSync();
      return page(
        new Array(stars + 1).join('★') + new Array(6 - stars).join('☆'),
        '"' + rated + '" דורג ' + stars + ' מתוך 5. ' + (syncedRate ? 'האתר יתעדכן בעוד כ-3 דקות.' : 'האתר יתעדכן בסנכרון הקרוב.'),
        back
      );
    }
    if (p.action === 'sync') {
      var started = startSync();
      return page(
        started ? 'הסנכרון התחיל' : 'סנכרון כבר רץ',
        started ? 'האתר יתעדכן בעוד כ-3 דקות.' : 'סנכרון התחיל לפני רגע — האתר יתעדכן בקרוב.',
        back
      );
    }
    return page('פעולה לא מוכרת', 'הקישור לא תקין.', back);
  } catch (err) {
    return page('משהו השתבש', String(err && err.message ? err.message : err), back);
  }
}

/** Set a "label | value" row of the doc's first table (adding the row, or a table, when missing). */
function setRow(docId, label, value) {
  if (!docId || !/^[\w-]{20,}$/.test(docId)) throw new Error('מזהה מסמך לא תקין.');
  if (!inRecipesFolder(docId)) throw new Error('המסמך לא נמצא בתיקייה "מתכונים לאתר".');
  var doc = DocumentApp.openById(docId); // fails if this person can't open/edit the doc
  var body = doc.getBody();
  var tables = body.getTables();
  if (tables.length === 0) {
    body.insertTable(0, [[label, value]]);
  } else {
    var table = tables[0];
    var done = false;
    for (var r = 0; r < table.getNumRows() && !done; r++) {
      var row = table.getRow(r);
      if (row.getNumCells() >= 2 && row.getCell(0).getText().replace(/[:\s?]/g, '') === label) {
        row.getCell(1).setText(value);
        done = true;
      }
    }
    if (!done) {
      var newRow = table.appendTableRow();
      newRow.appendTableCell(label).editAsText().setBold(true);
      newRow.appendTableCell(value).editAsText().setBold(false);
    }
  }
  doc.saveAndClose();
  return doc.getName();
}

/** True if the file sits in the recipes folder or one of its sub-folders. */
function inRecipesFolder(fileId) {
  var queue = [DriveApp.getFileById(fileId)];
  for (var depth = 0; depth < 5 && queue.length; depth++) {
    var next = [];
    for (var i = 0; i < queue.length; i++) {
      var parents = queue[i].getParents();
      while (parents.hasNext()) {
        var f = parents.next();
        if (f.getId() === ROOT_FOLDER_ID) return true;
        next.push(f);
      }
    }
    queue = next;
  }
  return false;
}

/** Start the GitHub sync workflow; at most once a minute. Returns false if skipped. */
function startSync() {
  var cache = CacheService.getScriptCache();
  if (cache.get('sync-started')) return false;
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('חסר GITHUB_TOKEN בהגדרות הסקריפט.');
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 204) throw new Error('GitHub: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
  cache.put('sync-started', '1', 60);
  return true;
}

/** Only links back to our own site. */
function safeBack(url) {
  return url && String(url).indexOf(SITE) === 0 ? String(url) : SITE;
}

function page(title, message, back) {
  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var html =
    '<!doctype html><html lang="he" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_top">' +
    '<style>body{font-family:Arial,sans-serif;background:#fbf6ef;color:#3b2a20;margin:0;padding:2rem 1rem;text-align:center}' +
    'h1{font-size:1.6rem}p{font-size:1.1rem}a{display:inline-block;margin-top:1rem;padding:.7rem 1.4rem;border-radius:.6rem;background:#b5512a;color:#fff;text-decoration:none;font-weight:bold}</style>' +
    '</head><body><h1>' + esc(title) + '</h1><p>' + esc(message) + '</p><a href="' + esc(back) + '">חזרה לאתר</a></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('ספר המתכונים').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
