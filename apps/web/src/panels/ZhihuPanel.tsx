import { useEffect, useMemo, useRef } from 'react';
import { renderZhihu } from '@md2/core';
import { Button, Toggle, Warnings, toast } from '../components/ui';
import { copyRich, download } from '../lib/clipboard';
import { resolveAsset } from '../lib/assets';
import { usePersistent } from '../lib/store';
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
      await copyRich(result.html, result.text);
      toast('已复制，打开知乎写文章页粘贴');
    } catch {
      toast('复制失败，请重试', 'err');
    }
  };

  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="panel-opts">
          <Toggle label="脚注 → 知乎参考文献" checked={nativeRefs} onChange={setNativeRefs} />
          <Toggle label="外链 → 参考文献" checked={linksAsRefs} onChange={setLinksAsRefs} />
          <span className="hint">公式使用知乎原生公式，代码块保留语言，粘贴后即可编辑</span>
        </div>
        <div className="panel-actions">
          <Button icon="download" onClick={() => download(`${doc.title || 'zhihu'}.html`, result.html, 'text/html')} title="下载 HTML" />
          <Button icon="external" href="https://zhuanlan.zhihu.com/write" title="打开知乎写文章" />
          <Button variant="primary" icon="copy" onClick={copy}>
            复制到知乎
          </Button>
        </div>
      </div>
      <Warnings items={result.warnings} />
      <div className="preview-scroll" ref={scroller}>
        <article className="zh-page">
          <h1 className="zh-title">{doc.title || '未命名文章'}</h1>
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
