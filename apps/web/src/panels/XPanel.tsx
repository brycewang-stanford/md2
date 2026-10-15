import { useMemo } from 'react';
import { renderX } from '@md2/core';
import { Button, Select, Toggle, Warnings, toast, Icon } from '../components/ui';
import { copyPlain } from '../lib/clipboard';
import { usePersistent } from '../lib/store';
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

export function XPanel({ doc }: PanelProps) {
  const [limit, setLimit] = usePersistent('x.limit', 280);
  const [numbering, setNumbering] = usePersistent('x.numbering', true);
  const [titleFirst, setTitleFirst] = usePersistent('x.titleFirst', true);
  const [includeCode, setIncludeCode] = usePersistent('x.includeCode', false);
  const [handle, setHandle] = usePersistent('x.handle', '');

  const { tweets, warnings } = useMemo(() => renderX(doc, { limit, numbering, titleFirst, includeCode }), [doc, limit, numbering, titleFirst, includeCode]);
  const name = handle.replace(/^@/, '') || String(doc.frontmatter.author ?? 'md2');

  return (
    <div className="panel">
      <div className="panel-bar">
        <div className="panel-opts">
          <Select
            value={limit}
            options={[
              { value: 280, label: '标准 280' },
              { value: 4000, label: 'Premium 4000' },
              { value: 25000, label: 'Premium+ 25000' },
            ]}
            onChange={setLimit}
          />
          <Toggle label="编号 1/n" checked={numbering} onChange={setNumbering} />
          <Toggle label="标题开头 🧵" checked={titleFirst} onChange={setTitleFirst} />
          <Toggle label="包含代码" checked={includeCode} onChange={setIncludeCode} />
          <input className="input input-sm" placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
        </div>
        <div className="panel-actions">
          <Button icon="external" href={`https://x.com/intent/post?text=${encodeURIComponent(tweets[0]?.text ?? '')}`} title="在 X 发布第一条" />
          <Button variant="primary" icon="copy" onClick={() => copyPlain(tweets.map((t) => t.text).join('\n\n———\n\n')).then(() => toast(`已复制 ${tweets.length} 条`))}>
            复制整串
          </Button>
        </div>
      </div>
      <Warnings items={warnings} />
      <div className="preview-scroll">
        <div className="x-thread">
          {tweets.map((t, i) => (
            <div className="x-post" key={i}>
              <div className="x-rail">
                <span className="x-avatar">{name.slice(0, 1).toUpperCase()}</span>
                {i < tweets.length - 1 && <span className="x-line" />}
              </div>
              <div className="x-main">
                <div className="x-who">
                  <b>{name}</b> <span>@{name.toLowerCase().replace(/\s+/g, '')}</span>
                </div>
                <div className="x-text">{t.text}</div>
                {t.images.length > 0 && (
                  <div className={`x-media n${Math.min(4, t.images.length)}`}>
                    {t.images.map((src) => (
                      <img key={src} src={src} alt="" />
                    ))}
                  </div>
                )}
                <div className="x-foot">
                  <Ring value={t.length} max={limit} />
                  <button type="button" className="x-copy" onClick={() => copyPlain(t.text).then(() => toast(`已复制第 ${i + 1} 条`))}>
                    <Icon name="copy" size={14} /> 复制
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
