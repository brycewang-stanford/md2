import { afterEach, describe, expect, test, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { publishWechat, wechatHtml, xThread, zhihuHtml } from '../src/actions.js';
import { publicImages } from '../src/public-images.js';
import { inlineLocalImages, localPath, loadImage } from '../src/io.js';
import { WechatApiError } from '../src/wechat-api.js';
import { wechatImages } from '../src/wechat-images.js';
import { zhihuImages, ZhihuAuthError } from '../src/zhihu-images.js';

const post = fileURLToPath(new URL('./fixtures/post.md', import.meta.url));
const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));

afterEach(() => vi.unstubAllGlobals());

describe('io', () => {
  test('resolves local images relative to the markdown file', () => {
    expect(localPath('./pic.png', dir)).toMatch(/fixtures\/pic\.png$/);
    expect(localPath('https://x.com/a.png', dir)).toBeUndefined();
    expect(inlineLocalImages(dir)('./pic.png')).toMatch(/^data:image\/png;base64,/);
  });
  test('loads data URLs', async () => {
    const img = await loadImage('data:image/png;base64,iVBORw0KGgo=', dir);
    expect(img.mime).toBe('image/png');
    expect(img.data.length).toBe(8);
  });
});

describe('zhihu images', () => {
  test('image_base maps local images to public URLs', async () => {
    const r = await publicImages(['./pic.png', 'https://x.com/a.png'], dir, { imageBase: 'https://cdn.example.com/post' });
    expect(r.map).toEqual({ './pic.png': 'https://cdn.example.com/post/pic.png' });
    expect(r.inlined).toEqual([]);
  });
  test('unpushed local images fall back to data URLs with a warning', async () => {
    const r = await zhihuHtml({ file: post }, { noGit: true });
    expect(r.html).toMatch(/<img src="data:image\/png;base64,/);
    expect(r.warnings.map((w) => w.code)).toContain('inlined-image');
    expect(r.warnings.map((w) => w.code)).not.toContain('local-image');
  });
});

describe('zhihu uploads', () => {
  const zhihuApi = (state: number) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === 'https://api.zhihu.com/images') {
        const { image_hash } = JSON.parse(String(init?.body));
        return Response.json({
          upload_file: { state, image_id: 'img1', object_key: `v2-${image_hash}` },
          upload_token: { access_id: 'id', access_key: 'key', access_token: 'tok' },
        });
      }
      if (url.startsWith('https://zhihu-pics-upload.zhimg.com/')) return new Response(null, { status: 200 });
      if (url === 'https://api.zhihu.com/images/img1') return Response.json({ status: 'success', original_src: 'https://picx.zhimg.com/v2-abc.png' });
      throw new Error(`unexpected fetch ${url}`);
    });
    return calls;
  };

  test('uploads to zhimg.com with the cookie, dedupes, reports what it cannot upload', async () => {
    const calls = zhihuApi(2);
    const r = await zhihuImages(['./pic.png', 'pic.png', './missing.png', 'https://pic1.zhimg.com/already.png'], dir, 'z0value');
    expect(r.map['./pic.png']).toBe('https://picx.zhimg.com/v2-abc.png');
    expect(r.map['pic.png']).toBe('https://picx.zhimg.com/v2-abc.png');
    expect(r.failed.map((f) => f.src)).toEqual(['./missing.png']);
    const ticket = calls.filter((c) => c.url === 'https://api.zhihu.com/images');
    expect(ticket.length).toBe(1);
    expect((ticket[0].init?.headers as Record<string, string>).cookie).toBe('z_c0=z0value');
    const put = calls.find((c) => c.url.startsWith('https://zhihu-pics-upload.zhimg.com/'))!;
    expect(put.init?.method).toBe('PUT');
    expect((put.init?.headers as Record<string, string>).authorization).toMatch(/^OSS id:[A-Za-z0-9+/=]+$/);
  });
  test('images Zhihu already has skip the OSS upload', async () => {
    const calls = zhihuApi(1);
    const r = await zhihuImages(['data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='], dir, 'z_c0=a; d_c0=b');
    expect(Object.values(r.map)).toEqual(['https://picx.zhimg.com/v2-abc.png']);
    expect(calls.some((c) => c.url.startsWith('https://zhihu-pics-upload'))).toBe(false);
  });
  test('a rejected cookie throws so the caller can fall back', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":{}}', { status: 401 }));
    await expect(zhihuImages(['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA'], dir, 'bad')).rejects.toBeInstanceOf(ZhihuAuthError);
  });
  test('zhihuHtml pastes zhimg URLs instead of base64 when a cookie is given', async () => {
    zhihuApi(2);
    const r = await zhihuHtml({ file: post }, { noGit: true, zhihuCookie: 'z0' });
    expect(r.html).toContain('src="https://picx.zhimg.com/v2-abc.png"');
    expect(r.html).not.toMatch(/src="data:/);
    expect(r.warnings.map((w) => w.code)).not.toContain('inlined-image');
  });
});

