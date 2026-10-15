import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
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
