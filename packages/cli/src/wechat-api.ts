/**
 * Minimal client for the WeChat Official Account (公众号) API:
 * stable access token → upload images → create a draft (草稿箱).
 * Docs: https://developers.weixin.qq.com/doc/offiaccount/
 */
const API = 'https://api.weixin.qq.com/cgi-bin';

const HINTS: Record<number, string> = {
  40001: 'AppSecret 错误或 access_token 失效',
  40013: 'AppID 无效',
  40125: 'AppSecret 无效',
  40164: '调用 IP 不在白名单：请在 公众平台 → 设置与开发 → 基本配置 → IP 白名单 中添加本机出口 IP',
  41005: '缺少图片数据',
  40005: '图片格式不支持（仅 jpg/png）',
  40009: '图片大小超出限制（正文图 ≤ 1MB）',
  40007: 'thumb_media_id 无效（封面需用永久素材）',
  45009: '接口调用超过频率限制',
  48001: '该公众号没有此接口权限（个人/未认证账号可能无法使用草稿接口）',
  53404: '账号已被限制',
};

export class WechatApiError extends Error {
  constructor(public errcode: number, errmsg: string) {
    super(`WeChat API ${errcode}: ${errmsg}${HINTS[errcode] ? ` — ${HINTS[errcode]}` : ''}`);
  }
}

async function call<T>(res: Response): Promise<T> {
  const json = (await res.json()) as T & { errcode?: number; errmsg?: string };
  if (json.errcode) throw new WechatApiError(json.errcode, json.errmsg ?? '');
  return json;
}

export interface Credentials {
  appId: string;
  appSecret: string;
}

export function credentialsFromEnv(appId?: string, appSecret?: string): Credentials {
  const id = appId ?? process.env.MD2_WECHAT_APPID ?? process.env.WECHAT_APPID;
  const secret = appSecret ?? process.env.MD2_WECHAT_SECRET ?? process.env.WECHAT_APPSECRET;
  if (!id || !secret) {
    throw new Error('Missing WeChat credentials: pass --appid/--secret or set MD2_WECHAT_APPID and MD2_WECHAT_SECRET');
  }
  return { appId: id, appSecret: secret };
}

export async function getAccessToken({ appId, appSecret }: Credentials): Promise<string> {
  const res = await fetch(`${API}/stable_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credential', appid: appId, secret: appSecret }),
  });
  const json = await call<{ access_token: string }>(res);
  return json.access_token;
}

function form(data: Buffer, name: string, mime: string): FormData {
  const fd = new FormData();
  fd.append('media', new Blob([new Uint8Array(data)], { type: mime }), name);
  return fd;
}

/** Upload an in-article image; returns a mmbiz.qpic.cn URL usable in content. */
export async function uploadContentImage(token: string, data: Buffer, name: string, mime: string): Promise<string> {
  const res = await fetch(`${API}/media/uploadimg?access_token=${token}`, { method: 'POST', body: form(data, name, mime) });
  return (await call<{ url: string }>(res)).url;
}

/** Upload a permanent image material (used as cover); returns media_id. */
export async function uploadMaterial(token: string, data: Buffer, name: string, mime: string): Promise<{ mediaId: string; url: string }> {
  const res = await fetch(`${API}/material/add_material?access_token=${token}&type=image`, {
    method: 'POST',
    body: form(data, name, mime),
  });
  const json = await call<{ media_id: string; url: string }>(res);
  return { mediaId: json.media_id, url: json.url };
}

export interface DraftArticle {
  title: string;
  author?: string;
  digest?: string;
  content: string;
  content_source_url?: string;
  thumb_media_id: string;
  need_open_comment?: 0 | 1;
  only_fans_can_comment?: 0 | 1;
}

export async function addDraft(token: string, article: DraftArticle): Promise<string> {
  const res = await fetch(`${API}/draft/add?access_token=${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ articles: [article] }),
  });
  return (await call<{ media_id: string }>(res)).media_id;
}