describe('wechat images', () => {
  test('uploads to mmbiz.qpic.cn, dedupes by content, reports what it cannot upload', async () => {
    const uploads: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('/stable_token')) return Response.json({ access_token: 'tok' });
      if (url.includes('/media/uploadimg')) {
        uploads.push(url);
        return Response.json({ url: `https://mmbiz.qpic.cn/x/${uploads.length}` });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const creds = { appId: 'wx', appSecret: 's' };
    const r = await wechatImages(['./pic.png', 'pic.png', './missing.png', 'https://mmbiz.qpic.cn/already'], dir, creds);
    expect(r.map['./pic.png']).toBe('https://mmbiz.qpic.cn/x/1');
    expect(r.map['pic.png']).toBe('https://mmbiz.qpic.cn/x/1');
    expect(uploads.length).toBe(1);
    expect(r.failed.map((f) => f.src)).toEqual(['./missing.png']);
    expect(r.map['https://mmbiz.qpic.cn/already']).toBeUndefined();
  });
  test('bad credentials throw so the caller can fall back to public URLs', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ errcode: 40164, errmsg: 'invalid ip' }));
    await expect(wechatImages(['./pic.png'], dir, { appId: 'wx', appSecret: 's' })).rejects.toThrow(/白名单/);
  });
});

describe('actions', () => {
  test('wechat html from file (math engine loads lazily)', async () => {
    const r = await wechatHtml({ file: post }, { theme: 'linear', noGit: true });
    expect(r.html).toContain('<svg');
    expect(r.html).toContain('#5e6ad2');
    // WeChat fetches pasted images from its servers: never leave a relative path behind
    expect(r.html).toMatch(/<img src="data:image\/png;base64,/);
    expect(r.warnings.map((w) => w.code)).toContain('inlined-image');
    expect(r.warnings.map((w) => w.code)).not.toContain('local-image');
  });
  test('wechat maps local images to image_base', async () => {
    const r = await wechatHtml({ file: post }, { imageBase: 'https://img.example.com/posts' });
    expect(r.html).toMatch(/<img src="https:\/\/img\.example\.com\/posts\//);
    expect(r.warnings.map((w) => w.code)).not.toContain('inlined-image');
  });
  test('thread from markdown string', async () => {
    expect((await xThread({ markdown: '# T\n\nhello world' })).tweets.length).toBeGreaterThan(0);
    expect((await xThread({ markdown: 'hello', }, { platform: 'bluesky' })).platform).toBe('bluesky');
  });
});

describe('publish wechat (mocked API)', () => {
  test('token → upload image → upload cover → draft', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      calls.push(u.pathname);
      const json = (o: object) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
      if (u.pathname.endsWith('/stable_token')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ appid: 'id', secret: 'sec' });
        return json({ access_token: 'TOKEN', expires_in: 7200 });
      }
      expect(u.searchParams.get('access_token')).toBe('TOKEN');
      if (u.pathname.endsWith('/media/uploadimg')) return json({ url: 'http://mmbiz.qpic.cn/uploaded.png' });
      if (u.pathname.endsWith('/material/add_material')) return json({ media_id: 'THUMB', url: 'x' });
      if (u.pathname.endsWith('/draft/add')) {
        const body = JSON.parse(String(init?.body));
        const a = body.articles[0];
        expect(a.title).toBe('测试文章');
        expect(a.author).toBe('tester');
        expect(a.thumb_media_id).toBe('THUMB');
        expect(a.content).toContain('http://mmbiz.qpic.cn/uploaded.png');
        expect(a.content).not.toContain('<h1');
        expect(a.digest).toContain('第一段内容');
        return json({ media_id: 'DRAFT1' });
      }
      throw new Error('unexpected ' + url);
    }));
    const r = await publishWechat({ file: post }, { appId: 'id', appSecret: 'sec' });
    expect(r.mediaId).toBe('DRAFT1');
    expect(calls.map((c) => c.split('/').pop())).toEqual(['stable_token', 'uploadimg', 'add_material', 'add']);
  });

  test('API errors carry actionable hints', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ errcode: 40164, errmsg: 'invalid ip' }))));
    const err = await publishWechat({ file: post }, { appId: 'id', appSecret: 'sec' }).catch((e) => e);
    expect(err).toBeInstanceOf(WechatApiError);
    expect(err.message).toContain('IP 白名单');
  });

  test('missing credentials', async () => {
    const env = { ...process.env };
    delete process.env.MD2_WECHAT_APPID;
    delete process.env.WECHAT_APPID;
    await expect(publishWechat({ file: post })).rejects.toThrow(/MD2_WECHAT_APPID/);
    process.env = env;
  });
});
