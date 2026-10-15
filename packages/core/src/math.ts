/**
 * TeX → SVG via MathJax, loaded lazily: the engine is ~1.5 MB, so browsers only
 * fetch it when a document actually contains math. Call `preloadMath()` (or
 * `ensureMath(doc)`) before rendering; until then formulas render as TeX code.
 */
interface MathEngine {
  convert: (tex: string, display: boolean) => string;
}

let engine: MathEngine | null = null;
let loading: Promise<void> | null = null;
const cache = new Map<string, string>();

export function isMathReady(): boolean {
  return engine !== null;
}

export function preloadMath(): Promise<void> {
  if (engine) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/AllPackages.js'),
    ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({ packages: AllPackages.filter((p: string) => p !== 'bussproofs') });
    // fontCache 'none' → every glyph is an inline <path>, no <use href>, which
    // WeChat's editor and image exporters both handle reliably.
    const svg = new SVG({ fontCache: 'none' });
    const doc = mathjax.document('', { InputJax: tex, OutputJax: svg });
    engine = {
      convert: (src, display) => adaptor.innerHTML(doc.convert(src, { display, em: 16, ex: 8, containerWidth: 80 * 16 })),
    };
  })();
  return loading;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Render TeX to a standalone `<svg>` string. Errors render as red TeX source
 * instead of throwing so one bad formula never breaks a whole article.
 */
export function texToSvg(tex: string, display: boolean): string {
  if (!engine) return `<code data-math-pending="">${esc(tex)}</code>`;
  const key = (display ? 'D' : 'I') + tex;
  const hit = cache.get(key);
  if (hit) return hit;
  let out: string;
  try {
    out = engine.convert(tex, display);
    const msg = /data-mjx-error="([^"]*)"/.exec(out)?.[1];
    if (msg) throw new Error(msg);
  } catch (e) {
    out = `<code style="color:#d33" title="${String((e as Error).message).replace(/"/g, '&quot;')}">${esc(tex)}</code>`;
  }
  // Keep the SVG compact and paste-safe
  out = out
    .replace(/ role="img"| focusable="false"| data-(mml-node|c|mjx-texclass|latex|semantic-[\w-]+)="[^"]*"/g, '')
    .replace(/ xmlns:xlink="[^"]*"/, '');
  if (cache.size > 500) cache.clear();
  cache.set(key, out);
  return out;
}
