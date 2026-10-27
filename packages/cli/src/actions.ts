import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseMarkdown, renderWechat, renderZhihu, renderXhs, renderX, renderCover, renderLongImage, ensureEngines, getTheme,
  aiXhsCopy, aiThread, aiWechatMeta, aiCoverCopy,
  type CoverOptions, type CoverSizeId, type CoverTemplateId, type WechatOptions, type XhsOptions, type XOptions,
  type ZhihuOptions, type ParsedDoc, type DiagramResolver, type LongImageOptions, type AiConfig, type SocialPlatformId, type RenderWarning,
} from '@md2/core';
import { readInput, inlineLocalImages, isRemote, type Input } from './io.js';
import { publishWechatDraft, type PublishCoreOptions } from './publish.js';
import { publicImages, type PublicImageOptions } from './public-images.js';
import { zhihuImages } from './zhihu-images.js';
import { renderXhsPngs, renderCoverPng, renderDiagrams, renderHtmlPng } from './browser.js';

export interface Source {
  file?: string;
  markdown?: string;
}

type Loaded = Input & { doc: ParsedDoc };

/** Read + parse, and load the lazy engines (MathJax) the document needs. */
async function load(src: Source): Promise<Loaded> {
  const input = readInput(src.file, src.markdown);
  const doc = parseMarkdown(input.markdown);
  await ensureEngines(doc);
  return { ...input, doc };
}

/** Diagram resolver backed by headless Chromium; undefined when there are no diagrams. */
async function diagramsFor(doc: ParsedDoc, theme?: string, accent?: string): Promise<DiagramResolver | undefined> {
  if (!doc.diagrams.length) return undefined;
  const t = getTheme(theme);
  const map = await renderDiagrams(doc.diagrams, accent || t.primary, t.id === 'midnight');
  return (_lang, code) => map.get(code);
}

/**
 * The WeChat editor re-hosts pasted images by fetching each src from its servers
 * (有 N 个内容插入失败 otherwise), so local images are mapped to public URLs first.
 */
export async function wechatHtml(src: Source, opts: WechatOptions & PublicImageOptions = {}) {
  const { doc, baseDir } = await load(src);
  const diagram = opts.diagram ?? (await diagramsFor(doc, opts.theme, opts.primaryColor));
  const imageBase = opts.imageBase ?? (doc.frontmatter.image_base as string | undefined);
  const { map, inlined, unreachable } = await publicImages(doc.images, baseDir, { imageBase, noGit: opts.noGit });
  const r = renderWechat(doc, { ...opts, diagram, resolveImage: opts.resolveImage ?? ((s) => map[s]) });
  if (inlined.length)
    r.warnings.push({
      code: 'inlined-image',
      message: `${inlined.length} 张本地图片未推送到 GitHub，已内嵌为 base64，公众号可能插入失败；请先 git push、设置 image_base，或用 md2 publish wechat 自动上传: ${inlined.join(', ')}`,
    });
  if (unreachable.length)
    r.warnings.push({ code: 'unreachable-image', message: `公众号可能无法抓取这些远程图片（备用地址均不可用）: ${unreachable.join(', ')}` });
  return r;
}

export interface ZhihuImageOptions extends PublicImageOptions {
  /** Zhihu login cookie (or z_c0 value): upload images to zhimg.com instead of relying on Zhihu's fetcher. Default: MD2_ZHIHU_COOKIE */
  zhihuCookie?: string;
}

/**
 * Zhihu fetches pasted images from its servers: with a login cookie they are
 * uploaded to zhimg.com first, anything left is mapped to public URLs.
 */
export async function zhihuHtml(src: Source, opts: ZhihuOptions & ZhihuImageOptions = {}) {
  const { doc, baseDir } = await load(src);
  const imageBase = opts.imageBase ?? (doc.frontmatter.image_base as string | undefined);
  const cookie = opts.zhihuCookie ?? process.env.MD2_ZHIHU_COOKIE;
  const uploaded: Record<string, string> = {};
  const warnings: RenderWarning[] = [];
  if (cookie) {
    try {
      const z = await zhihuImages(doc.images.filter((s) => !s.startsWith('asset:')), baseDir, cookie);
      Object.assign(uploaded, z.map);
      if (z.failed.length) warnings.push({ code: 'upload-failed', message: `这些图片没能上传到知乎，改用外链: ${z.failed.map((f) => `${f.src}（${f.error}）`).join(', ')}` });
    } catch (e) {
      warnings.push({ code: 'upload-failed', message: `图片上传知乎失败，改用外链: ${(e as Error).message}` });
    }
  }
  const rest = doc.images.filter((s) => !uploaded[s]);
  const { map, inlined, unreachable } = await publicImages(rest, baseDir, { imageBase, noGit: opts.noGit });
  Object.assign(map, uploaded);
  const r = renderZhihu(doc, { ...opts, resolveImage: opts.resolveImage ?? ((s) => map[s]) });
  r.warnings.push(...warnings);
  if (inlined.length)
    r.warnings.push({
      code: 'inlined-image',
      message: `${inlined.length} 张本地图片没有公开地址，只能内嵌为 base64，知乎不接受（会显示上传失败）；请设置 MD2_ZHIHU_COOKIE / --zhihu-cookie 自动上传，或先 git push（公开仓库）、设置 image_base: ${inlined.join(', ')}`,
    });
  if (unreachable.length)
    r.warnings.push({ code: 'unreachable-image', message: `知乎可能无法抓取这些远程图片（备用地址均不可用）: ${unreachable.join(', ')}` });
  return r;
}

