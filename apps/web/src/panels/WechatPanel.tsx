import { useEffect, useMemo, useRef, useState } from 'react';
import { renderWechat, type WechatSuggestion } from '@md2/core';
import { Button, Toggle, Warnings, toast, Icon } from '../components/ui';
import { AiButton } from '../components/ai';
import { host } from '../lib/host';
import { resolveAsset } from '../lib/assets';
import { usePersistent } from '../lib/store';
import { t } from '../lib/i18n';
import { usePrimaryAction } from '../lib/actions';
import { StyleBar, styleOptions } from './StyleBar';
import type { PanelProps } from './types';

export function WechatPanel({ doc, style, setStyle, scrollRatio, diagram }: PanelProps) {
  const [linkRefs, setLinkRefs] = usePersistent('wx.linkRefs', true);
  const [mac, setMac] = usePersistent('wx.mac', true);
  const [removeTitle, setRemoveTitle] = usePersistent('wx.removeTitle', true);
  const [ai, setAi] = useState<WechatSuggestion | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const result = useMemo(
    () => renderWechat(doc, { ...styleOptions(style), linkReferences: linkRefs, macCodeBlock: mac, removeTitle, resolveImage: resolveAsset, diagram }),
    [doc, style, linkRefs, mac, removeTitle, diagram],
  );

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = scrollRatio * (el.scrollHeight - el.clientHeight);
  }, [scrollRatio]);

  const localImages = result.warnings.some((w) => w.code === 'local-image') || /src="(data|blob|https:\/\/file\+)/.test(result.html);

  const copy = async () => {
    try {
      await host.copyRich(result.html, doc.markdown);
      toast(t('已复制，去公众号后台编辑器粘贴即可', 'Copied — paste into the WeChat editor'));
    } catch (e) {
      console.error('md2: export failed', e);
      toast(t('复制失败，请重试', 'Copy failed, try again'), 'err');
    }
  };
  usePrimaryAction(copy);

  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="panel-opts">
          <StyleBar style={style} setStyle={setStyle} />
          <Toggle label={t('外链转脚注', 'Links → refs')} checked={linkRefs} onChange={setLinkRefs} />
          <Toggle label={t('Mac 代码块', 'Mac code')} checked={mac} onChange={setMac} />
          <Toggle label={t('去掉 H1', 'Drop H1')} checked={removeTitle} onChange={setRemoveTitle} />
        </div>
        <div className="panel-actions">
          <AiButton<WechatSuggestion> task="wechat" label={t('标题 & 摘要', 'Titles')} onResult={setAi} />
          <Button icon="download" onClick={() => host.save(`${doc.title || 'article'}.html`, result.html, 'text/html')} title={t('下载 HTML', 'Download HTML')} />
          <Button variant="primary" icon="copy" onClick={copy}>
            {t('复制到公众号', 'Copy for WeChat')}
          </Button>
        </div>
      </div>
      <Warnings items={localImages ? [{ message: t('本地 / 粘贴的图片不能直接粘到公众号：请先上传图床，或用「发布到草稿箱」自动上传', 'Local images can’t be pasted into WeChat — host them online or use “Publish draft”, which uploads them') }] : []} />
      {ai && (
        <div className="suggest">
          <div className="suggest-head">
            <span><Icon name="wand" size={14} /> {t('AI 标题建议（点击复制）', 'AI headlines (click to copy)')}</span>
            <button type="button" className="icon-btn" onClick={() => setAi(null)}><Icon name="close" size={14} /></button>
          </div>
          <div className="suggest-list">
            {ai.titles.map((x) => (
              <button key={x} type="button" className="chip" onClick={() => host.copyText(x).then(() => toast(t('已复制标题', 'Title copied')))}>{x}</button>
            ))}
          </div>
          <button type="button" className="suggest-digest" onClick={() => host.copyText(ai.digest).then(() => toast(t('已复制摘要', 'Digest copied')))}>
            <b>{t('摘要', 'Digest')}</b> {ai.digest}
          </button>
        </div>
      )}
      <div className="preview-scroll" ref={scroller}>
        <div className="phone">
          <div className="phone-notch" />
          <div className="phone-screen">
            <div className="wx-head">
              <h1 className="wx-title">{doc.title || t('未命名文章', 'Untitled')}</h1>
              <div className="wx-meta">
                <span className="wx-author">{String(doc.frontmatter.author ?? 'md2')}</span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
            </div>
            <div className="wx-body" dangerouslySetInnerHTML={{ __html: result.html }} />
          </div>
        </div>
      </div>
    </div>
  );
}
