import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { getTheme, isMathReady, parseMarkdown, renderCover, type CoverTemplateId, type DiagramResolver, type ParsedDoc } from '@md2/core';
import { mountCover } from '@md2/core/dom';
import { elementToPng } from './lib/image';
import sample from '../../../examples/demo.md?raw';
import sampleEn from '../../../examples/demo.en.md?raw';
import { Editor } from './components/Editor';
import { Button, Toaster, toast } from './components/ui';
import { AiProvider } from './components/ai';
import { usePersistent } from './lib/store';
import { loadAssets, setHostImages } from './lib/assets';
import { useDiagrams, useEngines } from './lib/engines';
import { host, isVsCode, onHostMessage, postToHost } from './lib/host';
import { getLang, setLang, t, useLang } from './lib/i18n';
import { runPrimaryAction } from './lib/actions';
import { WechatPanel } from './panels/WechatPanel';
import { ZhihuPanel } from './panels/ZhihuPanel';
import { XhsPanel } from './panels/XhsPanel';
import { ThreadPanel } from './panels/ThreadPanel';
import { LongPanel } from './panels/LongPanel';
import { CoverPanel } from './panels/CoverPanel';
import { DEFAULT_STYLE, type StyleSettings } from './panels/types';

const TABS = [
  { id: 'wechat', zh: '公众号', en: 'WeChat', dot: '#07c160' },
  { id: 'zhihu', zh: '知乎', en: 'Zhihu', dot: '#1772f6' },
  { id: 'xhs', zh: '小红书', en: 'RED', dot: '#ff2442' },
  { id: 'thread', zh: '推文', en: 'Threads', dot: 'var(--text)' },
  { id: 'long', zh: '长图', en: 'Long', dot: '#f59e0b' },
  { id: 'cover', zh: '封面', en: 'Cover', dot: '#a78bfa' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

const REPO = 'https://github.com/brycewang-stanford/md2';

function countWords(md: string) {
  const body = md.replace(/^---[\s\S]*?---/, '').replace(/```[\s\S]*?```/g, '');
  const cjk = (body.match(/[一-鿿]/g) ?? []).length;
  const latin = (body.replace(/[一-鿿]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;
  return cjk + latin;
}

export function App() {
  const lang = useLang();
  const [markdown, setMarkdown] = usePersistent('markdown', getLang() === 'zh' ? sample : sampleEn);
  const [hostDoc, setHostDoc] = useState<{ markdown: string; fileName: string } | null>(null);
  const [savedTab, setTab] = usePersistent<TabId>('tab', 'wechat');
  const tab: TabId = TABS.some((x) => x.id === savedTab) ? savedTab : 'wechat';
  const [scheme, setScheme] = usePersistent<'light' | 'dark' | 'system'>('scheme', 'system');
  const [split, setSplit] = usePersistent('split', 0.44);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const [style, setStyleState] = usePersistent<StyleSettings>('style', DEFAULT_STYLE);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const docRef = useRef<ParsedDoc | null>(null);
  const diagramRef = useRef<DiagramResolver | undefined>(undefined);
  const pendingRef = useRef(false);
  const main = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadAssets().then(() => setAssetsReady(true));
  }, []);

  // VS Code: the document comes from the active editor
  useEffect(() => {
    if (!isVsCode) return;
    const off = onHostMessage((msg) => {
      if (msg.type === 'doc') {
        setHostImages((msg.images as Record<string, string>) ?? {});
        setHostDoc({ markdown: String(msg.markdown ?? ''), fileName: String(msg.fileName ?? '') });
      } else if (msg.type === 'scroll') {
        setScrollRatio(Number(msg.ratio) || 0);
      } else if (msg.type === 'command') {
        if (msg.tab) setTab(msg.tab as TabId);
        if (msg.action === 'primary') {
          void (async () => {
            // wait for lazy engines (MathJax, Mermaid) so exports never capture placeholders
            const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
            await sleep(300);
            for (let i = 0; i < 150; i++) {
              const d = docRef.current;
              if (d && !pendingRef.current && (!d.hasMath || isMathReady())) break;
              await sleep(100);
            }
            await sleep(200);
            await runPrimaryAction();
          })();
        }
      } else if (msg.type === 'theme') {
        setScheme(msg.dark ? 'dark' : 'light');
      } else if (msg.type === 'getDiagrams') {
        // extension asks for rendered diagrams before publishing
        const map: Record<string, string> = {};
        for (const d of docRef.current?.diagrams ?? []) {
          const svg = diagramRef.current?.(d.lang, d.code);
          if (svg) map[d.code] = svg;
        }
        postToHost({ type: 'reply', id: msg.id, result: map });
      } else if (msg.type === 'renderCover') {
        void (async () => {
          const d = docRef.current;
          const box = document.createElement('div');
          box.className = 'offscreen';
          document.body.appendChild(box);
          try {
            const el = mountCover(box, renderCover({
              title: d?.title || 'Untitled', subtitle: typeof d?.frontmatter.subtitle === 'string' ? d.frontmatter.subtitle : undefined,
              author: typeof d?.frontmatter.author === 'string' ? d.frontmatter.author : undefined, tags: d?.tags.slice(0, 3),
              template: (msg.template as CoverTemplateId) || 'aurora', size: 'wechat',
            }));
            const blob = await elementToPng(el);
            const buf = new Uint8Array(await blob.arrayBuffer());
            let bin = '';
            for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            postToHost({ type: 'reply', id: msg.id, result: btoa(bin) });
          } catch (e) {
            postToHost({ type: 'reply', id: msg.id, error: (e as Error).message });
          } finally {
            box.remove();
          }
        })();
      }
    });
    postToHost({ type: 'ready' });
    return off;
  }, [setTab, setScheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (scheme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', scheme);
  }, [scheme]);

  // ⌘/Ctrl + Shift + C runs the visible panel's main action (copy / export)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        void runPrimaryAction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const source = isVsCode ? (hostDoc?.markdown ?? '') : markdown;
  const deferred = useDeferredValue(source);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parsed = useMemo(() => parseMarkdown(deferred), [deferred, assetsReady, hostDoc]);
  const doc = useEngines(parsed);
  const words = useMemo(() => countWords(deferred), [deferred]);
  const setStyle = useCallback((s: Partial<StyleSettings>) => setStyleState((p) => ({ ...p, ...s })), [setStyleState]);
  const dark = scheme === 'dark' || (scheme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const theme = getTheme(style.theme);
  const { diagram, pending } = useDiagrams(doc, style.primary || theme.primary, theme.id === 'midnight');
  docRef.current = doc;
  diagramRef.current = diagram;
  pendingRef.current = pending;

  const openFile = async (f: File | undefined) => {
    if (!f) return;
    setMarkdown(await f.text());
    toast(t(`已打开 ${f.name}`, `Opened ${f.name}`));
  };

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = main.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => setSplit(Math.min(0.7, Math.max(0.25, (ev.clientX - rect.left) / rect.width)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
    };
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const panelProps = { doc, style, setStyle, scrollRatio, diagram };

  return (
    <AiProvider markdown={source}>
      <div className={`app${isVsCode ? ' is-embedded' : ''}`} data-mobile-view={mobileView} key={lang}>
        <header className="topbar">
          {!isVsCode && (
            <a className="brand" href={REPO} target="_blank" rel="noreferrer">
              <span className="logo">
                <svg viewBox="0 0 256 256" width="26" height="26" aria-hidden="true">
                  <rect width="256" height="256" rx="58" fill="#1c1b18" />
                  <path d="M50 184V84l42 54 42-54v100" fill="none" stroke="#faf9f5" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M164 92c0-14 12-24 26-24s26 10 26 24c0 22-52 44-52 64v12h54" fill="none" stroke="#d97757" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="brand-name">md2</span>
              <span className="brand-tag">Markdown → everywhere</span>
            </a>
          )}
          <nav className="tabs" role="tablist">
            {TABS.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={tab === x.id}
                className={`tab${tab === x.id ? ' is-active' : ''}`}
                onClick={() => {
                  setTab(x.id);
                  setMobileView('preview');
                }}
              >
                <span className="tab-dot" style={{ background: x.dot }} />
                {lang === 'zh' ? x.zh : x.en}
                {lang === 'zh' && <span className="tab-en">{x.en}</span>}
              </button>
            ))}
          </nav>
          <div className="topbar-right">
            {!isVsCode && (
              <div className="seg mobile-only">
                <button type="button" className={mobileView === 'edit' ? 'is-active' : ''} onClick={() => setMobileView('edit')}>{t('编辑', 'Edit')}</button>
                <button type="button" className={mobileView === 'preview' ? 'is-active' : ''} onClick={() => setMobileView('preview')}>{t('预览', 'Preview')}</button>
              </div>
            )}
            {isVsCode && hostDoc?.fileName && <span className="stats file-name">{hostDoc.fileName}</span>}
            <Button icon="globe" title="中文 / English" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
              {lang === 'zh' ? 'EN' : '中'}
            </Button>
            {!isVsCode && <Button icon={dark ? 'sun' : 'moon'} title={t('切换深浅色', 'Toggle dark mode')} onClick={() => setScheme(dark ? 'light' : 'dark')} />}
            <Button icon="github" onClick={() => host.openExternal(REPO)} title="GitHub" />
          </div>
        </header>

        <main className="workspace" ref={main} style={{ ['--split' as string]: split }}>
          {!isVsCode && (
            <>
              <section className="pane pane-editor">
                <div className="pane-bar">
                  <div className="pane-bar-left">
                    <Button icon="file" onClick={() => fileInput.current?.click()}>
                      {t('打开', 'Open')}
                    </Button>
                    <Button icon="sparkle" onClick={() => setMarkdown(lang === 'zh' ? sample : sampleEn)}>
                      {t('示例', 'Sample')}
                    </Button>
                    <input ref={fileInput} type="file" accept=".md,.markdown,.txt" hidden onChange={(e) => openFile(e.target.files?.[0])} />
                  </div>
                  <span className="stats">
                    {t(`${words.toLocaleString()} 字 · 约 ${Math.max(1, Math.round(words / 400))} 分钟`, `${words.toLocaleString()} words · ${Math.max(1, Math.round(words / 230))} min`)}
                  </span>
                </div>
                <Editor value={markdown} onChange={setMarkdown} onScrollRatio={setScrollRatio} />
              </section>
              <div className="divider" onPointerDown={startDrag} role="separator" aria-orientation="vertical" />
            </>
          )}
          <section className="pane pane-preview">
            {isVsCode && !hostDoc ? (
              <div className="empty">{t('打开一个 Markdown 文件即可预览', 'Open a Markdown file to preview it')}</div>
            ) : (
              <>
                {tab === 'wechat' && <WechatPanel {...panelProps} />}
                {tab === 'zhihu' && <ZhihuPanel {...panelProps} />}
                {tab === 'xhs' && <XhsPanel {...panelProps} />}
                {tab === 'thread' && <ThreadPanel {...panelProps} />}
                {tab === 'long' && <LongPanel {...panelProps} />}
                {tab === 'cover' && <CoverPanel {...panelProps} />}
              </>
            )}
          </section>
        </main>
        <Toaster />
      </div>
    </AiProvider>
  );
}
