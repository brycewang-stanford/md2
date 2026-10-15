/**
 * WeChat draft publishing without a browser dependency: callers supply the
 * cover image and diagram SVGs when they have them (the VS Code extension gets
 * both from its webview; the CLI falls back to headless Chromium).
 */
import { parseMarkdown, renderWechat, ensureEngines, type DiagramResolver, type WechatOptions } from '@md2/core';
import { readInput, loadImage, isRemote, localPath } from './io.js';
import { addDraft, credentialsFromEnv, getAccessToken, uploadContentImage, uploadMaterial, type Credentials } from './wechat-api.js';

export interface ImageFile {
  data: Buffer;
  name: string;
  mime: string;
}

export interface PublishCoreOptions extends WechatOptions {
  appId?: string;
  appSecret?: string;
  /** Cover image path/URL; default front matter `cover`, else first image, else `generateCover` */
  cover?: string;
  author?: string;
  digest?: string;
  sourceUrl?: string;
  openComment?: boolean;
  dryRun?: boolean;
  onProgress?: (msg: string) => void;
  /** Produce a cover when the article has none */
  generateCover?: () => Promise<ImageFile>;
  /** Produce diagram SVGs when the article has diagrams and `diagram` isn't given */
  generateDiagrams?: (diagrams: { lang: string; code: string }[]) => Promise<DiagramResolver | undefined>;
}

export async function publishWechatDraft(src: { file?: string; markdown?: string }, opts: PublishCoreOptions = {}) {
  const log = opts.onProgress ?? (() => {});
  const { markdown, baseDir } = readInput(src.file, src.markdown);
  const doc = parseMarkdown(markdown);
  await ensureEngines(doc);
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
  const diagram = opts.diagram ?? (doc.diagrams.length && opts.generateDiagrams ? await opts.generateDiagrams(doc.diagrams) : undefined);
  const { html, warnings } = renderWechat(doc, {
    ...opts,
    removeTitle: opts.removeTitle ?? true,
    resolveImage: (s) => uploaded.get(s),
    diagram,
  });

  // 3. cover
  const coverSrc = opts.cover ?? (wfm.cover as string) ?? (fm.cover as string) ?? doc.images[0];
  let coverFile: ImageFile;
  if (coverSrc && (isRemote(coverSrc) || localPath(coverSrc, baseDir))) {
    coverFile = await loadImage(coverSrc, baseDir);
  } else if (opts.generateCover) {
    coverFile = await opts.generateCover();
    log('✓ generated cover');
  } else {
    throw new Error('No cover image: add `cover:` to the front matter or include an image');
  }
  const thumb = opts.dryRun ? { mediaId: 'dry-run' } : await uploadMaterial(token, coverFile.data, coverFile.name, coverFile.mime);
  log('✓ cover uploaded');

  const article = {
    title: String(wfm.title ?? doc.title ?? 'Untitled').slice(0, 64),
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
