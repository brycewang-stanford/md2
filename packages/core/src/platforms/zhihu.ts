import { toHtml } from 'hast-util-to-html';
import { toText } from 'hast-util-to-text';
import { h } from 'hastscript';
import { visit, SKIP } from 'unist-util-visit';
import type { Root, Element, ElementContent, Parent } from 'hast';
import { parseMarkdown, CALLOUT_TITLES } from '../parse.js';
import { normalizeLang } from '../highlight.js';
import {
  cloneTree, codeBlocks, extractFootnotes, figureImages, hasClass, removeFirstH1, rewriteImages,
  taskListGlyphs, transformMath,
} from '../transforms.js';
import type { ParsedDoc, RenderWarning } from '../types.js';

export interface ZhihuOptions {
  /** Remove the first H1 (Zhihu has its own title field). Default true */
  removeTitle?: boolean;
  /** Turn GFM footnotes into Zhihu's native 参考文献 references. Default true */
  nativeReferences?: boolean;
  /** Turn external links into Zhihu references as well. Default false */
  linksAsReferences?: boolean;
  resolveImage?: (src: string) => string | undefined;
}

export interface ZhihuResult {
  html: string;
  /** Plain text (clipboard fallback) */
  text: string;
  doc: ParsedDoc;
  warnings: RenderWarning[];
}

/** Languages Zhihu's code block recognises; others fall back to plain text. */
const ZHIHU_LANGS = new Set([
  'text', 'bash', 'shell', 'c', 'cpp', 'csharp', 'css', 'go', 'haskell', 'html', 'java', 'javascript', 'json',
  'julia', 'kotlin', 'lua', 'makefile', 'markdown', 'matlab', 'nginx', 'objectivec', 'perl', 'php', 'python',
  'r', 'ruby', 'rust', 'scala', 'sql', 'swift', 'typescript', 'verilog', 'vim', 'xml', 'yaml', 'dockerfile',
  'diff', 'ini', 'toml', 'latex',
]);

export function zhihuLang(lang: string): string {
  const l = normalizeLang(lang);
  if (l === 'xml' && /html/i.test(lang)) return 'html';
  return ZHIHU_LANGS.has(l) ? l : 'text';
}

/**
 * Zhihu renders formulas as images from its own equation service. A trailing
 * `\\` marks a display (block) formula.
 */
export function zhihuEquation(tex: string, display: boolean): Element {
  const t = tex.trim().replace(/\n+/g, ' ');
  const val = display ? `${t}\\\\` : t;
  return h('img', {
    src: `https://www.zhihu.com/equation?tex=${encodeURIComponent(val)}`,
    alt: val,
    eeimg: '1',
  }) as Element;
}

/**
 * Zhihu re-hosts pasted images by fetching each src from its own servers, so
 * only URLs on the public internet (or inline data URLs) survive the paste.
 */
export function isPublicImage(src: string): boolean {
  if (src.startsWith('data:')) return true;
  if (!/^https?:\/\//i.test(src)) return false;
  return !/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|[^/]*\.localhost[:/]|[^/]*vscode-(resource|cdn|webview))/i.test(src);
}

const proxyPng = (url: string, png: boolean) =>
  `https://wsrv.nl/?url=${encodeURIComponent(url)}${png ? '&output=png' : ''}`;

/** owner/repo/ref/path of a file URL on GitHub (raw.githubusercontent.com or github.com/…/raw|blob/…). */
function githubFile(u: URL): { owner: string; repo: string; ref: string; path: string } | undefined {
  const seg = u.pathname.split('/').filter(Boolean);
  if (u.hostname === 'raw.githubusercontent.com' && seg.length >= 4) {
    const [owner, repo, ...rest] = seg;
    const named = rest[0] === 'refs' && (rest[1] === 'heads' || rest[1] === 'tags');
    const ref = named ? rest[2] : rest[0];
    const path = rest.slice(named ? 3 : 1).join('/');
    return ref && path ? { owner, repo, ref, path } : undefined;
  }
  if (u.hostname === 'github.com' && seg.length >= 5 && (seg[2] === 'raw' || seg[2] === 'blob')) {
    return { owner: seg[0], repo: seg[1], ref: seg[3], path: seg.slice(4).join('/') };
  }
  return undefined;
}

/**
 * Remote images Zhihu's servers are likely to fail on, mapped to alternatives in
 * order of preference (empty = keep the URL as is):
 * - SVG: Zhihu only re-hosts raster images → shields.io's PNG endpoint for badges,
 *   otherwise the wsrv.nl image proxy converting to PNG
 * - GitHub raw / blob URLs: raw.githubusercontent.com is unreachable from mainland
 *   China → jsDelivr, then wsrv.nl (jsDelivr can time out on a cold, large repo)
 */
