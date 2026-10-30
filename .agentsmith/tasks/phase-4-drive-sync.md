# Phase 4 — Google Drive sync, converter, needs-fixing page, template, setup guide
Status: done      Path: complex
Iteration: 1 of 3

## Request
Implement Phase 4 of docs/build-plan.md (R2, R3, R7, R9, R10, R11): Google Doc -> Markdown
converter (DOM-free, unit-tested), `npm run sync` against the Drive API (service account,
read-only), daily + workflow_dispatch sync Action that commits and deploys, unlisted
needs-fixing page, recipe template (.docx + Markdown description), Hebrew setup guide.
Branch phase-4-drive-sync, commit, no push.

## Acceptance criteria
- Converter: template table (ארוחה, סוג מנה, מאת, מנות, זמן הכנה, זמן בישול, slug), headings
  מצרכים / אופן ההכנה / הערות as real headings or bold lines, images anywhere (first = main),
  doc title = recipe title; never throws on content; ingredients as YAML list; meal/dishType as found.
- Images downloaded, resized/compressed with sharp, written before the frontmatter references them.
- Slug: valid doc slug field > slug already assigned to this driveId > transliterated title; unique.
- driveId + driveModified written.
- Sync: new/changed -> convert; removed -> delete recipe + images; unchanged -> no-op; only
  driveId recipes are managed; clear summary; mockable Drive; tests for new/edited/deleted/
  unchanged and stable slug on edit/rename.
- Workflow: daily cron + workflow_dispatch; skip with notice when unconfigured; commit to main
  only on changes; build + deploy via the existing deploy workflow (workflow_call); real errors
  fail and leave the site unchanged; pinned SHAs; minimal permissions; concurrency with deploy.
- /needs-fixing/ page: noindex, not in nav, every recipe with issues, link to recipe + Google Doc.
- Template .docx under docs/ + Markdown description; docs/google-drive-setup.md.
- npm test, check, build, check:links green; end-to-end run with mocked Drive builds and renders.

## Decisions & constraints
- Orchestrator implements directly (as in phases 1-3; tool policy forbids spawning subagents
  unless the user asks); self code-review pass before commit.

- Export format: Drive `files.export` as `application/zip` (HTML + images/ folder). Chosen over
  `text/html` because the HTML export references images by googleusercontent URLs that are
  short-lived / sometimes need auth, while the ZIP carries the image bytes themselves (one request,
  no extra fetches, same HTML structure). files.export is capped at 10 MB, so on
  `exportSizeLimitExceeded` the client falls back to the file's `exportLinks['application/zip']`
  with the same bearer token (no size cap). ZIP read with a 60-line node:zlib reader (no dep).
- Drive client: no googleapis. Service-account JWT (RS256) signed with node:crypto, exchanged at
  oauth2.googleapis.com/token via fetch; scope drive.readonly; retries 429/5xx; clear DriveError
  messages (bad key, folder not found/not shared, API down). Interface `DriveClient`
  (getFolder/listFolder/exportZip) is what tests mock (MemoryDrive).
- Deps added (devDependencies, the sync only runs in CI/dev): parse5 (spec HTML parser, new),
  sharp + yaml (already in the tree via Astro, now declared explicitly), @types/node (types only).
  Scripts are TypeScript run natively by Node 24 (type stripping; erasable syntax only).
- Storage: Drive recipes live in src/content/recipes/<slug>/index.md + photo-N.webp (WebP, fit
  1600px, q80, EXIF-rotated). Delete = remove that folder. recipe.ts now resolves `image` relative
  to the recipe's own file (falls back to src/content/recipes/ for the samples).
- Slug precedence: valid doc `slug` field (cleaned: "Baked Cheesecake" -> baked-cheesecake) and not
  taken > slug already assigned to this driveId > transliterated title; uniqueness against
  hand-written ids, top-level names in the recipes dir (e.g. images/) and other docs (-2, -3).
  Changing the slug field deliberately moves the URL (reported as "was <old>").
- Change detection: driveModified == Drive modifiedTime -> unchanged (no export). `force`
  re-converts all (needed after converter changes).
