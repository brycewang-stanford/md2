/**
 * Local image assets pasted / dropped into the editor. Stored in IndexedDB and
 * referenced from Markdown as `asset:<id>` so the document stays readable.
 */
const DB = 'md2';
const STORE = 'assets';
const cache = new Map<string, string>();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAssets(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve();
        cache.set(String(cur.key), String(cur.value));
        cur.continue();
      };
      req.onerror = () => resolve();
    });
  } catch {
    /* IndexedDB unavailable: assets live in memory only */
  }
}

export async function saveAsset(dataUrl: string): Promise<string> {
  const buf = new TextEncoder().encode(dataUrl);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  const id = Array.from(new Uint8Array(hash).slice(0, 5)).map((b) => b.toString(16).padStart(2, '0')).join('');
  cache.set(id, dataUrl);
  try {
    const db = await open();
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(dataUrl, id);
  } catch {
    /* memory only */
  }
  return id;
}

let hostImages: Record<string, string> = {};

/** Local-path → URL map supplied by the host (VS Code resolves relative images to webview URIs). */
export function setHostImages(map: Record<string, string>) {
  hostImages = map;
}

/** `resolveImage` for renderers: `asset:id` → data URL, host-mapped local paths → URLs. */
export function resolveAsset(src: string): string | undefined {
  if (src.startsWith('asset:')) return cache.get(src.slice(6));
  return hostImages[src];
}
