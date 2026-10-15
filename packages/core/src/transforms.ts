import { visit, SKIP } from 'unist-util-visit';
import { toText } from 'hast-util-to-text';
import { h } from 'hastscript';
import type { Root, Element, ElementContent, Parent, Text } from 'hast';
import { codeLang, highlightCode } from './highlight.js';

/** A raw HTML node; serialised verbatim by hast-util-to-html with allowDangerousHtml. */
export interface RawNode {
  type: 'raw';
  value: string;
}
export const raw = (value: string) => ({ type: 'raw', value }) as unknown as ElementContent;

export function classList(el: Element): string[] {
  const c: unknown = el.properties?.className;
  return Array.isArray(c) ? c.map(String) : typeof c === 'string' ? c.split(/\s+/) : [];
}

export function hasClass(el: Element, name: string): boolean {
  return classList(el).includes(name);
}

export function addClass(el: Element, ...names: string[]) {
  el.properties.className = [...classList(el), ...names];
}

function isWhitespace(n: ElementContent): boolean {
  return n.type === 'text' && !n.value.trim();
}

/** Replace math nodes produced by remark-math with platform-specific output. */
export function transformMath(
  tree: Root,
  render: (tex: string, display: boolean) => ElementContent,
) {
  visit(tree, 'element', (el: Element, index, parent: Parent | undefined) => {
    if (!parent || index === undefined) return;
    // display: <pre><code class="math-display">
    if (el.tagName === 'pre') {
      const code = el.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
      if (code && (hasClass(code, 'math-display') || codeLang(code) === 'math')) {
        parent.children[index] = render(toText(code, { whitespace: 'pre' }).trim(), true) as Element;
        return SKIP;
      }
    }
    if (el.tagName === 'code' && (hasClass(el, 'math-inline') || hasClass(el, 'math-display'))) {
      parent.children[index] = render(toText(el, { whitespace: 'pre' }).trim(), hasClass(el, 'math-display')) as Element;
      return SKIP;
    }
  });
}

export interface CodeBlockInfo {
  pre: Element;
  code: Element;
  lang: string;
  text: string;
}

/** Collect fenced code blocks (math blocks must already be transformed). */
export function codeBlocks(tree: Root): CodeBlockInfo[] {
  const out: CodeBlockInfo[] = [];
  visit(tree, 'element', (el: Element) => {
    if (el.tagName !== 'pre') return;
    const code = el.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
    if (!code) return;
    out.push({ pre: el, code, lang: codeLang(code), text: toText(code, { whitespace: 'pre' }).replace(/\n$/, '') });
    return SKIP;
  });
  return out;
}

export function highlightBlocks(tree: Root) {
  for (const b of codeBlocks(tree)) {
    b.code.children = highlightCode(b.text, b.lang);
    addClass(b.code, 'hljs');
    b.pre.properties.dataLang = b.lang || undefined;
  }
}

/**
 * Wrap heading content in `prefix / content / suffix` spans so themes can
 * decorate headings without pseudo-elements (which cannot be inlined).
 */
export function decorateHeadings(tree: Root) {
  visit(tree, 'element', (el: Element) => {
    if (!/^h[1-6]$/.test(el.tagName)) return;
    el.children = [
      h('span.prefix'),
      h('span.content', el.children),
      h('span.suffix'),
    ] as ElementContent[];
    return SKIP;
  });
}

/** `<p><img alt="cap"></p>` → `<figure><img><figcaption>cap</figcaption></figure>` */
export function figureImages(tree: Root, caption = true) {
  visit(tree, 'element', (el: Element, index, parent: Parent | undefined) => {
    if (!parent || index === undefined || el.tagName !== 'p') return;
    const kids = el.children.filter((c) => !isWhitespace(c));
    const imgs = kids.filter((c): c is Element => c.type === 'element' && c.tagName === 'img');
    if (!imgs.length || imgs.length !== kids.filter((c) => c.type === 'element' && c.tagName !== 'br').length) return;
    if (kids.some((c) => c.type === 'text')) return;
    const figs = imgs.map((img) => {
      const alt = String(img.properties.alt ?? '').trim();
      const title = String(img.properties.title ?? '').trim();
      const cap = title || alt;
      return h('figure', [img, caption && cap && !/^(image|img|图片)\d*$/i.test(cap) ? h('figcaption', cap) : null].filter(Boolean) as Element[]);
    });
    parent.children.splice(index, 1, ...figs);
    return [SKIP, index + figs.length];
  });
}

export function wrapTables(tree: Root) {
  visit(tree, 'element', (el: Element, index, parent: Parent | undefined) => {
    if (!parent || index === undefined || el.tagName !== 'table') return;
    parent.children[index] = h('section.table-wrap', [el]);
    return SKIP;
  });
}

