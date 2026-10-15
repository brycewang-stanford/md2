# Changelog

## 0.2.5 — 2026-10-15

### Fixed
- **More 知乎 images survive the paste.** SVG images (shields.io / JOSS badges) are converted to PNG, since Zhihu only re-hosts raster images. `raw.githubusercontent.com` images, which Zhihu's servers in mainland China can't reach, go through jsDelivr. Every candidate is checked before copy and falls back to the wsrv.nl image proxy when jsDelivr times out on a cold cache, and md2 warns about any remote image with no reachable alternative.

## 0.2.4 — 2026-10-15

### Changed
- **md2 has its own preview button** in the editor title bar: an `md2` glyph instead of the stock preview icon, so it is no longer confused with VS Code's built-in Markdown preview.

## 0.2.3 — 2026-10-15

### Changed
- **Published on the VS Code Marketplace** as [`brycewang-stanford.md2`](https://marketplace.visualstudio.com/items?itemName=brycewang-stanford.md2). The extension ID changed from `brycewang.md2`, so uninstall a sideloaded copy before installing from the Marketplace.

## 0.2.2 — 2026-10-15

### Changed
- The logo now spells **md2** (with the “d”) in the README, the VS Code extension icon, the web app header and the favicon.

## 0.2.1 — 2026-10-15

### Fixed
- **知乎 images no longer show 上传失败**. Zhihu re-hosts every pasted image by fetching its URL from Zhihu's servers, so local paths and VS Code preview URIs always failed. On copy (VS Code panel, `md2 zhihu --copy`), local images now become public URLs: jsDelivr links pinned to the pushed commit for files already on GitHub, an `image_base` front-matter / `--image-base` prefix for your own host, or inline base64 as a last resort. The Zhihu tab now warns about any image Zhihu can't fetch.

### Docs
- README split into English (`README.md`) and 简体中文 (`README.zh-CN.md`), for the repo and the VS Code extension.

## 0.2.0 — 2026-10-15

### New
- **VS Code extension**: live preview beside the editor with every md2 tab, scroll sync, copy and export commands that write into your workspace, WeChat draft publishing, and AI with keys in SecretStorage.
- **Threads beyond X**: Threads, Bluesky, Mastodon and LinkedIn, each with its own counting rules and image limits. Unicode-bold headings.
- **长图 (long image)** export in the web app, CLI (`md2 long`), MCP (`md2_long_image`) and VS Code.
- **Mermaid diagrams** render to self-contained SVG (computed styles baked in, no `<style>`, no `foreignObject`), so they survive pasting into WeChat.
- **AI copywriting** (bring your own key): Claude through the official Anthropic SDK (default `claude-opus-5-5`, structured JSON output, server-side refusal fallback) or any OpenAI-compatible endpoint. Covers 小红书 titles/caption/tags, thread rewrites, 公众号 headlines/digest and cover copy. Also available as `md2 ai …` and the `md2_ai` MCP tool.
- **Fine-tuning**: line height, paragraph and letter spacing, 首行缩进, justify, heading alignment and custom CSS (`--indent`, `--justify`, `--css` … in the CLI).
- **English UI** with a one-click 中文 / EN toggle, plus an English sample article.
- <kbd>⌘/Ctrl</kbd><kbd>⇧</kbd><kbd>C</kbd> runs the current tab's main action.
- New logo.

### Improved
- MathJax loads lazily, which halves the web app's initial download (1.15 MB → 0.55 MB gzipped).
- The CLI renders diagrams through headless Chromium, and `publish wechat` no longer needs a browser when the article has a cover.
- The MCP server closes idle browsers and shuts down cleanly.

### Fixed
- The X thread no longer repeats the intro paragraph after the hook post, and keeps display formulas.
- Inline Zhihu formulas no longer render as display blocks in the preview.
- Long-image header fonts are no longer lost to quote escaping.

## 0.1.0 — 2026-10-15

First release: WeChat, Zhihu, Xiaohongshu cards, X threads and covers. 16 themes, a web app, CLI and MCP server.