- Safety: all exports/conversions happen before any write; real errors write nothing. Mass-delete
  guard: an empty folder while Drive recipes exist fails (SYNC_ALLOW_EMPTY=1 to confirm).
  Folder existence is checked first (an unshared folder returns 404 instead of an empty list).
- Converter conventions beyond the brief (tolerance, no requirement change): "label: value" lines
  before the first section are read as details; transposed details table; ingredients table rows;
  sub-headings inside מצרכים become "לבצק:" items; template lines starting "הנחיה:" are dropped;
  "עותק של"/"Copy of" prefix stripped from the doc name; Google comments dropped; google.com/url
  links unwrapped; only http(s)/mailto links kept; text is Markdown/HTML-escaped.
- recipeView now shares pure logic with the sync (src/lib/recipe-issues.ts) and accepts aliases
  (בוקר/צהריים/ערב, חלבון/עיקרית, ...), a superset of "key or Hebrew label".
- Workflow: sync.yml (cron daily 02:17 UTC + workflow_dispatch with `force`), concurrency group
  drive-sync; skips with a ::notice when the secret/variable is missing; sync -> build + check:links
  -> commit + push to main (rebase retry) -> calls deploy.yml via workflow_call (ref: main, so the
  newest main is always what gets deployed). deploy.yml keeps its literal `pages` group.
  checkout persist-credentials:false; the write token is only set in the commit step.

## Findings by role
### frontend / platform (orchestrator implemented directly; no subagents per tool policy)
- See decisions above. /needs-fixing/ page (noindex, not in nav): every recipe with issues, link to
  the recipe and (if driveId) to the Google Doc; recipe page "צריך לתקן" box also links to the doc.
- Template: docs/recipe-template.docx generated by scripts/make-template.ts (RTL, Heading 2 styles,
  2-column details table with hints in parentheses, bullet + numbered lists, "הנחיה:" hint lines).
  Validated structurally (zip + XML parse + python-docx opens it); NOT verified in Google Docs.
### self code review
- Fixed: malformed %-escapes in image names could throw (now tolerated); a managed recipe without
  a valid slug could yield a path-like id (now regenerated); token not persisted during npm ci.

## Open risks
- Template import into Google Docs and the real Drive export were not exercised (no Google access
  here); fixtures imitate Google's export markup. The owner's sample doc should be run through the
  converter once Drive is connected (planned in the build plan).
- workflow_call + workflow-level concurrency in the called workflow: distinct group names avoid
  the known deadlock; behaviour to confirm on the first real sync run. Workflows were YAML-parsed
  but not linted with actionlint (download blocked here).
- Branch protection on main requiring PRs would block the bot push (none configured today).
- GitHub disables cron after 60 days without repo activity (documented in the guide).
- Transliterated slugs are rough without vowels (e.g. ogt-hgvina-shl-svta); the slug field fixes it.
- A failed deploy after a successful sync commit leaves the site stale until the next push/sync or
  a manual "Deploy to GitHub Pages" run (documented).

## Verification log
- npm test: 114 passed (6 files; 51 new: converter fixtures/tolerance, sync with mocked Drive,
  Drive client with mocked fetch incl. JWT signature verify, zip, sharp, slugs, recipeIssues).
- npm run check: 0 errors / 0 warnings / 0 hints (47 files).
- E2E: `npm run sync -- --mock-drive tests/fixtures/drive` -> added 3, skipped 1 (.docx), needs
  fixing 1; second run -> unchanged 3, "Nothing changed". With those recipes: build 21 pages,
  check:links 21 html / 501 refs / 0 problems; Playwright 390px + 1280px on /needs-fixing/ and
  the 3 synced recipes: no overflow, no console errors; hero + in-body photo, ingredients, steps,
  notes, unwrapped link render; mrk-adshim-ktomot shows 4 issues and is listed on /needs-fixing/
  with its Google Doc link; robots noindex only on /needs-fixing/.
- Generated recipes removed again (src/content/recipes identical to main); clean tree: build 18
  pages, check:links 18 html / 419 refs / 0 problems.
- CLI: unconfigured -> clear message, exit 1; bad key -> ::error annotation, exit 1.
