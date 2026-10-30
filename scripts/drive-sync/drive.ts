// Google Drive API v3 client for the sync — read-only, service account, no SDK.
// The service-account JWT is signed with node:crypto and exchanged for an access
// token with fetch (https://developers.google.com/identity/protocols/oauth2/service-account).
import { createSign } from 'node:crypto';

export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** RFC 3339 timestamp from Drive. */
  modifiedTime: string;
  exportLinks?: Record<string, string>;
}

/** What the sync needs from Drive. Mocked in tests (scripts/drive-sync/mock-drive.ts). */
export interface DriveClient {
  /** Folder metadata; throws DriveError if it does not exist or is not shared with the service account. */
  getFolder(folderId: string): Promise<{ id: string; name: string }>;
  /** Direct children of the folder (not trashed). */
  listFolder(folderId: string): Promise<DriveFile[]>;
  /** Google Doc exported as a ZIP (HTML + images/). */
  exportZip(file: DriveFile): Promise<Uint8Array>;
}

/** A real (non-content) failure: bad credentials, missing folder, API down. Fails the job. */
export class DriveError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Parse the JSON key (as stored in the GOOGLE_SERVICE_ACCOUNT_KEY secret). */
export function parseServiceAccountKey(json: string): ServiceAccountKey {
  let key: Partial<ServiceAccountKey> & { type?: string };
  try {
    key = JSON.parse(json);
  } catch {
    throw new DriveError('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON — paste the whole downloaded key file.');
  }
  if (!key.client_email || !key.private_key) {
    throw new DriveError('GOOGLE_SERVICE_ACCOUNT_KEY is missing client_email / private_key — is it a service account key?');
  }
  return { client_email: key.client_email, private_key: key.private_key, token_uri: key.token_uri };
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

export function signJwt(key: ServiceAccountKey, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: DRIVE_SCOPE,
      aud: key.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(key.private_key).toString('base64url')}`;
}

export interface HttpDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const API = 'https://www.googleapis.com/drive/v3';
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

export function createDriveClient(key: ServiceAccountKey, deps: HttpDeps = {}): DriveClient {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let token: { value: string; expires: number } | undefined;

  /** fetch with retries for rate limits, 5xx and network errors. */
  async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await sleep(1000 * 2 ** (attempt - 1));
      try {
        const res = await doFetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
        if (!RETRY_STATUS.has(res.status)) return res;
        lastErr = new DriveError(`Google API ${res.status} for ${url}`, res.status);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof DriveError ? lastErr : new DriveError(`Google API unreachable: ${(lastErr as Error)?.message}`);
  }

  async function accessToken(): Promise<string> {
    if (token && token.expires > now() + 60_000) return token.value;
    const assertion = signJwtSafe();
    const res = await fetchRetry(key.token_uri ?? 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new DriveError(
        `Google rejected the service account credentials (${res.status}). Check the GOOGLE_SERVICE_ACCOUNT_KEY secret. ${detail.slice(0, 200)}`,
        res.status,
      );
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: json.access_token, expires: now() + json.expires_in * 1000 };
    return token.value;
  }

  function signJwtSafe(): string {
    try {
      return signJwt(key, Math.floor(now() / 1000));
    } catch (e) {
      throw new DriveError(`Cannot sign with the service account private key: ${(e as Error).message}`);
    }
  }

  async function get(url: string): Promise<Response> {
    return fetchRetry(url, { headers: { authorization: `Bearer ${await accessToken()}` } });
  }

  async function failure(res: Response, what: string): Promise<DriveError> {
    const detail = await res.text().catch(() => '');
    return new DriveError(`${what}: Google API ${res.status} ${detail.slice(0, 300)}`, res.status);
  }

  return {
    async getFolder(folderId) {
      const q = new URLSearchParams({ fields: 'id,name,mimeType', supportsAllDrives: 'true' });
      const res = await get(`${API}/files/${encodeURIComponent(folderId)}?${q}`);
      if (res.status === 404) {
        throw new DriveError(
          `Drive folder ${folderId} not found. Check DRIVE_FOLDER_ID and that the folder is shared (Viewer) with ${key.client_email}.`,
          404,
        );
      }
      if (!res.ok) throw await failure(res, 'Reading the Drive folder failed');
      const f = (await res.json()) as { id: string; name: string; mimeType: string };
      if (f.mimeType !== FOLDER_MIME) throw new DriveError(`DRIVE_FOLDER_ID ${folderId} is not a folder ("${f.name}").`);
      return { id: f.id, name: f.name };
    },

    async listFolder(folderId) {
      const files: DriveFile[] = [];
      let pageToken: string | undefined;
      do {
        const q = new URLSearchParams({
          q: `'${folderId.replace(/['\\]/g, '\\$&')}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, exportLinks)',
          pageSize: '1000',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
        });
        if (pageToken) q.set('pageToken', pageToken);
        const res = await get(`${API}/files?${q}`);
        if (!res.ok) throw await failure(res, 'Listing the Drive folder failed');
        const json = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
        files.push(...(json.files ?? []));
        pageToken = json.nextPageToken;
      } while (pageToken);
      return files;
    },

    async exportZip(file) {
      const q = new URLSearchParams({ mimeType: 'application/zip' });
      const res = await get(`${API}/files/${encodeURIComponent(file.id)}/export?${q}`);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      // files.export is limited to 10 MB; docs with many photos are larger. The export
      // link has no such limit and accepts the same bearer token.
      const body = await res.text().catch(() => '');
      const link = file.exportLinks?.['application/zip'];
      if (res.status === 403 && /exportSizeLimitExceeded/.test(body) && link) {
        const big = await get(link);
        if (big.ok) return new Uint8Array(await big.arrayBuffer());
        throw await failure(big, `Exporting "${file.name}" (large document) failed`);
      }
      throw new DriveError(`Exporting "${file.name}" failed: Google API ${res.status} ${body.slice(0, 300)}`, res.status);
    },
  };
}
