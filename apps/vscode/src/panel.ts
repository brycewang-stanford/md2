import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';

/** Messages the webview sends that expect a `response`. */
export type RequestHandler = (msg: Record<string, unknown>, panel: PreviewPanel) => Promise<unknown>;

const IMG_RE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|<img[^>]+src=["']([^"']+)["']/g;

/**
 * The md2 preview: hosts the web app build (media/app) in a webview and keeps
 * it in sync with the active Markdown editor.
 */
export class PreviewPanel {
  static current: PreviewPanel | undefined;
  static output = vscode.window.createOutputChannel('md2');
  static logs: string[] = [];
  static readonly viewType = 'md2.preview';

  readonly panel: vscode.WebviewPanel;
  document: vscode.TextDocument | undefined;
  ready = false;
  private readyWaiters: (() => void)[] = [];
  private disposables: vscode.Disposable[] = [];
  private pushTimer: NodeJS.Timeout | undefined;
  private seq = 0;
  private replies = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  static show(ctx: vscode.ExtensionContext, handle: RequestHandler, doc?: vscode.TextDocument): PreviewPanel {
    const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
    if (PreviewPanel.current) {
      PreviewPanel.current.panel.reveal(column, true);
      if (doc) PreviewPanel.current.setDocument(doc);
      return PreviewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(PreviewPanel.viewType, 'md2', { viewColumn: column, preserveFocus: true }, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: PreviewPanel.roots(ctx, doc),
    });
    PreviewPanel.current = new PreviewPanel(ctx, panel, handle, doc);
    return PreviewPanel.current;
  }

  static revive(ctx: vscode.ExtensionContext, panel: vscode.WebviewPanel, handle: RequestHandler) {
    panel.webview.options = { enableScripts: true, localResourceRoots: PreviewPanel.roots(ctx) };
    PreviewPanel.current = new PreviewPanel(ctx, panel, handle, PreviewPanel.activeMarkdown());
  }

  static activeMarkdown(): vscode.TextDocument | undefined {
    const ed = vscode.window.activeTextEditor;
    return ed && ed.document.languageId === 'markdown' ? ed.document : undefined;
  }

