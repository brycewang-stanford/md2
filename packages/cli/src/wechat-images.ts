/**
 * The WeChat editor re-hosts every pasted <img> by fetching its src from
 * Tencent's servers; any host it can't reach (local paths, webview URIs, a cold
 * or blocked CDN) becomes 有 N 个内容插入失败. With API credentials we skip that
 * fetch entirely: upload each image to WeChat's own CDN (mmbiz.qpic.cn, the
 * same `uploadimg` call "publish draft" uses) and paste those URLs instead.
 */
import { createHash } from 'node:crypto';
import { zhihuImageCandidates } from '@md2/core';
import { loadImage } from './io.js';
import { getAccessToken, uploadContentImage, type Credentials } from './wechat-api.js';

export interface WechatImages {
  /** src as written in the Markdown → mmbiz.qpic.cn URL */
  map: Record<string, string>;
  /** srcs that couldn't be uploaded (missing file, not jpg/png, > 1 MB …) */
  failed: { src: string; error: string }[];
}

/** uploadimg only takes jpg/png up to 1 MB */
const UPLOADABLE = /^image\/(png|jpe?g)$/;
const MAX_BYTES = 1024 * 1024;

/** content hash → upload, so duplicates share one request and copying the same article again is instant */
const uploaded = new Map<string, Promise<string>>();

/** Bytes WeChat will accept: SVG / GitHub raw URLs go through their PNG / CDN alternatives first. */
async function loadUploadable(src: string, baseDir: string) {
  let last = 'unsupported image';
  for (const url of [...zhihuImageCandidates(src), src]) {
    try {
      const img = await loadImage(url, baseDir);
      if (!UPLOADABLE.test(img.mime)) last = `仅支持 jpg/png（${img.mime}）`;
      else if (img.data.length > MAX_BYTES) last = `超过 1MB（${(img.data.length / 1048576).toFixed(1)}MB）`;
      else return img;
    } catch (e) {
      last = (e as Error).message;
    }
  }
  throw new Error(last);
}

/** Upload every image to mmbiz.qpic.cn. Throws when the token can't be obtained (bad credentials, IP not whitelisted). */
export async function wechatImages(srcs: string[], baseDir: string, creds: Credentials): Promise<WechatImages> {
  const map: Record<string, string> = {};
  const failed: WechatImages['failed'] = [];
  const queue = [...new Set(srcs)].filter((s) => s && !/^https?:\/\/mmbiz\.qpic\.cn\//i.test(s));
  if (!queue.length) return { map, failed };
  const token = await getAccessToken(creds);

  const worker = async () => {
    for (let src = queue.shift(); src !== undefined; src = queue.shift()) {
      try {
        const img = await loadUploadable(src, baseDir);
        const key = createHash('sha1').update(img.data).digest('hex');
        let upload = uploaded.get(key);
        if (!upload) {
          upload = uploadContentImage(token, img.data, img.name, img.mime);
          uploaded.set(key, upload);
          upload.catch(() => uploaded.delete(key));
        }
        map[src] = await upload;
      } catch (e) {
        failed.push({ src, error: (e as Error).message });
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { map, failed };
}
