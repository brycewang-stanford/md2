import { toHtml } from 'hast-util-to-html';
import { h } from 'hastscript';
import type { ElementContent, Root } from 'hast';
import { parseMarkdown } from '../parse.js';
import { prepareArticle } from '../article.js';
import { getTheme, themeCss, themeVars, type StyleOptions } from '../themes/index.js';
import { renderCover, type CoverOptions, type CoverRender } from '../cover/index.js';
import { toPlainBlocks } from '../plain.js';
import { cloneTree, extractFootnotes, transformMath } from '../transforms.js';
import type { ParsedDoc, RenderWarning } from '../types.js';

export type XhsCardStyle = 'clean' | 'ivory' | 'notes' | 'grid' | 'aurora' | 'bento' | 'brutal' | 'midnight';

export const xhsCardStyles: { id: XhsCardStyle; name: string }[] = [
  { id: 'clean', name: '纯白 Clean' },
  { id: 'ivory', name: '象牙 Ivory' },
  { id: 'notes', name: '备忘录 Notes' },
  { id: 'grid', name: '方格纸 Grid' },
  { id: 'aurora', name: '极光玻璃 Aurora' },
  { id: 'bento', name: '便当卡片 Bento' },
  { id: 'brutal', name: '新野兽派 Brutal' },
  { id: 'midnight', name: '深夜 Midnight' },
];

export interface XhsOptions extends StyleOptions {
  cardStyle?: XhsCardStyle;
  /** macOS dots on code blocks. Default false on cards */
  macCodeBlock?: boolean;
  /** Shown in the card header, e.g. "@bryce" */
  author?: string;
  /** Generate a cover card. `false` disables, an object overrides cover options */
  cover?: boolean | Partial<CoverOptions>;
  /** `---` forces a new card. Default true */
  hrPageBreak?: boolean;
  /** Show "n/total" page numbers. Default true */
  pageNumbers?: boolean;
  /** Remove the first H1 from the cards (it is on the cover). Default true when cover is on */
  removeTitle?: boolean;
  resolveImage?: (src: string) => string | undefined;
}

/** Everything the DOM paginator needs to lay out cards (see `layoutXhsCards`). */
export interface XhsLayout {
  /** Article HTML (classes, not inlined) — top-level children are the blocks to paginate */
  contentHtml: string;
  css: string;
  /** CSS custom properties to set on each card */
  vars: Record<string, string>;
  cardStyle: XhsCardStyle;
  author?: string;
  cover?: CoverRender;
  hrPageBreak: boolean;
  pageNumbers: boolean;
  /** Layout size of one card in CSS px; exported at 2× → 1080×1440 */
  width: number;
  height: number;
}

export interface XhsText {
  title: string;
  body: string;
  tags: string[];
  /** Full post text: body + hashtags */
  full: string;
  titleLength: number;
  bodyLength: number;
  warnings: RenderWarning[];
}

export interface XhsResult {
  layout: XhsLayout;
  text: XhsText;
  doc: ParsedDoc;
  warnings: RenderWarning[];
}

export const XHS_TITLE_MAX = 20;
export const XHS_BODY_MAX = 1000;

const CARD_W = 540;
const CARD_H = 720;

