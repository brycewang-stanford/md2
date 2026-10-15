import { useEffect, useMemo, useRef, useState } from 'react';
import {
  renderXhs, xhsCardStyles, coverTemplates, xhsLength, XHS_TITLE_MAX, XHS_BODY_MAX,
  type XhsCardStyle, type CoverTemplateId, type XhsSuggestion,
} from '@md2/core';
import { layoutXhsCardsAsync } from '@md2/core/dom';
import { Button, Field, Select, Toggle, Warnings, toast, Icon } from '../components/ui';
import { AiButton } from '../components/ai';
import { host } from '../lib/host';
import { elementToPng, zipPngs } from '../lib/image';
import { resolveAsset } from '../lib/assets';
import { usePersistent } from '../lib/store';
import { t } from '../lib/i18n';
import { usePrimaryAction } from '../lib/actions';
import { StyleBar, styleOptions } from './StyleBar';
import type { PanelProps } from './types';

export function XhsPanel({ doc, style, setStyle, diagram }: PanelProps) {
  const [cardStyle, setCardStyle] = usePersistent<XhsCardStyle>('xhs.cardStyle', 'clean');
  const [author, setAuthor] = usePersistent('xhs.author', '');
  const [cover, setCover] = usePersistent('xhs.cover', true);
  const [coverTpl, setCoverTpl] = usePersistent<CoverTemplateId>('xhs.coverTpl', 'claude');
  const [hrBreak, setHrBreak] = usePersistent('xhs.hrBreak', true);
  const [scale, setScale] = usePersistent('xhs.scale', 0.5);
  const [ai, setAi] = useState<XhsSuggestion | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const host_ = useRef<HTMLDivElement>(null);
  const display = useRef<HTMLDivElement>(null);
  // resolves when the current layout pass has finished (exports wait on it)
  const layoutDone = useRef<Promise<void>>(Promise.resolve());

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
        diagram,
      }),
    [doc, style, cardStyle, author, cover, coverTpl, hrBreak, diagram],
  );

  useEffect(() => {
    let cancelled = false;
    let finish: () => void = () => {};
    layoutDone.current = new Promise<void>((r) => (finish = r));
    const timer = setTimeout(async () => {
      if (!host_.current || !display.current) return finish();
      const { cards } = await layoutXhsCardsAsync(host_.current, result.layout);
      if (cancelled) return finish();
      const frag = document.createDocumentFragment();
      cards.forEach((card, i) => {
        const cell = document.createElement('div');
        cell.className = 'xhs-cell';
        const clone = card.cloneNode(true) as HTMLElement;
        clone.classList.add('xhs-clone');
        cell.appendChild(clone);
        const btn = document.createElement('button');
        btn.className = 'xhs-cell-dl';
        btn.type = 'button';
        btn.textContent = t('下载', 'Save');
        btn.dataset.index = String(i);
        cell.appendChild(btn);
        frag.appendChild(cell);
      });
      display.current.replaceChildren(frag);
      setCount(cards.length);
      finish();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      finish();
    };
  }, [result]);

  const cardEls = () => Array.from(host_.current?.querySelectorAll<HTMLElement>(':scope > .xhs-card, :scope > .xhs-cover-card') ?? []);
  const name = (i: number) => `xhs-${String(i + 1).padStart(2, '0')}.png`;
  const captionText = () => `${(ai?.titles[0] ?? result.text.title)}\n\n${ai ? `${ai.body}\n\n${ai.tags.map((x) => '#' + x).join(' ')}` : result.text.full}\n`;

  const onDisplayClick = async (e: React.MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.xhs-cell-dl');
    if (!btn) return;
    const i = Number(btn.dataset.index);
    const el = cardEls()[i];
    if (!el) return;
    try {
      await host.save(name(i), await elementToPng(el));
    } catch (e) {
      console.error('md2: export failed', e);
      toast(t('导出失败（图片跨域？）', 'Export failed (cross-origin image?)'), 'err');
    }
  };

  const exportAll = async () => {
    setBusy(true);
    try {
      await layoutDone.current;
      const els = cardEls();
      const files = [];
      for (let i = 0; i < els.length; i++) files.push({ name: name(i), blob: await elementToPng(els[i]) });
      if (host.kind === 'vscode') {
        const dir = `${(doc.title || 'xhs').slice(0, 40)}-xhs`;
        for (const f of files) await host.save(`${dir}/${f.name}`, f.blob);
        await host.save(`${dir}/caption.txt`, captionText());
      } else {
        const zip = await zipPngs(files, { 'caption.txt': captionText() });
        await host.save(`${doc.title || 'xhs'}-xhs.zip`, zip);
      }
      toast(t(`已导出 ${files.length} 张 1080×1440 图片`, `Exported ${files.length} images (1080×1440)`));
    } catch (e) {
      console.error('md2: export failed', e);
      toast(t('导出失败：外链图片可能不允许跨域，请改用本地图片', 'Export failed: a remote image may block cross-origin use'), 'err');
    } finally {
      setBusy(false);
    }
  };
  usePrimaryAction(exportAll);

  const tx = result.text;
  const copy = (s: string, msg: string) => host.copyText(s).then(() => toast(msg));
  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="panel-opts">
          <StyleBar style={style} setStyle={setStyle} compact />
          <Select value={cardStyle} options={xhsCardStyles.map((s) => ({ value: s.id, label: s.name }))} onChange={setCardStyle} />
          <Toggle label={t('封面', 'Cover')} checked={cover} onChange={setCover} />
          {cover && <Select value={coverTpl} options={coverTemplates.map((c) => ({ value: c.id, label: `${t('封面', 'Cover')} · ${c.name}` }))} onChange={setCoverTpl} />}
          <Toggle label={t('--- 分页', '--- breaks')} checked={hrBreak} onChange={setHrBreak} />
          <input className="input input-sm" placeholder={t('@作者名', '@author')} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div className="panel-actions">
          <Select value={scale} options={[0.35, 0.5, 0.65].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))} onChange={setScale} />
          <Button variant="primary" icon="download" onClick={exportAll} disabled={busy || !count}>
            {busy ? t('导出中…', 'Exporting…') : t(`导出 ${count} 张`, `Export ${count}`)}
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
            <span>{t('笔记文案', 'Caption')}</span>
            <span className="caption-actions">
              <AiButton<XhsSuggestion> task="xhs" label={t('AI 爆款文案', 'AI caption')} onResult={setAi} />
              <Button icon="copy" variant="soft" onClick={() => copy(captionText(), t('已复制标题和正文', 'Title & body copied'))} />
            </span>
          </div>
          {ai ? (
            <>
              <Field label={t('AI 标题（点击复制）', 'AI titles (click to copy)')}>
                <div className="suggest-list col">
                  {ai.titles.map((x) => (
                    <button key={x} type="button" className={`chip${xhsLength(x) > XHS_TITLE_MAX ? ' over' : ''}`} onClick={() => copy(x, t('已复制标题', 'Title copied'))}>
                      {x} <em>{xhsLength(x)}</em>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={`${t('AI 正文', 'AI body')} ${xhsLength(ai.body)}/${XHS_BODY_MAX}`}>
                <div className="caption-box body" onClick={() => copy(`${ai.body}\n\n${ai.tags.map((x) => '#' + x).join(' ')}`, t('已复制正文', 'Body copied'))}>
                  {ai.body}
                  {'\n\n'}
                  {ai.tags.map((x) => '#' + x).join(' ')}
                </div>
              </Field>
              <button type="button" className="link-btn" onClick={() => setAi(null)}>
                <Icon name="reset" size={12} /> {t('用回自动文案', 'Back to auto caption')}
              </button>
            </>
          ) : (
            <>
              <Field label={`${t('标题', 'Title')} ${tx.titleLength}/${XHS_TITLE_MAX}`}>
                <div className={`caption-box${tx.titleLength > XHS_TITLE_MAX ? ' over' : ''}`} onClick={() => copy(tx.title, t('已复制标题', 'Title copied'))}>
                  {tx.title}
                </div>
              </Field>
              <Field label={`${t('正文', 'Body')} ${tx.bodyLength}/${XHS_BODY_MAX}`}>
                <div className={`caption-box body${tx.bodyLength > XHS_BODY_MAX ? ' over' : ''}`} onClick={() => copy(tx.full, t('已复制正文', 'Body copied'))}>
                  {tx.full}
                </div>
              </Field>
              <p className="hint">
                {t('点击即可复制 · front matter 可写', 'Click to copy · override with front matter')} <code>xhs.title</code> / <code>xhs.body</code>
              </p>
            </>
          )}
        </aside>
      </div>
      {/* offscreen, unscaled layout host: pagination measures real sizes here */}
      <div className="offscreen" ref={host_} aria-hidden="true" />
    </div>
  );
}
