import { useEffect, useMemo, useRef, useState } from 'react';
import { renderXhs, xhsCardStyles, coverTemplates, XHS_TITLE_MAX, XHS_BODY_MAX, type XhsCardStyle, type CoverTemplateId } from '@md2/core';
import { layoutXhsCardsAsync } from '@md2/core/dom';
import { Button, Field, Select, Toggle, Warnings, toast } from '../components/ui';
import { copyPlain, download } from '../lib/clipboard';
import { elementToPng, zipPngs } from '../lib/image';
import { resolveAsset } from '../lib/assets';
import { usePersistent } from '../lib/store';
import { StyleBar, styleOptions } from './StyleBar';
import type { PanelProps } from './types';

export function XhsPanel({ doc, style, setStyle }: PanelProps) {
  const [cardStyle, setCardStyle] = usePersistent<XhsCardStyle>('xhs.cardStyle', 'clean');
  const [author, setAuthor] = usePersistent('xhs.author', '');
  const [cover, setCover] = usePersistent('xhs.cover', true);
  const [coverTpl, setCoverTpl] = usePersistent<CoverTemplateId>('xhs.coverTpl', 'claude');
  const [hrBreak, setHrBreak] = usePersistent('xhs.hrBreak', true);
  const [scale, setScale] = usePersistent('xhs.scale', 0.5);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const display = useRef<HTMLDivElement>(null);

  const result = useMemo(
    () =>
      renderXhs(doc, {
        ...styleOptions(style),
        fontSize: undefined,
        cardStyle,
        author: author || undefined,
        cover: cover ? { template: coverTpl } : false,
        hrPageBreak: hrBreak,
        resolveImage: resolveAsset,
      }),
    [doc, style, cardStyle, author, cover, coverTpl, hrBreak],
  );

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!host.current || !display.current) return;
      const { cards } = await layoutXhsCardsAsync(host.current, result.layout);
      if (cancelled) return;
      const frag = document.createDocumentFragment();
      cards.forEach((card, i) => {
        const cell = document.createElement('div');
        cell.className = 'xhs-cell';
        cell.dataset.index = String(i);
        const clone = card.cloneNode(true) as HTMLElement;
        clone.classList.add('xhs-clone');
        cell.appendChild(clone);
        const btn = document.createElement('button');
        btn.className = 'xhs-cell-dl';
        btn.type = 'button';
        btn.textContent = '下载';
        btn.dataset.index = String(i);
        cell.appendChild(btn);
        frag.appendChild(cell);
      });
      display.current.replaceChildren(frag);
      setCount(cards.length);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [result]);

  const cardEls = () =>
    Array.from(host.current?.querySelectorAll<HTMLElement>(':scope > .xhs-card, :scope > .xhs-cover-card') ?? []);

  const onDisplayClick = async (e: React.MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.xhs-cell-dl');
    if (!btn) return;
    const i = Number(btn.dataset.index);
    const el = cardEls()[i];
    if (!el) return;
    try {
      download(`xhs-${String(i + 1).padStart(2, '0')}.png`, await elementToPng(el));
    } catch {
      toast('导出失败（图片跨域？）', 'err');
    }
  };

  const exportAll = async () => {
    setBusy(true);
    try {
      const els = cardEls();
      const files = [];
      for (let i = 0; i < els.length; i++) files.push({ name: `xhs-${String(i + 1).padStart(2, '0')}.png`, blob: await elementToPng(els[i]) });
      const zip = await zipPngs(files, { 'caption.txt': `${result.text.title}\n\n${result.text.full}\n` });
      download(`${doc.title || 'xhs'}-小红书.zip`, zip);
      toast(`已导出 ${files.length} 张 1080×1440 图片`);
    } catch (e) {
      console.error(e);
      toast('导出失败：外链图片可能不允许跨域，请改用本地图片', 'err');
    } finally {
      setBusy(false);
    }
  };

  const t = result.text;
  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="panel-opts">
          <StyleBar style={style} setStyle={setStyle} compact />
          <Select value={cardStyle} options={xhsCardStyles.map((s) => ({ value: s.id, label: s.name }))} onChange={setCardStyle} />
          <Toggle label="封面" checked={cover} onChange={setCover} />
          {cover && <Select value={coverTpl} options={coverTemplates.map((c) => ({ value: c.id, label: `封面 · ${c.name}` }))} onChange={setCoverTpl} />}
          <Toggle label="--- 分页" checked={hrBreak} onChange={setHrBreak} />
          <input className="input input-sm" placeholder="@作者名" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div className="panel-actions">
          <Select
            value={scale}
            options={[0.35, 0.5, 0.65].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))}
            onChange={setScale}
          />
          <Button variant="primary" icon="download" onClick={exportAll} disabled={busy || !count}>
            {busy ? '导出中…' : `导出 ${count} 张`}
          </Button>
        </div>
      </div>
      <Warnings items={result.warnings} />
      <div className="xhs-layout">
        <div className="preview-scroll">
          <div className="xhs-grid" ref={display} style={{ ['--s' as string]: scale }} onClick={onDisplayClick} />
        </div>
        <aside className="caption">
          <div className="caption-head">
            <span>笔记文案</span>
            <Button icon="copy" variant="soft" onClick={() => copyPlain(`${t.title}\n\n${t.full}`).then(() => toast('已复制标题和正文'))}>
              全部
            </Button>
          </div>
          <Field label={`标题 ${t.titleLength}/${XHS_TITLE_MAX}`}>
            <div className={`caption-box${t.titleLength > XHS_TITLE_MAX ? ' over' : ''}`} onClick={() => copyPlain(t.title).then(() => toast('已复制标题'))}>
              {t.title}
            </div>
          </Field>
          <Field label={`正文 ${t.bodyLength}/${XHS_BODY_MAX}`}>
            <div className={`caption-box body${t.bodyLength > XHS_BODY_MAX ? ' over' : ''}`} onClick={() => copyPlain(t.full).then(() => toast('已复制正文'))}>
              {t.full}
            </div>
          </Field>
          <p className="hint">点击即可复制 · front matter 可写 <code>xhs.title</code> / <code>xhs.body</code> 覆盖</p>
        </aside>
      </div>
      {/* offscreen, unscaled layout host: pagination measures real sizes here */}
      <div className="offscreen" ref={host} aria-hidden="true" />
    </div>
  );
}
