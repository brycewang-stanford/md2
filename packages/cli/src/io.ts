import { readFileSync, existsSync } from 'node:fs';
import { dirname, extname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Input {
  markdown: string;
  /** Directory relative image paths resolve against */
  baseDir: string;
  file?: string;
}

export function readInput(file: string | undefined, markdown?: string): Input {
  if (markdown !== undefined) return { markdown, baseDir: process.cwd() };
  if (!file || file === '-') return { markdown: readFileSync(0, 'utf8'), baseDir: process.cwd() };
  const path = resolve(file);
  if (!existsSync(path)) throw new Error(`File not found: ${file}`);
  return { markdown: readFileSync(path, 'utf8'), baseDir: dirname(path), file: path };
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.avif': 'image/avif',
};

export function mimeOf(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export function isRemote(src: string): boolean {
  return /^https?:\/\//i.test(src) || src.startsWith('data:');
}

/** Absolute local path for a relative / file: image src, or undefined for remote images. */
export function localPath(src: string, baseDir: string): string | undefined {
  if (isRemote(src) || !src) return undefined;
  const clean = decodeURI(src.split(/[?#]/)[0]);
  const p = clean.startsWith('file:') ? fileURLToPath(clean) : isAbsolute(clean) ? clean : resolve(baseDir, clean);
  return existsSync(p) ? p : undefined;
}

/** Image resolver that inlines local files as data URLs (for headless rendering). */
export function inlineLocalImages(baseDir: string) {
  return (src: string): string | undefined => {
    const p = localPath(src, baseDir);
    if (!p) return undefined;
    return `data:${mimeOf(p)};base64,${readFileSync(p).toString('base64')}`;
  };
}

/** Load image bytes from a local path, http(s) URL or data URL. */
export async function loadImage(src: string, baseDir: string): Promise<{ data: Buffer; mime: string; name: string }> {
  if (src.startsWith('data:')) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
    if (!m) throw new Error('Bad data URL');
    const data = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
    return { data, mime: m[1], name: `image.${m[1].split('/')[1] ?? 'png'}` };
  }
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0 md2' } });
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${src}`);
    const mime = res.headers.get('content-type')?.split(';')[0] ?? 'image/png';
    const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    return { data: Buffer.from(await res.arrayBuffer()), mime, name: `image.${ext}` };
  }
  const p = localPath(src, baseDir);
  if (!p) throw new Error(`Image not found: ${src}`);
  return { data: readFileSync(p), mime: mimeOf(p), name: p.split(/[\\/]/).pop()! };
}
