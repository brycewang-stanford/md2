import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

type MathDocument = ReturnType<typeof mathjax.document>;
let doc: MathDocument | null = null;
let adaptor: ReturnType<typeof liteAdaptor> | null = null;
const cache = new Map<string, string>();

function init() {
  if (doc) return;
  adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({ packages: AllPackages.filter((p: string) => p !== 'bussproofs') });
  // fontCache 'none' → every glyph is an inline <path>, no <use href>, which
  // WeChat's editor and image exporters both handle reliably.
  const svg = new SVG({ fontCache: 'none' });
  doc = mathjax.document('', { InputJax: tex, OutputJax: svg });
}

/**
 * Render TeX to a standalone `<svg>` string. Errors render as red TeX source
 * instead of throwing so one bad formula never breaks a whole article.
 */
export function texToSvg(tex: string, display: boolean): string {
  const key = (display ? 'D' : 'I') + tex;
  const hit = cache.get(key);
  if (hit) return hit;
  init();
  let out: string;
  try {
    const node = doc!.convert(tex, { display, em: 16, ex: 8, containerWidth: 80 * 16 });
    out = adaptor!.innerHTML(node);
    if (out.includes('data-mjx-error') || out.includes('merror')) {
      const msg = /data-mjx-error="([^"]*)"/.exec(out)?.[1];
      if (msg) throw new Error(msg);
    }
  } catch (e) {
    const esc = tex.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    out = `<code style="color:#d33" title="${String((e as Error).message).replace(/"/g, '&quot;')}">${esc}</code>`;
  }
  // Keep the SVG compact and paste-safe
  out = out
    .replace(/ role="img"| focusable="false"| data-(mml-node|c|mjx-texclass|latex|semantic-[\w-]+)="[^"]*"/g, '')
    .replace(/ xmlns:xlink="[^"]*"/, '');
  if (cache.size > 500) cache.clear();
  cache.set(key, out);
  return out;
}
