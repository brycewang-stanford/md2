<p align="center">
  <img src="https://raw.githubusercontent.com/brycewang-stanford/md2/main/docs/logo/md2-256.png" width="96" alt="md2 logo">
</p>

<h1 align="center">md2 for VS Code</h1>

<p align="center"><b>一篇 Markdown，发遍公众号、知乎、小红书、X / Threads / Bluesky / LinkedIn，还能出长图和封面。</b></p>

<p align="center"><a href="https://github.com/brycewang-stanford/md2/blob/main/apps/vscode/README.md">English</a> · <b>简体中文</b></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/brycewang-stanford/md2/main/docs/images/vscode-wechat.jpg" width="420" alt="公众号预览">
  <img src="https://raw.githubusercontent.com/brycewang-stanford/md2/main/docs/images/vscode-xhs.jpg" width="420" alt="小红书卡片">
</p>

## 功能

点击编辑器标题栏的 **md2** 图标（或按 <kbd>⌘</kbd><kbd>⌥</kbd><kbd>M</kbd> / <kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>M</kbd>），在 Markdown 旁边打开实时预览。边写边更新，并跟随编辑器滚动。

| 标签页 | 输出 |
| --- | --- |
| **公众号** | 全内联样式的富文本（公众号会剥掉 `<style>` 和 class）。公式和 Mermaid 图转为内联 SVG，外链转为文末编号参考资料，代码保留缩进。**复制**后直接粘贴到公众号编辑器。 |
| **知乎** | 干净的 HTML，使用知乎原生公式、`<pre lang>` 代码块，脚注转为知乎原生参考文献。 |
| **小红书** | 1080×1440 图文卡片，智能分页（段落、列表、代码、表格均可拆分），附封面卡片，文案按标题 20 字 / 正文 1000 字校验。 |
| **推文** | 生成 **X**（加权计数：中文 2、链接 23）、**Threads**、**Bluesky**、**Mastodon** 的 Thread，或一条带 Unicode 粗体小标题的 **LinkedIn** 长帖。 |
| **长图** | 整篇文章导出为一张长 PNG，适合朋友圈 / 微博。 |
| **封面** | 10 套现代模板（Aurora、Glass、Claude、Bento、Swiss、Neo-Brutal、Terminal、Notes、Editorial、Photo），6 种尺寸。 |

- **16 套当代主题**：Claude、Linear、Geist、Apple、Editorial、Swiss、Neo-Brutal、Bento、Aurora、Midnight、Matcha、Wabi、Distill、Coral、Stripe、宋韵。另有 8 套代码配色（Vitesse、Tokyo Night、Catppuccin、Rosé Pine、GitHub）和排版微调（首行缩进、两端对齐、间距、标题对齐、自定义 CSS）。
- **公式与图表**：`$…$`、`$$…$$` 和 ```` ```mermaid ```` 在所有平台都能渲染，粘贴到公众号也不会丢样式。
- **AI 写作助手（可选，自带 Key）**：小红书标题、文案与话题；推文改写；公众号标题与摘要；封面文案。支持 Claude（默认 `claude-opus-5-5`）或任何 OpenAI 兼容接口（DeepSeek、Kimi、通义、OpenRouter、Ollama）。Key 保存在 VS Code SecretStorage 中。
- **发布到公众号草稿箱**：**md2: Publish to WeChat Drafts** 会上传正文图片，使用 front matter 中的封面（或自动生成），并在「公众号 → 草稿箱」新建草稿。绝不会群发。
- **默认私密**：全部在本地渲染。除了你主动触发的 AI 和公众号接口调用，任何内容都不会离开你的电脑。

## 命令

| 命令 | 说明 |
| --- | --- |
| `md2: Open md2 Preview` | 在编辑器旁打开实时预览 |
| `md2: Copy for WeChat (公众号)` | 富文本复制到剪贴板 |
| `md2: Copy for Zhihu (知乎)` | 富文本复制到剪贴板；知乎标签页的「导出 Word」保存图片内嵌的 `.docx`，用知乎「导入 → 导入文档」导入 |
| `md2: Export Xiaohongshu Cards (小红书)` | PNG + `caption.txt`，保存到 `md2-export/` |
| `md2: Copy Thread` | 复制当前所选平台的 Thread |
| `md2: Export Long Image (长图)` | 一张长 PNG |
| `md2: Export Cover (封面)` | 所选尺寸的 PNG |
| `md2: Publish to WeChat Drafts` | 需要 AppID / AppSecret，且本机 IP 已加入白名单 |
| `md2: Set WeChat AppID / AppSecret` · `md2: Clear Stored Keys` | 凭据保存在 SecretStorage |

以上命令也都在编辑器右键菜单的 **md2** 子菜单中。在预览面板内，<kbd>⌘</kbd><kbd>⇧</kbd><kbd>C</kbd> 执行当前标签页的主操作。

## Front matter

```yaml
---
title: 文章标题            # 缺省时取第一个 H1
subtitle: 副标题           # 用于封面
author: 作者
tags: [AI, 效率工具]        # 小红书 / 推文话题、封面标签
description: 摘要          # 公众号摘要、推文首条
cover: ./cover.png        # 公众号草稿封面
xhs:
  title: ≤20 字的小红书标题
---
```

## 设置

- `md2.exportFolder`：导出目录，相对于 Markdown 文件（默认 `md2-export`）。
- `md2.revealAfterExport`：导出后提示在文件管理器中显示。
- `md2.wechat.coverTemplate`：自动生成公众号封面时使用的模板。

## 其他形态

- **Web App**：https://brycewang-stanford.github.io/md2/
- **CLI + MCP Server**（供 Claude、Cursor 等 Agent 使用）：见 [仓库](https://github.com/brycewang-stanford/md2/blob/main/README.zh-CN.md)。

MIT © Bryce Wang and contributors
