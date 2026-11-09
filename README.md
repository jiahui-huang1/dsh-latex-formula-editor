# DSH LaTeX 公式编辑器

简体中文 · [English](README.en.md)

[![npm](https://img.shields.io/npm/v/dsh-latex-formula-editor.svg)](https://www.npmjs.com/package/dsh-latex-formula-editor)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-0e7490.svg)](https://github.com/topics/dsh-plugin)

一个免费开源、可离线使用的 LaTeX 公式编辑器，挂在 DeepSeek Harness Web UI 的**左侧栏**（图标 `Σ`）。
交互参考 [latexlive.com](https://www.latexlive.com/)，但**全部在自己的机器上运行**：数学渲染用随包分发的
MathJax，PDF 解析用随包分发的 PDF.js，没有账号、没有额度、也不会上传（除了你自己配置的识别后端）。

- 侧栏入口 → 主面板，五个视图：**编辑器 / 图片识别 / 文档识别 / 收藏夹 / 帮助**
- LaTeX 实时渲染（MathJax 3.2.2，SVG 输出，离线）
- 界面缩放默认 **125%**（设置 → 界面缩放可在 100%–200% 之间切换）
- 浅色 / 深色主题一键切换（默认跟随系统），简体中文 / 繁體中文 / English 三语
- 分享链接把公式编码进 URL hash，不经过任何服务器
- 九种导出格式 + 四组导出菜单（图片 / 代码 / 转义 / 分享）

![编辑器](docs/img/editor.png)

## 功能

### 快捷工具

输入区上方是 10 张磁贴：**常用符号 / 希腊字母 / 分数微分 / 根式角标 / 极限对数 / 三角函数 / 积分运算 / 大型运算 / 括号取整 / 数组矩阵**。

- 磁贴图标是按分类实时排版的代表公式，不是图片
- 悬停磁贴在正下方 **4px** 处展开该分类的符号面板，并按数据里的分组分节（如希腊字母 → 小写字母 30 / 大写字母 11），移开自动收拢
- 面板里每个符号右上角有 ☆，点一下收藏到收藏夹，点击符号本身插入到光标处
- 磁贴行支持**滚轮横向滚动**（竖向滚轮自动转成横向），最右侧磁贴可滚到

![快捷工具](docs/img/hover.png)

### 公式模板

10 张模板磁贴：**代数 / 几何 / 不等式 / 积分 / 矩阵 / 三角 / 统计 / 数列 / 物理 / 化学**，悬停展开后整条插入现成模板（求根公式、余弦定理、均值不等式、二项式定理、方差、等比数列求和、薛定谔方程、化学方程式等）。

![公式模板](docs/img/templates.png)

### 格式工具

磁贴行下方用分隔线隔开的独立一行，8 个等宽图标按钮（62px）：

| 按钮 | 说明 |
| --- | --- |
| 颜色 | 调色盘图标 + 取色器，选色即把选中文字包进 `\textcolor{#hex}{…}` |
| 字体 | 正体 / 加粗 / 斜体 / 下划线 / 无衬线 / 黑板粗体 / 手写体 / 德文尖角体，下拉里每项用该字体真实渲染 |
| 字号 | 极小 → 巨无霸九档，下拉里每项用该字号真实渲染 |
| 环境 | align / aligned / gathered / cases / split / array / eqnarray，以及「无环境」（拆掉最外层环境）；选中即包 `\begin{…}…\end{…}` |
| 清空 | 清空源码区 |
| 撤销 | 撤销上一步（连续输入 400ms 合并为一步，最多 120 步） |
| 导入 | 读取 `.tex` / `.txt` |
| 收藏 | 把当前公式存进收藏夹 |

有选中文字就包裹选中内容，没有则插入空壳并把光标放进去。

### 收藏夹

顶部第五个页签，每条收藏是一张卡片：

- **标题**（默认「未命名公式」，点击即可改名）、**收藏时间**、**渲染结果**、**LaTeX 源码**（点击即复制）
- **插入 / 复制 / 删除** 三个按钮
- 顶部搜索框可按**标题或源码**检索
- 数量上限默认 **10**，在 设置 → 收藏夹上限 调整（1–50），超出时丢弃最旧的一条

![收藏夹](docs/img/favourites.png)

### 输出区域

导出条在预览区顶部，四组菜单：

| 菜单 | 选项 |
| --- | --- |
| 输出图片 | SVG / PNG / JPG（3× 倍率） |
| 输出代码 | LaTeX、AsciiMath、Typst、SVG Code、HTML 行内、HTML 独立、MathML、MathML(mml:)、MathML(m:)、MathML(attr:)、OMML |
| 转义 | 反斜杠转义、`$…$`、`$$…$$`、`\(…\)`、`\[…\]`、JSON 字符串 |
| 分享 | 复制分享链接（`#tex=` 编码，打开即回填公式） |

AsciiMath / Typst 由内置 TeX 解析器真实转换，OMML 由 MathML DOM 转换为 Word 公式结构，不是直接复制 LaTeX。

预览画布底色随主题自动切换：浅色主题白底、深色主题黑底（透明 / 白底 / 深色仍可手动覆盖）。

### 识别

- **图片识别**：拖拽、粘贴或选择图片，调用你配置的模型识别为 LaTeX 并插入编辑器
- **文档识别**：PDF 逐页渲染后识别，可挑页；完成后可**下载 Word(.docx) / LaTeX / Markdown**——Word 里的公式是 Office Math（Cambria Math）对象，可在 Word 里直接编辑；切换页签不会打断识别，识别记录默认永久保存，可在设置里限定天数并手动清空

![文档识别](docs/img/doc-ocr.png)

### 界面

- 默认 **125%** 缩放，100%–200% 可调；窄面板自动进入紧凑布局（页签换行、图标化动作、面板内滚动）
- 浅色 / 深色主题滑块（太阳 / 月亮图标），默认跟随系统
- 语言菜单：简体中文 / 繁體中文 / English，繁体由简体词表实时转换

![设置](docs/img/settings.png)

## 安装

本插件通过**本地目录**挂载到 DSH profile（`link:` 依赖），也可以从 npm 安装：

```bash
# 方式一：本地目录
git clone https://github.com/jiahui-huang1/dsh-latex-formula-editor.git
pnpm dsh plugin add ./dsh-latex-formula-editor

# 方式二：npm 包
pnpm dsh plugin add dsh-latex-formula-editor
```

安装后在 DSH 左侧栏启用 **公式编辑器**（入口 id `latex-editor`）。修改插件后重启 DSH 即可生效。

## 目录结构

```
index.js                 Host 半：静态资源路由、识别接口、设置持久化、latex_formula 工具
client.js                客户端入口：注册侧栏入口（sidebar.panellist）与主面板（main）
lib/
 ├─ 00-core.js           命名空间、i18n、设置存储、UI 原子组件、图标
 ├─ 10-latex.js          符号表 / 模板 / 解析器 / 源码工具（纯逻辑）
 ├─ 20-render.js         MathJax 渲染、九种导出格式、PDF 生成
 ├─ 30-visual.js         旧版符号面板 / 模板面板 / 结构树（新面板见 35-tiles）
 ├─ 35-tiles.js          快捷工具与公式模板磁贴、收藏夹、导出菜单
 ├─ 40-recognition.js    识别后端（Harness 模型 / OpenAI 兼容端点）
 ├─ 45-convert.js        TeX → AsciiMath / Typst、MathML → OMML
 ├─ 50-app.js            主界面：编辑器、预览、导出、历史、分享
 ├─ 56-recognition-panels.js  图片识别与文档识别界面
 ├─ 60-settings-help.js  设置面板与帮助页
 └─ 90-skin.js           企业简洁风皮肤与主题变量
vendor/                  MathJax 3.2.2 与 PDF.js（随包分发）
```

## 设置

- **编辑器**：界面缩放（默认 125%）、源码字号、自动换行、公式编号、收藏夹上限
- **识别**：`auto` 优先用 Harness 模型；也可填 OpenAI 兼容端点（URL / 模型 / Key）
- 渲染与导出完全离线，只有识别会把图片发给你配置的后端
- 设置保存在本机 `<DSH_HOME>/latex-editor/settings.json`

## 兼容性

- DSH ≥ 1.0（Cordis 插件规范：`dsh.bundle.patch` + `dsh.client`）
- 浏览器侧没有构建步骤，MathJax 与 PDF.js 已随插件内置

## 许可

MIT
