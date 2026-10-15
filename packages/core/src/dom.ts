/**
 * Browser-only helpers (need a real layout engine): XHS card pagination and
 * cover title fitting. Also bundled as an IIFE (`Md2Dom`) for the CLI, which
 * runs it inside headless Chromium — so web and CLI produce identical images.
 */
import type { XhsLayout } from './platforms/xhs.js';
import type { CoverRender } from './cover/index.js';

const STYLE_ATTR = 'data-md2-style';

function ensureStyle(host: HTMLElement, id: string, css: string) {
  const doc = host.ownerDocument;
  let el = host.querySelector<HTMLStyleElement>(`style[${STYLE_ATTR}="${id}"]`);
  if (!el) {
    el = doc.createElement('style');
    el.setAttribute(STYLE_ATTR, id);
    host.prepend(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

/** Shrink `.cv-title` until the cover's main area no longer overflows. */
export function fitCoverTitle(cover: HTMLElement) {
  const main = cover.querySelector<HTMLElement>('.cv-main');
  const title = cover.querySelector<HTMLElement>('.cv-title');
  if (!main || !title) return;
  const overflows = () => main.scrollHeight > main.clientHeight + 1 || title.scrollWidth > title.clientWidth + 1;
  let size = parseFloat(getComputedStyle(title).fontSize);
  let guard = 0;
  while (overflows() && size > 8 && guard++ < 60) {
    size *= 0.94;
    title.style.fontSize = `${size.toFixed(1)}px`;
  }
}

/** Mount a cover render into `host` (replacing its content) and fit the title. */
export function mountCover(host: HTMLElement, cover: CoverRender): HTMLElement {
  ensureStyle(host, 'cover', cover.css);
  host.querySelectorAll('.md2-cover').forEach((n) => n.remove());
  const tpl = host.ownerDocument.createElement('template');
  tpl.innerHTML = cover.html.trim();
  const el = tpl.content.firstElementChild as HTMLElement;
  host.appendChild(el);
  fitCoverTitle(el);
  return el;
}

// ───────────────────────────── pagination ─────────────────────────────

interface Page {
  card: HTMLElement;
  body: HTMLElement;
  /** `.md2` wrapper inside the body: blocks are appended here */
  flow: HTMLElement;
}

const MIN_SPLIT_SPACE = 48; // px; below this, don't bother splitting into the remaining space

function bottomOf(el: Element): number {
  return el.getBoundingClientRect().bottom;
}

function fits(page: Page): boolean {
  const last = page.flow.lastElementChild;
  if (!last) return true;
  const limit = page.body.getBoundingClientRect().bottom;
  return bottomOf(last) <= limit + 0.5 && page.flow.scrollWidth <= page.flow.clientWidth + 2;
}

function remaining(page: Page): number {
  const last = page.flow.lastElementChild;
  const top = last ? bottomOf(last) : page.body.getBoundingClientRect().top;
  return page.body.getBoundingClientRect().bottom - top;
}

const ATOMIC = new Set(['IMG', 'SVG', 'BR', 'svg', 'VIDEO', 'CANVAS', 'INPUT']);
function isAtomic(n: Node): boolean {
  if (n.nodeType !== 1) return false;
  const el = n as Element;
  return ATOMIC.has(el.tagName) || el.classList.contains('math-inline') || el.classList.contains('mac-dots');
}

/** Token length of a node: characters for text, 1 for atomic inline elements. */
function tokenLength(n: Node): number {
  if (n.nodeType === 3) return (n.textContent ?? '').length;
  if (isAtomic(n)) return 1;
  let len = 0;
  n.childNodes.forEach((c) => (len += tokenLength(c)));
  return len;
}

/**
 * Deep-clone `el` keeping only tokens in [start, end). Inline markup is
 * preserved on both sides of the cut.
 */
function sliceElement(el: Element, start: number, end: number): Element {
  const clone = el.cloneNode(false) as Element;
  let pos = 0;
  const walk = (src: Node, dst: Node) => {
    src.childNodes.forEach((child) => {
      const len = tokenLength(child);
      const s = pos;
      const e = pos + len;
      pos = e;
      if (e <= start || s >= end) return;
      if (child.nodeType === 3) {
        const text = child.textContent ?? '';
        dst.appendChild(el.ownerDocument.createTextNode(text.slice(Math.max(0, start - s), Math.min(len, end - s))));
      } else if (isAtomic(child)) {
        dst.appendChild(child.cloneNode(true));
      } else {
        const shallow = child.cloneNode(false);
        dst.appendChild(shallow);
        pos = s;
        walk(child, shallow);
        pos = e;
      }
    });
  };
  walk(el, clone);
  return clone;
}

function flatText(el: Element): string {
  let s = '';
  const walk = (n: Node) => {
    if (n.nodeType === 3) s += n.textContent ?? '';
    else if (isAtomic(n)) s += '\u0000';
    else n.childNodes.forEach(walk);
  };
  walk(el);
  return s;
}

/** Candidate cut offsets: line ends for code, word/char boundaries for prose. */
function boundaries(el: Element): number[] {
  const text = flatText(el);
  const out: number[] = [];
  if (el.tagName === 'PRE' || el.tagName === 'CODE') {
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1);
    return out;
  }
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment(s: string): Iterable<{ index: number }> } }).Segmenter;
  if (Seg) {
    for (const seg of new Seg('zh', { granularity: 'word' }).segment(text)) if (seg.index > 0) out.push(seg.index);
  } else {
    for (let i = 1; i < text.length; i++) out.push(i);
  }
  return out;
}

