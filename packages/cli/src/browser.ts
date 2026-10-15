import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { chromium, type Browser, type Page } from 'playwright-core';
import type { CoverRender, XhsLayout } from '@md2/core';

let browser: Browser | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Close the shared browser after `ms` without use (long-running MCP server). */
function touch(ms = 60_000) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void closeBrowser(), ms);
  idleTimer.unref?.();
}

/**
 * Launch headless Chromium. Tries, in order: $MD2_CHROME_PATH, the
 * Playwright-managed Chromium, installed Google Chrome, then Edge.
 */
export async function getBrowser(): Promise<Browser> {
  touch();
  if (browser) return browser;
  const attempts: [string, () => Promise<Browser>][] = [];
  if (process.env.MD2_CHROME_PATH)
    attempts.push(['MD2_CHROME_PATH', () => chromium.launch({ executablePath: process.env.MD2_CHROME_PATH })]);
  attempts.push(
    ['playwright chromium', () => chromium.launch()],
    ['Google Chrome', () => chromium.launch({ channel: 'chrome' })],
    ['Microsoft Edge', () => chromium.launch({ channel: 'msedge' })],
  );
  const errors: string[] = [];
  for (const [name, launch] of attempts) {
    try {
      browser = await launch();
      return browser;
    } catch (e) {
      errors.push(`${name}: ${String((e as Error).message).split('\n')[0]}`);
    }
  }
  throw new Error(
    'No Chromium-based browser found for rendering images.\n' +
      '  • install Google Chrome, or\n  • run: npx playwright install chromium, or\n  • set MD2_CHROME_PATH=/path/to/chrome\n' +
      errors.map((e) => '    ' + e).join('\n'),
  );
}

export async function closeBrowser() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const b = browser;
  browser = null;
  await b?.close().catch(() => {});
}

let iife: string | null = null;
function domScript(): string {
  if (iife) return iife;
  const candidates = [
    new URL('./md2-dom.iife.js', import.meta.url),
    new URL('../../core/dist/md2-dom.iife.js', import.meta.url),
  ];
  for (const c of candidates) {
    try {
      return (iife = readFileSync(c, 'utf8'));
    } catch {
      /* next */
    }
  }
  throw new Error('md2-dom.iife.js not found — run `pnpm build` in packages/core');
}

const SHELL = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff}
#host{display:flex;flex-direction:column;align-items:flex-start;gap:24px;padding:0}
</style></head><body><div id="host"></div></body></html>`;

async function newPage(width: number): Promise<Page> {
  const b = await getBrowser();
  const page = await b.newPage({ deviceScaleFactor: 2, viewport: { width: Math.ceil(width) + 40, height: 900 } });
  await page.setContent(SHELL);
  await page.addScriptTag({ content: domScript() });
  return page;
}

/** Render XHS cards to PNG files (1080×1440). Returns file paths in order. */
export async function renderXhsPngs(layout: XhsLayout, outDir: string, prefix = 'xhs'): Promise<string[]> {
  mkdirSync(outDir, { recursive: true });
  const page = await newPage(layout.width);
  try {
    await page.evaluate(async (l) => {
      const w = window as unknown as { Md2Dom: { layoutXhsCardsAsync: (h: HTMLElement, l: unknown) => Promise<unknown> } };
      await w.Md2Dom.layoutXhsCardsAsync(document.getElementById('host')!, l);
    }, layout as unknown as Record<string, unknown>);
    const cards = await page.$$('#host > .xhs-card, #host > .xhs-cover-card');
    const files: string[] = [];
    for (let i = 0; i < cards.length; i++) {
      const file = join(outDir, `${prefix}-${String(i + 1).padStart(2, '0')}.png`);
      await cards[i].screenshot({ path: file, animations: 'disabled' });
      files.push(file);
    }
    return files;
  } finally {
    await page.close();
  }
}

/** Render a cover to a PNG file at its export size. */
export async function renderCoverPng(cover: CoverRender, file: string): Promise<string> {
  const page = await newPage(cover.cssWidth);
  try {
    await page.evaluate(async (c) => {
      const w = window as unknown as {
        Md2Dom: { mountCover: (h: HTMLElement, c: unknown) => HTMLElement; preloadImages: (html: string) => Promise<void> };
      };
      const bg = /url\('([^']+)'\)/.exec((c as { html: string }).html)?.[1];
      if (bg) await w.Md2Dom.preloadImages(`<img src="${bg}">`);
      await document.fonts.ready;
      w.Md2Dom.mountCover(document.getElementById('host')!, c);
    }, cover as unknown as Record<string, unknown>);
    const el = await page.$('#host .md2-cover');
    await el!.screenshot({ path: file, animations: 'disabled' });
    return file;
  } finally {
    await page.close();
  }
}

function mermaidPath(): string {
  const require = createRequire(import.meta.url);
  for (const spec of ['mermaid/dist/mermaid.min.js', 'mermaid']) {
    try {
      const p = require.resolve(spec);
      const file = spec === 'mermaid' ? join(dirname(p), 'mermaid.min.js') : p;
      if (existsSync(file)) return file;
    } catch {
      /* next */
    }
  }
  throw new Error('mermaid is not installed (npm i mermaid)');
}

/** Render diagram blocks to paste-safe SVG strings, keyed by their source code. */
export async function renderDiagrams(diagrams: { lang: string; code: string }[], accent?: string, dark = false): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const todo = diagrams.filter((d) => d.lang === 'mermaid');
  if (!todo.length) return out;
  const page = await newPage(900);
  try {
    await page.addScriptTag({ path: mermaidPath() });
    const svgs = await page.evaluate(
      async ({ codes, accent, dark }) => {
        const w = window as unknown as {
          mermaid: { initialize: (c: unknown) => void; render: (id: string, t: string) => Promise<{ svg: string }> };
          Md2Dom: { mermaidConfig: (a?: string, d?: boolean) => unknown; renderMermaidSvg: (m: unknown, c: string) => Promise<string> };
        };
        w.mermaid.initialize(w.Md2Dom.mermaidConfig(accent, dark));
        const res: (string | null)[] = [];
        for (const c of codes) {
          try {
            res.push(await w.Md2Dom.renderMermaidSvg(w.mermaid, c));
          } catch {
            res.push(null);
          }
        }
        return res;
      },
      { codes: todo.map((d) => d.code), accent, dark },
    );
    todo.forEach((d, i) => {
      if (svgs[i]) out.set(d.code, svgs[i]!);
    });
    return out;
  } finally {
    await page.close();
  }
}

/** Screenshot a self-contained HTML block (e.g. a 长图) at 2×. */
export async function renderHtmlPng(html: string, width: number, file: string, selector = ':scope > *'): Promise<string> {
  mkdirSync(dirname(file), { recursive: true });
  const page = await newPage(width);
  try {
    await page.evaluate(async (h) => {
      const host = document.getElementById('host')!;
      host.innerHTML = h;
      await Promise.all(Array.from(document.images).map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      await document.fonts.ready;
    }, html);
    const el = await page.$(`#host ${selector === ':scope > *' ? '> *' : selector}`);
    await el!.screenshot({ path: file, animations: 'disabled' });
    return file;
  } finally {
    await page.close();
  }
}
