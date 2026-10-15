import { toHtml } from 'hast-util-to-html';
import { visit, SKIP } from 'unist-util-visit';
import type { Root, Element, Parent } from 'hast';
import { parseMarkdown } from '../parse.js';
import { inlineCss } from '../inline-css.js';
import { prepareArticle } from '../article.js';
import { getTheme, themeCss, themeVars, type StyleOptions } from '../themes/index.js';
import { hasClass } from '../transforms.js';
import type { DiagramResolver, ParsedDoc, RenderWarning } from '../types.js';

export interface WechatOptions extends StyleOptions {
  /** Convert external links into numbered references (WeChat blocks outside links). Default true */
  linkReferences?: boolean;
  /** macOS-style traffic-light dots on code blocks. Default true */
  macCodeBlock?: boolean;
  /** Show image alt/title as caption. Default true */
  figureCaption?: boolean;
  /** Remove the first H1 (WeChat has its own title field). Default false */
  removeTitle?: boolean;
  /** Rewrite image src (e.g. local path → uploaded URL) */
  resolveImage?: (src: string) => string | undefined;
  /** Title of the reference section. Default 参考资料 */
  referencesTitle?: string;
  /** Render ```mermaid blocks to inline SVG (see `renderMermaidSvg` in @md2/core/dom) */
  diagram?: DiagramResolver;
}

export interface WechatResult {
  /** Paste-ready HTML with every style inlined */
  html: string;
  doc: ParsedDoc;
  warnings: RenderWarning[];
}

const BLOCK = new Set(['p', 'section', 'div', 'ul', 'ol', 'pre', 'blockquote', 'table', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr']);

const WECHAT_LINK =/^https?:\/\/(mp\.weixin\.qq\.com|weixin\.qq\.com)\//i;

export function renderWechat(input: string | ParsedDoc, opts: WechatOptions = {}): WechatResult {
  const doc = typeof input === 'string' ? parseMarkdown(input) : input;
  const theme = getTheme(opts.theme);
  const { root, warnings } = prepareArticle(doc, {
    theme: theme.id,
    links: opts.linkReferences === false ? 'keep' : 'refs',
    keepLink: (u) => WECHAT_LINK.test(u),
    macCodeBlock: opts.macCodeBlock,
    figureCaption: opts.figureCaption,
    removeTitle: opts.removeTitle,
    resolveImage: opts.resolveImage,
    referencesTitle: opts.referencesTitle,
    protectCodeWhitespace: true,
    diagram: opts.diagram,
  });
  root.properties.dataTool = 'md2';
  const tree: Root = { type: 'root', children: [root] };
  inlineCss(tree, themeCss(theme, opts), { vars: themeVars(theme, opts) });

  // Drop decorative spans that ended up empty and unstyled; WeChat would strip them anyway
  visit(tree, 'element', (el: Element, index, parent: Parent | undefined) => {
    if (!parent || index === undefined || el.tagName !== 'span') return;
    if ((hasClass(el, 'prefix') || hasClass(el, 'suffix')) && el.children.length === 0 && !/width/.test(String(el.properties.style ?? ''))) {
      parent.children.splice(index, 1);
      return [SKIP, index];
    }
  });
  visit(tree, 'element', (el: Element) => {
    // WeChat drops <div> wrappers (callouts lose their box); <section> survives
    if (el.tagName === 'div') el.tagName = 'section';
    // Saving / publishing fails (请勿插入非mp.weixin.qq.com域名的链接) on any other <a href>:
    // mailto:, #anchors, relative paths, raw HTML, or every link when references are off
    if (el.tagName === 'a' && !WECHAT_LINK.test(String(el.properties.href ?? ''))) {
      el.tagName = 'span';
      delete el.properties.href;
      delete el.properties.target;
      delete el.properties.rel;
      delete el.properties.title;
    }
    // WeChat wraps a tight <li>'s inline content in a <section> itself, but leaves a
    // leading <span> outside it (task-list ☑ ended up on its own line); wrap it all first
    if (el.tagName === 'li' && el.children.length && !el.children.some((c) => c.type === 'element' && BLOCK.has(c.tagName)))
      el.children = [{ type: 'element', tagName: 'section', properties: {}, children: el.children }];
    delete el.properties.className;
    delete el.properties.dataLang;
    delete el.properties.dataFootnote;
    delete el.properties.dataCallout;
  });

  return { html: toHtml(tree, { allowDangerousHtml: true }), doc, warnings };
}
