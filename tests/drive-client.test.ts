import { createVerify, generateKeyPairSync } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createDriveClient, DRIVE_SCOPE, DriveError, parseServiceAccountKey } from '../scripts/drive-sync/drive';
import { processImage } from '../scripts/drive-sync/images';
import { isValidSlug, slugFromTitle, uniqueSlug, cleanSlug } from '../scripts/drive-sync/slug';
import { readZip, writeZip } from '../scripts/drive-sync/zip';
import { recipeIssues } from '../src/lib/recipe-issues';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = {
  client_email: 'sync@project.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
function fakeFetch(handler: Handler) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { f, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const tokenOk = () => json({ access_token: 'tok', expires_in: 3600 });
const deps = (f: typeof fetch) => ({ fetch: f, now: () => 1_800_000_000_000, sleep: async () => {} });

describe('Drive client (fetch mocked)', () => {
  it('signs a valid RS256 service-account JWT with the read-only Drive scope', async () => {
    let assertion = '';
    const { f } = fakeFetch(async (url, init) => {
      if (url.hostname === 'oauth2.googleapis.com') {
        assertion = new URLSearchParams(String(init.body)).get('assertion')!;
        return tokenOk();
      }
      return json({ id: 'F', name: 'מתכונים לאתר', mimeType: 'application/vnd.google-apps.folder' });
    });
    const drive = createDriveClient(key, deps(f));
    expect(await drive.getFolder('F')).toEqual({ id: 'F', name: 'מתכונים לאתר' });
    const [h, c, sig] = assertion.split('.');
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({ iss: key.client_email, scope: DRIVE_SCOPE, aud: 'https://oauth2.googleapis.com/token' });
    expect(claims.exp - claims.iat).toBe(3600);
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
  });

  it('pages through the folder listing and reuses the token', async () => {
    const { f, calls } = fakeFetch((url) => {
      if (url.hostname === 'oauth2.googleapis.com') return tokenOk();
      const page = url.searchParams.get('pageToken');
      expect(url.searchParams.get('q')).toBe("'F' in parents and trashed = false");
      return page
        ? json({ files: [{ id: 'b', name: 'B', mimeType: 'x', modifiedTime: 't' }] })
        : json({ files: [{ id: 'a', name: 'A', mimeType: 'x', modifiedTime: 't' }], nextPageToken: 'p2' });
    });
    const files = await createDriveClient(key, deps(f)).listFolder('F');
    expect(files.map((x) => x.id)).toEqual(['a', 'b']);
    expect(calls.filter((c) => c.url.hostname === 'oauth2.googleapis.com')).toHaveLength(1);
    expect(calls[1].init.headers).toMatchObject({ authorization: 'Bearer tok' });
  });

  it('reports bad credentials as a DriveError', async () => {
    const { f } = fakeFetch(() => json({ error: 'invalid_grant' }, 400));
    await expect(createDriveClient(key, deps(f)).listFolder('F')).rejects.toThrow(/rejected the service account/);
  });

  it('explains a missing / unshared folder', async () => {
    const { f } = fakeFetch((url) => (url.hostname === 'oauth2.googleapis.com' ? tokenOk() : json({}, 404)));
    await expect(createDriveClient(key, deps(f)).getFolder('F')).rejects.toThrow(/shared \(Viewer\) with sync@project/);
  });

  it('retries 5xx / 429 and then gives up with a DriveError', async () => {
    let n = 0;
    const { f } = fakeFetch((url) => {
      if (url.hostname === 'oauth2.googleapis.com') return tokenOk();
      n++;
      return n < 3 ? json({}, 503) : json({ files: [] });
    });
    expect(await createDriveClient(key, deps(f)).listFolder('F')).toEqual([]);
    const down = fakeFetch((url) => (url.hostname === 'oauth2.googleapis.com' ? tokenOk() : json({}, 500)));
    await expect(createDriveClient(key, deps(down.f)).listFolder('F')).rejects.toBeInstanceOf(DriveError);
  });

  it('exports a ZIP, falling back to the export link for docs over 10 MB', async () => {
    const zip = writeZip([['doc.html', '<p>hi</p>']]);
    const { f, calls } = fakeFetch((url) => {
      if (url.hostname === 'oauth2.googleapis.com') return tokenOk();
      if (url.pathname.endsWith('/export'))
        return new Response('{"error":{"errors":[{"reason":"exportSizeLimitExceeded"}]}}', { status: 403 });
      return new Response(Buffer.from(zip));
    });
    const out = await createDriveClient(key, deps(f)).exportZip({
      id: 'd',
      name: 'n',
      mimeType: 'x',
      modifiedTime: 't',
      exportLinks: { 'application/zip': 'https://docs.google.com/feeds/download/documents/export/Export?id=d&exportFormat=zip' },
    });
    expect(readZip(out).get('doc.html')).toBeDefined();
    expect(calls.at(-1)!.url.hostname).toBe('docs.google.com');
  });

  it('validates the key JSON', () => {
    expect(() => parseServiceAccountKey('nope')).toThrow(/not valid JSON/);
    expect(() => parseServiceAccountKey('{"type":"x"}')).toThrow(/client_email/);
    expect(parseServiceAccountKey(JSON.stringify({ ...key, type: 'service_account' })).client_email).toBe(key.client_email);
  });
});

describe('zip', () => {
  it('round-trips Hebrew names and binary data', () => {
    const bin = new Uint8Array([0, 255, 1, 2, 3]);
    const files = readZip(writeZip([['מתכון.html', '<p>שלום</p>'], ['images/a.png', bin]]));
    expect(Buffer.from(files.get('מתכון.html')!).toString()).toBe('<p>שלום</p>');
    expect([...files.get('images/a.png')!]).toEqual([...bin]);
  });
  it('rejects garbage', () => {
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow(/not a zip/);
  });
});

describe('processImage', () => {
  it('fits large photos inside 1600px as WebP and honours EXIF rotation', async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#888' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await processImage(big);
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([1067, 1600]); // rotated to portrait
  });
  it('returns null for non-images', async () => {
    expect(await processImage(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('slugs', () => {
  it('transliterates Hebrew titles into valid English slugs', () => {
    for (const t of ['עוגת הגבינה של סבתא', 'צ׳יפס', 'מרק עוף', 'חומוס 2', 'Pasta אלפרדו', '!!!', 'שָׁלוֹם']) {
      expect(isValidSlug(slugFromTitle(t))).toBe(true);
    }
    expect(slugFromTitle('מרק עוף')).toBe('mrk-of');
    expect(slugFromTitle('!!!')).toBe('recipe');
    expect(slugFromTitle('א'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
  it('cleans and de-duplicates', () => {
    expect(cleanSlug(' Grandma Cheesecake! ')).toBe('grandma-cheesecake');
    expect(uniqueSlug('a', new Set(['a', 'a-2']))).toBe('a-3');
    expect(isValidSlug('Bad Slug')).toBe(false);
  });
});

describe('recipeIssues (shared with the site)', () => {
  it('accepts keys, labels and aliases; flags unknown and missing values', () => {
    const ok = recipeIssues({ meal: ['ערב', 'lunch'], dishType: ['חלבון'], ingredients: ['x'], image: './a.webp', imageFound: true });
    expect(ok).toMatchObject({ meal: ['dinner', 'lunch'], dishType: ['main'], issues: [] });
    const bad = recipeIssues({ meal: ['ארוחת לילה'], ingredients: [' '], imageFound: false });
    expect(bad.issues).toEqual([
      expect.stringContaining('"ארוחת לילה" לא מוכרת'),
      expect.stringContaining('חסר סוג מנה'),
      'חסרה תמונה',
      'חסרים מצרכים',
    ]);
  });
});
