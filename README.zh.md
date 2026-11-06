# dsh-latex-formula-editor

> LaTeX 公式编辑器 —— DSH 侧栏插件：离线渲染、磁贴取符号、公式模板、收藏夹、图片/文档识别、多格式导出与分享。

![插件界面](docs/img/editor.png)

## 安装

```bash
# 1. 取仓库
git clone https://github.com/jiahui-huang1/dsh-latex-formula-editor.git
# 2. 以本地插件方式安装（DSH 会自动读取 package.json 里的 dsh.bundle.patch / dsh.client）
pnpm dsh plugin add ./dsh-latex-formula-editor
```

安装后在 DSH 左侧栏启用 **公式编辑器**（入口 id `latex-editor`）。

## 功能

- **快捷工具**：常用符号 / 希腊字母 / 分数微分 / 根式角标 / 极限对数 / 三角函数 / 积分运算 / 大型运算 / 括号取整 / 数组矩阵，悬停磁贴展开分组符号面板，点击插入光标处
- **公式模板**：代数 / 几何 / 不等式 / 积分 / 矩阵 / 三角 / 统计 / 数列 / 物理 / 化学，展开即可整条插入
- **格式行**：取色器、真实字体预览、真实字号预览、环境包裹（align / aligned / gathered / cases / split / array / eqnarray / 无环境）、清空、撤销、导入、收藏
- **输出**：输出图片（SVG / PNG / JPG）、输出代码（LaTeX / AsciiMath / Typst / SVG Code / HTML 内联与独立 / MathML / MathML mml: / m: / attr: / OMML）、转义（反斜杠、`$…$`、`$$…$$`、`\(…\)`、`\[…\]`、JSON）、分享链接
- **收藏夹**：标题、时间、渲染结果、源码；可改名 / 复制 / 删除 / 插入；按标题或源码搜索；上限可配（默认 10）
- **识别**：图片识别（拖拽 / 粘贴）、文档识别（逐页 OCR，支持下载 Word / LaTeX / Markdown，最近 15 天记录可重新下载）
- **界面**：默认 150% 缩放、浅色/深色主题、简体中文 / 繁體中文 / English

![文档识别](docs/img/doc-ocr.png)

## 配置

设置 → 识别服务：可选 Harness 内置模型或自建 OpenAI 兼容端点；渲染与导出完全离线，仅识别会发送图片。

## 兼容性

- DSH ≥ 1.0（Cordis 插件规范：`dsh.bundle.patch` + `dsh.client`）
- 浏览器侧无构建步骤，MathJax 3 与 PDF.js 已随插件内置

## 许可

MIT
