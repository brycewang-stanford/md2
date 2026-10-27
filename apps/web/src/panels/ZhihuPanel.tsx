import { useEffect, useMemo, useRef } from 'react';
import { renderZhihu, isPublicImage, zhihuImageCandidates } from '@md2/core';
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
  const opts = { linksAsReferences: linksAsRefs, nativeReferences: nativeRefs };
  const result = useMemo(() => renderZhihu(doc, { ...opts, resolveImage: resolveAsset }), [doc, linksAsRefs, nativeRefs]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = scrollRatio * (el.scrollHeight - el.clientHeight);
  }, [scrollRatio]);

  // Zhihu re-fetches every pasted image from its own servers, so the preview's
  // local/webview URLs are swapped for public ones (or data URLs) at copy time
  const copy = async () => {
    try {
      let out = result;
      const map: Record<string, string> = {};
      let inlined: string[] = [];
      let unreachable = 0;
      let uploadError: string | undefined;
      const upload = async (srcs: string[], prompt: boolean) => {
        const z = await host.zhihuImages!(srcs, prompt);
        if (z) {
          Object.assign(map, z.map);
          uploadError = z.error;
        }
        return z;
      };
      // 1. Login cookie saved: upload to zhimg.com, nothing left for Zhihu's fetcher to fail on
      const uploadable = doc.images.filter((s) => !s.startsWith('asset:') && !/^https?:\/\/[^/]*\.zhimg\.com\//i.test(s));
      let saved = null;
      if (host.zhihuImages && uploadable.length) {
        toast(t(`正在准备 ${uploadable.length} 张图片…`, `Preparing ${uploadable.length} images…`));
        saved = await upload(uploadable, false);
      }
      // 2. The rest: public URLs (pushed to a public GitHub repo / image_base), base64 as a last resort.
      // Local files, plus remote SVG / GitHub raw images whose alternatives get verified
      const pending = doc.images.filter((s) => !map[s] && !s.startsWith('asset:') && (!isPublicImage(s) || zhihuImageCandidates(s).length));
      if (host.publicImages && pending.length) {
        if (!host.zhihuImages) toast(t(`正在准备 ${pending.length} 张图片…`, `Preparing ${pending.length} images…`));
        const pub = await host.publicImages(pending, doc.frontmatter.image_base as string | undefined);
        for (const [s, u] of Object.entries(pub.map)) map[s] ??= u;
        inlined = pub.inlined;
        unreachable = pub.unreachable?.length ?? 0;
      }
      // 3. Zhihu rejects base64, so with no cookie saved, ask for one and upload those
      if (inlined.length && host.zhihuImages && !saved) {
        const z = await upload(inlined, true);
        if (z) inlined = inlined.filter((s) => !z.map[s]);
      }
      if (Object.keys(map).length) out = renderZhihu(doc, { ...opts, resolveImage: (s) => map[s] ?? resolveAsset(s) });
      if (uploadError) console.warn('md2: Zhihu image upload failed, using public URLs:', uploadError);
      await host.copyRich(out.html, out.text);
      const broken = out.warnings.filter((w) => w.code === 'local-image').length;
      if (broken) toast(t(`已复制，但 ${broken} 张图片知乎无法抓取（文件不存在？）`, `Copied, but Zhihu can’t fetch ${broken} images (missing files?)`), 'err');
      else if (inlined.length)
        toast(
          t(
            `已复制，但 ${inlined.length} 张本地图片没有公开地址，知乎会导入失败${uploadError ? `（上传知乎失败：${uploadError}）` : ''}：运行「md2: Set Zhihu Cookie」自动上传，或推送到公开仓库 / 设置 image_base`,
            `Copied, but ${inlined.length} local images have no public URL and will fail on Zhihu${uploadError ? ` (upload failed: ${uploadError})` : ''} — run “md2: Set Zhihu Cookie”, push to a public repo, or set image_base`,
          ),
          'err',
        );
      else if (unreachable) toast(t(`已复制，但 ${unreachable} 张远程图片的备用地址都无法访问，知乎可能上传失败`, `Copied, but ${unreachable} remote images had no reachable alternative`), 'err');
      else if (uploadError) toast(t(`已复制（图片上传知乎失败，已改用外链：${uploadError}）`, `Copied (Zhihu upload failed, using public URLs: ${uploadError})`), 'err');
      else toast(t('已复制，打开知乎写文章页粘贴', 'Copied — paste into Zhihu’s editor'));
    } catch (e) {
      console.error('md2: export failed', e);
      toast(t('复制失败，请重试', 'Copy failed, try again'), 'err');
    }
  };
  usePrimaryAction(copy);

  const warnings = [
    // VS Code resolves local images at copy time; only flag what it can't
    ...result.warnings.filter((w) => !(host.publicImages && w.code === 'local-image' && /vscode-(resource|cdn|webview)/.test(w.message))),
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
