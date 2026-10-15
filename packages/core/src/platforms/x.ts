import type { ElementContent, Root } from 'hast';
import { h } from 'hastscript';
import { toPlainBlocks } from '../plain.js';
import { parseMarkdown } from '../parse.js';
import { cloneTree, extractFootnotes, transformMath } from '../transforms.js';
import type { ParsedDoc, RenderWarning } from '../types.js';

export type SocialPlatformId = 'x' | 'threads' | 'bluesky' | 'mastodon' | 'linkedin';

export interface SocialPlatform {
  id: SocialPlatformId;
  name: string;
  /** Default max length per post */
  limit: number;
  /** How the platform counts characters */
  count: (text: string) => number;
  maxImages: number;
  numbering: boolean;
  boldHeadings: boolean;
  /** One long post rather than a thread (headings don't start new posts) */
  single?: boolean;
  /** Compose URL taking `text` (first post) */
  intent?: (text: string) => string;
}

export interface XOptions {
  /** Target platform; sets the length rules and defaults. Default 'x' */
  platform?: SocialPlatformId;
  /** Max length per post (platform default; X Premium allows 25 000). */
  limit?: number;
  /** Render headings in Unicode bold (𝗹𝗶𝗸𝗲 𝘁𝗵𝗶𝘀). Default: on for LinkedIn and Latin-script headings */
  boldHeadings?: boolean;
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
  /** Length as the platform counts it (X: CJK = 2, URL = 23) */
  length: number;
  images: string[];
}

