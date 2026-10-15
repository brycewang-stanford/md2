<div align="center">

<img src="docs/logo/md2-256.png" width="88" alt="md2">

# md2

**一篇 Markdown，发遍公众号、知乎、小红书、X / Threads，还能出长图和封面。**
Write once in Markdown → WeChat · Zhihu · Xiaohongshu cards · X / Threads / Bluesky / LinkedIn · long images · covers.

[在线使用 Web App](https://brycewang-stanford.github.io/md2/) · [VS Code 扩展](#vs-code-扩展) · [CLI](#cli) · [MCP / Agents](#mcp--ai-agents) · [English](#english)

![md2 web app](docs/images/app-wechat.jpg)

</div>

## 为什么是 md2

每个平台的编辑器都有自己的“脾气”，md2 把脏活一次做完：

| 平台 | md2 输出 | 关键处理 |
| --- | --- | --- |
| **公众号** | 全内联样式富文本，一键复制；或 API 直接建草稿 | 自研 CSS 内联引擎（按优先级 / `!important` 合并）、公式转 SVG、外链转文末参考资料、代码保留缩进、Mac 风格代码块 |
| **知乎** | 干净的语义化 HTML，一键复制 | 公式转知乎原生公式（行内 / 块级）、`<pre lang>` 代码块、脚注转知乎**原生参考文献** |
| **小红书** | 1080×1440 图文卡片 + 封面 + 文案 | **智能分页**：按段落 / 列表项 / 代码行 / 表格行切分，标题不落单，表头跨页重复，`---` 强制分页；标题 ≤20、正文 ≤1000 字校验 |
| **X / Threads / Bluesky / Mastodon / LinkedIn** | 自动拆分的 Thread / 长帖 | 各平台的计数规则（X 中文 2、链接 23；Bluesky 按字素；Mastodon 链接 23）、按句子拆分、`1/n` 编号、图片按位置附着、Unicode 粗体小标题 |
| **长图** | 一张 1080px 宽的长图 | 朋友圈 / 微博 / 小红书长图，主题与公众号一致 |
| **封面** | 10 套现代模板 × 6 种尺寸 | 小红书 3:4 / 1:1、公众号 2.35:1 / 1:1、知乎 16:9、X 16:9，标题自动适配字号 |

另外：**Mermaid 流程图**（样式全部内联，粘到公众号也不丢）、**数学公式**、**排版微调**（首行缩进、两端对齐、行距 / 段距 / 字距、自定义 CSS）、**AI 写作助手**（自带 Key：Claude / DeepSeek / Kimi / 通义 / Ollama，生成小红书爆款标题与文案、改写推文、公众号标题与摘要、封面文案）、**中英双语界面**。

全部渲染在本地完成：Web 版在浏览器里跑，CLI / VS Code 在本机跑，只有你主动触发的 AI 与公众号接口调用才会联网。

### 16 套当代主题 + 8 套代码配色

不是“微信绿 / 樱花粉”那一套。主题参考当下的设计语言：**Claude、Linear、Geist (Vercel)、Apple 发布会、杂志编辑、瑞士国际主义、新野兽派、便当卡片、极光渐变、深夜模式、抹茶、侘寂、学术 Distill、珊瑚生活、Stripe 文档、宋韵**。代码高亮：GitHub Light/Dark、Vitesse、Tokyo Night、Catppuccin、Rosé Pine。任意主题都可以一键换主色。

![themes](docs/images/app-themes.jpg)

![wechat themes](docs/images/wechat-themes.jpg)

### 小红书卡片

![xhs cards](docs/images/xhs-cards.jpg)

![xhs panel](docs/images/app-xhs.jpg)

### 封面

![covers](docs/images/covers-xhs.jpg)

![wide covers](docs/images/covers-wide.jpg)

### 知乎 & X

![zhihu](docs/images/app-zhihu-dark.jpg)

![x thread](docs/images/app-x.jpg)

### Mermaid、排版微调、AI

![mermaid](docs/images/app-mermaid.jpg)

![tune](docs/images/app-tune.jpg)

![threads](docs/images/app-threads.jpg)

![long image](docs/images/app-long.jpg)

## 快速开始

### VS Code 扩展

在扩展市场搜索 **md2**（或安装 [Release](https://github.com/brycewang-stanford/md2/releases) 里的 `.vsix`），打开任意 Markdown，点击编辑器右上角的 md2 图标或按 <kbd>⌘</kbd><kbd>⌥</kbd><kbd>M</kbd>：

- 实时预览所有平台，跟随编辑器滚动；
- 命令面板 / 右键菜单：复制到公众号 / 知乎、导出小红书卡片 / 长图 / 封面（保存到 `md2-export/`）、复制推文；
- **发布到公众号草稿箱**（AppID / AppSecret 存在 VS Code 加密存储中）。

<p>
  <img src="docs/images/vscode-wechat.jpg" width="380" alt="VS Code WeChat">
  <img src="docs/images/vscode-xhs.jpg" width="450" alt="VS Code XHS">
</p>

### Web App

打开 **https://brycewang-stanford.github.io/md2/**，左边写 Markdown（可拖入 `.md` 文件或粘贴图片），右边切换平台：

- **公众号**：点「复制到公众号」，在公众号后台编辑器直接粘贴。
- **知乎**：点「复制到知乎」，在 [写文章](https://zhuanlan.zhihu.com/write) 粘贴，公式和代码块保持可编辑。
- **小红书**：点「导出 N 张」下载 ZIP（图片 + `caption.txt`），右侧点击即可复制标题 / 正文。
- **X**：逐条复制，或一键复制整串。
- **封面**：选模板和尺寸，导出 PNG，或一次导出全部尺寸。

本地开发：

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

### CLI

```bash
git clone https://github.com/brycewang-stanford/md2 && cd md2
pnpm install && pnpm build
cd packages/cli && npm link && cd -   # 全局 `md2` 命令（npm 包 md2all 发布后可直接 npx md2all）

md2 wechat post.md --copy -t claude        # 公众号富文本 → 剪贴板
md2 zhihu  post.md --copy                  # 知乎富文本 → 剪贴板
md2 xhs    post.md -o out/xhs -s bento     # 小红书卡片 + caption.txt
md2 thread post.md -p x                   # X thread（-p threads|bluesky|mastodon|linkedin）
md2 long   post.md -t claude              # 长图
md2 ai xhs post.md                        # AI 小红书标题 / 文案（需 ANTHROPIC_API_KEY）
md2 cover  post.md -s wechat -t aurora     # 公众号头图
md2 cover  post.md --all -s xhs            # 一次渲染全部封面模板
md2 themes                                 # 列出所有主题 / 卡片 / 封面 / 尺寸
```

图片类命令（`xhs`、`cover`）用本机 Chrome / Edge 渲染，或运行 `npx playwright install chromium`；也可以设 `MD2_CHROME_PATH`。

#### 直接发到公众号草稿箱

```bash
export MD2_WECHAT_APPID=wx...
export MD2_WECHAT_SECRET=...
md2 publish wechat post.md -t linear       # 上传正文图片 → 上传/生成封面 → 新建草稿
md2 publish wechat post.md --dry-run       # 不调用接口，先演练
```

需要在公众平台「设置与开发 → 基本配置」把本机出口 IP 加入白名单。md2 只会**创建草稿**，不会替你群发。常见错误码（40164 IP 白名单、48001 无接口权限等）会给出中文提示。

### Front matter

```yaml
---
title: 文章标题            # 缺省时取第一个 H1
subtitle: 副标题           # 用于封面
author: 作者
tags: [AI, 效率工具]        # 小红书 / X 话题、封面标签
description: 摘要          # 公众号摘要、X 首条
cover: ./cover.png        # 公众号封面（否则取第一张图，再否则自动生成）
xhs:
  title: 小红书标题 ≤20 字
---
```

扩展语法：GFM 表格 / 任务列表 / 删除线、`$行内$` 与 `$$块级$$` 公式、脚注 `[^1]`、GitHub 风格提示块 `> [!TIP]`、内嵌 HTML。

## MCP / AI Agents

md2 自带 MCP Server，让 Claude、Cursor 等 Agent 直接排版和出图：

```json
{
  "mcpServers": {
    "md2": { "command": "node", "args": ["/path/to/md2/packages/cli/dist/cli.js", "mcp"] }
  }
}
```

（npm 包发布后可改为 `"command": "npx", "args": ["-y", "md2all", "mcp"]`。）

工具：`md2_wechat`、`md2_zhihu`、`md2_thread`、`md2_xhs_cards`、`md2_long_image`、`md2_cover`、`md2_ai`、`md2_publish_wechat_draft`、`md2_list_styles`。

Claude Code 用户也可以直接用仓库里的 skill：`skills/md2/SKILL.md`。

## 架构

```
packages/core   @md2/core  同构渲染引擎（浏览器 + Node）
  parse         unified / remark / rehype → hast（front matter、GFM、数学、提示块）
  inline-css    PostCSS + hast-util-select 的 CSS 内联引擎（公众号）
  article       公式 SVG（MathJax）、代码高亮（lowlight）、标题装饰、脚注与引用
  platforms/    wechat · zhihu · xhs · x
  cover/        10 套封面模板
  dom.ts        小红书分页器 & 封面字号适配（浏览器端；CLI 通过无头 Chromium 复用同一份代码）
packages/cli    md2all     CLI + MCP Server + 公众号 API
apps/web        Web App（React + CodeMirror 6），同一份代码嵌入 VS Code webview
apps/vscode     VS Code 扩展（预览面板、命令、SecretStorage、草稿发布）
```

小红书分页和封面在 Web 与 CLI 中运行的是**同一份 DOM 代码**，所以两边导出的图片完全一致。

```bash
pnpm build && pnpm test
```

## Roadmap

- [x] Mermaid 图表 · AI 写作助手 · VS Code 扩展 · 长图 · Threads / Bluesky / LinkedIn
- [ ] 知乎 / 小红书 浏览器自动填充（Playwright，保存登录态）
- [ ] 主题市场：导入 / 分享自定义主题
- [ ] Obsidian 插件（复用 `@md2/core`）

欢迎 Issue 和 PR。

---

## English

**md2** turns one Markdown file into platform-ready output for Chinese and global social platforms:

- **WeChat Official Account**: every style inlined by a specificity-aware CSS inliner. Formulas become SVG and external links become numbered references (WeChat blocks outside links). Code keeps its indentation. It can copy to the clipboard or create a draft through the official API, uploading images and the cover for you.
- **Zhihu**: clean semantic HTML with Zhihu's native equations, `<pre lang>` code blocks and native references for footnotes.
- **Xiaohongshu (RED)**: 1080×1440 image cards with smart pagination. It splits paragraphs, list items, code lines and table rows (repeating the header), keeps headings with their content and treats `---` as a page break. It also produces a cover and a caption checked against the 20/1000-character limits.
- **X / Threads / Bluesky / Mastodon / LinkedIn**: platform-accurate counting (X: CJK = 2, URL = 23), splits at sentences, `1/n` numbering, images attached where they appear, Unicode-bold headings.
- **Long images** (one 1080 px-wide PNG) and **covers** (10 templates × 6 sizes).
- **Mermaid** diagrams as paste-safe SVG, **math** everywhere, **fine-tuning** (indent, justify, spacing, custom CSS), and an optional **AI assistant** (bring your own key: Claude, or any OpenAI-compatible model) for captions, headlines and thread rewrites.

It ships 16 contemporary article themes and 8 code palettes. It runs as a **web app** (Chinese/English UI), a **VS Code extension**, a **CLI** (`md2`) and an **MCP server** (`md2 mcp`), all local-first.

## License

[MIT](LICENSE) © Bryce Wang and contributors. See [NOTICE](NOTICE) for acknowledgements.
