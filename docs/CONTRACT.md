# dsh-latex-editor — module contract

A DSH Web plugin (bundle) that puts a free, open-source LaTeX formula workbench in
the left sidebar. Browser modules are **classic scripts** served from
`/plugins/latex-editor/lib/<file>.js` and loaded in filename order by `client.js`.
There is **no bundler, no build step, no imports** — every module reads the shared
`window.__LX` namespace created by `lib/00-core.js`.

## Hard rules

1. One IIFE per file: `;(function(){ 'use strict'; const LX = window.__LX; if(!LX) return; ... })()`.
   Never reassign `window.__LX`; only add your own documented key.
2. React is `LX.React`, `createElement` is `LX.h` (or `const h = LX.h`). Never `require`
   anything, never import a Harness client package, never touch `document.body`,
   never query another plugin's DOM.
3. All visible text goes through `LX.t('yourprefix.key')`, with keys contributed by
   `LX.addDict('zh', {...})` / `LX.addDict('en', {...})` at load time. Use your own
   key prefix (`pal.`, `ed.`, `exp.`, `ocr.`, `doc.`, `set.`, `help.`). Never edit
   another module's keys.
4. Style only with the theme tokens `--dsw-alias-*` (see `lib/00-core.js` CSS). Literal
   colors are only allowed for formula preview artwork. CSS goes into `LX.addCss(...)`
   with a class prefix you own (`lx-pal-`, `lx-tree-`, `lx-ocr-`, ...).
5. Reuse `LX.ui.*` (`Button, IconButton, Input, Textarea, Select, Switch, Slider, Field,
   Segmented, Tabs, Badge, Spinner, ProgressBar, Empty, Card, Divider, Kbd, Modal,
   ToastHost`) and `LX.icons.*` instead of writing new controls, so the workbench looks
   like the host.
6. `node --check <file>` must pass (plain ES2022, no JSX, no TypeScript). Keep the file
   under ~2200 lines; split styling into a template literal at the end.
7. Do not edit files outside your scope. Do not install anything. Do not run pnpm/npm.
8. Everything must work offline: no CDN, no remote fonts, no network except same-origin
   `/plugins/latex-editor/*` routes.

## Host routes (implemented in `index.js`, already fixed)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/plugins/latex-editor/health` | – | `{ ok, backend, llm:{available,provider,model,vision}, endpoint:{configured} }` |
| POST | `/plugins/latex-editor/recognize` | `{ image:'data:image/…;base64,…', hint?:string, backend?:'auto'\|'llm'\|'endpoint' }` | `{ latex, backend, model, ms }` — errors are HTTP 4xx/5xx with `{ error, code }` |
| POST | `/plugins/latex-editor/save` | `{ filename, content }` | `{ path }` |
| GET | `/plugins/latex-editor/vendor/mathjax/tex-svg-full.js` | – | MathJax 3.2.2 combined TeX→SVG bundle |
| GET | `/plugins/latex-editor/vendor/pdfjs/pdf.min.js` | – | PDF.js 3.11 UMD |
| GET | `/plugins/latex-editor/vendor/pdfjs/pdf.worker.min.js` | – | PDF.js worker |

## `LX.latex` — owned by `lib/10-latex.js`

```js
LX.latex = {
  palette: [                       // top-level categories (rendered as tabs)
    { id, zh, en, groups: [ { id, zh, en, items: [ { tex, zh, en } ] } ] }
  ],
  templates: [                     // structural templates
    { id, zh, en, group, tex, caret }   // caret: index inside `tex` where the caret lands
  ],
  insertAt(text, selStart, selEnd, snippet, caret) -> { text, selStart, selEnd },
  wrapSelection(text, selStart, selEnd, before, after) -> { text, selStart, selEnd },
  parse(source) -> ast,            // { type:'root', start, end, children:[...] }
  outline(source) -> [ { depth, kind, label:{zh,en}, start, end, tex } ],
  tokenize(source) -> [ { from, to, cls } ],   // cls: command|brace|math|number|text|comment|env
  normalize(source) -> string,     // strips $, $$, \[ \], wrappers, trims
  stats(source) -> { chars, commands, depth },
  completions() -> [ { cmd, zh, en } ],
}
```