export interface XResult {
  tweets: Tweet[];
  platform: SocialPlatformId;
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

const graphemes = (s: string): number => {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  if (!Seg) return Array.from(s).length;
  let n = 0;
  for (const _ of new Seg(undefined, { granularity: 'grapheme' }).segment(s)) n++;
  return n;
};
const codePoints = (s: string) => Array.from(s).length;
/** Mastodon counts every URL as 23 characters. */
const mastodonLength = (s: string) => codePoints(s.replace(URL_RE, 'x'.repeat(23)));

export const socialPlatforms: Record<SocialPlatformId, SocialPlatform> = {
  x: { id: 'x', name: 'X', limit: 280, count: tweetLength, maxImages: 4, numbering: true, boldHeadings: false, intent: (t) => `https://x.com/intent/post?text=${encodeURIComponent(t)}` },
  threads: { id: 'threads', name: 'Threads', limit: 500, count: codePoints, maxImages: 10, numbering: true, boldHeadings: false, intent: (t) => `https://www.threads.net/intent/post?text=${encodeURIComponent(t)}` },
  bluesky: { id: 'bluesky', name: 'Bluesky', limit: 300, count: graphemes, maxImages: 4, numbering: true, boldHeadings: false, intent: (t) => `https://bsky.app/intent/compose?text=${encodeURIComponent(t)}` },
  mastodon: { id: 'mastodon', name: 'Mastodon', limit: 500, count: mastodonLength, maxImages: 4, numbering: true, boldHeadings: false },
  linkedin: { id: 'linkedin', name: 'LinkedIn', limit: 3000, count: codePoints, maxImages: 9, numbering: false, boldHeadings: true, single: true, intent: (t) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(t)}` },
};

const BOLD: [number, number, number][] = [
  [0x41, 0x5a, 0x1d5d4], // A-Z
  [0x61, 0x7a, 0x1d5ee], // a-z
  [0x30, 0x39, 0x1d7ec], // 0-9
];
/** Latin letters and digits → Mathematical Sans-Serif Bold (other scripts unchanged). */
export function toUnicodeBold(s: string): string {
  return Array.from(s)
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      for (const [a, b, base] of BOLD) if (cp >= a && cp <= b) return String.fromCodePoint(base + cp - a);
      return ch;
    })
    .join('');
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

function toBlocks(tree: Root, opts: XOptions, bold: boolean | undefined): Block[] {
  return toPlainBlocks(tree, { keepUrls: true }).map((b) => {
    switch (b.kind) {
      case 'heading': {
        const cjk = CJK.test(b.text);
        const useBold = bold ?? !cjk;
        // Unicode bold has no CJK forms, so CJK headings get a visible marker too
        const text = useBold ? (cjk ? `▍${toUnicodeBold(b.text)}` : toUnicodeBold(b.text)) : `【${b.text}】`;
        return { text, images: [], heading: true, raw: b.text };
      }
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
  raw?: string;
}

/** Split text that is too long into sentence-sized pieces that fit `limit`. */
function splitLong(text: string, limit: number, tweetLength: (s: string) => number): string[] {
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

/** Convert an article into a thread for X, Threads, Bluesky, Mastodon or a LinkedIn post. */
export function renderX(input: string | ParsedDoc, opts: XOptions = {}): XResult {
  const doc = typeof input === 'string' ? parseMarkdown(input) : input;
  const platform = socialPlatforms[opts.platform ?? 'x'];
  const tweetLength = platform.count;
  const limit = opts.limit ?? platform.limit;
  const numbering = opts.numbering ?? platform.numbering;
  const maxImages = platform.maxImages;
  const reserve = numbering ? 8 : 0; // " 12/34"
  const warnings: RenderWarning[] = [];
  const tree: Root = cloneTree(doc.hast);
  transformMath(tree, (tex, display) =>
    (display ? h('p', tex) : { type: 'text', value: tex }) as ElementContent,
  );
  const notes = extractFootnotes(tree);

  const blocks = toBlocks(tree, opts, opts.boldHeadings ?? (platform.boldHeadings || undefined));
  // Drop the H1 if it equals the title, it becomes the hook post
  if (opts.titleFirst !== false && doc.title) {
    const i = blocks.findIndex((b) => b.heading && b.raw === doc.title);
    if (i >= 0) blocks.splice(i, 1);
  }
  if (notes.length) blocks.push({ text: notes.map((n) => `[${n.n}] ${n.text}`).join('\n'), images: [] });

  const max = limit - reserve;
  const posts: { text: string; images: string[] }[] = [];
  let cur: { text: string; images: string[] } | null = null;
  if (opts.titleFirst !== false && doc.title && platform.single) {
    cur = { text: platform.boldHeadings ? toUnicodeBold(doc.title) : doc.title, images: [] };
  } else if (opts.titleFirst !== false && doc.title) {
    const withSummary = !!doc.summary && tweetLength(`${doc.title}\n\n${doc.summary}`) <= max - 4;
    const title = platform.boldHeadings ? toUnicodeBold(doc.title) : doc.title;
    const thread = platform.id === 'linkedin' ? '' : ' 🧵';
    posts.push({ text: `${withSummary ? `${title}\n\n${doc.summary}` : title}${thread}`, images: [] });
    // Don't repeat the intro paragraph the hook already quotes
    if (withSummary) {
      const i = blocks.findIndex((b) => !b.heading && b.text.trim());
      if (i >= 0 && blocks[i].text.trim() === doc.summary.trim() && !blocks[i].images.length) blocks.splice(i, 1);
    }
  }
  const flush = () => {
    if (cur && (cur.text.trim() || cur.images.length)) posts.push({ text: cur.text.trim(), images: cur.images });
    cur = null;
  };
  for (const b of blocks) {
    const pieces = splitLong(b.text, max, tweetLength);
    pieces.forEach((piece, pi) => {
      const images = pi === pieces.length - 1 ? b.images : [];
      // Headings start a new post
      if (b.heading && !platform.single) flush();
      const joined = cur ? `${cur.text}\n\n${piece}` : piece;
      if (cur && tweetLength(joined) <= max && cur.images.length + images.length <= maxImages) {
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

  // Images beyond the per-post limit overflow into image-only posts
  const final: { text: string; images: string[] }[] = [];
  for (const p of posts) {
    final.push({ text: p.text, images: p.images.slice(0, maxImages) });
    for (let i = maxImages; i < p.images.length; i += maxImages) final.push({ text: '', images: p.images.slice(i, i + maxImages) });
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
  return { tweets, doc, warnings, platform: platform.id };
}

export const renderThread = renderX;
