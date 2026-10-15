import type { ElementContent, Root } from 'hast';
import { h } from 'hastscript';
import { toPlainBlocks } from '../plain.js';
import { parseMarkdown } from '../parse.js';
import { cloneTree, extractFootnotes, transformMath } from '../transforms.js';
import type { ParsedDoc, RenderWarning } from '../types.js';

export interface XOptions {
  /** Max weighted length per post. 280 for standard accounts; Premium allows 25 000. */
  limit?: number;
  /** Append ` 1/n` counters. Default true */
  numbering?: boolean;
  /** Put the title as the first post (with 🧵). Default true */
  titleFirst?: boolean;
  /** Include fenced code blocks (as plain text). Default false → replaced by a placeholder */
  includeCode?: boolean;
  /** Hashtags appended to the last post (from front matter tags). Default true */
  hashtags?: boolean;
}

export interface Tweet {
  text: string;
  /** Weighted length as counted by X (CJK = 2, URL = 23) */
  length: number;
  images: string[];
}

export interface XResult {
  tweets: Tweet[];
  doc: ParsedDoc;
  warnings: RenderWarning[];
}

const URL_RE = /https?:\/\/[^\s　-〿＀-￯]+/g;
const URL_WEIGHT = 23;

/** Weight of a single code point per twitter-text v3 config. */
function cpWeight(cp: number): number {
  if (cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247)) return 1;
  return 2;
}

/** Weighted length as X counts it. */
export function tweetLength(text: string): number {
  let len = 0;
  let rest = text.replace(URL_RE, () => {
    len += URL_WEIGHT;
    return '';
  });
  // Emoji sequences count as 2 regardless of components
  rest = rest.replace(/\p{Extended_Pictographic}(‍\p{Extended_Pictographic}|️|[\u{1f3fb}-\u{1f3ff}])*/gu, () => {
    len += 2;
    return '';
  });
  for (const ch of rest) len += cpWeight(ch.codePointAt(0)!);
  return len;
}

function toBlocks(tree: Root, opts: XOptions): Block[] {
  return toPlainBlocks(tree, { keepUrls: true }).map((b) => {
    switch (b.kind) {
      case 'heading':
        return { text: `【${b.text}】`, images: [], heading: true };
      case 'list':
        return {
          text: b.items!.map((i) => '  '.repeat(i.depth) + (i.ordered ? `${i.n}. ` : i.depth ? '◦ ' : '• ') + i.text).join('\n'),
          images: b.images,
        };
      case 'quote':
        return { text: `“${b.text}”`, images: b.images };
      case 'code':
        return { text: opts.includeCode ? b.text : '［代码见原文］', images: [] };
      default:
        return { text: b.text, images: b.images };
    }
  });
}

interface Block {
  text: string;
  images: string[];
  heading?: boolean;
}

/** Split text that is too long into sentence-sized pieces that fit `limit`. */
function splitLong(text: string, limit: number): string[] {
  if (tweetLength(text) <= limit) return [text];
  const sentences = text.match(/[^。！？!?；;.\n]+[。！？!?；;.\n]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (tweetLength(cur + s) <= limit) {
      cur += s;
      continue;
    }
    if (cur) out.push(cur.trim());
    if (tweetLength(s) <= limit) {
      cur = s;
    } else {
      // hard split by characters / words
      cur = '';
      const parts = /[一-鿿]/.test(s) ? Array.from(s) : s.split(/(\s+)/);
      for (const p of parts) {
        if (tweetLength(cur + p) > limit) {
          out.push(cur.trim());
          cur = '';
        }
        cur += p;
      }
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Convert an article into an X/Twitter thread. */
export function renderX(input: string | ParsedDoc, opts: XOptions = {}): XResult {
  const doc = typeof input === 'string' ? parseMarkdown(input) : input;
  const limit = opts.limit ?? 280;
  const numbering = opts.numbering !== false;
  const reserve = numbering ? 8 : 0; // " 12/34"
  const warnings: RenderWarning[] = [];
  const tree: Root = cloneTree(doc.hast);
  transformMath(tree, (tex, display) =>
    (display ? h('p', tex) : { type: 'text', value: tex }) as ElementContent,
  );
  const notes = extractFootnotes(tree);

  const blocks = toBlocks(tree, opts);
  // Drop the H1 if it equals the title, it becomes the hook post
  if (opts.titleFirst !== false && doc.title) {
    const i = blocks.findIndex((b) => b.heading && b.text === `【${doc.title}】`);
    if (i >= 0) blocks.splice(i, 1);
  }
  if (notes.length) blocks.push({ text: notes.map((n) => `[${n.n}] ${n.text}`).join('\n'), images: [] });

  const max = limit - reserve;
  const posts: { text: string; images: string[] }[] = [];
  if (opts.titleFirst !== false && doc.title) {
    const withSummary = !!doc.summary && tweetLength(`${doc.title}\n\n${doc.summary}`) <= max - 4;
    posts.push({ text: `${withSummary ? `${doc.title}\n\n${doc.summary}` : doc.title} 🧵`, images: [] });
    // Don't repeat the intro paragraph the hook already quotes
    if (withSummary) {
      const i = blocks.findIndex((b) => !b.heading && b.text.trim());
      if (i >= 0 && blocks[i].text.trim() === doc.summary.trim() && !blocks[i].images.length) blocks.splice(i, 1);
    }
  }
  let cur: { text: string; images: string[] } | null = null;
  const flush = () => {
    if (cur && (cur.text.trim() || cur.images.length)) posts.push({ text: cur.text.trim(), images: cur.images });
    cur = null;
  };
  for (const b of blocks) {
    const pieces = splitLong(b.text, max);
    pieces.forEach((piece, pi) => {
      const images = pi === pieces.length - 1 ? b.images : [];
      // Headings start a new post
      if (b.heading) flush();
      const joined = cur ? `${cur.text}\n\n${piece}` : piece;
      if (cur && tweetLength(joined) <= max && cur.images.length + images.length <= 4) {
        cur.text = joined;
        cur.images.push(...images);
      } else {
        flush();
        cur = { text: piece, images: [...images] };
      }
    });
  }
  flush();

  if (opts.hashtags !== false && doc.tags.length && posts.length) {
    const tags = doc.tags.map((t) => '#' + t.replace(/\s+/g, '')).join(' ');
    const last = posts[posts.length - 1];
    if (tweetLength(`${last.text}\n\n${tags}`) <= max) last.text += `\n\n${tags}`;
    else posts.push({ text: tags, images: [] });
  }

  // Images beyond 4 per post overflow into image-only posts
  const final: { text: string; images: string[] }[] = [];
  for (const p of posts) {
    final.push({ text: p.text, images: p.images.slice(0, 4) });
    for (let i = 4; i < p.images.length; i += 4) final.push({ text: '', images: p.images.slice(i, i + 4) });
  }

  const n = final.length;
  const tweets: Tweet[] = final.map((p, i) => {
    const text = numbering && n > 1 ? `${p.text}${p.text ? ' ' : ''}${i + 1}/${n}` : p.text;
    return { text, length: tweetLength(text), images: p.images };
  });
  for (const t of tweets) {
    if (t.length > limit) warnings.push({ code: 'too-long', message: `A post is ${t.length}/${limit}` });
    for (const src of t.images) {
      if (!/^https?:|^data:/.test(src)) warnings.push({ code: 'local-image', message: `Attach manually: ${src}` });
    }
  }
  return { tweets, doc, warnings };
}
