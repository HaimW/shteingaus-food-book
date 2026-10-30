# Build Plan — Shteingaus Food Book

Status: **approved by owner** (2026-10-30). Phases 1–4 live; phase 5 code live, form setup pending (see [Status](#status-2026-10-31) and [Open items](#open-items)).

## Goal

A public Hebrew (RTL) family recipe website on GitHub Pages:
https://haimw.github.io/shteingaus-food-book/

Recipes live in a shared Google Drive folder of Google Docs. The website picks them up automatically.

## Requirements

### R1. Site
- Astro static site, `lang="he"` `dir="rtl"`, Hebrew web font (e.g. Heebo/Assistant), mobile-first.
- Pages: home (recipe card grid), recipe page, meal-category pages, search, random recipe, meal builder, "needs fixing" page.
- "סנכרן עכשיו" (sync now) button (R8) and "הוסף מתכון" (add recipe) button opening the recipe form (R12).
- Print-friendly recipe page (one clean page, no nav).
- English URL slugs, e.g. `/recipes/grandma-cheesecake` (from the doc's `slug` field, else transliterated from the title; stable once assigned).
- Repo and site are public.

### R2. Recipe model
Each Google Doc becomes one Markdown file in `src/content/recipes/` plus its images. Frontmatter:

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Hebrew title (the doc's title) |
| `slug` | no | English URL; generated if missing, then kept stable |
| `meal` | expected | one or more of: `breakfast` (ארוחת בוקר), `lunch` (ארוחת צהריים), `dinner` (ארוחת ערב), `dessert` (קינוח) |
| `dishType` | expected | **one or more** of: `main` (מנה עיקרית / חלבון), `side` (תוספת), `salad` (סלט), `dessert` (קינוח), `other` — used by the meal builder |
| `ingredients` | expected | list of ingredients (quantity + item), e.g. `2 כוסות קמח`; may be missing (see R3) |
| `servings`, `prepTime`, `cookTime` | no | |
| `author` | no | family member the recipe comes from |
| `image` | no | main photo (first image in the doc) |
| `tags` | no | |
| `tested` | no | doc row **נוסה** (כן/לא) — set by the "סמנו כנוסה" button (R13) or by hand |
| `rating` | no | doc row **דירוג** (1–5) — set by the star bar (R13) or by hand |
| `driveId`, `driveModified` | yes (auto) | link back to the source doc; written by the sync |

Body: אופן ההכנה (steps), הערות (notes).

Recipe content never fails the build:
- `meal` / `dishType` accept the English key or the Hebrew label (e.g. `ארוחת ערב`). Missing or unknown values (not in the allowed list) still publish; the recipe page shows a yellow **"צריך לתקן"** box naming the value and the allowed choices, and the recipe is left out of meal filters / the meal builder for that value until fixed.
- A missing photo, or an `image` path that doesn't exist, still publishes; the page shows a red "חסרה תמונה" placeholder and the issue is listed in the "צריך לתקן" box.
- Recipe cards show a "צריך לתקן (n)" badge, and every such recipe is listed on the "needs fixing" page (R9).

### R3. Ingredients section
- Every recipe page shows a dedicated **מצרכים** section, rendered from `ingredients`.
- A recipe without ingredients still builds and publishes; its page shows a **red "מצרכים חסרים" (missing ingredients) section** in place of the list. Missing ingredients never fail the build or the sync.

### R4. Search and filters
- Full-text search across **all words in all recipes** (title, ingredients, steps, notes, author, tags).
- Custom client-side search over a build-time JSON index (no Pagefind), Hebrew-aware:
  - strips niqqud and punctuation, normalizes final letters (ך/כ, ם/מ, ן/נ, ף/פ, ץ/צ);
  - matches words with attached prefixes (ו, ה, ב, ל, מ, ש, כ and combinations such as וה, וב, שב), so **בצל** finds **ובצל / הבצל / לבצל**;
  - ranks title matches above ingredient matches above body matches.
- Filter by meal: ארוחת בוקר / צהריים / ערב / קינוח, combinable with search.
- One shared recipe index powers search, filters, random recipe and meal builder.

### R5. Random recipe
- "מתכון אקראי" button: picks a random recipe (within the active meal filter, if any) and opens it; "another one" re-rolls.

### R6. Meal builder
- "בנה לי ארוחה" picks a full meal so nobody has to decide:
  - default: **main + side + salad**, optional **+ dessert** toggle;
  - user chooses which courses to include (2, 3 or more);
  - optional meal filter (lunch/dinner);
  - re-roll the whole meal or a single course; "lock" a course and re-roll the rest;
  - the same recipe is never picked twice in one meal (a recipe tagged `side` + `salad` can fill either course, not both);
  - shareable link to the generated meal (recipe slugs in the URL).
- If a course has no recipes, it is skipped with a friendly message.
- No kosher (meat/dairy) rules.
- Runs entirely in the browser from the shared recipe index.

### R7. Google Drive sync
- **Source of truth:** a Google Drive folder (e.g. "מתכונים לאתר") of Google Docs, one recipe per doc. Family members add/edit recipes there; no GitHub account needed. Editing happens only in Drive (no `/admin` editor).
- **Recipe template** (a Google Doc to copy):
  - top details table: ארוחה (meal), סוג מנה (dish type), מאת (author), מנות, זמן הכנה, זמן בישול, slug (optional);
  - headings (real Google Docs heading styles): מצרכים / אופן ההכנה / הערות;
  - photos pasted anywhere in the doc; the first one is the main photo;
  - optional rows **נוסה** and **דירוג** (R13).
  - Parser also tolerates the existing docs' layout (to be matched against a sample from the owner) and plain bold lines as headings.
- **Sync job** — GitHub Action:
  - runs **daily** on a schedule, and on demand (R8);
  - lists the folder **and its sub-folders** via the Google Drive API (service account with read-only access to the shared folder);
  - a sub-folder's name is a dish-type hint when the doc has none (סלטים → סלט, קציצות → מנה עיקרית, מרקים/לחם → אחר, קינוחים → קינוח);
  - docs named **"תבנית מתכון"** (and unrenamed copies "עותק של תבנית מתכון") are templates and never published;
  - for each doc: if new or `modifiedTime` changed → export (HTML), convert to Markdown + frontmatter, download and compress images;
  - doc deleted/removed from the folder → recipe removed;
  - nothing changed → no commit, no deploy;
  - commits changes and builds + deploys in the same workflow (Action commits don't trigger other workflows).
- **Never fails on content:** unparseable parts go into the body; missing fields → red section / "needs fixing" page. The job fails only on real errors (bad credentials, Drive API down), and then the live site stays as it was.
- **Existing recipes (done 2026-10-30, differently than first planned):** the originals in the wife's folder "מתכוני אוכל" (77 docs + 16 screenshots/photos, very mixed layouts) were **not** moved or edited. Claude read them all once and created cleaned-up copies in the template layout — with categories, slugs, translations of English recipes, transcribed screenshots/handwriting and cropped photos — in a new folder **"מתכונים לאתר"** (owned by yafim.sh@gmail.com, shared Editor with the wife). Content Claude had to add (missing steps/ingredients) is highlighted yellow in the docs and noted on the page. 91 recipes; the original folder stays as an archive.
- **Credentials:** Google service account key stored as a GitHub Actions secret (`GOOGLE_SERVICE_ACCOUNT_KEY`); read-only Drive scope. Setup guide in `docs/google-drive-setup.md`.

### R8. "Sync now" button
- A public static site cannot hold a GitHub token, so the button calls a small **Google Apps Script web app** (`apps-script/Code.gs`, `?action=sync`):
  - the Apps Script stores a fine-grained GitHub token (scope: this repo, Actions write only) in its script properties (`GITHUB_TOKEN`) — never in the website;
  - on request it triggers the sync workflow (`workflow_dispatch`);
  - cooldown: at most one dispatch per minute; extra presses get "סנכרון כבר רץ" (the workflow's concurrency group also queues overlapping runs).
- Implemented as a "סנכרן עכשיו" link in the site footer; the result page says "האתר יתעדכן בעוד כ-3 דקות" and links back to the page it was pressed on.
- The web app runs as the person who opens it ("Execute as: user accessing", "Anyone with Google account").
- Setup steps: `docs/apps-script-setup.md`.

### R12. "הוסף מתכון" recipe form (no AI)
- A **Google Form** owned by the owner, for adding a new recipe quickly from a phone:
  - שם המתכון (required);
  - ארוחה — checkboxes: ארוחת בוקר / צהריים / ערב / קינוח;
  - סוג מנה — checkboxes: מנה עיקרית / תוספת / סלט / קינוח / אחר (fixed choices, so categories can't be mistyped);
  - מצרכים — paragraph, one ingredient per line;
  - אופן ההכנה — paragraph, one step per line;
  - הערות, מאת, מנות, זמן הכנה, זמן בישול — optional;
  - תמונות — file upload (images only; requires the person to be signed in to Google). Apps Script cannot create file-upload questions, so the owner adds this one question by hand;
  - also: תיקייה (which sub-folder the doc goes to) and "כבר ניסינו את המתכון?" (→ נוסה row).
- A **Google Apps Script** bound to the form runs on each submission and creates a **Google Doc in the recipes folder in the exact template layout** (details table + מצרכים / אופן ההכנה / הערות headings + photos inserted), named after the recipe. The Doc stays the single source of truth for later edits (R7); the form is only a fast way to create it.
- The script then triggers the sync (same mechanism as R8), so the recipe appears on the site within a few minutes; otherwise the daily sync picks it up.
- Website: a "הוסף מתכון" button (header/home) linking to the form.
- The Apps Script code and form setup steps are committed in the repo (`apps-script/Code.gs`: `createRecipeForm()` run once from the editor builds the form and its submit trigger; `onRecipeSubmit()` handles submissions) with a step-by-step guide (`docs/apps-script-setup.md`, step 4); the owner installs it once.
- Tests: the Doc produced by the script is converted correctly by the R7 converter (fixture), including Hebrew, multiple photos and empty optional fields.

### R13. Tested badge, star rating, edit link (added 2026-10-30)
- Every recipe page shows a **"✓ נוסה" / "טרם נוסה"** badge and a **5-star family rating**; cards show the stars and "✓ נוסה". One shared family score per recipe (not per person).
- Both are stored **in the recipe's Google Doc** (rows **נוסה** and **דירוג** in the details table), so Drive stays the single source of truth; they can also be typed by hand.
- Buttons on the recipe page ("סמנו כנוסה ✓" / "סמנו כלא נוסה", tapping a star) open the Apps Script web app (`?action=tested|rate`), which runs **as the signed-in family member** — only people the folder is shared with as editors can change anything. It checks the doc is inside "מתכונים לאתר", sets the row (adding it if missing), starts the sync and links back.
- **"עריכה ב-Google Docs"** button on every recipe page opens its doc, so the family can fix and extend recipes.
- **"הדפסה"** button opens the print view (R1 print style).

### R9. "Needs fixing" page
- An unlisted page (not in navigation, `noindex`) listing every recipe with problems: missing ingredients, missing photo, missing meal or dish type. Each item links to the recipe page and to its **Google Doc** for editing.

### R10. Deploy
- GitHub Actions build + deploy to Pages on push to `main` and after each sync that changed something.
- One-time manual step: repo Settings → Pages → Source = "GitHub Actions".

### R11. Quality bar
- Converter tests on sample exported docs: Hebrew text, images, template layout, existing-doc layout, missing sections, messy formatting.
- Sync tests with a mocked Drive API: new / edited / deleted / unchanged docs; slug stays stable on edit.
- Unit tests: Hebrew search normalization/prefix matching, random pick, meal builder (course filling, no duplicates, locking, empty courses), sub-folders/templates/folder hints, נוסה/דירוג parsing.
- Build passes, no broken links (incl. the `/shteingaus-food-book/` base path), RTL verified on mobile + desktop, accessibility check passes.
- End-to-end check: add a doc to the Drive folder → press "sync now" → recipe appears on the site.

## Phases
1. Skeleton, layout, deploy, recipe schema + 4–6 sample recipes covering every meal and dish type.
2. Recipe page with ingredients section (incl. red missing state), shared recipe index, Hebrew search, meal filters.
3. Random recipe + meal builder.
4. Google Drive sync: Google Doc template, converter, daily sync Action, "needs fixing" page, setup guide. Owner does the Google Cloud setup (~15 min) and moves existing docs into the folder.
5. "Sync now" button (Apps Script), "הוסף מתכון" Google Form + Apps Script (R12), print style. Added along the way: R13 (tested, rating, edit link).

## Status (2026-10-31)

| Item | Status |
|---|---|
| Phase 1 — skeleton, RTL layout, deploy | ✅ live |
| Phase 2 — recipe pages, Hebrew search, meal filters | ✅ live |
| Phase 3 — random recipe, meal builder | ✅ live |
| Phase 4 — Drive sync (daily + manual), converter, needs-fixing page, setup guide | ✅ live; Google Cloud + service account set up; sync reads sub-folders |
| One-time import of the family recipes | ✅ 91 recipes in "מתכונים לאתר" (+ a "תבנית מתכון" template in every folder); sample recipes removed |
| R13 — tested badge, star rating, edit link | ✅ live; Apps Script web app deployed and tested end to end (5 stars on פלאפל) |
| R8 — "סנכרן עכשיו" (footer link) | ✅ code live — **needs the updated Apps Script version deployed** (see open items) |
| R1 — print style + "הדפסה" button | ✅ code live |
| R12 — "הוסף מתכון" form | 🟡 code ready (`createRecipeForm`, `onRecipeSubmit`); owner still has to run setup; the header button appears once `FORM_URL` is set in `src/lib/config.ts` |

Tests: 120 unit tests passing; build 100 pages, link check 0 problems.

## Open items

Owner (setup):
1. Paste the latest `apps-script/Code.gs` + `apps-script/appsscript.json` into the script, **Deploy → Manage deployments → New version** (adds the form code and wider scopes; everyone re-approves permissions once).
2. Run `createRecipeForm` once; add the **תמונות** file-upload question by hand; send the public form link → set `FORM_URL` in `src/lib/config.ts`.
3. Test the form end to end (submit with a photo → doc appears in the chosen folder → recipe on the site); then add a converter fixture test for a form-created doc (R12 test item).

Content (family, in Google Docs — no code):
4. 73 recipes have no photo (yellow "צריך לתקן" badge — **intentionally kept** on every such recipe, owner decision 2026-10-31).
5. "מאפה פילו תרד ופטה" has no recipe text (only a screenshot of a video).
6. No dessert recipes yet → the meal builder skips the dessert course.
7. Review the steps Claude completed (highlighted yellow in the docs).

Maintenance / nice to have:
8. GitHub sometimes leaves a Pages deploy run queued (seen twice); if it recurs, add a watchdog/retry. Workaround: cancel the stuck run, the next one deploys.
9. The GitHub token in the Apps Script expires (as chosen at creation) — the buttons then fail with "GitHub: 401"; create a new token and update `GITHUB_TOKEN`.
10. Scheduled workflows are disabled by GitHub after 60 days without repo activity — re-enable under Actions if the daily sync stops.
11. Ideas not started: filter "רק מתכונים שנוסו", sort by rating, per-person ratings.

## Defaults (change if wanted)
- Site title: "ספר המתכונים משפחת שטיינגאוס" (confirmed by owner); warm, homey look with large food photos.

## Decisions log
- Google Drive folder is the single source of truth; `/admin` editor (Sveltia CMS) and `.docx` upload pipeline dropped — avoids two editing places overwriting each other, and family needs no GitHub accounts.
- Sync daily + on-demand button via Apps Script (keeps the GitHub token out of the public site).
- Added R12: Google Form → Apps Script creates a template-layout Google Doc in the folder → sync. Easiest no-AI way to add recipes; fixed category choices; Docs remain the source of truth for edits.
- Sync never fails on recipe content; problems surface as red sections and on the "needs fixing" page.
- Pagefind replaced by custom search (Hebrew attached prefixes; one shared index).
- `dishType` is multi-valued.
- No kosher rules in meal builder.
- Accepted: one secret (Google service account key) in GitHub Actions.
- 2026-10-30: originals stay untouched in the wife's folder; Claude did a one-time AI clean-up into a new folder "מתכונים לאתר" (owner request). After that, no AI is involved in adding recipes.
- 2026-10-30: sync reads sub-folders; folder name is a dish-type hint; "תבנית מתכון" docs are skipped.
- 2026-10-30: tested + rating are stored in the Google Doc (rows נוסה/דירוג), not in a separate database; changed from the site through an Apps Script web app that runs as the signed-in user. Owner preferred buttons ("as a product") over typing in the doc.
- 2026-10-30: the Apps Script web app uses wider scopes (Drive, Forms, triggers) once the form code is added; one script project for all family actions.
- 2026-10-31: "צריך לתקן" badge stays on every recipe missing a photo or other data (owner decision).
