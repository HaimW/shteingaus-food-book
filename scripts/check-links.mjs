import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
// Verifies the built site: every HTML page has lang="he" dir="rtl" and a <title>,
// and every internal href/src/srcset/url() is base-path-safe and points at a real file.
// Usage: node scripts/check-links.mjs [distDir]
const dist = process.argv[2] ?? "dist", BASE = '/shteingaus-food-book/';
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(dist); let bad = 0, links = 0;
const resolve = (u) => { let p = decodeURIComponent(u.split(/[?#]/)[0].slice(BASE.length)); p = join(dist, p); return existsSync(p) && statSync(p).isDirectory() ? join(p, 'index.html') : p; };
for (const f of files.filter((f) => /\.(html|css)$/.test(f))) {
  const s = readFileSync(f, 'utf8');
  if (f.endsWith('.html')) {
    if (!/<html lang="he" dir="rtl">/.test(s)) { console.log('NO lang/dir', f); bad++; }
    if (!s.includes('<title>')) { console.log('no title', f); bad++; }
  }
  const refs = [...s.matchAll(/(?:href|src)="([^"]+)"/g), ...s.matchAll(/srcset="([^"]+)"/g), ...s.matchAll(/url\(([^)]+)\)/g)]
    .flatMap((m) => (m[0].startsWith('srcset') ? m[1].split(',').map((x) => x.trim().split(' ')[0]) : [m[1].replace(/["']/g, '')]));
  for (const u of refs) {
    if (/^(https?:|data:|mailto:|#)/.test(u)) continue;
    links++;
    if (!u.startsWith(BASE)) { console.log('NOT BASE-SAFE', f, u); bad++; continue; }
    if (!existsSync(resolve(u))) { console.log('BROKEN', f, u); bad++; }
  }
}
console.log(`${files.filter((f) => f.endsWith('.html')).length} html, ${links} internal refs, ${bad} problems`);
process.exit(bad ? 1 : 0);
