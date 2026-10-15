/**
 * Zhihu's editor re-hosts every pasted <img> by asking its own servers to fetch
 * the src (POST zhuanlan.zhihu.com/api/uploaded_images {url}), so a local path,
 * a VS Code webview URI or a blob: URL always ends up as 上传失败. Before copying,
 * map local images to URLs the public internet can reach:
 *
 *   1. `imageBase` (front matter `image_base`) — your own image host / CDN prefix
 *   2. files committed and pushed to a GitHub remote → jsDelivr, pinned to the
 *      pushed commit (verified reachable, which also warms jsDelivr's cache)
 *   3. anything else → inlined data URL, as a last resort
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { localPath, mimeOf } from './io.js';

export interface PublicImageOptions {
  /** URL prefix that relative image paths resolve against */
  imageBase?: string;
  /** Skip the GitHub/jsDelivr lookup (data URLs only) */
  noGit?: boolean;
}

export interface PublicImages {
  /** src as written in the Markdown → public URL or data URL */
  map: Record<string, string>;
  /** srcs that had to be inlined as data URLs */
  inlined: string[];
}

function git(cwd: string, ...args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

interface Pushed {
  root: string;
  owner: string;
  repo: string;
  sha: string;
}

/** The upstream commit of `dir`'s branch, when that upstream is on GitHub. */
function pushedRepo(dir: string): Pushed | undefined {
  const root = git(dir, 'rev-parse', '--show-toplevel');
  const upstream = git(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
  if (!root || !upstream) return undefined;
  const remote = upstream.split('/')[0];
  const url = git(dir, 'remote', 'get-url', remote) ?? '';
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url);
  const sha = git(dir, 'rev-parse', '@{u}');
  if (!m || !sha) return undefined;
  return { root, owner: m[1], repo: m[2], sha };
}

/** True when `file` exists in the pushed commit with identical content. */
function isPushed(repo: Pushed, file: string): boolean {
  const rel = relative(repo.root, file).split(sep).join('/');
  const remoteBlob = git(repo.root, 'rev-parse', `${repo.sha}:${rel}`);
  return !!remoteBlob && remoteBlob === git(repo.root, 'hash-object', file);
}

/** jsDelivr can take several seconds on a cold cache, so allow a generous timeout and one retry. */
async function reachable(url: string, tries = 2): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(25000) });
      if (res.ok) return (res.headers.get('content-type') ?? '').startsWith('image/');
      if (res.status < 500) return false;
    } catch {
      /* timeout / network: retry */
    }
  }
  return false;
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export async function publicImages(srcs: string[], baseDir: string, opts: PublicImageOptions = {}): Promise<PublicImages> {
  const map: Record<string, string> = {};
  const inlined: string[] = [];
  const locals = [...new Set(srcs)]
    .map((src) => ({ src, file: localPath(src, baseDir) }))
    .filter((x): x is { src: string; file: string } => !!x.file);
  if (!locals.length) return { map, inlined };

  const base = opts.imageBase?.trim();
  const repo = base || opts.noGit ? undefined : pushedRepo(baseDir);

  await Promise.all(
    locals.map(async ({ src, file }) => {
      if (base) {
        const rel = relative(baseDir, file).split(sep).join('/');
        map[src] = new URL(encodePath(rel), base.endsWith('/') ? base : `${base}/`).toString();
        return;
      }
      if (repo && isPushed(repo, file)) {
        const rel = relative(repo.root, file).split(sep).join('/');
        const url = `https://cdn.jsdelivr.net/gh/${repo.owner}/${repo.repo}@${repo.sha}/${encodePath(rel)}`;
        if (await reachable(url)) {
          map[src] = url;
          return;
        }
      }
      map[src] = `data:${mimeOf(file)};base64,${readFileSync(file).toString('base64')}`;
      inlined.push(src);
    }),
  );
  return { map, inlined };
}
