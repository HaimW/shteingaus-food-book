// Resize / compress recipe photos with sharp (already used by Astro).
import sharp from 'sharp';

export const MAX_SIDE = 1600;
export const QUALITY = 80;

/**
 * Normalize a photo for the repo: apply EXIF rotation, fit inside 1600x1600, WebP.
 * Returns null for anything that is not a decodable image (a content problem, never an error).
 */
export async function processImage(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const out = await sharp(bytes, { animated: false, limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}
