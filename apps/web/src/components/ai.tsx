import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { aiPresets, DEFAULT_CLAUDE_MODEL, type AiConfig, type SocialPlatformId } from '@md2/core';
import { host, type AiTask } from '../lib/host';
import { usePersistent } from '../lib/store';
import { t } from '../lib/i18n';
import { Button, Field, Icon, Select, toast } from './ui';

interface AiState {
  /** Config without the key on VS Code (the key lives in SecretStorage) */
  cfg: AiConfig | null;
  configured: boolean;
  openSettings: () => void;
  run: <T>(task: AiTask, platform?: SocialPlatformId) => Promise<T | null>;
  busy: AiTask | null;
}

const Ctx = createContext<AiState | null>(null);

export function useAi(): AiState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AiProvider missing');
  return v;
}

export function AiProvider({ markdown, children }: { markdown: string; children: ReactNode }) {
  const [cfg, setCfg] = usePersistent<AiConfig | null>('ai.config', null);
  const [hostConfigured, setHostConfigured] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<AiTask | null>(null);

  useEffect(() => {
    if (host.aiConfigured) void host.aiConfigured().then(setHostConfigured).catch(() => {});
  }, []);

  const configured = host.kind === 'vscode' ? hostConfigured : !!cfg && (cfg.provider === 'openai' ? !!cfg.baseURL : !!cfg.apiKey);

  const run = useCallback(
    async <T,>(task: AiTask, platform: SocialPlatformId = 'x'): Promise<T | null> => {
      if (!configured) {
        setOpen(true);
        return null;
      }
      setBusy(task);
      try {
        return (await host.ai(task, markdown, platform, cfg)) as T;
      } catch (e) {
        toast((e as Error).message.slice(0, 160), 'err');
        return null;
      } finally {
        setBusy(null);
      }
    },
    [configured, markdown, cfg],
  );

  const value = useMemo<AiState>(() => ({ cfg, configured, openSettings: () => setOpen(true), run, busy }), [cfg, configured, run, busy]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {open && (
        <AiSettings
          initial={cfg}
          onClose={() => setOpen(false)}
          onSave={async (next) => {
            if (host.saveAiConfig) {
              await host.saveAiConfig(next);
              setCfg({ ...next, apiKey: '' });
              setHostConfigured(true);
            } else {
              setCfg(next);
            }
            setOpen(false);
            toast(t('AI 设置已保存', 'AI settings saved'));
          }}
        />
      )}
    </Ctx.Provider>
  );
}

function AiSettings({ initial, onClose, onSave }: { initial: AiConfig | null; onClose: () => void; onSave: (c: AiConfig) => void }) {
  const guess = aiPresets.find((p) => p.provider === initial?.provider && (p.baseURL ?? '') === (initial?.baseURL ?? '')) ?? aiPresets[0];
  const [preset, setPreset] = useState(initial ? guess.id : 'anthropic');
  const p = aiPresets.find((x) => x.id === preset)!;
  const [baseURL, setBaseURL] = useState(initial?.baseURL ?? p.baseURL ?? '');
  const [model, setModel] = useState(initial?.model || p.model);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="AI settings">
        <div className="modal-head">
          <span><Icon name="wand" size={16} /> {t('AI 写作助手', 'AI assistant')}</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="close"><Icon name="close" /></button>
        </div>
        <p className="hint">
          {host.kind === 'vscode'
            ? t('Key 保存在 VS Code 的加密存储（SecretStorage）中，请求由扩展直接发往服务商。', 'Your key is kept in VS Code SecretStorage; the extension calls the provider directly.')
            : t('Key 只保存在本浏览器（localStorage），请求直接从浏览器发往服务商，不经过任何 md2 服务器。', 'Your key stays in this browser (localStorage); requests go straight to the provider, never through an md2 server.')}
        </p>
        <Select
          label={t('服务商', 'Provider')}
          value={preset}
          options={aiPresets.map((x) => ({ value: x.id, label: x.name }))}
          onChange={(id) => {
            const np = aiPresets.find((x) => x.id === id)!;
            setPreset(id);
            setBaseURL(np.baseURL ?? '');
            setModel(np.model);
          }}
        />
        {p.provider === 'openai' && (
          <Field label="Base URL">
            <input className="input" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://…/v1" />
          </Field>
        )}
        <Field label={t('模型', 'Model')}>
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder={p.provider === 'anthropic' ? DEFAULT_CLAUDE_MODEL : 'model id'} />
        </Field>
        <Field label="API Key">
          <input className="input" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={preset === 'ollama' ? t('本地 Ollama 可留空', 'Optional for local Ollama') : 'sk-…'} />
        </Field>
        {p.keyUrl && (
          <a className="link-btn" href={p.keyUrl} target="_blank" rel="noreferrer">{t('获取 API Key →', 'Get an API key →')}</a>
        )}
        <div className="modal-actions">
          <Button onClick={onClose}>{t('取消', 'Cancel')}</Button>
          <Button
            variant="primary"
            icon="check"
            onClick={() => onSave({ provider: p.provider, apiKey: apiKey.trim(), baseURL: p.provider === 'openai' ? baseURL.trim() : undefined, model: model.trim() || p.model })}
          >
            {t('保存', 'Save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A "✨ AI" button that runs a task and hands the result to `onResult`. */
export function AiButton<T>({ task, platform, label, onResult }: { task: AiTask; platform?: SocialPlatformId; label: string; onResult: (r: T) => void }) {
  const ai = useAi();
  const busy = ai.busy === task;
  return (
    <span className="ai-btn-wrap">
      <Button
        variant="soft"
        icon="wand"
        disabled={!!ai.busy}
        onClick={async () => {
          const r = await ai.run<T>(task, platform);
          if (r) onResult(r);
        }}
      >
        {busy ? t('生成中…', 'Thinking…') : label}
      </Button>
      <button type="button" className="icon-btn ai-cog" title={t('AI 设置', 'AI settings')} onClick={ai.openSettings}>
        <Icon name="key" size={13} />
      </button>
    </span>
  );
}
