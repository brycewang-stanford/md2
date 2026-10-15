import { toBlob } from 'html-to-image';
import JSZip from 'jszip';

/** Rasterise an element at 2× (540×720 card → 1080×1440 PNG). */
export async function elementToPng(el: HTMLElement, pixelRatio = 2): Promise<Blob> {
  // A hidden page (e.g. a background webview tab) has no layout yet: wait for it
  for (let i = 0; i < 50 && el.offsetWidth === 0; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (el.offsetWidth === 0) {
    console.warn(`md2: zero-size export target`, { vis: document.visibilityState, w: window.innerWidth, h: window.innerHeight, connected: el.isConnected, parentW: el.parentElement?.offsetWidth, display: getComputedStyle(el).display });
  }
  if (el.offsetWidth === 0) throw new Error('preview is not visible — bring the md2 tab to the front and retry');
  console.info(`md2: rasterising ${el.className} ${el.offsetWidth}×${el.offsetHeight}`);
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('rasterise timed out')), 45000));
  // html-to-image resolves each image inside requestAnimationFrame, which never fires while the
  // page isn't painting (an occluded or background VS Code window): fall back to a timer
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => {
    let done = false;
    const run = (t: number) => {
      if (!done) (done = true), cb(t);
    };
    setTimeout(() => run(performance.now()), 50);
    return raf.call(window, run);
  };
  let blob: Blob | null;
  try {
    blob = await Promise.race([timeout, toBlob(el, {
      pixelRatio,
      cacheBust: false,
      skipFonts: true,
      // keep the card's own size even when displayed scaled
      style: { transform: 'none', margin: '0' },
      width: parseFloat(getComputedStyle(el).width) || el.offsetWidth,
      height: parseFloat(getComputedStyle(el).height) || el.offsetHeight,
    })]);
  } finally {
    window.requestAnimationFrame = raf;
  }
  console.info(`md2: rasterised ${blob?.size ?? 0} bytes`);
  if (!blob) throw new Error('render failed');
  return blob;
}

export async function zipPngs(files: { name: string; blob: Blob }[], extra: Record<string, string> = {}): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  for (const [name, text] of Object.entries(extra)) zip.file(name, text);
  return zip.generateAsync({ type: 'blob' });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
