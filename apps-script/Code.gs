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
 * "הוסף מתכון" Google Form (build-plan R12):
 *   run createRecipeForm() once from the editor. It creates the form, connects
 *   onRecipeSubmit() to it, and logs the form's public link. Each submission becomes
 *   a Google Doc in the template layout in the chosen folder, then the sync starts.
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

// ---------------------------------------------------------------------------
// "הוסף מתכון" Google Form

var FORM_TITLES = {
  title: 'שם המתכון',
  folder: 'תיקייה',
  meal: 'ארוחה',
  dish: 'סוג מנה',
  author: 'מאת',
  servings: 'מנות',
  prep: 'זמן הכנה',
  cook: 'זמן בישול',
  ingredients: 'מצרכים',
  steps: 'אופן ההכנה',
  notes: 'הערות',
  tested: 'כבר ניסינו את המתכון?',
  photos: 'תמונות',
};
var MAIN_FOLDER_CHOICE = 'ראשית (בלי תת-תיקייה)';

/** Run once from the editor: creates the form and connects onRecipeSubmit to it. */
function createRecipeForm() {
  var T = FORM_TITLES;
  var form = FormApp.create('הוסף מתכון — ספר המתכונים משפחת שטיינגאוס');
  form
    .setDescription('ממלאים, שולחים — והמתכון מופיע באתר תוך כמה דקות. אפשר לתקן אחר כך במסמך ה-Google Docs שנוצר.')
    .setConfirmationMessage('תודה! המתכון יופיע באתר בעוד כ-3 דקות.')
    .setCollectEmail(false)
    .setAllowResponseEdits(false);

  form.addTextItem().setTitle(T.title).setRequired(true);
  var folders = [MAIN_FOLDER_CHOICE];
  var it = DriveApp.getFolderById(ROOT_FOLDER_ID).getFolders();
  while (it.hasNext()) folders.push(it.next().getName());
  form.addListItem().setTitle(T.folder).setChoiceValues(folders).setRequired(true);
  form.addCheckboxItem().setTitle(T.meal).setChoiceValues(['ארוחת בוקר', 'ארוחת צהריים', 'ארוחת ערב', 'קינוח']);
  form.addCheckboxItem().setTitle(T.dish).setChoiceValues(['מנה עיקרית', 'תוספת', 'סלט', 'קינוח', 'אחר']);
  form.addTextItem().setTitle(T.author).setHelpText('ממי המתכון (לא חובה)');
  form.addTextItem().setTitle(T.servings);
  form.addTextItem().setTitle(T.prep).setHelpText('למשל "20 דקות"');
  form.addTextItem().setTitle(T.cook).setHelpText('למשל "45 דקות"');
  form.addParagraphTextItem().setTitle(T.ingredients).setHelpText('מצרך אחד בכל שורה, למשל "2 כוסות קמח". כותרת משנה בשורה נפרדת, למשל "לרוטב:"');
  form.addParagraphTextItem().setTitle(T.steps).setHelpText('שלב אחד בכל שורה');
  form.addParagraphTextItem().setTitle(T.notes).setHelpText('טיפים, החלפות, הגשה (לא חובה)');
  form.addMultipleChoiceItem().setTitle(T.tested).setChoiceValues(['כן', 'עוד לא']);

  ScriptApp.newTrigger('onRecipeSubmit').forForm(form).onFormSubmit().create();
  PropertiesService.getScriptProperties().setProperty('FORM_ID', form.getId());
  Logger.log('Public link (for the website): ' + form.getPublishedUrl());
  Logger.log('Edit the form (add the photos question): ' + form.getEditUrl());
}

/** Form trigger: one submission -> one recipe doc in the template layout. */
function onRecipeSubmit(e) {
  var T = FORM_TITLES;
  var a = {};
  e.response.getItemResponses().forEach(function (r) {
    a[r.getItem().getTitle()] = r.getResponse();
  });
  var list = function (v) { return Array.isArray(v) ? v.join(', ') : v ? String(v) : ''; };
  var lines = function (v) {
    return String(v || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(String);
  };

  var title = String(a[T.title] || 'מתכון חדש').trim();
  var doc = DocumentApp.create(title);
  var body = doc.getBody();
  var rtl = function (el) { el.setLeftToRight(false); return el; };

  var rows = [
    [T.meal, list(a[T.meal])],
    [T.dish, list(a[T.dish])],
    [T.author, list(a[T.author])],
    [T.servings, list(a[T.servings])],
    [T.prep, list(a[T.prep])],
    [T.cook, list(a[T.cook])],
  ];
  if (a[T.tested]) rows.push([TESTED_LABEL, a[T.tested] === 'כן' ? 'כן' : 'לא']);
  var table = body.appendTable(rows);
  for (var r = 0; r < table.getNumRows(); r++) table.getRow(r).getCell(0).editAsText().setBold(true);

  // Photos (file-upload question): the first one becomes the main photo.
  var photoIds = a[T.photos] || [];
  (Array.isArray(photoIds) ? photoIds : [photoIds]).forEach(function (id) {
    try {
      var img = body.appendImage(DriveApp.getFileById(id).getBlob());
      var w = img.getWidth(), h = img.getHeight();
      if (w > 480) img.setWidth(480).setHeight(Math.round((h * 480) / w));
    } catch (err) {
      rtl(body.appendParagraph('(תמונה לא נטענה: ' + err + ')'));
    }
  });

  rtl(body.appendParagraph(T.ingredients).setHeading(DocumentApp.ParagraphHeading.HEADING2));
  lines(a[T.ingredients]).forEach(function (l) {
    rtl(body.appendListItem(l.replace(/^[-*•·]\s*/, '')).setGlyphType(DocumentApp.GlyphType.BULLET));
  });
  rtl(body.appendParagraph(T.steps).setHeading(DocumentApp.ParagraphHeading.HEADING2));
  lines(a[T.steps]).forEach(function (l) {
    rtl(body.appendListItem(l.replace(/^\d+\s*[.)\-]\s*/, '')).setGlyphType(DocumentApp.GlyphType.NUMBER));
  });
  var notes = lines(a[T.notes]);
  if (notes.length) {
    rtl(body.appendParagraph(T.notes).setHeading(DocumentApp.ParagraphHeading.HEADING2));
    notes.forEach(function (l) { rtl(body.appendParagraph(l)); });
  }
  doc.saveAndClose();

  DriveApp.getFileById(doc.getId()).moveTo(targetFolder(a[T.folder]));
  try {
    startSync();
  } catch (err) {
    console.error('sync not started: ' + err); // the daily sync will pick it up
  }
}

function targetFolder(name) {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  if (name && name !== MAIN_FOLDER_CHOICE) {
    var it = root.getFoldersByName(name);
    if (it.hasNext()) return it.next();
  }
  return root;
}