`outline()` must return **at least** groups, commands with their arguments, scripts,
environments and text runs, with `start`/`end` being offsets into `source` so the
editor can select them. Depth starts at 0.

## `LX.render` — owned by `lib/20-render.js`

```js
LX.render = {
  ensure(extensions) -> Promise<boolean>,       // idempotent MathJax load + package config
  tex2svg(source, { display=true, numbered=false, extensions=[], scale=1 }) ->
      Promise<{ svg, width, height, errors:[{ message }] }>,   // svg = outerHTML string
  tex2mathml(source, opts) -> Promise<string>,
  tex2html(source, opts) -> Promise<string>,     // standalone HTML document
  svgToPng(svg, { scale=2, background=null }) -> Promise<Blob>,
  svgToJpeg(svg, { scale=2, background='#ffffff', quality=0.95 }) -> Promise<Blob>,
  svgToWebp(svg, { scale=2, background=null }) -> Promise<Blob>,
  svgToPdf(svg, { scale=2, background=null, margin=12 }) -> Promise<Blob>,
  formats: [ { id, zh, en, ext, mime } ],       // for the export menu
  exportAs(formatId, source, options) -> Promise<{ blob, filename }>,
}
```

Constraints: MathJax is loaded from `LX.api.asset('vendor/mathjax/tex-svg-full.js')`
(global check `window.MathJax?.startup?.document`), configured with
`{ loader:{load:['[tex]/ams', …]}, tex:{packages:{'[+]':extensions}}, svg:{fontCache:'local'} }`
and `options.enableMenu=false`. SVG output must contain no external references so it
rasterizes through `Image` + `canvas` (MathJax SVG glyph paths qualify). PDF must be
written by hand (no dependencies): one page, one image XObject, FlateDecode via
`CompressionStream('deflate')` when available with an uncompressed fallback.

## `LX.recog` / `LX.recogUI` — owned by `lib/40-recognition.js` + `lib/56-recognition-panels.js`

```js
LX.recog = {
  loadPdfJs() -> Promise<lib>,                 // sets workerSrc to the vendored worker
  openPdf(file) -> Promise<{ doc, pages, title }>,
  renderPage(doc, n, { scale=2 }) -> Promise<HTMLCanvasElement>,
  thumbnail(doc, n, maxWidth=140) -> Promise<string>,   // data URL
  recognizeImage(dataUrl, { hint, backend, signal }) -> Promise<{ latex, backend, model, ms }>,
  health() -> Promise<health payload | null>,
}
LX.recogUI = {
  ImageTab({ t, onInsert, onOpenSettings }),      // full page body for the 图片识别 tab
  DocumentTab({ t, onInsert, onOpenSettings }),   // full page body for the 文档识别 tab
}
```

Tabs render a single `<div className="lx-tabpage lx-scroll">` filling the panel
(`flex:1;min-height:0`), and use only `LX.ui` primitives. Image tab: drop zone,
paste handler, preview, hint input, recognize button, result textarea + 复制 / 发送到编辑器.
Document tab: PDF drop zone (PDF only, ≤100 pages, ≤50 MB), rendered page thumbnails
with checkboxes, page-range summary, recognize-with-progress, per-page result list with
复制 / 发送到编辑器, and "全部导出 .tex / .md".

## `LX.visual` — owned by `lib/30-visual.js` (Lead)

```js
LX.visual = {
  SymbolPanel({ onInsert }),      // palette tabs + grid, click inserts
  TemplatePanel({ onInsert }),
  StructurePanel({ tex, selection, onSelect, onReplace }),
  ops: { wrap, insertRow, deleteNode },
}
```

## Entry / shell — owned by `client.js` + `lib/50-app.js` (Lead)

`client.js` registers `sidebar.panellist` (`id: latex-editor`) and `main`
(`key: latex-editor`), registers the merged dictionaries once via `ctx.locale.register`,
binds the translator (`LX.setTranslator`, `LX.setLanguage`), and renders
`LX.app.Workbench(props)`.


## 交付现状（实现完成后核对）

