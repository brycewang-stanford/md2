---
name: md2
description: Turn a Markdown article into platform-ready output — WeChat Official Account (公众号) rich text or draft, Zhihu (知乎) article HTML, Xiaohongshu (小红书) 3:4 image cards with caption, an X/Twitter thread, and cover images in every platform size. Use when the user wants to publish, format, typeset (排版), or convert Markdown for 公众号 / 知乎 / 小红书 / X / Twitter, make a 封面 / cover, or split an article into a thread.
---

# md2 — Markdown → 公众号 · 知乎 · 小红书 · X

`md2` is a CLI (npm package `md2all`) and an MCP server. Prefer the CLI from a shell:

```bash
md2 <command> ...   # after `npm link` in packages/cli; or: node <repo>/packages/cli/dist/cli.js <command>
```

## Pick the command

| Goal | Command |
| --- | --- |
| WeChat rich text on the clipboard | `md2 wechat post.md --copy -t claude` |
| WeChat HTML file | `md2 wechat post.md -o out/wechat.html` |
| Create a WeChat **draft** (uploads images + cover) | `md2 publish wechat post.md` (needs `MD2_WECHAT_APPID`, `MD2_WECHAT_SECRET`, whitelisted IP) |
| Zhihu rich text on the clipboard | `md2 zhihu post.md --copy` |
| XHS 1080×1440 cards + `caption.txt` | `md2 xhs post.md -o out/xhs -s clean -a "@name"` |
| Thread for X / Threads / Bluesky / Mastodon / LinkedIn | `md2 thread post.md -p x` (`-p linkedin` for one long post, `--limit 25000` for X Premium, `--json`) |
| One tall image (长图) | `md2 long post.md -t claude -o long.png` |
| AI copy (needs `ANTHROPIC_API_KEY` or `MD2_AI_*`) | `md2 ai xhs|thread|wechat|cover post.md` |
| Cover image | `md2 cover post.md -s wechat -t aurora -o cover.png` |
| See every theme / style / template / size | `md2 themes` |

Image commands (`xhs`, `long`, `cover`, Mermaid diagrams, generated covers in `publish`) need Chrome, Edge, or `npx playwright install chromium`.
Fine-tuning flags work on wechat / xhs / long: `--indent --justify --line-height 1.9 --para-spacing 1.4 --css extra.css`.

## Front matter md2 understands

```yaml
---
title: 文章标题            # falls back to the first H1
subtitle: 副标题           # covers
author: 作者
tags: [AI, 效率]           # XHS hashtags, X hashtags, cover chips
description: 摘要          # WeChat digest, X hook
cover: ./cover.png        # WeChat draft cover (else first image, else generated)
xhs:
  title: ≤20 字的小红书标题
  body: 自定义小红书正文（可选）
---
```

## Writing tips that render well everywhere

- `> [!TIP]` / `[!NOTE]` / `[!WARNING]` / `[!IMPORTANT]` / `[!CAUTION]` → styled callouts.
- `$inline$` and `$$block$$` math → SVG on WeChat, native formulas on Zhihu.
- Footnotes `[^1]` → numbered references (Zhihu: native 参考文献).
- External links become numbered references on WeChat automatically (WeChat blocks outside links).
- `---` starts a new XHS card. Keep XHS titles ≤ 20 chars, body ≤ 1000.
- ```` ```mermaid ```` diagrams become inline SVG (WeChat-safe); Zhihu keeps them as code.

## Themes (choose by tone)

claude (warm, serif), linear (product), geist (mono B/W), apple (big type), editorial (long-read serif),
swiss (grid, red), brutal (neo-brutalism), bento (soft cards), aurora (gradients), midnight (dark),
matcha, wabi (Japanese calm), distill (academic), coral (lifestyle), stripe (dev docs), song (Chinese serif).
Override the accent with `--color "#hex"`; code themes via `--code-theme`.

## MCP

`md2 mcp` exposes `md2_wechat`, `md2_zhihu`, `md2_thread`, `md2_xhs_cards`, `md2_long_image`, `md2_cover`,
`md2_ai`, `md2_publish_wechat_draft`, `md2_list_styles`. Publishing only ever creates a **draft**; never claim an
article was published publicly.
