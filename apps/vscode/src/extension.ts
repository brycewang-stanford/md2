import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { aiXhsCopy, aiThread, aiWechatMeta, aiCoverCopy, type AiConfig, type SocialPlatformId } from '@md2/core';
import { copyHtml } from '../../../packages/cli/src/clipboard';
import { publishWechatDraft } from '../../../packages/cli/src/publish';
import { publicImages } from '../../../packages/cli/src/public-images';
import { PreviewPanel, type RequestHandler } from './panel';

const SECRET_AI_KEY = 'md2.ai.apiKey';
const SECRET_WX_ID = 'md2.wechat.appId';
const SECRET_WX_SECRET = 'md2.wechat.appSecret';
const STATE_AI = 'md2.ai.config';

let ctx: vscode.ExtensionContext;

// ───── saving exports ─────

let saveBurst: { count: number; dir: string; timer?: NodeJS.Timeout } | null = null;

function exportDir(doc: vscode.TextDocument | undefined): string {
  const folder = vscode.workspace.getConfiguration('md2').get<string>('exportFolder') || 'md2-export';
  if (doc && doc.uri.scheme === 'file') return path.resolve(path.dirname(doc.uri.fsPath), folder);
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (ws) return path.join(ws.uri.fsPath, folder);
  return path.join(require('node:os').homedir(), 'Downloads', 'md2');
}

function safeName(name: string): string {
  return name
    .split('/')
    .map((part) => part.replace(/[\\:*?"<>|]/g, '_').trim())
    .filter((part) => part && part !== '..' && part !== '.')
    .join(path.sep);
}

async function saveFile(panel: PreviewPanel, name: string, base64: string): Promise<string> {
  const dir = exportDir(panel.document);
  const file = path.join(dir, safeName(name));
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, Buffer.from(base64, 'base64'));
  // Group bursts (e.g. 8 XHS cards) into one notification
  if (!saveBurst) saveBurst = { count: 0, dir: path.dirname(file) };
  saveBurst.count++;
  if (saveBurst.timer) clearTimeout(saveBurst.timer);
  saveBurst.timer = setTimeout(async () => {
    const { count, dir: shownDir } = saveBurst!;
    saveBurst = null;
    const rel = vscode.workspace.asRelativePath(shownDir);
    if (!vscode.workspace.getConfiguration('md2').get<boolean>('revealAfterExport', true)) {
      void vscode.window.showInformationMessage(`md2: saved ${count === 1 ? path.basename(file) : `${count} files`} to ${rel}`);
      return;
    }
    const reveal = 'Reveal';
    const pick = await vscode.window.showInformationMessage(`md2: saved ${count === 1 ? path.basename(file) : `${count} files`} to ${rel}`, reveal);
    if (pick === reveal) void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(count === 1 ? file : shownDir));
  }, 600);
  return file;
}

// ───── AI ─────

async function aiConfig(): Promise<AiConfig | null> {
  const stored = ctx.globalState.get<Omit<AiConfig, 'apiKey'>>(STATE_AI);
  const key = (await ctx.secrets.get(SECRET_AI_KEY)) ?? process.env.ANTHROPIC_API_KEY ?? '';
  if (!stored && !key) return null;
  return { provider: stored?.provider ?? 'anthropic', baseURL: stored?.baseURL, model: stored?.model, apiKey: key };
}

async function runAi(task: string, markdown: string, platform: SocialPlatformId) {
  const cfg = await aiConfig();
  if (!cfg || (cfg.provider === 'anthropic' && !cfg.apiKey)) throw new Error('Set an API key in md2 AI settings first');
  switch (task) {
    case 'xhs': return aiXhsCopy(cfg, markdown);
    case 'thread': return aiThread(cfg, markdown, platform);
    case 'wechat': return aiWechatMeta(cfg, markdown);
    case 'cover': return aiCoverCopy(cfg, markdown);
    default: throw new Error(`unknown task ${task}`);
  }
}

// ───── webview requests ─────

const handle: RequestHandler = async (msg, panel) => {
  switch (msg.type) {
    case 'save':
      return saveFile(panel, String(msg.name), String(msg.base64));
    case 'copyRich':
      try {
        copyHtml(String(msg.html), String(msg.text));
      } catch {
        // No rich-clipboard tool (e.g. remote Linux): plain text is better than nothing
        await vscode.env.clipboard.writeText(String(msg.text));
        void vscode.window.showWarningMessage('md2: rich-text clipboard unavailable here; copied plain text instead.');
      }
      return true;
    case 'copyText':
      await vscode.env.clipboard.writeText(String(msg.text));
      return true;
    case 'publicImages': {
      // Zhihu fetches pasted images from its servers: map local files to public URLs / data URLs
      const doc = panel.document;
      if (!doc || doc.uri.scheme !== 'file') return { map: {}, inlined: [], unreachable: [] };
      const imageBase = typeof msg.imageBase === 'string' ? msg.imageBase : undefined;
      return publicImages(msg.srcs as string[], path.dirname(doc.uri.fsPath), { imageBase });
    }
    case 'ai':
      return runAi(String(msg.task), String(msg.markdown), (msg.platform as SocialPlatformId) ?? 'x');
    case 'saveAiConfig': {
      const c = msg.config as AiConfig;
      await ctx.globalState.update(STATE_AI, { provider: c.provider, baseURL: c.baseURL, model: c.model });
      if (c.apiKey) await ctx.secrets.store(SECRET_AI_KEY, c.apiKey);
      return true;
    }
    case 'aiConfigured': {
      const cfg = await aiConfig();
      return !!cfg && (cfg.provider === 'openai' ? !!cfg.baseURL : !!cfg.apiKey);
    }
    default:
      throw new Error(`unknown request ${String(msg.type)}`);
  }
};

// ───── commands ─────

function targetDoc(uri?: vscode.Uri): vscode.TextDocument | undefined {
  if (uri) return vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  return PreviewPanel.activeMarkdown() ?? PreviewPanel.current?.document;
}

async function openPreview(uri?: vscode.Uri): Promise<PreviewPanel> {
  let doc = targetDoc(uri);
  if (!doc && uri) doc = await vscode.workspace.openTextDocument(uri);
  if (!doc) {
    const md = vscode.workspace.textDocuments.find((d) => d.languageId === 'markdown');
    doc = md;
  }
  const panel = PreviewPanel.show(ctx, handle, doc);
  await panel.whenReady();
  return panel;
}

async function tabCommand(tab: string) {
  const panel = await openPreview();
  if (!panel.document) {
    void vscode.window.showWarningMessage('md2: open a Markdown file first.');
    return;
  }
  await panel.command(tab, 'primary');
}

async function wechatCredentials(force = false): Promise<{ appId: string; appSecret: string } | undefined> {
  let appId = force ? undefined : await ctx.secrets.get(SECRET_WX_ID);
  let appSecret = force ? undefined : await ctx.secrets.get(SECRET_WX_SECRET);
  if (!appId) {
    appId = await vscode.window.showInputBox({ title: 'WeChat Official Account AppID', prompt: '公众平台 → 设置与开发 → 基本配置', ignoreFocusOut: true, placeHolder: 'wx…' });
    if (!appId) return undefined;
  }
  if (!appSecret) {
    appSecret = await vscode.window.showInputBox({ title: 'WeChat AppSecret', password: true, ignoreFocusOut: true });
    if (!appSecret) return undefined;
  }
  await ctx.secrets.store(SECRET_WX_ID, appId.trim());
  await ctx.secrets.store(SECRET_WX_SECRET, appSecret.trim());
  return { appId: appId.trim(), appSecret: appSecret.trim() };
}

async function publishWechat() {
  const panel = await openPreview();
  const doc = panel.document;
  if (!doc) return void vscode.window.showWarningMessage('md2: open a Markdown file first.');
  if (doc.isDirty) await doc.save();
  const creds = await wechatCredentials();
  if (!creds) return;
  const coverTemplate = vscode.workspace.getConfiguration('md2').get<string>('wechat.coverTemplate', 'aurora');
  try {
    const r = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'md2: publishing to WeChat drafts', cancellable: false },
      (progress) =>
        publishWechatDraft(doc.uri.scheme === 'file' ? { file: doc.uri.fsPath } : { markdown: doc.getText() }, {
          ...creds,
          onProgress: (m) => progress.report({ message: m.replace(/^✓\s*/, '') }),
          generateDiagrams: async () => {
            const map = await panel.ask<Record<string, string>>('getDiagrams');
            return (_lang, code) => map[code];
          },
          generateCover: async () => {
            const b64 = await panel.ask<string>('renderCover', { template: coverTemplate });
            return { data: Buffer.from(b64, 'base64'), name: 'cover.png', mime: 'image/png' };
          },
        }),
    );
    const open = 'Open WeChat MP';
    const pick = await vscode.window.showInformationMessage(`md2: draft created (${r.article.title}). Review it in 内容管理 → 草稿箱.`, open);
    if (pick === open) void vscode.env.openExternal(vscode.Uri.parse('https://mp.weixin.qq.com/'));
    for (const w of r.warnings) void vscode.window.showWarningMessage(`md2: ${w.message}`);
  } catch (e) {
    void vscode.window.showErrorMessage(`md2: ${(e as Error).message}`);
  }
}

