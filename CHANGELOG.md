# Changelog

## 0.2.8 — 2026-10-17

### Fixed
- **Local images with Chinese (or other non-ASCII) file names show in the VS Code preview.** `![](images/封面.png)` rendered as a broken image while `images/cover.png` worked: the Markdown renderer percent-encodes the path before md2 looks it up, so the lookup missed. All previews (公众号, 知乎, 小红书, long image) now find the file.
- A local image whose file name contains a literal `%` no longer stops the preview from updating.

## 0.2.7 — 2026-10-15

### Fixed
- **公众号 articles can be published again (请勿插入非mp.weixin.qq.com域名的链接).** WeChat refuses to save or publish an article containing any link that isn't an mp.weixin.qq.com link, and some still got through: links inside footnotes, `mailto:` / email links, `#anchor` and relative links, raw HTML `<a>`, and every link when "Links → refs" was off. Footnote links now become numbered references like the rest, and any other link becomes plain text.

## 0.2.6 — 2026-10-15

### Fixed
- **公众号 images no longer fail to paste (有 N 个内容插入失败).** The WeChat editor fetches every pasted image from Tencent's servers, and "Copy for WeChat" was pasting local / webview image URLs. With WeChat credentials saved (the ones "Publish draft" uses), copy now uploads each image to WeChat's own CDN (mmbiz.qpic.cn); SVG badges are converted to PNG first. Without credentials, or if the upload fails, images map to public URLs as for Zhihu (`image_base`, pushed files → jsDelivr / wsrv.nl), with base64 and a warning as a last resort.
- `md2 wechat` maps local images the same way and takes `--image-base` / `--no-git`.
- **公众号 paste keeps its layout.** Callouts (`> [!TIP]` …) keep their box: WeChat drops `<div>`, so they are now `<section>`. Task-list items no longer split the ☑ and the text onto two lines. The paste no longer triggers 内容结构检测 warnings: the claude theme's bold highlighter (and aurora's h3 marker) use an inset shadow instead of a gradient text background, and footnote markers no longer set `line-height: 0`.
- **Long image / Xiaohongshu export no longer times out** when the VS Code window is in the background or covered by another window. The rasteriser waited for an animation frame, which Chromium doesn't fire for a page that isn't painting.
- **知乎 images, tested in the real editor.** Paste tests showed Zhihu rejects `raster.shields.io` badges, and that a cold jsDelivr cache can fail. Badges now go through the wsrv.nl proxy as PNG, and GitHub-hosted images (your pushed files and `raw.githubusercontent.com`) try wsrv.nl first, then jsDelivr. On this README, all 20 images re-host correctly. Pasted base64 images do **not** work in Zhihu (it maps them all to one cached image), so md2 now warns that unpushed images must be pushed or given an `image_base`.
- **Copying large articles works.** On macOS, copying more than ~1 MB (e.g. with inline images) silently failed (`osascript failed`); the CLI and VS Code copy now handle any size.

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
