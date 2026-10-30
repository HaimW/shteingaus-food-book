// npm run sync — pull recipes from the Google Drive folder into src/content/recipes/.
//
// Configuration (environment):
//   GOOGLE_SERVICE_ACCOUNT_KEY  service-account JSON key (the JSON text, or a path to the file)
//   DRIVE_FOLDER_ID             id of the Drive folder ("מתכונים לאתר")
//   SYNC_FORCE=1                re-convert every doc (e.g. after a converter change)
//   SYNC_ALLOW_EMPTY=1          allow removing every Drive recipe when the folder is empty
// Flags:
//   --mock-drive <dir>          use a local fixture folder instead of Google Drive (see mock-drive.ts)
//   --force                     same as SYNC_FORCE=1
//
// Exit code 0 = success (whether or not anything changed), 1 = real error (nothing written).
// In GitHub Actions it writes `changed=true|false` to $GITHUB_OUTPUT and a summary to the job page.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createDriveClient, parseServiceAccountKey, type DriveClient } from './drive.ts';
import { loadFixtureDrive } from './mock-drive.ts';
import { formatSummary, syncRecipes } from './sync.ts';

const SITE_URL = 'https://haimw.github.io/shteingaus-food-book/';
const ROOT = resolve(import.meta.dirname, '../..');

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { 'mock-drive': { type: 'string' }, force: { type: 'boolean', default: false } },
  });
  const env = process.env;
  let drive: DriveClient;
  let folderId: string;

  if (values['mock-drive']) {
    drive = loadFixtureDrive(resolve(values['mock-drive']));
    folderId = 'mock-folder';
    console.log(`Using mock Drive from ${values['mock-drive']}`);
  } else {
    const rawKey = env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
    folderId = env.DRIVE_FOLDER_ID?.trim() ?? '';
    if (!rawKey || !folderId) {
      console.error(
        'Drive sync is not configured: set GOOGLE_SERVICE_ACCOUNT_KEY and DRIVE_FOLDER_ID (see docs/google-drive-setup.md).',
      );
      return 1;
    }
    const keyJson = rawKey.startsWith('{') ? rawKey : existsSync(rawKey) ? readFileSync(rawKey, 'utf8') : rawKey;
    drive = createDriveClient(parseServiceAccountKey(keyJson));
  }

  const result = await syncRecipes({
    drive,
    folderId,
    recipesDir: resolve(ROOT, 'src/content/recipes'),
    force: values.force || env.SYNC_FORCE === '1',
    allowEmpty: env.SYNC_ALLOW_EMPTY === '1',
    log: (line) => console.log(line),
  });

  const summary = formatSummary(result, SITE_URL);
  console.log(`\n${summary}`);
  if (env.GITHUB_OUTPUT) {
    const counts = `added ${result.added.length}, updated ${result.updated.length}, removed ${result.removed.length}`;
    appendFileSync(env.GITHUB_OUTPUT, `changed=${result.changed}\ncounts=${counts}\n`);
  }
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    // ::error:: shows up as an annotation on the GitHub Actions run.
    console.error(process.env.GITHUB_ACTIONS ? `::error title=Drive sync failed::${message}` : `Drive sync failed: ${message}`);
    if (process.env.DEBUG && err instanceof Error) console.error(err.stack);
    process.exit(1);
  },
);
