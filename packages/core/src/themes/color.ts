/** Tiny colour helpers (no deps) used to derive theme tints from one primary colour. */

export function parseHex(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/** Mix `hex` with `other` (default white); `amount` = share of `other`. */
export function mix(hex: string, amount: number, other = '#ffffff'): string {
  const a = parseHex(hex);
  const b = parseHex(other);
  if (!a || !b) return hex;
  return '#' + a.map((v, i) => toHex(v + (b[i] - v) * amount)).join('');
}

export function rgba(hex: string, alpha: number): string {
  const a = parseHex(hex);
  return a ? `rgba(${a[0]}, ${a[1]}, ${a[2]}, ${alpha})` : hex;
}

/** Relative luminance 0..1 */
export function luminance(hex: string): number {
  const a = parseHex(hex);
  if (!a) return 0.5;
  const [r, g, b] = a.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableOn(hex: string): string {
  return luminance(hex) > 0.45 ? '#1f2328' : '#ffffff';
}
