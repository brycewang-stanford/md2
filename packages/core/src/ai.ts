/**
 * Optional AI copywriting with the user's own key. Claude goes through the
 * official Anthropic SDK; any OpenAI-compatible endpoint (DeepSeek, Kimi, Qwen,
 * OpenRouter, Ollama…) goes through a plain chat-completions call.
 * Nothing here runs unless the user configures a key.
 */
import { toPlainBlocks } from './plain.js';
import { cloneTree, extractFootnotes, transformMath } from './transforms.js';
import { parseMarkdown } from './parse.js';
import { socialPlatforms, type SocialPlatformId } from './platforms/x.js';
import { XHS_TITLE_MAX } from './platforms/xhs.js';
import type { ElementContent, Root } from 'hast';
import type { ParsedDoc } from './types.js';

export type AiProvider = 'anthropic' | 'openai';

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  /** API base URL. Anthropic default https://api.anthropic.com; OpenAI-compatible required */
  baseURL?: string;
  model?: string;
}

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

/** Presets for the settings UI. Model names are editable defaults. */
export const aiPresets: { id: string; name: string; provider: AiProvider; baseURL?: string; model: string; keyUrl?: string }[] = [
  { id: 'anthropic', name: 'Claude (Anthropic)', provider: 'anthropic', model: DEFAULT_CLAUDE_MODEL, keyUrl: 'https://platform.claude.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', provider: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
  { id: 'deepseek', name: 'DeepSeek', provider: 'openai', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'moonshot', name: 'Kimi (Moonshot)', provider: 'openai', baseURL: 'https://api.moonshot.cn/v1', model: 'kimi-latest' },
  { id: 'qwen', name: '通义千问 Qwen', provider: 'openai', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'openrouter', name: 'OpenRouter', provider: 'openai', baseURL: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-opus-5.5' },
  { id: 'ollama', name: 'Ollama (local)', provider: 'openai', baseURL: 'http://localhost:11434/v1', model: 'qwen3' },
];

export class AiError extends Error {}

type JsonSchema = Record<string, unknown>;

function strictObject(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
const str = (description: string): JsonSchema => ({ type: 'string', description });
const strArray = (description: string): JsonSchema => ({ type: 'array', items: { type: 'string' }, description });

function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = cleaned.search(/[[{]/);
  try {
    return JSON.parse(start > 0 ? cleaned.slice(start) : cleaned) as T;
  } catch {
    throw new AiError('The model did not return valid JSON. Try again or pick another model.');
  }
}

async function completeAnthropic<T>(cfg: AiConfig, system: string, user: string, schema: JsonSchema): Promise<T> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseURL || undefined, dangerouslyAllowBrowser: true });
  try {
    const res = await client.beta.messages.create({
      model: cfg.model || DEFAULT_CLAUDE_MODEL,
      max_tokens: 16000,
      // On a policy decline, retry server-side on Anthropic's recommended fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    });
    if (res.stop_reason === 'refusal') throw new AiError('Claude declined this request.');
    if (res.stop_reason === 'max_tokens') throw new AiError('The response was cut off; try a shorter article.');
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return parseJson<T>(text);
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError('Invalid Anthropic API key.');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('Rate limited by Anthropic — wait a moment and retry.');
    if (e instanceof Anthropic.APIError) throw new AiError(`Anthropic API error ${e.status ?? ''}: ${e.message}`);
    throw new AiError(`Could not reach Anthropic: ${(e as Error).message}`);
  }
}

async function completeOpenAI<T>(cfg: AiConfig, system: string, user: string): Promise<T> {
  if (!cfg.baseURL) throw new AiError('Base URL is required for OpenAI-compatible providers.');
  const url = cfg.baseURL.replace(/\/+$/, '') + '/chat/completions';
  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: `${system}\nRespond with a single JSON object only.` },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
  };
  const send = (b: object) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify(b),
    });
  let res = await send(body);
  // Some servers reject response_format; retry without it
  if (res.status === 400) res = await send({ ...body, response_format: undefined });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AiError(`API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new AiError('Empty response from the model.');
  return parseJson<T>(text);
}

export async function completeJson<T>(cfg: AiConfig, system: string, user: string, schema: JsonSchema): Promise<T> {
  if (!cfg.apiKey && cfg.provider === 'anthropic') throw new AiError('Add an API key in AI settings first.');
  return cfg.provider === 'anthropic' ? completeAnthropic<T>(cfg, system, user, schema) : completeOpenAI<T>(cfg, system, user);
}

/** Article as compact plain text for prompts (headings marked, code kept short). */
export function articleText(input: string | ParsedDoc, maxChars = 24000): string {
  const doc = typeof input === 'string' ? parseMarkdown(input) : input;
  const tree: Root = cloneTree(doc.hast);
  transformMath(tree, (tex) => ({ type: 'text', value: `$${tex}$` }) as ElementContent);
  extractFootnotes(tree);
  const lines = toPlainBlocks(tree).map((b) => {
    if (b.kind === 'heading') return `${'#'.repeat(b.level ?? 2)} ${b.text}`;
    if (b.kind === 'list') return b.items!.map((i) => `${'  '.repeat(i.depth)}- ${i.text}`).join('\n');
    if (b.kind === 'code') return '```\n' + b.text.split('\n').slice(0, 12).join('\n') + '\n```';
    return b.text;
  });
  const text = lines.filter(Boolean).join('\n\n');
  return text.length > maxChars ? text.slice(0, maxChars) + '\n…' : text;
}

const LANG_RULE = 'Write in the same language as the article (Chinese articles → Simplified Chinese).';

export interface XhsSuggestion {
  titles: string[];
  body: string;
  tags: string[];
}

/** 小红书: 5 title options (≤20 chars), an emoji-structured caption and hashtags. */
export function aiXhsCopy(cfg: AiConfig, doc: string | ParsedDoc): Promise<XhsSuggestion> {
  const system = `You are a top Xiaohongshu (小红书) content editor. ${LANG_RULE}
Titles: at most ${XHS_TITLE_MAX} characters each, concrete and curiosity-driven, no clickbait lies, 1 emoji max.
Body: 300-800 characters, short paragraphs, emoji bullets, a strong first line, ends with a question that invites comments.
Tags: 5-8 topical hashtags without the # sign.`;
  return completeJson<XhsSuggestion>(cfg, system, `Article:\n\n${articleText(doc)}`, strictObject({
    titles: strArray('Exactly 5 title options'),
    body: str('Caption body'),
    tags: strArray('5-8 hashtags without #'),
  }));
}