const CARD_CSS = `
.xhs-card { position: relative; width: ${CARD_W}px; height: ${CARD_H}px; overflow: hidden; box-sizing: border-box;
  display: flex; flex-direction: column; background: var(--xhs-bg); color: var(--md2-text); font-family: var(--md2-font); }
.xhs-card * { box-sizing: border-box; }
.xhs-card .xhs-inner { position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0; margin: var(--xhs-margin); padding: 30px 34px 18px; background: var(--xhs-paper); border-radius: var(--xhs-radius); box-shadow: var(--xhs-shadow); }
.xhs-card .xhs-head { display: flex; align-items: center; gap: 10px; height: 34px; margin-bottom: 14px; font-size: 14px; color: var(--md2-muted); flex: none; }
.xhs-card .xhs-avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--md2-primary); color: var(--md2-on-primary); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; }
.xhs-card .xhs-author { font-weight: 600; color: var(--md2-text); }
.xhs-card .xhs-body { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.xhs-card .xhs-foot { flex: none; height: 26px; display: flex; align-items: flex-end; justify-content: space-between; font-size: 12px; color: var(--md2-muted); letter-spacing: 0.05em; }
.xhs-card .xhs-page { font-variant-numeric: tabular-nums; }
.xhs-card .xhs-body > .md2 > :first-child { margin-top: 0 !important; }
.xhs-card .md2 { text-align: justify; }
.xhs-card .md2 pre code { white-space: pre-wrap; word-break: break-all; font-size: 12.5px; }
.xhs-card .md2 .table-wrap { overflow: visible; }
.xhs-card .md2 img { max-height: 520px; object-fit: contain; }
.xhs-card .md2 .math-block { overflow: visible; }
.xhs-card .md2 .math-block svg { max-width: 100%; height: auto; }
.xhs-card .md2 a, .xhs-card .md2 .link { overflow-wrap: anywhere; }
.xhs-card .md2 h1 { margin-top: 0.2em; }
.xhs-card .md2 li[data-md2-cont] { list-style-type: none; }
.xhs-card .md2 h2 { margin-top: 1.3em; }

.xhs-style-clean { --xhs-bg: #ffffff; --xhs-paper: transparent; --xhs-margin: 0px; --xhs-radius: 0px; --xhs-shadow: none; }
.xhs-style-ivory { --xhs-bg: #f5f4ee; --xhs-paper: transparent; --xhs-margin: 0px; --xhs-radius: 0px; --xhs-shadow: none; }
.xhs-style-notes { --xhs-bg: #ffffff; --xhs-paper: transparent; --xhs-margin: 0px; --xhs-radius: 0px; --xhs-shadow: none; }
.xhs-style-notes .xhs-inner { padding-top: 22px; background-image: linear-gradient(transparent calc(100% - 1px), #f1f1f1 1px); background-size: 100% 30.6px; background-position: 0 2px; }
.xhs-style-notes .xhs-head { color: #e0a400; font-weight: 600; border-bottom: 1px solid #f0f0f0; margin: 0 -34px 16px; padding: 0 34px 12px; height: 46px; }
.xhs-style-notes .xhs-avatar { background: #ffd60a; color: #1d1d1f; }
.xhs-style-grid { --xhs-bg: #fbfbf9; --xhs-paper: transparent; --xhs-margin: 0px; --xhs-radius: 0px; --xhs-shadow: none; }
.xhs-style-grid .xhs-inner { background-image: linear-gradient(rgba(0,0,0,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.045) 1px, transparent 1px); background-size: 22px 22px; }
.xhs-style-aurora { --xhs-bg: radial-gradient(120% 80% at 0% 0%, #c7b8ff 0%, transparent 55%), radial-gradient(90% 70% at 100% 20%, #a5f3d0 0%, transparent 55%), radial-gradient(100% 80% at 60% 100%, #ffc6e5 0%, transparent 60%), #f3f1ff;
  --xhs-paper: rgba(255,255,255,0.86); --xhs-margin: 24px; --xhs-radius: 22px; --xhs-shadow: 0 10px 30px rgba(60, 40, 140, 0.12); }
.xhs-style-aurora .xhs-inner { padding: 26px 28px 14px; border: 1px solid rgba(255,255,255,0.9); }
.xhs-style-bento { --xhs-bg: #eef0f4; --xhs-paper: #ffffff; --xhs-margin: 20px; --xhs-radius: 26px; --xhs-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05); }
.xhs-style-bento .xhs-inner { padding: 26px 28px 14px; }
.xhs-style-brutal { --xhs-bg: #ffd23f; --xhs-paper: #ffffff; --xhs-margin: 22px 26px 30px 22px; --xhs-radius: 0px; --xhs-shadow: 8px 8px 0 #111; }
.xhs-style-brutal .xhs-inner { border: 2.5px solid #111; padding: 24px 26px 14px; }
.xhs-style-brutal .xhs-avatar { background: #ff90e8; color: #111; border: 2px solid #111; }
.xhs-style-midnight { --xhs-bg: #13141c; --xhs-paper: transparent; --xhs-margin: 0px; --xhs-radius: 0px; --xhs-shadow: none;
  --md2-text: #c0caf5; --md2-heading: #ffffff; --md2-strong: #ffffff; --md2-muted: #7a82a6; --md2-border: #2a2e45;
  --md2-quote-bg: #1f2335; --md2-quote-text: #a9b1d6; --md2-th-bg: #1f2335; --md2-code-inline-bg: #24283b; --md2-code-inline: #ff9e64; }
.xhs-style-midnight .md2 .callout { background: #1f2335; }
.xhs-style-midnight .md2 { background: transparent; padding: 0; }
.xhs-cover-card { position: relative; width: ${CARD_W}px; height: ${CARD_H}px; overflow: hidden; }
`;

