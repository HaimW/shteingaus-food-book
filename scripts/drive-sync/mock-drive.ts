// In-memory Drive for tests and for `npm run sync -- --mock-drive <dir>` (no Google account needed).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DriveError, GOOGLE_DOC_MIME, type DriveClient, type DriveFile } from './drive.ts';
import { writeZip } from './zip.ts';

export interface MockDoc {
  id: string;
  name: string;
  modifiedTime: string;
  /** Google Docs HTML export. */
  html?: string;
  /** Files referenced by the HTML as images/<name>. */
  images?: Record<string, Uint8Array>;
  /** Non-doc files (e.g. an uploaded .docx not yet converted). */
  mimeType?: string;
}

export class MemoryDrive implements DriveClient {
  folderId: string;
  docs: MockDoc[];
  exports: string[] = [];
  constructor(folderId: string, docs: MockDoc[] = []) {
    this.folderId = folderId;
    this.docs = docs;
  }

  async getFolder(folderId: string) {
    if (folderId !== this.folderId) throw new DriveError(`Drive folder ${folderId} not found`, 404);
    return { id: folderId, name: 'מתכונים לאתר' };
  }

  async listFolder(folderId: string): Promise<DriveFile[]> {
    await this.getFolder(folderId);
    return this.docs.map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType ?? GOOGLE_DOC_MIME, modifiedTime: d.modifiedTime }));
  }

  async exportZip(file: DriveFile): Promise<Uint8Array> {
    const doc = this.docs.find((d) => d.id === file.id);
    if (!doc || doc.html === undefined) throw new DriveError(`export of ${file.id} failed`, 404);
    this.exports.push(doc.id);
    const safeName = doc.name.replace(/[\\/:*?"<>|]/g, '_');
    return writeZip([
      [`${safeName}.html`, doc.html],
      ...Object.entries(doc.images ?? {}).map(([n, data]): [string, Uint8Array] => [`images/${n}`, data]),
    ]);
  }
}

/**
 * Load a mock Drive from a directory: one sub-folder per doc containing meta.json
 * ({ "name": "...", "modifiedTime": "..." }), doc.html and optional images/.
 * The sub-folder name is the doc id.
 */
export function loadFixtureDrive(dir: string, folderId = 'mock-folder'): MemoryDrive {
  const docs: MockDoc[] = [];
  for (const id of readdirSync(dir).sort()) {
    const docDir = join(dir, id);
    if (!statSync(docDir).isDirectory() || !existsSync(join(docDir, 'meta.json'))) continue;
    const meta = JSON.parse(readFileSync(join(docDir, 'meta.json'), 'utf8')) as Omit<MockDoc, 'id'>;
    const images: Record<string, Uint8Array> = {};
    const imgDir = join(docDir, 'images');
    if (existsSync(imgDir)) for (const f of readdirSync(imgDir)) images[f] = new Uint8Array(readFileSync(join(imgDir, f)));
    const htmlPath = join(docDir, 'doc.html');
    docs.push({ ...meta, id, html: existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : undefined, images });
  }
  return new MemoryDrive(folderId, docs);
}
