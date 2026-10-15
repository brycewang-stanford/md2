import { parseMarkdown } from '../parse.js';
import { getTheme, themeVars } from '../themes/index.js';
import { renderWechat, type WechatOptions } from './wechat.js';
import type { ParsedDoc, RenderWarning } from '../types.js';

export interface LongImageOptions extends WechatOptions {
  /** Layout width in CSS px; exported at 2× (default 540 → 1080 px wide) */
  width?: number;
  /** Show title / author header. Default true */
  header?: boolean;
  /** Footer text, e.g. "@me · 2026". Default author · md2 */
  footer?: string | false;
  /** Page background behind the article */
  background?: string;
}

export interface LongImageResult {
  /** Self-contained HTML of the image root (`.md2-long`) */
  html: string;
  width: number;
  doc: ParsedDoc;
  warnings: RenderWarning[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * One tall image of the whole article (长图) for 朋友圈 / 微博 / 小红书 long posts.
 * Reuses the WeChat renderer so every theme looks identical.
 */
export function renderLongImage(input: string | ParsedDoc, opts: LongImageOptions = {}): LongImageResult {
  const doc = typeof input === 'string' ? parseMarkdown(input) : input;
  const theme = getTheme(opts.theme);
  const vars = themeVars(theme, opts);
  const width = opts.width ?? 540;
  const showHeader = opts.header !== false;
  const { html: body, warnings } = renderWechat(doc, { ...opts, linkReferences: opts.linkReferences ?? true, removeTitle: showHeader });
  const dark = theme.id === 'midnight';
  const bg = opts.background ?? (dark ? '#13141c' : '#ffffff');
  const muted = vars['--md2-muted'];
  const font = vars['--md2-font'].replace(/"/g, "'");
  const author = doc.frontmatter.author ? String(doc.frontmatter.author) : '';
  const footer = opts.footer === false ? '' : (opts.footer ?? Array.from(new Set([author, 'md2'].filter(Boolean))).join(' · '));

  const header = showHeader && doc.title
    ? `<header style="padding:8px 0 22px;margin-bottom:8px;border-bottom:1px solid ${vars['--md2-border']}">
<h1 style="margin:0 0 10px;font-size:${Math.round((opts.fontSize ?? 16) * 1.65)}px;line-height:1.35;font-weight:800;color:${vars['--md2-heading']};font-family:${font}">${esc(doc.title)}</h1>
${author ? `<div style="font-size:13px;color:${muted};font-family:${font}">${esc(author)}</div>` : ''}
</header>`
    : '';
  const foot = footer
    ? `<footer style="margin-top:36px;padding-top:16px;border-top:1px solid ${vars['--md2-border']};text-align:center;font-size:12px;letter-spacing:.08em;color:${muted};font-family:${font}">${esc(footer)}</footer>`
    : '';
  const html = `<div class="md2-long" style="width:${width}px;box-sizing:border-box;padding:40px 30px 32px;background:${bg}">${header}${body}${foot}</div>`;
  return { html, width, doc, warnings };
}