  private static roots(ctx: vscode.ExtensionContext, doc?: vscode.TextDocument): vscode.Uri[] {
    const roots = [vscode.Uri.joinPath(ctx.extensionUri, 'media'), ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri)];
    if (doc && doc.uri.scheme === 'file') roots.push(vscode.Uri.file(path.dirname(doc.uri.fsPath)));
    return roots;
  }

  private constructor(private ctx: vscode.ExtensionContext, panel: vscode.WebviewPanel, private handle: RequestHandler, doc?: vscode.TextDocument) {
    this.panel = panel;
    this.panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'icon.png');
    this.panel.webview.html = this.html();
    this.document = doc;
    if (doc) this.panel.title = `md2 · ${path.basename(doc.fileName)}`;

    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m)),
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (ed && ed.document.languageId === 'markdown') this.setDocument(ed.document);
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.document && e.document.uri.toString() === this.document.uri.toString()) this.schedulePush();
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (!this.document || e.textEditor.document.uri.toString() !== this.document.uri.toString()) return;
        const first = e.visibleRanges[0]?.start.line ?? 0;
        const total = Math.max(1, e.textEditor.document.lineCount - (e.visibleRanges[0] ? e.visibleRanges[0].end.line - first : 0));
        this.post({ type: 'scroll', ratio: Math.min(1, first / total) });
      }),
      vscode.window.onDidChangeActiveColorTheme(() => this.postTheme()),
    );
  }

  setDocument(doc: vscode.TextDocument) {
    const changed = this.document?.uri.toString() !== doc.uri.toString();
    this.document = doc;
    if (changed && doc.uri.scheme === 'file') {
      const roots = PreviewPanel.roots(this.ctx, doc);
      this.panel.webview.options = { ...this.panel.webview.options, localResourceRoots: roots };
    }
    this.panel.title = `md2 · ${path.basename(doc.fileName)}`;
    this.schedulePush(0);
  }

  private schedulePush(delay = 150) {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.pushDocument(), delay);
  }

  /** Map local image paths in the Markdown to webview URIs. */
  private imageMap(doc: vscode.TextDocument): Record<string, string> {
    const map: Record<string, string> = {};
    if (doc.uri.scheme !== 'file') return map;
    const dir = path.dirname(doc.uri.fsPath);
    const text = doc.getText();
    for (const m of text.matchAll(IMG_RE)) {
      const src = m[1] ?? m[2];
      if (!src || /^(https?:|data:|asset:)/i.test(src)) continue;
      let p = decodeURI(src.split(/[?#]/)[0]);
      if (p.startsWith('file://')) p = vscode.Uri.parse(p).fsPath;
      const abs = path.isAbsolute(p) ? p : path.resolve(dir, p);
      if (fs.existsSync(abs)) map[src] = this.panel.webview.asWebviewUri(vscode.Uri.file(abs)).toString();
    }
    return map;
  }

  pushDocument() {
    if (!this.ready || !this.document) return;
    this.post({
      type: 'doc',
      markdown: this.document.getText(),
      fileName: path.basename(this.document.fileName),
      images: this.imageMap(this.document),
    });
  }

  private postTheme() {
    const kind = vscode.window.activeColorTheme.kind;
    this.post({ type: 'theme', dark: kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast });
  }

  post(msg: Record<string, unknown>) {
    void this.panel.webview.postMessage(msg);
  }

  whenReady(): Promise<void> {
    return this.ready ? Promise.resolve() : new Promise((r) => this.readyWaiters.push(r));
  }

  /** Ask the webview for something (diagrams, a rendered cover) and await its reply. */
  ask<T>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 30000): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.replies.delete(id);
        reject(new Error(`md2 preview did not answer ${type}`));
      }, timeoutMs);
      this.replies.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v as T)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.post({ type, id, ...payload });
    });
  }

  /** Switch tab and run the panel's main action (copy / export). */
  async command(tab: string, action: 'primary' | 'show' = 'primary') {
    await this.whenReady();
    this.post({ type: 'command', tab, action: action === 'primary' ? 'primary' : undefined });
  }

  private async onMessage(msg: Record<string, unknown>) {
    if (msg.type === 'ready') {
      this.ready = true;
      this.postTheme();
      this.pushDocument();
      this.readyWaiters.splice(0).forEach((r) => r());
      return;
    }
    if (msg.type === 'reply' && typeof msg.id === 'number') {
      const r = this.replies.get(msg.id);
      this.replies.delete(msg.id);
      if (msg.error) r?.reject(new Error(String(msg.error)));
      else r?.resolve(msg.result);
      return;
    }
    if (msg.type === 'log') {
      PreviewPanel.output.appendLine(`[${new Date().toISOString().slice(11, 19)}] ${String(msg.level)}: ${String(msg.text)}`);
      PreviewPanel.logs.push(String(msg.text));
      return;
    }
    if (msg.type === 'openExternal' && typeof msg.url === 'string') {
      void vscode.env.openExternal(vscode.Uri.parse(msg.url));
      return;
    }
    if (typeof msg.id !== 'number') return;
    try {
      const result = await this.handle(msg, this);
      this.post({ type: 'response', id: msg.id, result });
    } catch (e) {
      this.post({ type: 'response', id: msg.id, error: (e as Error).message });
    }
  }

  private html(): string {
    const webview = this.panel.webview;
    const appRoot = vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'app');
    const base = webview.asWebviewUri(appRoot).toString().replace(/\/?$/, '/');
    let html = fs.readFileSync(path.join(appRoot.fsPath, 'index.html'), 'utf8');
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: http: data: blob:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `script-src ${webview.cspSource} 'wasm-unsafe-eval'`,
      `connect-src ${webview.cspSource} https: http://localhost:* http://127.0.0.1:* data: blob:`,
      `worker-src ${webview.cspSource} blob:`,
    ].join('; ');
    html = html
      .replace(/\s+crossorigin(="[^"]*")?/g, '')
      .replace('<head>', `<head>\n<base href="${base}">\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
    return html;
  }

  dispose() {
    PreviewPanel.current = undefined;
    this.replies.forEach((r) => r.reject(new Error('preview closed')));
    this.disposables.forEach((d) => d.dispose());
    this.panel.dispose();
  }
}
