import { useMemo, useRef, useState } from 'react';
import { renderLongImage } from '@md2/core';
import { Button, Select, Toggle, Warnings, toast } from '../components/ui';
import { host } from '../lib/host';
import { elementToPng } from '../lib/image';
import { resolveAsset } from '../lib/assets';
import { usePersistent } from '../lib/store';
import { t } from '../lib/i18n';
import { usePrimaryAction } from '../lib/actions';
import { StyleBar, styleOptions } from './StyleBar';
import type { PanelProps } from './types';

/** 长图: the whole article as one tall image for 朋友圈 / 微博 / 小红书. */
export function LongPanel({ doc, style, setStyle, diagram }: PanelProps) {
  const [width, setWidth] = usePersistent('long.width', 540);
  const [header, setHeader] = usePersistent('long.header', true);
  const [footer, setFooter] = usePersistent('long.footer', '');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const result = useMemo(
    () => renderLongImage(doc, { ...styleOptions(style), width, header, footer: footer || undefined, resolveImage: resolveAsset, diagram }),
    [doc, style, width, header, footer, diagram],
  );

  const exportPng = async () => {
    const el = ref.current?.querySelector<HTMLElement>('.md2-long');
    if (!el) return;
    setBusy(true);
    try {
      const blob = await elementToPng(el, 2);
      await host.save(`${doc.title || 'md2'}-long.png`, blob);
      toast(t(`已导出 ${width * 2}px 宽长图`, `Exported a ${width * 2}px-wide image`));
    } catch (e) {
      console.error('md2: export failed', e);
      toast(t('导出失败（外链图片跨域？）', 'Export failed (cross-origin image?)'), 'err');
    } finally {
      setBusy(false);
    }
  };
  usePrimaryAction(exportPng);

  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="panel-opts">
          <StyleBar style={style} setStyle={setStyle} />
          <Select
            value={width}
            options={[
              { value: 375, label: t('窄 750px', 'Narrow 750px') },
              { value: 540, label: t('标准 1080px', 'Standard 1080px') },
              { value: 640, label: t('宽 1280px', 'Wide 1280px') },
            ]}
            onChange={setWidth}
          />
          <Toggle label={t('标题头', 'Header')} checked={header} onChange={setHeader} />
          <input className="input input-sm" placeholder={t('页脚文字', 'Footer text')} value={footer} onChange={(e) => setFooter(e.target.value)} />
        </div>
        <div className="panel-actions">
          <Button variant="primary" icon="download" onClick={exportPng} disabled={busy}>
            {busy ? t('导出中…', 'Exporting…') : t('导出长图', 'Export image')}
          </Button>
        </div>
      </div>
      <Warnings items={result.warnings.filter((w) => w.code !== 'local-image')} />
      <div className="preview-scroll">
        <div className="long-frame" ref={ref} dangerouslySetInnerHTML={{ __html: result.html }} />
      </div>
    </div>
  );
}
