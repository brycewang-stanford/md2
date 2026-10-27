/**
 * Zhihu's editor re-hosts pasted images by fetching each src from its servers,
 * which can't work for local files that aren't on a public host (an unpushed or
 * private repo), and it maps every pasted data: image to one cached picture. With
 * the user's Zhihu login cookie we skip that fetch: upload each image the way the
 * editor's own 图片 button does (api.zhihu.com/images → Aliyun OSS PUT) and paste
 * the resulting zhimg.com URLs instead.
 */
import { createHash, createHmac } from 'node:crypto';
import { zhihuImageCandidates } from '@md2/core';
import { loadImage } from './io.js';

export interface ZhihuImages {
  /** src as written in the Markdown → zhimg.com URL */
  map: Record<string, string>;
  /** srcs that couldn't be uploaded (missing file, unsupported type …) */
  failed: { src: string; error: string }[];
}

/** The cookie is rejected (logged out / expired); the caller falls back to public URLs. */
export class ZhihuAuthError extends Error {}

const API = 'https://api.zhihu.com/images';
const OSS = 'https://zhihu-pics-upload.zhimg.com';
const OSS_UA = 'aliyun-sdk-js/6.8.0';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const UPLOADABLE = /^image\/(png|jpe?g|gif|webp)$/;

export const isZhimg = (src: string) => /^https?:\/\/[^/]*\.zhimg\.com\//i.test(src);

/** Accepts a full `Cookie:` header copied from DevTools, or just the z_c0 value. */
export function zhihuCookie(input: string): string {
  const s = input.trim().replace(/^cookie:\s*/i, '');
  return s.includes('=') ? s : `z_c0=${s}`;
}

interface UploadTicket {
  upload_file: { state: number; image_id: string; object_key: string };
  upload_token: { access_id: string; access_key: string; access_token: string };
}

async function api<T>(cookie: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { cookie, 'user-agent': UA, referer: 'https://zhuanlan.zhihu.com/', origin: 'https://zhuanlan.zhihu.com', 'content-type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 401 || res.status === 403) throw new ZhihuAuthError('知乎登录 Cookie 无效或已过期，请重新设置（md2: Set Zhihu Cookie）');
  if (!res.ok) throw new Error(`知乎图片接口 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

/** OSS V1 signature, as the editor's aliyun-sdk-js computes it (bucket is zhihu-pics, not the upload host). */
async function ossPut(ticket: UploadTicket, data: Buffer, mime: string) {
  const { object_key } = ticket.upload_file;
  const { access_id, access_key, access_token } = ticket.upload_token;
  const date = new Date().toUTCString();
  const toSign = `PUT\n\n${mime}\n${date}\nx-oss-date:${date}\nx-oss-security-token:${access_token}\nx-oss-user-agent:${OSS_UA}\n/zhihu-pics/${object_key}`;
  const signature = createHmac('sha1', access_key).update(toSign).digest('base64');
  const res = await fetch(`${OSS}/${object_key}`, {
    method: 'PUT',
    headers: {
      'content-type': mime,
      authorization: `OSS ${access_id}:${signature}`,
      'x-oss-date': date,
      'x-oss-security-token': access_token,
      'x-oss-user-agent': OSS_UA,
    },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`上传到知乎图床失败 ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Zhihu processes the upload asynchronously; its own URL is known once status is success. */
async function settled(cookie: string, ticket: UploadTicket): Promise<string> {
  for (let i = 0; i < 10; i++) {
    try {
      const s = await api<{ status?: string; original_src?: string; src?: string }>(cookie, `${API}/${ticket.upload_file.image_id}`);
      if (s.status === 'success' && (s.original_src || s.src)) return (s.original_src || s.src)!;
    } catch (e) {
      if (e instanceof ZhihuAuthError) throw e;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  // the object is in the bucket either way; this is where Zhihu serves it
  return `https://picx.zhimg.com/${ticket.upload_file.object_key}`;
}

/** Bytes Zhihu accepts: SVG / GitHub raw URLs go through their PNG / CDN alternatives first. */
async function loadUploadable(src: string, baseDir: string) {
  let last = 'unsupported image';
  for (const url of [...zhihuImageCandidates(src), src]) {
    try {
      const img = await loadImage(url, baseDir);
      if (UPLOADABLE.test(img.mime)) return img;
      last = `不支持的图片格式（${img.mime}）`;
    } catch (e) {
      last = (e as Error).message;
    }
  }
  throw new Error(last);
}

/** md5 → upload, so duplicates share one request and copying the same article again is instant */
const uploaded = new Map<string, Promise<string>>();

/** Upload every image to Zhihu's CDN. Throws ZhihuAuthError when the cookie is rejected. */
export async function zhihuImages(srcs: string[], baseDir: string, cookieInput: string): Promise<ZhihuImages> {
  const cookie = zhihuCookie(cookieInput);
  const map: Record<string, string> = {};
  const failed: ZhihuImages['failed'] = [];
  const queue = [...new Set(srcs)].filter((s) => s && !isZhimg(s));
  let authError: ZhihuAuthError | undefined;

  const worker = async () => {
    for (let src = queue.shift(); src !== undefined && !authError; src = queue.shift()) {
      try {
        const img = await loadUploadable(src, baseDir);
        const hash = createHash('md5').update(img.data).digest('hex');
        let upload = uploaded.get(hash);
        if (!upload) {
          upload = (async () => {
            const ticket = await api<UploadTicket>(cookie, API, { method: 'POST', body: JSON.stringify({ image_hash: hash, source: 'article' }) });
            // state 1: Zhihu already has these bytes; 2: PUT them to OSS first
            if (ticket.upload_file.state !== 1) await ossPut(ticket, img.data, img.mime);
            return settled(cookie, ticket);
          })();
          uploaded.set(hash, upload);
          upload.catch(() => uploaded.delete(hash));
        }
        map[src] = await upload;
      } catch (e) {
        if (e instanceof ZhihuAuthError) authError = e;
        else failed.push({ src, error: (e as Error).message });
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (authError) throw authError;
  return { map, failed };
}
