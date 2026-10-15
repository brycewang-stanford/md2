import { h } from 'hastscript';
import { visit } from 'unist-util-visit';
import type { Root, Element, ElementContent, Parent, Text } from 'hast';
import { texToSvg } from './math.js';
import { getTheme } from './themes/index.js';
import {
  cloneTree, codeBlocks, decorateHeadings, extractFootnotes, figureImages, hasClass, highlightBlocks,
  linksToFootnotes, raw, removeFirstH1, rewriteImages, taskListGlyphs, transformMath, wrapTables,
} from './transforms.js';
import type { ParsedDoc, RenderWarning } from './types.js';

export interface ArticleOptions {
  theme?: string;
  /** 'refs' → numbered reference list (WeChat); 'text' → plain text; 'keep' → leave <a> */
  links?: 'refs' | 'text' | 'keep';
  /** Keep these link URLs as real links when links = 'refs' */
  keepLink?: (url: string) => boolean;
  macCodeBlock?: boolean;
  figureCaption?: boolean;
  removeTitle?: boolean;
  resolveImage?: (src: string) => string | undefined;
  referencesTitle?: string;
  /** Convert code whitespace to NBSP/<br> (needed by WeChat's editor) */
  protectCodeWhitespace?: boolean;
}

const MAC_DOTS =
  '<svg xmlns="http://www.w3.org/2000/svg" width="45" height="12" viewBox="0 0 45 12" style="display:inline-block"><circle cx="6" cy="6" r="5.5" fill="#ff5f56"/><circle cx="22" cy="6" r="5.5" fill="#ffbd2e"/><circle cx="38" cy="6" r="5.5" fill="#27c93f"/></svg>';

function protectWhitespace(code: Element) {
  const walk = (node: Parent) => {
    const out: ElementContent[] = [];
    for (const child of node.children as ElementContent[]) {
      if (child.type === 'text') {
        const lines = child.value.replace(/\t/g, '    ').split('\n');
        lines.forEach((line, i) => {
          if (i > 0) out.push(h('br') as Element);
          if (line) out.push({ type: 'text', value: line.replace(/ /g, ' ') } as Text);
        });
      } else {
        if (child.type === 'element') walk(child);
        out.push(child);
      }
    }
    node.children = out as Element['children'];
  };
  walk(code);
}

/**
 * Build the styled-article tree shared by WeChat and XHS cards:
 * math → SVG, highlighted code, decorated headings, figures, callouts and a
 * unified reference list. Returns `<section class="md2">` (classes intact).
 */
export function prepareArticle(doc: ParsedDoc, opts: ArticleOptions = {}): { root: Element; warnings: RenderWarning[] } {
  const tree: Root = cloneTree(doc.hast);
  const warnings: RenderWarning[] = [];
  const theme = getTheme(opts.theme);

  if (opts.removeTitle) removeFirstH1(tree);
  if (opts.resolveImage) rewriteImages(tree, opts.resolveImage);

  transformMath(tree, (tex, display) =>
    display
      ? (h('section.math-block', [raw(texToSvg(tex, true))]) as Element)
      : (h('span.math-inline', [raw(texToSvg(tex, false))]) as Element),
  );

  highlightBlocks(tree);
  for (const b of codeBlocks(tree)) {
    if (opts.protectCodeWhitespace) protectWhitespace(b.code);
    if (opts.macCodeBlock !== false) b.pre.children.unshift(h('span.mac-dots', [raw(MAC_DOTS)]) as Element);
  }

  decorateHeadings(tree);
  visit(tree, 'element', (el: Element) => {
    const lvl = el.tagName as 'h1' | 'h2' | 'h3' | 'h4';
    if (!/^h[1-4]$/.test(lvl)) return;
    const [pre, , suf] = el.children as Element[];
    if (theme.prefix?.[lvl]) pre.children = [{ type: 'text', value: theme.prefix[lvl]! }];
    if (theme.suffix?.[lvl]) suf.children = [{ type: 'text', value: theme.suffix[lvl]! }];
  });

  figureImages(tree, opts.figureCaption !== false);
  wrapTables(tree);
  taskListGlyphs(tree);

  const notes = extractFootnotes(tree);
  const linkMode = opts.links ?? 'refs';
  let links: ReturnType<typeof linksToFootnotes> = [];
  if (linkMode === 'refs') {
    links = linksToFootnotes(tree, opts.keepLink ?? (() => false));
  } else if (linkMode === 'text') {
    visit(tree, 'element', (el: Element) => {
      if (el.tagName === 'a') {
        el.tagName = 'span';
        el.properties = { className: ['link'] };
      }
    });
  }
  // Footnotes and link references share one numbered list
  if (notes.length && links.length) {
    const offset = notes.length;
    visit(tree, 'element', (el: Element) => {
      if (el.tagName === 'sup' && hasClass(el, 'link-ref')) {
        const n = Number(String((el.children[0] as Text).value).replace(/\D/g, '')) + offset;
        el.children = [{ type: 'text', value: `[${n}]` }];
      }
    });
    links.forEach((l) => (l.n += offset));
  }
  const refItems = [
    ...notes.map((n) => ({ n: n.n, body: n.content })),
    ...links.map((l) => ({
      n: l.n,
      body: [{ type: 'text', value: `${l.text}: ` } as Text, h('span.ref-url', l.url) as Element] as ElementContent[],
    })),
  ];
  if (refItems.length) {
    tree.children.push(
      h('section.refs', [
        h('p.refs-title', opts.referencesTitle ?? '参考资料'),
        ...refItems.map((it) => h('p.ref-item', [h('span.ref-num', `[${it.n}]`), ...it.body])),
      ]) as Element,
    );
  }

  visit(tree, 'element', (el: Element) => {
    if (el.tagName !== 'img') return;
    const src = String(el.properties.src ?? '');
    if (src && !/^(https?:|data:|blob:)/i.test(src)) {
      warnings.push({ code: 'local-image', message: `Local image needs uploading first: ${src}` });
    }
  });

  const root = h('section.md2', tree.children as ElementContent[]) as Element;
  return { root, warnings };
}
