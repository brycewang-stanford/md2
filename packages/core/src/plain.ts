import { toText } from 'hast-util-to-text';
import type { Element, ElementContent, Root } from 'hast';
import { hasClass } from './transforms.js';

export interface PlainBlock {
  kind: 'heading' | 'paragraph' | 'list' | 'quote' | 'code' | 'table' | 'image' | 'callout';
  level?: number;
  text: string;
  /** For lists: individual item lines (without bullets) */
  items?: { text: string; depth: number; ordered: boolean; n: number }[];
  images: string[];
}

export function inlineText(node: ElementContent | Root): string {
  return toText(node as Element, { whitespace: 'normal' }).replace(/[ \t]+/g, ' ').trim();
}

function imgs(el: Element): string[] {
  const out: string[] = [];
  const walk = (n: Element) => {
    if (n.tagName === 'img' && n.properties.src) out.push(String(n.properties.src));
    for (const c of n.children) if (c.type === 'element') walk(c);
  };
  walk(el);
  return out;
}

/** Replace `<a>` by "text url" (or just text) so links survive as plain text. */
function flattenLinks(el: Element, keepUrls: boolean) {
  const walk = (n: Element) => {
    n.children = n.children.map((c) => {
      if (c.type === 'element' && c.tagName === 'a') {
        const href = String(c.properties.href ?? '');
        const t = inlineText(c);
        if (keepUrls && /^https?:/.test(href) && t !== href) return { type: 'text', value: `${t} ${href} ` } as ElementContent;
        return { type: 'text', value: t } as ElementContent;
      }
      if (c.type === 'element') walk(c);
      return c;
    });
  };
  walk(el);
}

/**
 * Flatten an article tree into plain-text blocks. Math must already be
 * converted to text and footnotes extracted by the caller.
 */
export function toPlainBlocks(tree: Root, opts: { keepUrls?: boolean } = {}): PlainBlock[] {
  const blocks: PlainBlock[] = [];
  const keepUrls = opts.keepUrls ?? true;

  const listItems = (list: Element, depth: number, out: NonNullable<PlainBlock['items']>, images: string[]) => {
    let n = Number(list.properties.start ?? 1);
    const ordered = list.tagName === 'ol';
    for (const li of list.children) {
      if (li.type !== 'element' || li.tagName !== 'li') continue;
      flattenLinks(li, keepUrls);
      const nested = li.children.filter((c): c is Element => c.type === 'element' && (c.tagName === 'ul' || c.tagName === 'ol'));
      const own = { ...li, children: li.children.filter((c) => !nested.includes(c as Element)) } as Element;
      out.push({ text: inlineText(own), depth, ordered, n: n++ });
      images.push(...imgs(own));
      for (const sub of nested) listItems(sub, depth + 1, out, images);
    }
  };

  const visitBlock = (el: Element) => {
    switch (el.tagName) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        blocks.push({ kind: 'heading', level: Number(el.tagName[1]), text: inlineText(el), images: [] });
        return;
      case 'p': {
        flattenLinks(el, keepUrls);
        const text = inlineText(el);
        const images = imgs(el);
        if (text) blocks.push({ kind: 'paragraph', text, images });
        else if (images.length) blocks.push({ kind: 'image', text: '', images });
        return;
      }
      case 'ul': case 'ol': {
        const items: NonNullable<PlainBlock['items']> = [];
        const images: string[] = [];
        listItems(el, 0, items, images);
        blocks.push({ kind: 'list', text: items.map((i) => i.text).join('\n'), items, images });
        return;
      }
      case 'blockquote':
        flattenLinks(el, keepUrls);
        blocks.push({ kind: 'quote', text: inlineText(el), images: imgs(el) });
        return;
      case 'div':
        if (hasClass(el, 'callout')) {
          flattenLinks(el, keepUrls);
          const [title, ...rest] = el.children.filter((c): c is Element => c.type === 'element');
          blocks.push({
            kind: 'callout',
            text: `${title ? inlineText(title) + '：' : ''}${rest.map((r) => inlineText(r)).join('\n')}`,
            images: [],
          });
          return;
        }
        for (const c of el.children) if (c.type === 'element') visitBlock(c);
        return;
      case 'pre':
        blocks.push({ kind: 'code', text: toText(el).replace(/\n$/, ''), images: [] });
        return;
      case 'table': {
        const rows: string[] = [];
        const walk = (n: Element) => {
          if (n.tagName === 'tr') {
            rows.push((n.children.filter((c) => c.type === 'element') as Element[]).map((c) => inlineText(c)).join(' | '));
            return;
          }
          for (const c of n.children) if (c.type === 'element') walk(c);
        };
        walk(el);
        blocks.push({ kind: 'table', text: rows.join('\n'), images: [] });
        return;
      }
      case 'figure':
        blocks.push({ kind: 'image', text: '', images: imgs(el) });
        return;
      case 'hr':
      case 'section':
        return;
      default: {
        const t = inlineText(el);
        if (t) blocks.push({ kind: 'paragraph', text: t, images: imgs(el) });
      }
    }
  };
  for (const c of tree.children) if (c.type === 'element') visitBlock(c);
  return blocks;
}
