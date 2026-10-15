/**
 * The environment the md2 UI runs in. The same React app runs as the web app
 * and inside the VS Code extension's webview; everything environment-specific
 * (saving files, rich clipboard, AI calls, document source) goes through here.
 */
import type { AiConfig, SocialPlatformId } from '@md2/core';
import { copyPlain, copyRich, download } from './clipboard';

export type AiTask = 'xhs' | 'thread' | 'wechat' | 'cover';

export interface Host {
  kind: 'web' | 'vscode';
  save(name: string, data: Blob | string, mime?: string): Promise<void>;
  copyRich(html: string, text: string): Promise<void>;
  copyText(text: string): Promise<void>;
  openExternal(url: string): void;
  /** Run an AI task; in VS Code the extension host makes the call with a key from SecretStorage */
  ai(task: AiTask, markdown: string, platform: SocialPlatformId, cfg: AiConfig | null): Promise<unknown>;
  /** Persist AI settings (web: localStorage via caller; VS Code: SecretStorage) */
  saveAiConfig?(cfg: AiConfig): Promise<void>;
  /** Whether a key is configured on the host side (VS Code) */
  aiConfigured?(): Promise<boolean>;
  /** Map image srcs to URLs Zhihu's servers can fetch (VS Code: jsDelivr for pushed files, else data URLs; verified alternatives for SVG / GitHub raw) */
  publicImages?(srcs: string[], imageBase?: string): Promise<{ map: Record<string, string>; inlined: string[]; unreachable: string[] }>;
}

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(s: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

async function blobToBase64(data: Blob | string): Promise<string> {
  const blob = typeof data === 'string' ? new Blob([data]) : data;
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

async function runAiLocally(task: AiTask, markdown: string, platform: SocialPlatformId, cfg: AiConfig | null) {
  if (!cfg || (!cfg.apiKey && cfg.provider === 'anthropic')) throw new Error('请先在 AI 设置中填写 API Key');
  const core = await import('@md2/core');
  switch (task) {
    case 'xhs': return core.aiXhsCopy(cfg, markdown);
    case 'thread': return core.aiThread(cfg, markdown, platform);
    case 'wechat': return core.aiWechatMeta(cfg, markdown);
    case 'cover': return core.aiCoverCopy(cfg, markdown);
  }
}

function webHost(): Host {
  return {
    kind: 'web',
    save: async (name, data, mime) => download(name, data, mime),
    copyRich,
    copyText: copyPlain,
    openExternal: (url) => window.open(url, '_blank', 'noopener'),
    ai: runAiLocally,
  };
}

// ───── VS Code webview bridge ─────

type Listener = (msg: Record<string, unknown>) => void;
const listeners = new Set<Listener>();
let vscode: VsCodeApi | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function request<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    vscode!.postMessage({ type, id, ...payload });
  });
}

/** Subscribe to messages from the extension host (document updates, commands). */
export function onHostMessage(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function postToHost(msg: Record<string, unknown>) {
  vscode?.postMessage(msg);
}

function vscodeHost(api: VsCodeApi): Host {
  vscode = api;
  // Surface webview errors in the extension's "md2" output channel
  const log = (level: string, args: unknown[]) =>
    api.postMessage({ type: 'log', level, text: args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' ') });
  for (const level of ['error', 'warn', 'info'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => (log(level, args), orig(...args));
  }
  window.addEventListener('error', (e) => log('error', [e.message, e.filename + ':' + e.lineno]));
  window.addEventListener('unhandledrejection', (e) => log('error', ['unhandled rejection', e.reason]));
  window.addEventListener('message', (e) => {
    const msg = e.data as Record<string, unknown>;
    if (msg && msg.type === 'response' && typeof msg.id === 'number') {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(String(msg.error)));
      else p?.resolve(msg.result);
      return;
    }
    listeners.forEach((l) => l(msg));
  });
  return {
    kind: 'vscode',
    save: async (name, data) => {
      await request('save', { name, base64: await blobToBase64(data) });
    },
    copyRich: (html, text) => request('copyRich', { html, text }),
    copyText: (text) => request('copyText', { text }),
    openExternal: (url) => api.postMessage({ type: 'openExternal', url }),
    ai: (task, markdown, platform) => request('ai', { task, markdown, platform }),
    saveAiConfig: (cfg) => request('saveAiConfig', { config: cfg }),
    aiConfigured: () => request<boolean>('aiConfigured'),
    publicImages: (srcs, imageBase) => request('publicImages', { srcs, imageBase }),
  };
}

export const host: Host = typeof window !== 'undefined' && window.acquireVsCodeApi ? vscodeHost(window.acquireVsCodeApi()) : webHost();
export const isVsCode = host.kind === 'vscode';