export async function xThread(src: Source, opts: XOptions = {}) {
  const { doc } = await load(src);
  return renderX(doc, opts);
}

export interface XhsExportOptions extends XhsOptions {
  outDir: string;
}

/** Render XHS image cards + caption.txt into outDir. */
export async function xhsExport(src: Source, opts: XhsExportOptions) {
  const { doc, baseDir } = await load(src);
  const fm = doc.frontmatter;
  const coverFm = (fm.xhs as Record<string, unknown> | undefined)?.cover as Partial<CoverOptions> | undefined;
  const resolveImage = inlineLocalImages(baseDir);
  const diagram = await diagramsFor(doc, opts.theme, opts.primaryColor);
  const result = renderXhs(doc, {
    ...opts,
    cover: opts.cover === false ? false : { ...(typeof opts.cover === 'object' ? opts.cover : {}), ...coverFm },
    resolveImage,
    diagram,
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

export interface LongExportOptions extends LongImageOptions {
  out: string;
}

/** Render the whole article as one tall PNG (长图). */
export async function longExport(src: Source, opts: LongExportOptions) {
  const { doc, baseDir } = await load(src);
  const diagram = await diagramsFor(doc, opts.theme, opts.primaryColor);
  const r = renderLongImage(doc, { ...opts, resolveImage: inlineLocalImages(baseDir), diagram });
  await renderHtmlPng(r.html, r.width, opts.out);
  return { file: opts.out, warnings: r.warnings };
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
    const input = readInput(src.file, src.markdown);
    const doc = parseMarkdown(input.markdown);
    baseDir = input.baseDir;
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

export interface PublishOptions extends PublishCoreOptions {
  coverTemplate?: CoverTemplateId;
}

/** Upload images + cover and create a WeChat draft (headless Chromium renders a missing cover / diagrams). */
export async function publishWechat(src: Source, opts: PublishOptions = {}) {
  return publishWechatDraft(src, {
    ...opts,
    generateCover: async () => {
      const out = join(tmpdir(), `md2-cover-${Date.now()}.png`);
      await coverExport(src, { out, size: 'wechat', template: opts.coverTemplate ?? 'aurora' });
      return { data: readFileSync(out), name: 'cover.png', mime: 'image/png' };
    },
    generateDiagrams: async (diagrams) => {
      const t = getTheme(opts.theme);
      const map = await renderDiagrams(diagrams, opts.primaryColor || t.primary, t.id === 'midnight');
      return (_lang, code) => map.get(code);
    },
  });
}

// ───────────── AI ─────────────

/**
 * AI provider from env: ANTHROPIC_API_KEY (Claude, default) or
 * MD2_AI_BASE_URL + MD2_AI_API_KEY + MD2_AI_MODEL for an OpenAI-compatible endpoint.
 */
export function aiConfigFromEnv(over: Partial<AiConfig> = {}): AiConfig {
  const env = process.env;
  if (over.provider === 'openai' || (!over.provider && env.MD2_AI_BASE_URL)) {
    return {
      provider: 'openai',
      baseURL: over.baseURL ?? env.MD2_AI_BASE_URL,
      apiKey: over.apiKey ?? env.MD2_AI_API_KEY ?? '',
      model: over.model ?? env.MD2_AI_MODEL ?? '',
    };
  }
  const key = over.apiKey ?? env.ANTHROPIC_API_KEY ?? env.MD2_AI_API_KEY;
  if (!key) throw new Error('Set ANTHROPIC_API_KEY (or MD2_AI_BASE_URL + MD2_AI_API_KEY for OpenAI-compatible providers)');
  return { provider: 'anthropic', apiKey: key, model: over.model ?? env.MD2_AI_MODEL, baseURL: over.baseURL ?? env.ANTHROPIC_BASE_URL };
}

export type AiTask = 'xhs' | 'thread' | 'wechat' | 'cover';

export async function aiSuggest(src: Source, task: AiTask, cfg: AiConfig, platform: SocialPlatformId = 'x') {
  const { doc } = await load(src);
  switch (task) {
    case 'xhs': return aiXhsCopy(cfg, doc);
    case 'thread': return aiThread(cfg, doc, platform);
    case 'wechat': return aiWechatMeta(cfg, doc);
    case 'cover': return aiCoverCopy(cfg, doc);
  }
}