const TEXT_SPLITTABLE = new Set(['P', 'PRE', 'LI', 'TD', 'FIGCAPTION']);
const BLOCK_TAGS = new Set(['P', 'UL', 'OL', 'LI', 'PRE', 'BLOCKQUOTE', 'DIV', 'SECTION', 'TABLE', 'THEAD', 'TBODY', 'TR', 'FIGURE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR']);
const CONTAINERS = new Set(['UL', 'OL', 'BLOCKQUOTE', 'DIV', 'SECTION', 'TABLE', 'THEAD', 'TBODY', 'LI']);

interface Split {
  head: Element;
  tail: Element;
}

/**
 * Try to put the largest possible head of `el` into `parent` (which lives in
 * `page`) such that the page still fits. Returns head (already appended) and
 * tail, or null if nothing sensible fits.
 */
function split(el: Element, parent: Element, page: Page): Split | null {
  // Lists, quotes, callouts, tables: move children one by one
  const hasBlockKids = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName));
  if (CONTAINERS.has(el.tagName) && hasBlockKids) return splitContainer(el, parent, page);
  if (TEXT_SPLITTABLE.has(el.tagName)) return splitText(el, parent, page);
  return null;
}

function splitContainer(el: Element, parent: Element, page: Page): Split | null {
  const head = el.cloneNode(false) as Element;
  parent.appendChild(head);
  const kids = Array.from(el.childNodes);
  // Tables: repeat the header on the next card
  const thead = el.tagName === 'TABLE' ? el.querySelector(':scope > thead') : null;
  let i = 0;
  let placed = 0;
  for (; i < kids.length; i++) {
    const k = kids[i];
    head.appendChild(k);
    if (!fits(page)) {
      head.removeChild(k);
      break;
    }
    if (k.nodeType === 1) placed++;
  }
  if (i >= kids.length) return { head, tail: el.cloneNode(false) as Element };
  let carry: Node[] = kids.slice(i);
  const first = kids[i];
  if (first.nodeType === 1) {
    const sub = split(first as Element, head, page);
    if (sub) {
      carry = [sub.tail, ...kids.slice(i + 1)];
      placed++;
    }
  }
  if (placed === 0 || (thead && placed === 1 && head.lastElementChild?.tagName === 'THEAD')) {
    parent.removeChild(head);
    kids.forEach((k) => el.appendChild(k)); // restore
    return null;
  }
  const tail = el.cloneNode(false) as Element;
  if (thead && !carry.includes(thead)) tail.appendChild(thead.cloneNode(true));
  carry.forEach((k) => tail.appendChild(k));
  // Ordered lists continue numbering
  if (el.tagName === 'OL') {
    const start = Number(el.getAttribute('start') ?? 1);
    const used = Array.from(head.children).filter((c) => c.tagName === 'LI').length;
    const contPartial = carry[0] && (carry[0] as Element).tagName === 'LI' && (carry[0] as Element).hasAttribute('data-md2-cont');
    tail.setAttribute('start', String(start + used - (contPartial ? 1 : 0)));
  }
  if (el.tagName === 'LI') tail.setAttribute('data-md2-cont', '');
  return { head, tail };
}