三个模块均按上面的契约实现，冻结版本的公开面如下：

- `lib/10-latex.js` → `LX.latex = { palette, templates, templateGroups, insertAt, wrapSelection, parse, outline, tokenize, normalize, stats, completions, commandLabel, previewTex }`
  10 类 / 37 组 / 438 个符号（291 个带 `glyph`）/ 9 个模板组 / 48 个模板 / 408 条补全。
- `lib/20-render.js` → `LX.render = { ensure, tex2svg, tex2mathml, tex2html, svgToPng, svgToJpeg, svgToWebp, svgToPdf, formats, exportAs }`
  （另有非枚举别名 `toPng/toJpeg/toWebp/toPdf`）。`extensions` 是增量预加载：随包分发的 `tex-svg-full`
  已预激活全部 32 个 TeX 包，因此该参数无法关闭已加载的包。
- `lib/40-recognition.js` → `LX.recog = { loadPdfJs, openPdf, renderPage, thumbnail, pageToDataUrl, recognizeImage, downscaleImage, health, invalidateHealth, closePdf, sanitizeLatex, errorCodes }`
- `lib/56-recognition-panels.js` → `LX.recogUI = { ImageTab, DocumentTab }`，props `{ t, onInsert(latex), onOpenSettings() }`。
- Host 侧 `index.js` 另有 `GET/PUT /plugins/latex-editor/settings`（面板设置回写并持久化到
  `<DSH_HOME>/latex-editor/settings.json`），以及 `latex_formula` 工具。


## 样式层（`lib/90-skin.js`）

界面遵循**企业简洁风（Corporate Clean）**，全部视觉规则集中在最后加载的 `lib/90-skin.js`：

- `.lx-root` 上的 `--lx-*` token（`accent #2563eb`、`--lx-page/card/border`、三档阴影、`--lx-r-lg/xl`、`--lx-focus`），
  表面色由宿主 `--dsw-alias-*` 用 `color-mix` 推导，因此浅色/深色自动成立；
- 组件皮肤：按钮（shadow-sm → hover 上浮 1px + shadow → active `scale(.98)`）、输入（focus 边框 + 3px 柔环）、
  switch、segmented、tabs、badge、card、modal、toast、导出条、符号/模板/结构面板、识别页签、设置与帮助；
- 焦点统一为 `0 0 0 2px 表面色, 0 0 0 4px #3b82f6`（ring + ring-offset 2，WCAG 2.1 AA 分离式焦点环）；
- 所有过渡 ≤200ms `ease-out`，并提供 `prefers-reduced-motion` 降级；
- 禁止项：无渐变控件、无直角、无 `shadow-2xl`、无嵌套卡片（检查器网格与代码块视为凹陷区块，不加边框/阴影）。

新增功能模块时**不要**再写自己的颜色/阴影/圆角，只加结构与既有 token，视觉由这一层收口。


## 字阶

`lib/90-skin.js` 末尾的 `type scale` 段定义全局字号（正文 14.5、按钮 14.5/600、页签 15.5、
标题 17、辅助 13.5、徽标 12.5–13），并强制 `textarea { font-size: inherit }`——UA 样式表默认
13.33px，否则源码字号设置与高亮覆盖层会错位。新增模块请复用这套字号，不要另设更小的值。


## 快捷工具磁贴与悬停面板

`.lx-quick` 磁贴悬停时，`SymbolPanel` 在磁贴行下方用 `.lx-quick-pop` 覆盖层展开该分类的符号（标题 + 数量 + 可滚动网格），
指针移到面板内保持不变，离开 180ms 后收起；点击面板内符号直接插入光标处。面板内容**按分类的分组分节渲染**（`HoverGroups`），
搜索时改为「搜索结果」平铺面板。磁贴行用 `ResizeObserver` 量高度，面板 `top` 由该高度决定，高度上限由外壳的 `--lx-pop-max` 控制。
磁贴行注册了 `passive:false` 的 `wheel` 监听，把竖向滚轮转成 `scrollLeft`，右侧磁贴可以滚到。常驻的符号网格已移除。默认界面缩放 150%（`--lx-ui-scale`），100%–200% 可在设置里切换。
