import { useEffect, useMemo, useRef, useState } from 'react';
import { renderWechat, isPublicImage, zhihuImageCandidates, type WechatSuggestion } from '@md2/core';
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

  const opts = { ...styleOptions(style), linkReferences: linkRefs, macCodeBlock: mac, removeTitle, diagram };
  const result = useMemo(() => renderWechat(doc, { ...opts, resolveImage: resolveAsset }), [doc, style, linkRefs, mac, removeTitle, diagram]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = scrollRatio * (el.scrollHeight - el.clientHeight);
  }, [scrollRatio]);

  // Images WeChat's servers can't fetch: local files / webview URIs, and SVG or raw.githubusercontent.com URLs
  const unhosted = doc.images.filter((s) => !s.startsWith('asset:') && (!isPublicImage(s) || zhihuImageCandidates(s).length > 0));
  // VS Code maps these to public URLs at copy time; the web app can only warn
  const localImages = host.publicImages
    ? doc.images.some((s) => s.startsWith('asset:'))
    : result.warnings.some((w) => w.code === 'local-image') || /src="(data|blob|https:\/\/file\+)/.test(result.html);

  // The WeChat editor re-hosts every pasted image by fetching its src from its own
  // servers (有 N 个内容插入失败 otherwise), so swap preview URLs for public ones
  const copy = async () => {
    try {
      let html = result.html;
      const map: Record<string, string> = {};
      let pub: { inlined: string[]; unreachable: string[] } = { inlined: [], unreachable: [] };
      let uploadError: string | undefined;
      // 1. API credentials saved (「发布到草稿箱」): upload to WeChat's own CDN, nothing left for its fetcher to fail on
      const uploadable = doc.images.filter((s) => !s.startsWith('asset:') && !/^https?:\/\/mmbiz\.qpic\.cn\//i.test(s));
      if (host.wechatImages && uploadable.length) {
        toast(t(`正在上传 ${uploadable.length} 张图片到公众号…`, `Uploading ${uploadable.length} images to WeChat…`));
        const w = await host.wechatImages(uploadable);
        if (w) {
          Object.assign(map, w.map);
          uploadError = w.error;
        }
      }
      // 2. Anything not uploaded: public URLs WeChat's servers can fetch (jsDelivr / image_base), base64 as a last resort
      const rest = unhosted.filter((s) => !map[s]);
      if (host.publicImages && rest.length) {
        if (!Object.keys(map).length) toast(t(`正在准备 ${rest.length} 张图片…`, `Preparing ${rest.length} images…`));
        const r = await host.publicImages(rest, doc.frontmatter.image_base as string | undefined);
        Object.assign(map, r.map);
        pub = r;
      }
      if (Object.keys(map).length) html = renderWechat(doc, { ...opts, resolveImage: (s) => map[s] ?? resolveAsset(s) }).html;
      if (uploadError) console.warn('md2: WeChat image upload failed, using public URLs:', uploadError);
      await host.copyRich(html, doc.markdown);
      const broken = [...html.matchAll(/<img[^>]+src="([^"]*)"/g)].filter((m) => !isPublicImage(m[1].replace(/&amp;/g, '&'))).length;
      if (broken) toast(t(`已复制，但 ${broken} 张图片公众号无法抓取（文件不存在？）`, `Copied, but WeChat can’t fetch ${broken} images (missing files?)`), 'err');
      else if (pub.inlined.length)
        toast(
          t(
            `已复制；${pub.inlined.length} 张图片未推送到 GitHub，已内嵌为 base64，公众号可能插入失败 —— 请先 git push、设置 image_base，或用「发布到草稿箱」`,
            `Copied; ${pub.inlined.length} unpushed images inlined as base64, which WeChat may reject — git push, set image_base, or use “Publish draft”`,
          ),
          'err',
        );
      else if (pub.unreachable.length) toast(t(`已复制，但 ${pub.unreachable.length} 张远程图片可能无法插入`, `Copied, but ${pub.unreachable.length} remote images may fail`), 'err');
      else if (uploadError) toast(t(`已复制（图片上传公众号失败，已改用外链：${uploadError}）`, `Copied (WeChat upload failed, using public URLs: ${uploadError})`), 'err');
      else toast(t('已复制，去公众号后台编辑器粘贴即可', 'Copied — paste into the WeChat editor'));
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