/** GFM task-list checkboxes → ☑ / ☐ glyphs (inputs are stripped by most editors). */
export function taskListGlyphs(tree: Root) {
  visit(tree, 'element', (el: Element, index, parent: Parent | undefined) => {
    if (!parent || index === undefined || el.tagName !== 'input' || el.properties.type !== 'checkbox') return;
    const glyph: Text = { type: 'text', value: el.properties.checked ? '☑ ' : '☐ ' };
    parent.children[index] = h('span.task', [glyph]) as Element;
  });
}

/** Footnote metadata extracted from the GFM footnote section. */
export interface Footnote {
  n: number;
  id: string;
  content: ElementContent[];
  text: string;
}

/**
 * Pull GFM footnotes out of the tree. Refs become `<sup class="footnote-ref">[n]</sup>`;
 * the `<section data-footnotes>` is removed and returned for the caller to re-render.
 */
export function extractFootnotes(tree: Root): Footnote[] {
  const notes: Footnote[] = [];
  const order = new Map<string, number>();
  visit(tree, 'element', (el: Element, index, parent: Parent | undefined) => {
    if (!parent || index === undefined) return;
    if (el.tagName === 'section' && el.properties.dataFootnotes !== undefined) {
      visit(el, 'element', (li: Element) => {
        if (li.tagName !== 'li') return;
        // drop back-references
        visit(li, 'element', (a: Element, i, p: Parent | undefined) => {
          if (p && i !== undefined && a.tagName === 'a' && a.properties.dataFootnoteBackref !== undefined) {
            p.children.splice(i, 1);
            return [SKIP, i];
          }
        });
        const id = String(li.properties.id ?? '');
        const content = li.children.flatMap((c) =>
          c.type === 'element' && c.tagName === 'p' ? c.children : isWhitespace(c) ? [] : [c],
        );
        notes.push({ n: notes.length + 1, id, content, text: toText(li).trim() });
        order.set(id, notes.length);
      });
      parent.children.splice(index, 1);
      return [SKIP, index];
    }
  });
  visit(tree, 'element', (el: Element) => {
    if (el.tagName !== 'sup') return;
    const a = el.children.find((c): c is Element => c.type === 'element' && c.tagName === 'a');
    if (!a || a.properties.dataFootnoteRef === undefined) return;
    const target = String(a.properties.href ?? '').replace(/^#/, '');
    const n = order.get(target) ?? Number(toText(a));
    el.properties = { className: ['footnote-ref'], dataFootnote: n };
    el.children = [{ type: 'text', value: `[${n}]` }];
  });
  return notes;
}

export interface LinkRef {
  n: number;
  text: string;
  url: string;
}

/**
 * External links → text + `[n]` and a reference list at the end.
 * WeChat only allows links to mp.weixin.qq.com inside articles.
 */
export function linksToFootnotes(trees: Root | Root[], keep: (url: string) => boolean): LinkRef[] {
  const refs: LinkRef[] = [];
  const seen = new Map<string, number>();
  for (const tree of Array.isArray(trees) ? trees : [trees]) visit(tree, 'element', (el: Element, index, parent: Parent | undefined) => {
    if (!parent || index === undefined || el.tagName !== 'a') return;
    const url = String(el.properties.href ?? '');
    if (!/^https?:\/\//i.test(url) || keep(url)) return;
    const text = toText(el).trim();
    const span = h('span.link', el.children) as Element;
    if (!text || text === url || text === url.replace(/^https?:\/\//, '')) {
      parent.children[index] = span;
      return SKIP;
    }
    let n = seen.get(url);
    if (!n) {
      n = refs.length + 1;
      seen.set(url, n);
      refs.push({ n, text, url });
    }
    parent.children.splice(index, 1, span, h('sup.footnote-ref.link-ref', `[${n}]`) as Element);
    return [SKIP, index + 2];
  });
  return refs;
}

/** Remove the first H1 (used when the platform has its own title field). */
export function removeFirstH1(tree: Root) {
  const i = tree.children.findIndex((c) => c.type === 'element' && c.tagName === 'h1');
  if (i >= 0) tree.children.splice(i, 1);
}

/** Make relative/local image URLs absolute using a resolver. */
export function rewriteImages(tree: Root, resolve: (src: string) => string | undefined) {
  visit(tree, 'element', (el: Element) => {
    if (el.tagName !== 'img') return;
    const src = String(el.properties.src ?? '');
    const next = resolve(src);
    if (next !== undefined) el.properties.src = next;
  });
}

export function cloneTree<T>(tree: T): T {
  return structuredClone(tree);
}