function splitText(el: Element, parent: Element, page: Page): Split | null {
  const cuts = boundaries(el);
  if (!cuts.length) return null;
  const total = tokenLength(el);
  let lo = 0;
  let hi = cuts.length - 1;
  let best = -1;
  let probe: Element | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const head = sliceElement(el, 0, cuts[mid]);
    if (probe) parent.replaceChild(head, probe);
    else parent.appendChild(head);
    probe = head;
    if (fits(page)) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (probe) parent.removeChild(probe);
  if (best < 0) return null;
  const cut = cuts[best];
  // Require at least two lines worth of text on this card
  if (cut < 12 && el.tagName !== 'PRE') return null;
  const head = sliceElement(el, 0, cut);
  parent.appendChild(head);
  const tail = sliceElement(el, cut, total);
  if (el.tagName === 'LI') tail.setAttribute('data-md2-cont', '');
  head.setAttribute('data-md2-split', 'head');
  tail.setAttribute('data-md2-split', 'tail');
  // Trim the whitespace at the cut so the tail doesn't start with a space / newline
  const firstText = (n: Node): Text | null => {
    if (n.nodeType === 3) return n as Text;
    for (const c of Array.from(n.childNodes)) {
      const t = firstText(c);
      if (t && t.textContent) return t;
    }
    return null;
  };
  const ft = firstText(tail);
  if (ft) ft.textContent = (ft.textContent ?? '').replace(/^[\s\n]+/, '');
  return { head, tail };
}

/** Scale an oversize unsplittable block (image, formula, wide table) to fit its page. */
function shrinkToFit(el: HTMLElement, page: Page) {
  const avail = page.body.getBoundingClientRect().bottom - el.getBoundingClientRect().top;
  const h = el.getBoundingClientRect().height;
  const wide = el.scrollWidth > page.flow.clientWidth + 2 ? page.flow.clientWidth / el.scrollWidth : 1;
  if (wide < 1) {
    (el.style as CSSStyleDeclaration & { zoom: string }).zoom = String(Math.max(0.3, wide));
    if (fits(page)) return;
  }
  if (h <= avail || h <= 0) return;
  const imgs = el.tagName === 'IMG' ? [el] : Array.from(el.querySelectorAll<HTMLElement>('img'));
  if (imgs.length === 1) {
    const img = imgs[0];
    const other = h - img.getBoundingClientRect().height;
    img.style.maxHeight = `${Math.max(80, avail - other - 4)}px`;
    img.style.width = 'auto';
    if (fits(page)) return;
  }
  (el.style as CSSStyleDeclaration & { zoom: string }).zoom = String(Math.max(0.3, (avail - 4) / h));
}

export interface LayoutResult {
  cards: HTMLElement[];
  pages: number;
}

/**
 * Paginate an XHS layout into fixed-size cards inside `host`.
 * Returns every card element in order (cover first when enabled).
 */
