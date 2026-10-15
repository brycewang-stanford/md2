import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseMarkdown, renderWechat, renderZhihu, renderXhs, renderX, renderCover,
  type CoverOptions, type CoverSizeId, type CoverTemplateId, type WechatOptions, type XhsOptions, type XOptions,
  type ZhihuOptions, type ParsedDoc,
} from '@md2/core';
import { readInput, inlineLocalImages, loadImage, isRemote, localPath, type Input } from './io.js';
import { renderXhsPngs, renderCoverPng } from './browser.js';
import {
  addDraft, credentialsFromEnv, getAccessToken, uploadContentImage, uploadMaterial, type Credentials,
} from './wechat-api.js';

export interface Source {
  file?: string;
  markdown?: string;
}

function load(src: Source): Input & { doc: ParsedDoc } {
  const input = readInput(src.file, src.markdown);
  return { ...input, doc: parseMarkdown(input.markdown) };
}

export function wechatHtml(src: Source, opts: WechatOptions = {}) {
  const { doc } = load(src);
  return renderWechat(doc, opts);
}

export function zhihuHtml(src: Source, opts: ZhihuOptions = {}) {
  const { doc } = load(src);
  return renderZhihu(doc, opts);
}

export function xThread(src: Source, opts: XOptions = {}) {
  const { doc } = load(src);
  return renderX(doc, opts);
}

export interface XhsExportOptions extends XhsOptions {
  outDir: string;
}

/** Render XHS image cards + caption.txt into outDir. */
export async function xhsExport(src: Source, opts: XhsExportOptions) {
  const { doc, baseDir } = load(src);
  const fm = doc.frontmatter;
  const coverFm = (fm.xhs as Record<string, unknown> | undefined)?.cover as Partial<CoverOptions> | undefined;
  const resolveImage = inlineLocalImages(baseDir);
  const result = renderXhs(doc, {
    ...opts,
    cover: opts.cover === false ? false : { ...(typeof opts.cover === 'object' ? opts.cover : {}), ...coverFm },
    resolveImage,
  });
  if (result.layout.cover) {
    // inline local background images for the cover as well
    result.layout.cover.html = result.layout.cover.html.replace(/url\('([^']+)'\)/g, (m, u) => {
      const d = resolveImage(u);
      return d ? `url('${d}')` : m;
    });
  }
  const files = await renderXhsPngs(result.layout, opts.outDir);
  const caption = join(opts.outDir, 'caption.txt');
  writeFileSync(caption, `${result.text.title}\n\n${result.text.full}\n`);
  return { files, caption, text: result.text, warnings: result.warnings };
}

export interface CoverExportOptions extends Partial<CoverOptions> {
  out: string;
  size?: CoverSizeId;
  template?: CoverTemplateId;
}

/** Render a cover PNG. Title/subtitle/author/tags default to the article's front matter. */
export async function coverExport(src: Source | null, opts: CoverExportOptions) {
  let baseDir = process.cwd();
  let defaults: Partial<CoverOptions> = {};
  if (src && (src.file || src.markdown !== undefined)) {
    const { doc, baseDir: b } = load(src);
    baseDir = b;
    const fm = doc.frontmatter;
    defaults = {
      title: doc.title,
      subtitle: typeof fm.subtitle === 'string' ? fm.subtitle : undefined,
      author: typeof fm.author === 'string' ? fm.author : undefined,
      tags: doc.tags.slice(0, 4),
    };
  }
  const merged = { ...defaults, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) } as CoverOptions;
  if (merged.background && !isRemote(merged.background)) merged.background = inlineLocalImages(baseDir)(merged.background) ?? merged.background;
  const cover = renderCover({ ...merged, title: merged.title || 'Untitled' });
  mkdirSync(dirname(opts.out), { recursive: true });
  await renderCoverPng(cover, opts.out);
  return { file: opts.out, width: cover.width, height: cover.height };
}

export interface PublishOptions extends WechatOptions {
  appId?: string;
  appSecret?: string;
  /** Cover image path/URL; default front matter `cover`, else first image, else generated */
  cover?: string;
  coverTemplate?: CoverTemplateId;
  author?: string;
  digest?: string;
  sourceUrl?: string;
  openComment?: boolean;
  dryRun?: boolean;
  onProgress?: (msg: string) => void;
}

/** Upload images + cover and create a WeChat draft. Returns the draft media_id. */
export async function publishWechat(src: Source, opts: PublishOptions = {}) {
  const log = opts.onProgress ?? (() => {});
  const { doc, baseDir } = load(src);
  const fm = doc.frontmatter;
  const wfm = (fm.wechat ?? {}) as Record<string, unknown>;
  const creds: Credentials | null = opts.dryRun ? null : credentialsFromEnv(opts.appId, opts.appSecret);
  const token = creds ? await getAccessToken(creds) : 'dry-run';
  log('✓ access token');

  // 1. upload every image in the article
  const uploaded = new Map<string, string>();
  for (const imgSrc of doc.images) {
    if (uploaded.has(imgSrc) || /mmbiz\.qpic\.cn/.test(imgSrc)) continue;
    const img = await loadImage(imgSrc, baseDir);
    const url = opts.dryRun ? `https://mmbiz.qpic.cn/dry-run/${uploaded.size}` : await uploadContentImage(token, img.data, img.name, img.mime);
    uploaded.set(imgSrc, url);
    log(`✓ image ${imgSrc}`);
  }

  // 2. render content with uploaded URLs, without the H1 (WeChat has a title field)
  const { html, warnings } = renderWechat(doc, {
    ...opts,
    removeTitle: opts.removeTitle ?? true,
    resolveImage: (s) => uploaded.get(s),
  });

  // 3. cover
  const coverSrc = opts.cover ?? (wfm.cover as string) ?? (fm.cover as string) ?? doc.images[0];
  let coverFile: { data: Buffer; name: string; mime: string };
  if (coverSrc && (isRemote(coverSrc) || localPath(coverSrc, baseDir))) {
    coverFile = await loadImage(coverSrc, baseDir);
  } else {
    const out = join(tmpdir(), `md2-cover-${Date.now()}.png`);
    await coverExport(src, { out, size: 'wechat', template: opts.coverTemplate ?? 'aurora' });
    coverFile = { data: readFileSync(out), name: 'cover.png', mime: 'image/png' };
    log('✓ generated cover');
  }
  const thumb = opts.dryRun ? { mediaId: 'dry-run' } : await uploadMaterial(token, coverFile.data, coverFile.name, coverFile.mime);
  log('✓ cover uploaded');

  const title = String(wfm.title ?? doc.title ?? 'Untitled').slice(0, 64);
  const article = {
    title,
    author: (opts.author ?? (fm.author as string) ?? '').slice(0, 16) || undefined,
    digest: (opts.digest ?? (wfm.digest as string) ?? doc.summary).slice(0, 120),
    content: html,
    content_source_url: opts.sourceUrl ?? (fm.source as string) ?? undefined,
    thumb_media_id: thumb.mediaId,
    need_open_comment: (opts.openComment ? 1 : 0) as 0 | 1,
  };
  if (opts.dryRun) return { mediaId: 'dry-run', article, warnings };
  const mediaId = await addDraft(token, article);
  log('✓ draft created');
  return { mediaId, article, warnings };
}
