import { useEffect, useMemo, useRef, useState } from 'react';
import { renderCover, coverTemplates, coverSizes, type CoverSizeId, type CoverTemplateId, type CoverOptions, type CoverSuggestion } from '@md2/core';
import { mountCover } from '@md2/core/dom';
import { Button, ColorField, Field, toast } from '../components/ui';
import { AiButton } from '../components/ai';
import { host } from '../lib/host';
import { elementToPng, readFileAsDataUrl, zipPngs } from '../lib/image';
import { usePersistent } from '../lib/store';
import { t } from '../lib/i18n';
import { usePrimaryAction } from '../lib/actions';
import type { PanelProps } from './types';

interface Fields {
  title: string;
  subtitle: string;
  author: string;
  badge: string;
  emoji: string;
  tags: string;
}

/** Mount a cover render into a box, scaled to `scale`. */
function CoverView({ opts, scale, onEl }: { opts: CoverOptions; scale: number; onEl?: (el: HTMLElement | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const render = useMemo(() => renderCover(opts), [opts]);
  useEffect(() => {
    if (!box.current) return;
    const el = mountCover(box.current, render);
    onEl?.(el);
  }, [render, onEl]);
  return (
    <div className="cover-frame" style={{ width: render.cssWidth * scale, height: render.cssHeight * scale }}>
      <div className="cover-scale" ref={box} style={{ transform: `scale(${scale})` }} />
    </div>
  );
}

export function CoverPanel({ doc }: PanelProps) {
  const [tpl, setTpl] = usePersistent<CoverTemplateId>('cover.tpl', 'aurora');
  const [size, setSize] = usePersistent<CoverSizeId>('cover.size', 'xhs');
  const [accent, setAccent] = usePersistent('cover.accent', '');
  const [overrides, setOverrides] = usePersistent<Partial<Fields>>('cover.fields', {});
  const [bg, setBg] = useState('');
  const [main, setMain] = useState<HTMLElement | null>(null);

  const fm = doc.frontmatter;
  const fields: Fields = {
    title: overrides.title ?? doc.title,
    subtitle: overrides.subtitle ?? String(fm.subtitle ?? ''),
    author: overrides.author ?? String(fm.author ?? ''),
    badge: overrides.badge ?? '',
    emoji: overrides.emoji ?? '',
    tags: overrides.tags ?? doc.tags.slice(0, 4).join(', '),
  };
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setOverrides({ ...overrides, [k]: e.target.value });

  const opts = useMemo<CoverOptions>(
    () => ({
      title: fields.title || t('未命名标题', 'Untitled'),
      subtitle: fields.subtitle || undefined,
      author: fields.author || undefined,
      badge: fields.badge || undefined,
      emoji: fields.emoji || undefined,
      tags: fields.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      template: tpl,
      size,
      accent: accent || undefined,
      background: bg || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields.title, fields.subtitle, fields.author, fields.badge, fields.emoji, fields.tags, tpl, size, accent, bg],
  );

  const sz = coverSizes[size];
  const mainScale = Math.min(1, 560 / (sz.width / 2), 520 / (sz.height / 2));
  const thumbScale = 150 / (sz.width / 2);
  const tplAccent = coverTemplates.find((t) => t.id === tpl)!.accent;

  const exportOne = async () => {
    if (!main) return;
    try {
      await host.save(`cover-${size}-${tpl}.png`, await elementToPng(main));
      toast(t(`已导出 ${sz.width}×${sz.height}`, `Exported ${sz.width}×${sz.height}`));
    } catch {
      toast(t('导出失败', 'Export failed'), 'err');
    }
  };
  usePrimaryAction(exportOne);

  const exportAllSizes = async () => {
    const box = document.createElement('div');
    box.className = 'offscreen';
    document.body.appendChild(box);
    try {
      const files = [];
      for (const id of Object.keys(coverSizes) as CoverSizeId[]) {
        const el = mountCover(box, renderCover({ ...opts, size: id }));
        files.push({ name: `cover-${id}.png`, blob: await elementToPng(el) });
      }
      if (host.kind === 'vscode') for (const f of files) await host.save(`covers/${f.name}`, f.blob);
      else await host.save(`${doc.title || 'md2'}-covers.zip`, await zipPngs(files));
      toast(t(`已导出 ${files.length} 个尺寸`, `Exported ${files.length} sizes`));
    } catch {
      toast(t('导出失败', 'Export failed'), 'err');
    } finally {
      box.remove();
    }
  };

  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="panel-opts">
          <div className="seg">
            {(Object.keys(coverSizes) as CoverSizeId[]).map((id) => (
              <button key={id} type="button" className={id === size ? 'is-active' : ''} onClick={() => setSize(id)}>
                {coverSizes[id].label}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-actions">
          <AiButton<CoverSuggestion>
            task="cover"
            label={t('AI 文案', 'AI copy')}
            onResult={(r) => setOverrides({ ...overrides, title: r.title.replace(/\\n/g, '\n'), subtitle: r.subtitle, badge: r.badge, emoji: r.emoji })}
          />
          <Button icon="download" variant="soft" onClick={exportAllSizes}>
            {t('全部尺寸', 'All sizes')}
          </Button>
          <Button variant="primary" icon="download" onClick={exportOne}>
            {t('导出 PNG', 'Export PNG')}
          </Button>
        </div>
      </div>
      <div className="cover-layout">
        <div className="preview-scroll cover-stage">
          <CoverView opts={opts} scale={mainScale} onEl={setMain} />
          <div className="cover-thumbs">
            {coverTemplates.map((t) => (
              <button key={t.id} type="button" className={`cover-thumb${t.id === tpl ? ' is-active' : ''}`} onClick={() => setTpl(t.id)} title={t.name}>
                <CoverView opts={{ ...opts, template: t.id, accent: accent || undefined }} scale={thumbScale} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </div>
        <aside className="cover-form">
          <Field label={t('标题（换行用回车，==重点== 高亮）', 'Title (Enter = line break, ==x== = highlight)')}>
            <textarea className="input" rows={3} value={fields.title} onChange={set('title')} />
          </Field>
          <Field label={t('副标题', 'Subtitle')}>
            <input className="input" value={fields.subtitle} onChange={set('subtitle')} />
          </Field>
          <div className="form-row">
            <Field label={t('角标', 'Badge')}>
              <input className="input" placeholder={t('干货 / NEW', 'NEW / GUIDE')} value={fields.badge} onChange={set('badge')} />
            </Field>
            <Field label="Emoji">
              <input className="input" placeholder="🚀" value={fields.emoji} onChange={set('emoji')} />
            </Field>
          </div>
          <Field label={t('作者', 'Author')}>
            <input className="input" value={fields.author} onChange={set('author')} />
          </Field>
          <Field label={t('标签（逗号分隔）', 'Tags (comma separated)')}>
            <input className="input" value={fields.tags} onChange={set('tags')} />
          </Field>
          <div className="form-row">
            <ColorField label={t('强调色', 'Accent')} value={accent} fallback={tplAccent} onChange={setAccent} />
            <Field label={t('背景图', 'Background')}>
              <span className="file-btn">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setBg(await readFileAsDataUrl(f));
                  }}
                />
                {bg ? t('更换', 'Change') : t('上传', 'Upload')}
              </span>
              {bg && (
                <button type="button" className="link-btn" onClick={() => setBg('')}>
                  {t('移除', 'Remove')}
                </button>
              )}
            </Field>
          </div>
          <button type="button" className="link-btn" onClick={() => setOverrides({})}>
            {t('重置为文章信息', 'Reset to article info')}
          </button>
        </aside>
      </div>
    </div>
  );
}