export interface ThreadSuggestion {
  posts: string[];
}

/** Rewrite the article as a native thread for X / Threads / Bluesky / Mastodon / LinkedIn. */
export function aiThread(cfg: AiConfig, doc: string | ParsedDoc, platform: SocialPlatformId = 'x', limit?: number): Promise<ThreadSuggestion> {
  const p = socialPlatforms[platform];
  const max = limit ?? p.limit;
  const unit = platform === 'x' ? `${max} weighted characters (each CJK character counts as 2, each URL as 23)` : `${max} characters`;
  const system = `You turn articles into high-performing ${p.name} ${platform === 'linkedin' ? 'posts' : 'threads'}. ${LANG_RULE}
Each post must be at most ${unit}. Open with a hook that states the payoff. One idea per post.
No hashtags except at most 2 in the final post. No "1/n" numbering — it is added automatically.${platform === 'linkedin' ? ' Return exactly one post.' : ''}`;
  return completeJson<ThreadSuggestion>(cfg, system, `Article:\n\n${articleText(doc)}`, strictObject({
    posts: strArray('The posts in order'),
  }));
}

export interface WechatSuggestion {
  titles: string[];
  digest: string;
}

/** 公众号: 5 headline options (≤30 chars) and a ≤120-char digest. */
export function aiWechatMeta(cfg: AiConfig, doc: string | ParsedDoc): Promise<WechatSuggestion> {
  const system = `You are a senior WeChat Official Account (公众号) editor. ${LANG_RULE}
Titles: at most 30 characters, specific, informative, varied angles (benefit, number, question, contrast, story).
Digest: at most 120 characters, summarises the value of the article.`;
  return completeJson<WechatSuggestion>(cfg, system, `Article:\n\n${articleText(doc)}`, strictObject({
    titles: strArray('Exactly 5 headline options'),
    digest: str('Digest / summary'),
  }));
}

export interface CoverSuggestion {
  title: string;
  subtitle: string;
  badge: string;
  emoji: string;
}

/** Cover copy: a punchy title with one ==highlight==, subtitle, badge and emoji. */
export function aiCoverCopy(cfg: AiConfig, doc: string | ParsedDoc): Promise<CoverSuggestion> {
  const system = `You write cover-image copy for social posts. ${LANG_RULE}
title: at most 16 characters (CJK) or 6 words, may contain "\\n" for a line break and exactly one ==highlighted== key phrase.
subtitle: at most 24 characters. badge: 2-4 characters label (e.g. 干货, 教程, NEW). emoji: one emoji.`;
  return completeJson<CoverSuggestion>(cfg, system, `Article:\n\n${articleText(doc, 8000)}`, strictObject({
    title: str('Cover title'),
    subtitle: str('Subtitle'),
    badge: str('Badge'),
    emoji: str('One emoji'),
  }));
}