/** Article → layout data for XHS image cards. Run `layoutXhsCards` (from `@md2/core/dom`) to paginate. */
export function renderXhs(input: string | ParsedDoc, opts: XhsOptions = {}): XhsResult {
  const doc = typeof input === 'string' ? parseMarkdown(input) : input;
  const theme = getTheme(opts.theme);
  const coverOn = opts.cover !== false;
  const author = opts.author ?? (doc.frontmatter.author ? String(doc.frontmatter.author) : undefined);
  const xfm = (doc.frontmatter.xhs ?? {}) as Record<string, unknown>;

  const { root, warnings } = prepareArticle(doc, {
    theme: theme.id,
    links: 'text',
    macCodeBlock: opts.macCodeBlock ?? false,
    figureCaption: true,
    removeTitle: opts.removeTitle ?? coverOn,
    resolveImage: opts.resolveImage,
  });
  const contentHtml = toHtml(root, { allowDangerousHtml: true });

  const vars = themeVars(theme, { ...opts, fontSize: opts.fontSize ?? 17, lineHeight: opts.lineHeight ?? 1.8 });
  const css = CARD_CSS + '\n' + themeCss(theme, opts);

  let cover: CoverRender | undefined;
  if (coverOn) {
    const co = typeof opts.cover === 'object' ? opts.cover : {};
    cover = renderCover({
      title: String(xfm.title ?? doc.title ?? ''),
      subtitle: (doc.frontmatter.subtitle as string) ?? undefined,
      author,
      tags: doc.tags.slice(0, 4),
      template: 'claude',
      accent: opts.primaryColor ?? theme.primary,
      ...co,
      size: { width: CARD_W * 2, height: CARD_H * 2 },
      scale: 2,
    });
  }

  const text = renderXhsText(doc);
  return {
    layout: {
      contentHtml,
      css,
      vars,
      cardStyle: opts.cardStyle ?? 'clean',
      author,
      cover,
      hrPageBreak: opts.hrPageBreak !== false,
      pageNumbers: opts.pageNumbers !== false,
      width: CARD_W,
      height: CARD_H,
    },
    text,
    doc,
    warnings: [...warnings, ...text.warnings],
  };
}

const NUM_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/** Count characters the way XHS's editor does (each code point = 1). */
export function xhsLength(s: string): number {
  return Array.from(s).length;
}

/** Article → XHS post caption: ≤20-char title, emoji-structured body, hashtags. */
export function renderXhsText(input: string | ParsedDoc, opts: { emoji?: boolean } = {}): XhsText {
  const doc = typeof input === 'string' ? parseMarkdown(input) : input;
  const emoji = opts.emoji !== false;
  const xfm = (doc.frontmatter.xhs ?? {}) as Record<string, unknown>;
  const tree: Root = cloneTree(doc.hast);
  transformMath(tree, (tex, display) => (display ? h('p', tex) : { type: 'text', value: tex }) as ElementContent);
  extractFootnotes(tree);
  const blocks = toPlainBlocks(tree, { keepUrls: false });

  const lines: string[] = [];
  let skippedTitle = false;
  for (const b of blocks) {
    switch (b.kind) {
      case 'heading':
        if (!skippedTitle && b.level === 1 && b.text === doc.title) {
          skippedTitle = true;
          continue;
        }
        lines.push(`${emoji ? (b.level! <= 2 ? '📌 ' : '🔸 ') : ''}${b.text}`);
        break;
      case 'list':
        lines.push(
          b.items!.map((i) => '  '.repeat(i.depth) + (i.ordered ? (emoji && i.n <= 10 ? NUM_EMOJI[i.n] + ' ' : `${i.n}. `) : emoji ? (i.depth ? '▫️ ' : '✅ ') : '• ') + i.text).join('\n'),
        );
        break;
      case 'quote':
        lines.push(`${emoji ? '💬 ' : ''}${b.text}`);
        break;
      case 'callout':
        lines.push(b.text);
        break;
      case 'code':
        lines.push(emoji ? '💻（代码见图）' : '（代码见图）');
        break;
      case 'table':
        lines.push(b.text);
        break;
      case 'image':
        break;
      default:
        lines.push(b.text);
    }
  }
  const tags = doc.tags.length ? doc.tags : ((xfm.tags as string[]) ?? []);
  const body = (typeof xfm.body === 'string' ? xfm.body : lines.join('\n\n')).trim();
  const title = String(xfm.title ?? doc.title ?? '').trim();
  const hashtags = tags.map((t) => `#${t}`).join(' ');
  const full = hashtags ? `${body}\n\n${hashtags}` : body;

  const warnings: RenderWarning[] = [];
  if (xhsLength(title) > XHS_TITLE_MAX)
    warnings.push({ code: 'xhs-title', message: `小红书标题 ${xhsLength(title)}/${XHS_TITLE_MAX} 字，超出部分会被截断（可在 front matter 写 xhs.title）` });
  if (xhsLength(full) > XHS_BODY_MAX)
    warnings.push({ code: 'xhs-body', message: `小红书正文 ${xhsLength(full)}/${XHS_BODY_MAX} 字，超出上限（可在 front matter 写 xhs.body）` });

  return { title, body, tags, full, titleLength: xhsLength(title), bodyLength: xhsLength(full), warnings };
}
