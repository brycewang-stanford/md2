import { useMemo, useState } from 'react';
import { renderX, socialPlatforms, type SocialPlatformId, type ThreadSuggestion, type Tweet } from '@md2/core';
import { Button, Select, Toggle, Warnings, toast, Icon } from '../components/ui';
import { AiButton } from '../components/ai';
import { host } from '../lib/host';
import { usePersistent } from '../lib/store';
import { t } from '../lib/i18n';
import { usePrimaryAction } from '../lib/actions';
import type { PanelProps } from './types';

function Ring({ value, max }: { value: number; max: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, value / max);
  const color = value > max ? '#f4212e' : p > 0.9 ? '#ffd400' : '#1d9bf0';
  return (
    <span className="ring" title={`${value}/${max}`}>
      <svg width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
        <circle cx="11" cy="11" r={r} fill="none" stroke={color} strokeWidth="2" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 11 11)" strokeLinecap="round" />
      </svg>
      <span>{max - value}</span>
    </span>
  );
}

const PLATFORM_ICONS: Record<SocialPlatformId, string> = { x: '𝕏', threads: '@', bluesky: '🦋', mastodon: '🐘', linkedin: 'in' };

export function ThreadPanel({ doc }: PanelProps) {
  const [platformId, setPlatformId] = usePersistent<SocialPlatformId>('thread.platform', 'x');
  const [limitByPlatform, setLimitByPlatform] = usePersistent<Record<string, number>>('thread.limits', {});
  const [numbering, setNumbering] = usePersistent('thread.numbering', true);
  const [titleFirst, setTitleFirst] = usePersistent('thread.titleFirst', true);
  const [includeCode, setIncludeCode] = usePersistent('thread.includeCode', false);
  const [handle, setHandle] = usePersistent('thread.handle', '');
  const [ai, setAi] = useState<{ platform: SocialPlatformId; posts: string[] } | null>(null);

  const platform = socialPlatforms[platformId];
  const limit = limitByPlatform[platformId] ?? platform.limit;
  const auto = useMemo(
    () => renderX(doc, { platform: platformId, limit, numbering: platform.numbering ? numbering : false, titleFirst, includeCode }),
    [doc, platformId, limit, numbering, titleFirst, includeCode, platform.numbering],
  );

  // AI posts get the same counting and numbering as the automatic split
  const tweets: Tweet[] = useMemo(() => {
    if (!ai || ai.platform !== platformId) return auto.tweets;
    const n = ai.posts.length;
    return ai.posts.map((p, i) => {
      const text = platform.numbering && numbering && n > 1 ? `${p} ${i + 1}/${n}` : p;
      return { text, length: platform.count(text), images: [] };
    });
  }, [ai, auto, platformId, platform, numbering]);

  const copyAll = () => host.copyText(tweets.map((x) => x.text).join('\n\n———\n\n')).then(() => toast(t(`已复制 ${tweets.length} 条`, `Copied ${tweets.length} posts`)));
  usePrimaryAction(copyAll);
  const name = handle.replace(/^@/, '') || String(doc.frontmatter.author ?? 'md2');
  const limits =
    platformId === 'x'
      ? [{ value: 280, label: t('标准 280', 'Standard 280') }, { value: 4000, label: 'Premium 4000' }, { value: 25000, label: 'Premium+ 25000' }]
      : [{ value: platform.limit, label: `${platform.limit}` }];

  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="panel-opts">
          <div className="seg">
            {Object.values(socialPlatforms).map((p) => (
              <button key={p.id} type="button" className={p.id === platformId ? 'is-active' : ''} onClick={() => setPlatformId(p.id)}>
                <span className="seg-icon">{PLATFORM_ICONS[p.id]}</span> {p.name}
              </button>
            ))}
          </div>
          {limits.length > 1 && <Select value={limit} options={limits} onChange={(v) => setLimitByPlatform({ ...limitByPlatform, [platformId]: v })} />}
          {platform.numbering && <Toggle label={t('编号 1/n', 'Number 1/n')} checked={numbering} onChange={setNumbering} />}
          <Toggle label={t('标题开头', 'Title first')} checked={titleFirst} onChange={setTitleFirst} />
          <Toggle label={t('包含代码', 'Include code')} checked={includeCode} onChange={setIncludeCode} />
          <input className="input input-sm" placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
        </div>
        <div className="panel-actions">
          <AiButton<ThreadSuggestion> task="thread" platform={platformId} label={t('AI 改写', 'AI rewrite')} onResult={(r) => setAi({ platform: platformId, posts: r.posts })} />
          {platform.intent && <Button icon="external" onClick={() => host.openExternal(platform.intent!(tweets[0]?.text ?? ''))} title={t(`在 ${platform.name} 发布第一条`, `Post the first one on ${platform.name}`)} />}
          <Button variant="primary" icon="copy" onClick={copyAll}>
            {platform.id === 'linkedin' ? t('复制帖子', 'Copy post') : t('复制整串', 'Copy thread')}
          </Button>
        </div>
      </div>
      <Warnings items={auto.warnings} />
      {ai && ai.platform === platformId && (
        <div className="suggest">
          <div className="suggest-head">
            <span><Icon name="wand" size={14} /> {t('当前显示 AI 改写版本', 'Showing the AI rewrite')}</span>
            <button type="button" className="link-btn" onClick={() => setAi(null)}>{t('用回自动拆分', 'Back to automatic split')}</button>
          </div>
        </div>
      )}
      <div className="preview-scroll">
        <div className="x-thread">
          {tweets.map((tw, i) => (
            <div className="x-post" key={i}>
              <div className="x-rail">
                <span className="x-avatar">{name.slice(0, 1).toUpperCase()}</span>
                {i < tweets.length - 1 && <span className="x-line" />}
              </div>
              <div className="x-main">
                <div className="x-who">
                  <b>{name}</b> <span>@{name.toLowerCase().replace(/\s+/g, '')} · {platform.name}</span>
                </div>
                <div className="x-text">{tw.text}</div>
                {tw.images.length > 0 && (
                  <div className={`x-media n${Math.min(4, tw.images.length)}`}>
                    {tw.images.map((src) => (
                      <img key={src} src={src} alt="" />
                    ))}
                  </div>
                )}
                <div className="x-foot">
                  <Ring value={tw.length} max={limit} />
                  <button type="button" className="x-copy" onClick={() => host.copyText(tw.text).then(() => toast(t(`已复制第 ${i + 1} 条`, `Copied post ${i + 1}`)))}>
                    <Icon name="copy" size={14} /> {t('复制', 'Copy')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
