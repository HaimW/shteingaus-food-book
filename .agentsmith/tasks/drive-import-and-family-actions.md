# Drive import, sub-folder sync, family actions (R13) and phase 5
Status: phase 5 code done; owner setup pending (see "Open")      Path: complex
Dates: 2026-10-30 → 2026-10-31

## 1. One-time import of the family recipes (2026-10-30)
- Source: wife's folder "מתכוני אוכל" (0B1Rs2lJhOAzSTGdIM3cwR2ZBYm8) — 77 Google Docs + 16 images
  (Instagram/Facebook screenshots, a handwritten card) in a root folder and 4 sub-folders. Left untouched.
- Read via the service account (the Claude Drive connector runs as yafim.sh@gmail.com and cannot see it).
- Claude rewrote each recipe into the template layout (details table, מצרכים / אופן ההכנה / הערות),
  assigned meal + dish type, English slug, translated English recipes, transcribed screenshots,
  cropped dish photos. Content not in the source is highlighted yellow in the doc + noted on the page.
- Created in a new folder "מתכונים לאתר" (1bX6rcnwoGFKlD3V5OZ88zYeef_d2LMPI, owner yafim.sh@gmail.com,
  Editor: kharin9188@gmail.com, Viewer: service account) with the same sub-folders + a "תבנית מתכון"
  template in each folder. Photos were served to Google Docs import from a temporary branch
  (deleted afterwards).
- Skipped: "חלות של רוני" (empty doc), one duplicate image. Result: 91 recipes. Sample recipes removed.
- DRIVE_FOLDER_ID (repo variable) points at the new folder.

## 2. Sync changes
- Reads sub-folders (up to 3 levels); folder name → dish-type hint when the doc has none.
- Skips "תבנית מתכון" / "עותק של תבנית מתכון".
- New doc rows: נוסה (tested, boolean) and דירוג (rating 1–5) → frontmatter `tested`, `rating`.

## 3. R13 — tested badge, star rating, edit link
- Recipe page: ✓ נוסה / טרם נוסה badge, StarRating (clickable via Apps Script), "עריכה ב-Google Docs",
  "הדפסה". Cards: stars + ✓ נוסה. Index v2 includes tested + rating.
- apps-script/Code.gs: web app, executes as the user accessing it; actions tested / rate / sync;
  checks the doc is inside the recipes folder; GITHUB_TOKEN in script properties; 60 s dispatch cooldown.
- Verified end to end by the owner: 5 stars on פלאפל → doc row דירוג: 5 → sync run → live page shows 5/5.

## 4. Phase 5
- Footer "סנכרן עכשיו" link (returns to the current page); print stylesheet + "הדפסה" button.
- "הוסף מתכון": createRecipeForm() builds the Google Form + submit trigger; onRecipeSubmit() creates a
  template-layout doc in the chosen folder (photos from the file-upload question) and starts the sync.
  Header button appears when FORM_URL is set in src/lib/config.ts.

## Verification
- npm test: 120 passed · npm run check: 0 errors · build: 100 pages · check:links: 0 problems.
- Real sync: 91 added, second run 91 unchanged; GitHub sync workflow run against the new folder: success.
- Apps Script form code: syntax-checked only (node --check); not yet run in Google.

## Open (also in docs/build-plan.md → Open items)
- Owner: deploy the new Apps Script version; run createRecipeForm; add the "תמונות" upload question;
  send the public form link → FORM_URL.
- Then: end-to-end form test; converter fixture test for a form-created doc.
