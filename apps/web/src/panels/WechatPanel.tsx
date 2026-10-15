import { useEffect, useMemo, useRef } from 'react';
import { renderWechat } from '@md2/core';
import { Button, Toggle, Warnings, toast } from '../components/ui';
import { copyRich, download } from '../lib/clipboard';
import { resolveAsset } from '../lib/assets';
import { usePersistent } from '../lib/store';
import { StyleBar, styleOptions } from './StyleBar';
import type { PanelProps } from './types';

export function WechatPanel({ doc, style, setStyle, scrollRatio }: PanelProps) {
  const [linkRefs, setLinkRefs] = usePersistent('wx.linkRefs', true);
  const [mac, setMac] = usePersistent('wx.mac', true);
  const [removeTitle, setRemoveTitle] = usePersistent('wx.removeTitle', true);
  const scroller = useRef<HTMLDivElement>(null);

  const result = useMemo(
    () => renderWechat(doc, { ...styleOptions(style), linkReferences: linkRefs, macCodeBlock: mac, removeTitle, resolveImage: resolveAsset }),
    [doc, style, linkRefs, mac, removeTitle],
  );

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = scrollRatio * (el.scrollHeight - el.clientHeight);
  }, [scrollRatio]);

  const localImages = result.warnings.filter((w) => w.code === 'local-image').length + (/src="data:/.test(result.html) ? 1 : 0);

  const copy = async () => {
    try {
      await copyRich(result.html, doc.markdown);
      toast('已复制，去公众号后台编辑器粘贴即可');
    } catch {
      toast('复制失败，请重试', 'err');
    }
  };

  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="panel-opts">
          <StyleBar style={style} setStyle={setStyle} />
          <Toggle label="外链转脚注" checked={linkRefs} onChange={setLinkRefs} />
          <Toggle label="Mac 代码块" checked={mac} onChange={setMac} />
          <Toggle label="去掉 H1" checked={removeTitle} onChange={setRemoveTitle} />
        </div>
        <div className="panel-actions">
          <Button icon="download" onClick={() => download(`${doc.title || 'article'}.html`, result.html, 'text/html')} title="下载 HTML" />
          <Button variant="primary" icon="copy" onClick={copy}>
            复制到公众号
          </Button>
        </div>
      </div>
      <Warnings items={localImages ? [{ message: '本地 / 粘贴的图片不能直接粘到公众号，请先上传到图床，或使用 CLI 的 md2 publish wechat 自动上传' }] : []} />
      <div className="preview-scroll" ref={scroller}>
        <div className="phone">
          <div className="phone-notch" />
          <div className="phone-screen">
            <div className="wx-head">
              <h1 className="wx-title">{doc.title || '未命名文章'}</h1>
              <div className="wx-meta">
                <span className="wx-author">{String(doc.frontmatter.author ?? 'md2')}</span>
                <span>{new Date().toLocaleDateString('zh-CN')}</span>
              </div>
            </div>
            <div className="wx-body" dangerouslySetInnerHTML={{ __html: result.html }} />
          </div>
        </div>
      </div>
    </div>
  );
}
