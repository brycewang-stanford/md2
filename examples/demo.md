---
title: 一篇 Markdown，发遍公众号、知乎、小红书和 X
subtitle: md2 —— 写一次，处处好看
author: md2
tags: [Markdown, 公众号排版, 效率工具]
xhs:
  title: 一篇 Markdown 发 4 个平台
---

# 一篇 Markdown，发遍公众号、知乎、小红书和 X

**md2** 是一个开源的多平台排版工具：同一份 Markdown，一键生成 *公众号* 富文本、*知乎* 文章、*小红书* 图文卡片和 *X / Twitter* 长推。所有渲染都在本地完成，不上传任何内容。

## 为什么需要它

每个平台的编辑器都有自己的“脾气”：

1. 公众号会**删掉所有 `<style>` 和 class**，只认内联样式；
2. 知乎的公式要用它自家的 `equation` 图片，代码块只认 `lang` 属性；
3. 小红书根本没有正文排版，只能发 **3:4 图片**；
4. X 每条只有 280 个字符，而且中文算两个。

> [!TIP]
> md2 把这些脏活都包了：你只管写 Markdown。

## 数学公式

行内公式 $E = mc^2$ 与块级公式都会渲染成 SVG（公众号）或知乎原生公式：

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

## 代码高亮

```python
def fib(n: int) -> int:
    """Return the n-th Fibonacci number."""
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print([fib(i) for i in range(10)])
```

行内代码比如 `npm i -g md2all` 也有样式。

## 表格

| 平台 | 输出 | 关键处理 |
| --- | --- | --- |
| 公众号 | 内联样式 HTML | 链接转脚注、公式转 SVG |
| 知乎 | 语义化 HTML | 公式图片、原生参考文献 |
| 小红书 | 1080×1440 图片 | 智能分页、封面 |
| X | Thread | 加权字数、自动拆分 |

## 引用与提示

> 好的排版不会让人注意到排版本身。

> [!WARNING]
> 公众号里外链不可点击，md2 会自动把它们转成文末参考资料。

## 链接与脚注

了解更多请看 [GitHub 仓库](https://github.com/brycewang-stanford/md2)，或者阅读 [CommonMark 规范](https://commonmark.org)。脚注也支持[^1]。

- [x] 公众号一键复制
- [x] 知乎公式
- [x] 小红书卡片
- [ ] 更多平台

---

## 小结

写作的人应该专注内容。剩下的交给 md2。

[^1]: 脚注会和链接一起，整理成文末的参考资料。