export interface Md2Api {
  /** For tests: the live preview (if open) */
  preview(): PreviewPanel | undefined;
  /** For tests: errors reported by the webview */
  logs(): string[];
}

export function activate(context: vscode.ExtensionContext): Md2Api {
  ctx = context;
  const reg = (id: string, fn: (...args: never[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  reg('md2.openPreview', (uri?: vscode.Uri) => openPreview(uri));
  reg('md2.copyWechat', () => tabCommand('wechat'));
  reg('md2.copyZhihu', () => tabCommand('zhihu'));
  reg('md2.exportXhs', () => tabCommand('xhs'));
  reg('md2.copyThread', () => tabCommand('thread'));
  reg('md2.exportLong', () => tabCommand('long'));
  reg('md2.exportCover', () => tabCommand('cover'));
  reg('md2.publishWechat', () => publishWechat());
  reg('md2.setWechatCredentials', async () => {
    if (await wechatCredentials(true)) void vscode.window.showInformationMessage('md2: WeChat credentials saved to SecretStorage.');
  });
  reg('md2.clearSecrets', async () => {
    await Promise.all([SECRET_AI_KEY, SECRET_WX_ID, SECRET_WX_SECRET].map((k) => ctx.secrets.delete(k)));
    await ctx.globalState.update(STATE_AI, undefined);
    void vscode.window.showInformationMessage('md2: stored keys cleared.');
  });
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(PreviewPanel.viewType, {
      async deserializeWebviewPanel(panel) {
        PreviewPanel.revive(context, panel, handle);
      },
    }),
  );
  return { preview: () => PreviewPanel.current, logs: () => PreviewPanel.logs };
}

export function deactivate() {
  PreviewPanel.current?.dispose();
}
