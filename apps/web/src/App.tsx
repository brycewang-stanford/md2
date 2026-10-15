import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { parseMarkdown } from '@md2/core';
import sample from '../../../examples/demo.md?raw';
import { Editor } from './components/Editor';
import { Button, Toaster, toast } from './components/ui';
import { usePersistent } from './lib/store';
import { loadAssets } from './lib/assets';
import { WechatPanel } from './panels/WechatPanel';
import { ZhihuPanel } from './panels/ZhihuPanel';
import { XhsPanel } from './panels/XhsPanel';
import { XPanel } from './panels/XPanel';
import { CoverPanel } from './panels/CoverPanel';
import type { StyleSettings } from './panels/types';

const TABS = [
  { id: 'wechat', label: '公众号', en: 'WeChat', dot: '#07c160' },
  { id: 'zhihu', label: '知乎', en: 'Zhihu', dot: '#1772f6' },
  { id: 'xhs', label: '小红书', en: 'RED', dot: '#ff2442' },
  { id: 'x', label: 'X', en: 'Thread', dot: 'var(--text)' },
  { id: 'cover', label: '封面', en: 'Cover', dot: '#a78bfa' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const REPO = 'https://github.com/brycewang-stanford/md2';

function countWords(md: string) {
  const body = md.replace(/^---[\s\S]*?---/, '').replace(/```[\s\S]*?```/g, '');
  const cjk = (body.match(/[一-鿿]/g) ?? []).length;
  const latin = (body.replace(/[一-鿿]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;
  return cjk + latin;
}

export function App() {
  const [markdown, setMarkdown] = usePersistent('markdown', sample);
  const [tab, setTab] = usePersistent<TabId>('tab', 'wechat');
  const [scheme, setScheme] = usePersistent<'light' | 'dark' | 'system'>('scheme', 'system');
  const [split, setSplit] = usePersistent('split', 0.44);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const [style, setStyleState] = usePersistent<StyleSettings>('style', { theme: 'claude', codeTheme: '', primary: '', fontSize: 16, font: 'sans' });
  const [scrollRatio, setScrollRatio] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const main = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadAssets().then(() => setAssetsReady(true));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (scheme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', scheme);
  }, [scheme]);

  const deferred = useDeferredValue(markdown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doc = useMemo(() => parseMarkdown(deferred), [deferred, assetsReady]);
  const words = useMemo(() => countWords(deferred), [deferred]);
  const setStyle = useCallback((s: Partial<StyleSettings>) => setStyleState((p) => ({ ...p, ...s })), [setStyleState]);

  const openFile = async (f: File | undefined) => {
    if (!f) return;
    setMarkdown(await f.text());
    toast(`已打开 ${f.name}`);
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

  const panelProps = { doc, style, setStyle, scrollRatio };
  const dark = scheme === 'dark' || (scheme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <div className="app" data-mobile-view={mobileView}>
      <header className="topbar">
        <a className="brand" href={REPO} target="_blank" rel="noreferrer">
          <span className="logo">
            <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
              <rect width="64" height="64" rx="16" fill="currentColor" />
              <path d="M16 44V20l10 13 10-13v24" stroke="var(--bg)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="47" cy="40" r="5" fill="#d97757" />
            </svg>
          </span>
          <span className="brand-name">md2</span>
          <span className="brand-tag">Markdown → everywhere</span>
        </a>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => {
                setTab(t.id);
                setMobileView('preview');
              }}
            >
              <span className="tab-dot" style={{ background: t.dot }} />
              {t.label}
              <span className="tab-en">{t.en}</span>
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <div className="seg mobile-only">
            <button type="button" className={mobileView === 'edit' ? 'is-active' : ''} onClick={() => setMobileView('edit')}>编辑</button>
            <button type="button" className={mobileView === 'preview' ? 'is-active' : ''} onClick={() => setMobileView('preview')}>预览</button>
          </div>
          <Button icon={dark ? 'sun' : 'moon'} title="切换深浅色" onClick={() => setScheme(dark ? 'light' : 'dark')} />
          <Button icon="github" href={REPO} title="GitHub" />
        </div>
      </header>

      <main className="workspace" ref={main} style={{ ['--split' as string]: split }}>
        <section className="pane pane-editor">
          <div className="pane-bar">
            <div className="pane-bar-left">
              <Button icon="file" onClick={() => fileInput.current?.click()}>
                打开
              </Button>
              <Button icon="sparkle" onClick={() => setMarkdown(sample)}>
                示例
              </Button>
              <input ref={fileInput} type="file" accept=".md,.markdown,.txt" hidden onChange={(e) => openFile(e.target.files?.[0])} />
            </div>
            <span className="stats">
              {words.toLocaleString()} 字 · 约 {Math.max(1, Math.round(words / 400))} 分钟
            </span>
          </div>
          <Editor value={markdown} onChange={setMarkdown} onScrollRatio={setScrollRatio} />
        </section>
        <div className="divider" onPointerDown={startDrag} role="separator" aria-orientation="vertical" />
        <section className="pane pane-preview">
          {tab === 'wechat' && <WechatPanel {...panelProps} />}
          {tab === 'zhihu' && <ZhihuPanel {...panelProps} />}
          {tab === 'xhs' && <XhsPanel {...panelProps} />}
          {tab === 'x' && <XPanel {...panelProps} />}
          {tab === 'cover' && <CoverPanel {...panelProps} />}
        </section>
      </main>
      <Toaster />
    </div>
  );
}
