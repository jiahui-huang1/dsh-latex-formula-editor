# 实测环境（真实界面验证）

本目录记录一次在**真实 DSH Web 界面**上验证插件的做法，供后续复现。

## 为什么需要单独起一个 web 实例

桌面版 profile（`~/.dsh/profiles/desktop`）被 Electron 独占，`dsh web` 会直接拒绝：

`
error: profile "desktop" is managed exclusively by the Electron application
`

因此验证用独立的 `web` profile：它加载同一个插件目录（`link:` 依赖 + junction），
但拥有自己的 `node_modules`，不会干扰桌面版。

## 一次性准备

`powershell
# 1) 插件装进 web profile（node_modules 里建 junction，免 pnpm）
New-Item -ItemType Directory -Force "$env:USERPROFILE\.dsh\profiles\web\node_modules" | Out-Null
New-Item -ItemType Junction 
  -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-latex-formula-editor" 
  -Target "D:\Huangjh\Documents\ChatGPT\AI工具使用\dsh-latex-formula-editor"
`

`profiles/web/package.json` 的 `dependencies` 与 `dsh.profile.bundles` 都要加上
`dsh-latex-formula-editor`（注意：**写 UTF-8 无 BOM**，否则 boot 时报
`SyntaxError: Unexpected token '锘'`）。

## 启动并拿到带 token 的地址

`powershell
$exe = "C:\Users\ustc\AppData\Local\Programs\DSH NEXT\DSH NEXT.exe"
$cli = "C:\Users\ustc\AppData\Local\Programs\DSH NEXT\resources\app.asar\node_modules\@deepseek-ai\dsh\lib\bin.js"
$env:ELECTRON_RUN_AS_NODE = "1"
& $exe $cli web --no-open --port 15125
# => dsh web: http://127.0.0.1:15125/?token=...
`

token 每个进程随机生成，只在启动行里出现一次；把整条 URL 交给浏览器打开即完成登录
（换取 `dsh-auth-*` 签名 cookie）。

## 已验证项（1920×1080 全屏）

- 侧栏「公式编辑器」入口、五个页签（编辑器/图片识别/文档识别/收藏夹/帮助）全部渲染，无 `data-slot-error`。
- 快捷工具 10 张磁贴（1.1.6 起全部为 SVG 图标）、悬停展开面板、点符号插入光标处。
- 源码编辑器自定义光标：`.lx-ed-caret` 实测 `1.25×28.75px`、颜色 `rgb(15,17,21)`，与 16px 字号字形对齐。
- MathJax 预览渲染、页签往返后状态保留。
- 窄宽度（面板 ~984px）时预览区工具行会折成三行：可接受，但已列入下一轮候选优化。

截图：仅在本机 `.iteration/` 留存，不入库（全屏图会带出个人工作区与会话名）。
