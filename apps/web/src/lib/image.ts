import { toBlob } from 'html-to-image';
import JSZip from 'jszip';

/** Rasterise an element at 2× (540×720 card → 1080×1440 PNG). */
export async function elementToPng(el: HTMLElement, pixelRatio = 2): Promise<Blob> {
  const blob = await toBlob(el, {
    pixelRatio,
    cacheBust: false,
    skipFonts: true,
    // keep the card's own size even when displayed scaled
    style: { transform: 'none', margin: '0' },
    width: parseFloat(getComputedStyle(el).width) || el.offsetWidth,
    height: parseFloat(getComputedStyle(el).height) || el.offsetHeight,
  });
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
