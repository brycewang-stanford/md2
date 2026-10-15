import { useEffect, useMemo, useRef, useState } from 'react';
import { renderCover, coverTemplates, coverSizes, type CoverSizeId, type CoverTemplateId, type CoverOptions } from '@md2/core';
import { mountCover } from '@md2/core/dom';
import { Button, ColorField, Field, toast } from '../components/ui';
import { download } from '../lib/clipboard';
import { elementToPng, readFileAsDataUrl, zipPngs } from '../lib/image';
import { usePersistent } from '../lib/store';
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
      title: fields.title || '未命名标题',
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
      download(`cover-${size}-${tpl}.png`, await elementToPng(main));
      toast(`已导出 ${sz.width}×${sz.height}`);
    } catch {
      toast('导出失败', 'err');
    }
  };

  const exportAllSizes = async () => {
    const host = document.createElement('div');
    host.className = 'offscreen';
    document.body.appendChild(host);
    try {
      const files = [];
      for (const id of Object.keys(coverSizes) as CoverSizeId[]) {
        const el = mountCover(host, renderCover({ ...opts, size: id }));
        files.push({ name: `cover-${id}.png`, blob: await elementToPng(el) });
      }
      download(`${doc.title || 'md2'}-covers.zip`, await zipPngs(files));
      toast(`已导出 ${files.length} 个尺寸`);
    } catch {
      toast('导出失败', 'err');
    } finally {
      host.remove();
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
          <Button icon="download" variant="soft" onClick={exportAllSizes}>
            全部尺寸
          </Button>
          <Button variant="primary" icon="download" onClick={exportOne}>
            导出 PNG
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
          <Field label="标题（换行用回车，==重点== 高亮）">
            <textarea className="input" rows={3} value={fields.title} onChange={set('title')} />
          </Field>
          <Field label="副标题">
            <input className="input" value={fields.subtitle} onChange={set('subtitle')} />
          </Field>
          <div className="form-row">
            <Field label="角标">
              <input className="input" placeholder="干货 / NEW" value={fields.badge} onChange={set('badge')} />
            </Field>
            <Field label="Emoji">
              <input className="input" placeholder="🚀" value={fields.emoji} onChange={set('emoji')} />
            </Field>
          </div>
          <Field label="作者">
            <input className="input" value={fields.author} onChange={set('author')} />
          </Field>
          <Field label="标签（逗号分隔）">
            <input className="input" value={fields.tags} onChange={set('tags')} />
          </Field>
          <div className="form-row">
            <ColorField label="强调色" value={accent} fallback={tplAccent} onChange={setAccent} />
            <Field label="背景图">
              <span className="file-btn">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setBg(await readFileAsDataUrl(f));
                  }}
                />
                {bg ? '更换' : '上传'}
              </span>
              {bg && (
                <button type="button" className="link-btn" onClick={() => setBg('')}>
                  移除
                </button>
              )}
            </Field>
          </div>
          <button type="button" className="link-btn" onClick={() => setOverrides({})}>
            重置为文章信息
          </button>
        </aside>
      </div>
    </div>
  );
}