export function layoutXhsCards(host: HTMLElement, layout: XhsLayout): LayoutResult {
  const doc = host.ownerDocument;
  host.innerHTML = '';
  ensureStyle(host, 'xhs', layout.css);
  if (layout.cover) ensureStyle(host, 'cover', layout.cover.css);

  const cards: HTMLElement[] = [];
  if (layout.cover) {
    const wrap = doc.createElement('div');
    wrap.className = 'xhs-cover-card';
    host.appendChild(wrap);
    const tpl = doc.createElement('template');
    tpl.innerHTML = layout.cover.html.trim();
    const coverEl = tpl.content.firstElementChild as HTMLElement;
    wrap.appendChild(coverEl);
    fitCoverTitle(coverEl);
    cards.push(wrap);
  }

  const varStyle = Object.entries(layout.vars).map(([k, v]) => `${k}:${v}`).join(';');
  const initial = layout.author ? Array.from(layout.author.replace(/^@/, ''))[0]?.toUpperCase() ?? '' : '';

  const newPage = (): Page => {
    const card = doc.createElement('div');
    card.className = `xhs-card xhs-style-${layout.cardStyle}`;
    card.setAttribute('style', varStyle);
    const inner = doc.createElement('div');
    inner.className = 'xhs-inner';
    if (layout.author) {
      const head = doc.createElement('div');
      head.className = 'xhs-head';
      head.innerHTML = `<span class="xhs-avatar"></span><span class="xhs-author"></span>`;
      (head.firstChild as HTMLElement).textContent = initial;
      (head.lastChild as HTMLElement).textContent = layout.author;
      inner.appendChild(head);
    }
    const body = doc.createElement('div');
    body.className = 'xhs-body';
    const flow = doc.createElement('section');
    flow.className = 'md2';
    body.appendChild(flow);
    inner.appendChild(body);
    const foot = doc.createElement('div');
    foot.className = 'xhs-foot';
    foot.innerHTML = '<span class="xhs-brand"></span><span class="xhs-page"></span>';
    inner.appendChild(foot);
    card.appendChild(inner);
    host.appendChild(card);
    cards.push(card);
    return { card, body, flow };
  };

  const tpl = doc.createElement('template');
  tpl.innerHTML = layout.contentHtml;
  const article = tpl.content.firstElementChild;
  const queue: Element[] = article ? Array.from(article.children) : [];

  let page = newPage();
  const empty = (p: Page) => p.flow.children.length === 0;
  let guard = 0;
  while (queue.length && guard++ < 5000) {
    const block = queue.shift()!;
    if (block.tagName === 'HR' && layout.hrPageBreak) {
      if (!empty(page)) page = newPage();
      continue;
    }
    page.flow.appendChild(block);
    if (fits(page)) continue;
    page.flow.removeChild(block);

    if (!empty(page) && remaining(page) >= MIN_SPLIT_SPACE) {
      const s = split(block, page.flow, page);
      if (s) {
        queue.unshift(s.tail);
        page = newPage();
        continue;
      }
    }
    if (!empty(page)) {
      // Keep headings with the content that follows them
      const last = page.flow.lastElementChild;
      if (last && /^H[1-6]$/.test(last.tagName) && page.flow.children.length > 1) {
        page.flow.removeChild(last);
        queue.unshift(block);
        queue.unshift(last);
      } else {
        queue.unshift(block);
      }
      page = newPage();
      continue;
    }
    // Empty page and the block still doesn't fit: split from the top, else shrink
    const s = split(block, page.flow, page);
    if (s) {
      queue.unshift(s.tail);
      page = newPage();
      continue;
    }
    page.flow.appendChild(block);
    shrinkToFit(block as HTMLElement, page);
    if (queue.length) page = newPage();
  }
  // Remove a trailing empty card
  if (empty(page) && cards.length > 1) {
    page.card.remove();
    cards.pop();
  }

  if (layout.pageNumbers) {
    const content = cards.filter((c) => c.classList.contains('xhs-card'));
    content.forEach((c, i) => {
      const el = c.querySelector('.xhs-page');
      if (el) el.textContent = `${i + 1} / ${content.length}`;
    });
  }
  return { cards, pages: cards.length };
}

/** Resolve once every `<img>` referenced by `html` has loaded (or failed). */
export function preloadImages(html: string, doc: Document = document): Promise<void> {
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  const srcs = Array.from(tpl.content.querySelectorAll('img'))
    .map((i) => i.getAttribute('src'))
    .filter((s): s is string => !!s);
  return Promise.all(
    srcs.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = src;
          if (img.complete) resolve();
        }),
    ),
  ).then(() => undefined);
}

/** `layoutXhsCards` after images and web fonts are ready (accurate heights). */
export async function layoutXhsCardsAsync(host: HTMLElement, layout: XhsLayout): Promise<LayoutResult> {
  const doc = host.ownerDocument;
  await Promise.all([preloadImages(layout.contentHtml, doc), preloadImages(layout.cover?.html ?? '', doc), doc.fonts?.ready]);
  return layoutXhsCards(host, layout);
}
