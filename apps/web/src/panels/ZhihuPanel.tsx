import { useEffect, useMemo, useRef } from 'react';
import { renderZhihu } from '@md2/core';
import { Button, Toggle, Warnings, toast } from '../components/ui';
import { host } from '../lib/host';
import { resolveAsset } from '../lib/assets';
import { usePersistent } from '../lib/store';
import { t } from '../lib/i18n';
import { usePrimaryAction } from '../lib/actions';
import type { PanelProps } from './types';

export function ZhihuPanel({ doc, scrollRatio }: PanelProps) {
  const [linksAsRefs, setLinksAsRefs] = usePersistent('zh.linksAsRefs', false);
  const [nativeRefs, setNativeRefs] = usePersistent('zh.nativeRefs', true);
  const scroller = useRef<HTMLDivElement>(null);
  const result = useMemo(
    () => renderZhihu(doc, { linksAsReferences: linksAsRefs, nativeReferences: nativeRefs, resolveImage: resolveAsset }),
    [doc, linksAsRefs, nativeRefs],
  );

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = scrollRatio * (el.scrollHeight - el.clientHeight);
  }, [scrollRatio]);

  const copy = async () => {
    try {
      await host.copyRich(result.html, result.text);
      toast(t('已复制，打开知乎写文章页粘贴', 'Copied — paste into Zhihu’s editor'));
    } catch {
      toast(t('复制失败，请重试', 'Copy failed, try again'), 'err');
    }
  };
  usePrimaryAction(copy);

  const warnings = [
    ...result.warnings,
    ...(doc.diagrams.length ? [{ message: t('知乎不支持内联 SVG：流程图会以代码块粘贴，可在「长图」或「小红书」标签导出图片后插入', 'Zhihu has no inline SVG: diagrams paste as code — export them as images from the Long image or XHS tab') }] : []),
  ];

  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="panel-opts">
          <Toggle label={t('脚注 → 知乎参考文献', 'Footnotes → references')} checked={nativeRefs} onChange={setNativeRefs} />
          <Toggle label={t('外链 → 参考文献', 'Links → references')} checked={linksAsRefs} onChange={setLinksAsRefs} />
          <span className="hint">{t('公式使用知乎原生公式，代码块保留语言，粘贴后即可编辑', 'Formulas become native Zhihu equations; code keeps its language')}</span>
        </div>
        <div className="panel-actions">
          <Button icon="download" onClick={() => host.save(`${doc.title || 'zhihu'}.html`, result.html, 'text/html')} title={t('下载 HTML', 'Download HTML')} />
          <Button icon="external" onClick={() => host.openExternal('https://zhuanlan.zhihu.com/write')} title={t('打开知乎写文章', 'Open Zhihu editor')} />
          <Button variant="primary" icon="copy" onClick={copy}>
            {t('复制到知乎', 'Copy for Zhihu')}
          </Button>
        </div>
      </div>
      <Warnings items={warnings} />
      <div className="preview-scroll" ref={scroller}>
        <article className="zh-page">
          <h1 className="zh-title">{doc.title || t('未命名文章', 'Untitled')}</h1>
          <div className="zh-author">
            <span className="zh-avatar">{String(doc.frontmatter.author ?? 'md2').slice(0, 1).toUpperCase()}</span>
            <span>{String(doc.frontmatter.author ?? 'md2')}</span>
          </div>
          <div className="zh-body" dangerouslySetInnerHTML={{ __html: result.html }} />
        </article>
      </div>
    </div>
  );
}