export function zhihuImageCandidates(src: string): string[] {
  if (!/^https?:\/\//i.test(src) || !isPublicImage(src)) return [];
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return [];
  }
  const svg = /\.svg$/i.test(u.pathname);
  if (u.hostname === 'img.shields.io') return [`https://raster.shields.io${u.pathname.replace(/\.svg$/i, '')}.png${u.search}`];
  const gh = githubFile(u);
  if (gh) {
    const raw = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${gh.ref}/${gh.path}`;
    const cdn = `https://cdn.jsdelivr.net/gh/${gh.owner}/${gh.repo}@${gh.ref}/${gh.path}`;
    return svg ? [proxyPng(cdn, true), proxyPng(raw, true)] : [cdn, proxyPng(raw, false)];
  }
  return svg ? [proxyPng(src, true)] : [];
}

function zhihuReference(n: number, text: string, url: string): Element {
  return h(
    'sup',
    {
      dataText: text,
      dataUrl: url,
      dataDraftNode: 'inline',
      dataDraftType: 'reference',
      dataNumero: String(n),
    },
    `[${n}]`,
  ) as Element;
}

export function renderZhihu(input: string | ParsedDoc, opts: ZhihuOptions = {}): ZhihuResult {
  const doc = typeof input === 'string' ? parseMarkdown(input) : input;
  const tree: Root = cloneTree(doc.hast);
  const warnings: RenderWarning[] = [];

  if (opts.removeTitle !== false) removeFirstH1(tree);
  if (opts.resolveImage) rewriteImages(tree, opts.resolveImage);
  // Hosts / formats Zhihu can't re-host; the CLI and VS Code verify these ahead of time via resolveImage
  rewriteImages(tree, (src) => zhihuImageCandidates(src)[0]);

  figureImages(tree, true);
  transformMath(tree, (tex, display) =>
    display ? (h('p', [zhihuEquation(tex, true)]) as Element) : zhihuEquation(tex, false),
  );

  for (const b of codeBlocks(tree)) {
    const pre = h('pre', { lang: zhihuLang(b.lang) }, b.text) as Element;
    Object.assign(b.pre, pre);
  }

  taskListGlyphs(tree);

  // Callouts → blockquote with bold title
  visit(tree, 'element', (el: Element) => {
    if (el.tagName === 'div' && hasClass(el, 'callout')) {
      el.tagName = 'blockquote';
      const title = el.children.find((c): c is Element => c.type === 'element' && hasClass(c, 'callout-title'));
      if (title) {
        title.children = [h('strong', toText(title) || CALLOUT_TITLES.note) as Element];
      }
    }
  });

  // Zhihu supports h1–h3 well; deeper levels become bold paragraphs
  visit(tree, 'element', (el: Element) => {
    if (/^h[4-6]$/.test(el.tagName)) {
      el.tagName = 'p';
      el.children = [h('strong', el.children) as Element];
    }
  });

  const notes = extractFootnotes(tree);
  const native = opts.nativeReferences !== false;
  if (notes.length) {
    if (native) {
      visit(tree, 'element', (el: Element, index, parent: Parent | undefined) => {
        if (!parent || index === undefined || el.tagName !== 'sup' || !hasClass(el, 'footnote-ref')) return;
        const n = Number(el.properties.dataFootnote);
        const note = notes[n - 1];
        if (!note) return;
        const url = /https?:\/\/\S+/.exec(note.text)?.[0] ?? '';
        const text = url ? note.text.replace(url, '').replace(/[:：\s]+$/, '').trim() || url : note.text;
        parent.children[index] = zhihuReference(n, text, url);
        return SKIP;
      });
    } else {
      tree.children.push(
        h('h2', '注释') as Element,
        h('ol', notes.map((n) => h('li', n.content))) as Element,
      );
    }
  }

  if (opts.linksAsReferences) {
    let n = notes.length;
    visit(tree, 'element', (el: Element, index, parent: Parent | undefined) => {
      if (!parent || index === undefined || el.tagName !== 'a') return;
      const url = String(el.properties.href ?? '');
      if (!/^https?:\/\//.test(url)) return;
      const text = toText(el);
      parent.children.splice(index, 1, ...(el.children as ElementContent[]), zhihuReference(++n, text, url));
      return [SKIP, index + el.children.length + 1];
    });
  }

  // Zhihu ignores styles/classes; strip them to keep the paste clean
  visit(tree, 'element', (el: Element) => {
    if (el.tagName === 'img') {
      const src = String(el.properties.src ?? '');
      if (src && !isPublicImage(src))
        warnings.push({ code: 'local-image', message: `知乎服务器无法抓取此图片，粘贴后会显示「上传失败」: ${src}` });
    }
    if (el.tagName === 'img' && el.properties.eeimg) return;
    delete el.properties.className;
    delete el.properties.style;
    if (el.tagName !== 'sup') {
      delete el.properties.dataFootnote;
      delete el.properties.dataCallout;
    }
  });

  const html = toHtml(tree);
  return { html, text: toText(tree), doc, warnings };
}
