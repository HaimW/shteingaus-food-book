# Project Profile: shteingaus-food-book

## Project Context

- Stack: Astro static site, Markdown recipes (one file per recipe + images in repo), Node tooling
- Runtime: GitHub Pages, https://haimw.github.io/shteingaus-food-book/ (base path /shteingaus-food-book/)
- Data: none
- Ingest: Google Drive folder of Google Docs is the source of truth; daily GitHub Action (+ "sync now" button via Apps Script) converts docs to Markdown + images, commits, deploys. Plan: docs/build-plan.md
- Language: Hebrew content; RTL site
- Conventions: one recipe per Markdown file with frontmatter; mobile-first, accessible, print-friendly
- Delivery: GitHub Actions builds and deploys to Pages
- Constraints: no server code; only secrets are the Google service account key (GitHub Actions) and a GitHub token held in Apps Script
- Non-goals: backend, database, auth, embedded/hardware

## Q&A

| Topic | Answer | Source |
|---|---|---|
| Domains | web_app + cross_cutting | user facts |
| Stack | Astro, Markdown recipes | user (confirmed) |
| Deploy | GitHub Pages via Actions | user |
| Data stores | none | user |
| Pruning | keep the cut of 14 agents | user (confirmed) |
| Team/review | owner adds first recipes manually from Google Docs; then fast add via uploading a .docx (with pictures) that CI converts to Markdown + images | user |
| Testing | none yet; done = build passes, links work, RTL renders | proposed |
| CI/CD | GitHub Actions (to create), deploy on push to main | proposed |
| Perf/reliability | best effort | assumed |
| Security | no PII/auth/payments | inferred |
| Non-goals | backend, DB, auth, embedded | user |

## Pruned

Agents: backend-engineer-web, backend-engineer-platform, data-engineer, database-engineer, reliability-engineer, incident-review, plus all 8 embedded agents. Skill: api-design. Domains dirs backend_heavy and embedded removed.
