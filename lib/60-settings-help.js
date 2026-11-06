/**
 * @local/dsh-latex-editor — lib/60-settings-help.js
 *
 * The settings sheet (declarative `LX.settings` fields) and the in-app
 * documentation tab. Both pages are pure React over `LX.ui` primitives and the
 * harness theme tokens.
 */
;(function () {
  'use strict'
  const LX = window.__LX
  if (!LX || !LX.React) return
  const React = LX.React
  const h = LX.h
  const { useCallback, useEffect, useMemo, useState } = React
  const t = function (key, vars) {
    return LX.t(key, vars)
  }
  const { Button, IconButton, Input, Textarea, Select, Switch, Slider, Field, Badge, Spinner, Modal, Segmented, Divider, Kbd } = LX.ui

  const settings = LX.settings

  const EXTENSIONS = [
    { value: 'ams', zh: 'AMS', en: 'AMS', hintZh: '对齐与 AMS 数学环境', hintEn: 'Alignment and AMS environments' },
    { value: 'color', zh: '颜色', en: 'Color', hintZh: '\\color 与 \\textcolor', hintEn: '\\color and \\textcolor' },
    { value: 'cancel', zh: '删除线', en: 'Cancel', hintZh: '\\cancel 与 \\bcancel 约分标记', hintEn: '\\cancel and \\bcancel marks' },
    { value: 'bbox', zh: '边框', en: 'Bbox', hintZh: '为局部加框、底色与内边距', hintEn: 'Border, background and padding' },
    { value: 'physics', zh: '物理', en: 'Physics', hintZh: '\\dv 微分、\\vb 向量、括号等', hintEn: '\\dv, \\vb, bracket macros' },
    { value: 'mhchem', zh: '化学', en: 'Chem', hintZh: '\\ce 化学式与反应式', hintEn: '\\ce chemical formulas' },
    { value: 'unicode', zh: 'Unicode', en: 'Unicode', hintZh: '更宽的 Unicode 符号输入', hintEn: 'Wider Unicode input' },
    { value: 'newcommand', zh: '自定义宏', en: 'Macros', hintZh: '\\newcommand 自定义命令', hintEn: '\\newcommand support' },
    { value: 'noerrors', zh: '容错', en: 'Tolerant', hintZh: '弱化部分 TeX 错误', hintEn: 'Soften some TeX errors' },
    { value: 'textmacros', zh: '文本宏', en: 'Text macros', hintZh: '在 \\text{} 内解析宏', hintEn: 'Macros inside \\text{}' },
  ]

  /* ------------------------------------------------------------- fields */

  const FIELDS = [
    {
      key: 'backend',
      group: 'recognition',
      type: 'select',
      zh: '识别后端',
      en: 'Recognition backend',
      hintZh: 'auto 先试用当前对话模型，失败或不可用时再请求端点',
      hintEn: 'auto tries the current chat model first, then the endpoint',
      options: [
        { value: 'auto', zh: '自动', en: 'Automatic' },
        { value: 'llm', zh: '当前对话模型', en: 'Chat model' },
        { value: 'endpoint', zh: '自定义端点', en: 'Custom endpoint' },
      ],
      default: 'auto',
    },
    {
      key: 'endpointUrl',
      group: 'recognition',
      type: 'text',
      zh: '端点地址',
      en: 'Endpoint URL',
      hintZh: 'OpenAI 兼容的 /chat/completions 地址，可指向本机开源视觉模型',
      hintEn: 'OpenAI-compatible /chat/completions URL, local open models included',
      placeholder: 'http://127.0.0.1:11434/v1/chat/completions',
      default: '',
    },
    {
      key: 'endpointModel',
      group: 'recognition',
      type: 'text',
      zh: '端点模型',
      en: 'Endpoint model',
      hintZh: '例如 qwen2.5-vl、llava、minicpm-v',
      hintEn: 'For example qwen2.5-vl, llava, minicpm-v',
      placeholder: 'qwen2.5-vl',
      default: '',
    },
    {
      key: 'endpointKey',
      group: 'recognition',
      type: 'password',
      zh: '端点密钥',
      en: 'Endpoint key',
      hintZh: '仅保存在本机浏览器；本机模型通常留空',
      hintEn: 'Stored in this browser only; usually empty for local models',
      default: '',
    },
    {
      key: 'prompt',
      group: 'recognition',
      type: 'textarea',
      zh: '附加提示',
      en: 'Extra instruction',
      hintZh: '追加到识别提示词末尾，用来固定输出风格',
      hintEn: 'Appended to the recognition prompt to steer the output',
      placeholder: '例如：只输出公式本体，不要解释。',
      default: '',
    },
    {
      key: 'docMaxPages',
      group: 'recognition',
      type: 'number',
      zh: '文档每批页数上限',
      en: 'Pages per document batch',
      hintZh: '一次最多识别的页数，默认 30',
      hintEn: 'Maximum pages recognized in one run, 30 by default',
      min: 1,
      max: 100,
      default: 30,
    },
    {
      key: 'docScale',
      group: 'recognition',
      type: 'range',
      zh: 'PDF 渲染倍率',
      en: 'PDF render scale',
      hintZh: '倍率越高识别越准，速度越慢',
      hintEn: 'Higher looks better and costs more time',
      min: 1.5,
      max: 3,
      step: 0.5,
      default: 2,
    },
    {
      key: 'autoClearOnRecognize',
      group: 'behavior',
      type: 'switch',
      zh: '识图后替换编辑器内容',
      en: 'Replace the editor after OCR',
      hintZh: '关闭后识别结果会追加到当前公式之后',
      hintEn: 'When off, results are appended instead of replacing',
      default: true,
    },
    {
      key: 'livePreview',
      group: 'editor',
      type: 'switch',
      zh: '实时预览',
      en: 'Live preview',
      hintZh: '关闭后需要手动渲染，长公式更省资源',
      hintEn: 'When off, rendering waits for a manual refresh',
      default: true,
    },
    {
      key: 'numbered',
      group: 'editor',
      type: 'switch',
      zh: '公式编号',
      en: 'Numbering',
      hintZh: '预览与由预览导出的 SVG / PNG / PDF 会带编号',
      hintEn: 'Preview and its SVG / PNG / PDF exports carry a number',
      default: false,
    },
    {
      key: 'uiScale',
      group: 'editor',
      type: 'select',
      zh: '界面缩放',
      en: 'Interface scale',
      hintZh: '整个工作台相对 DSH 界面的缩放，默认 150%',
      hintEn: 'Scales the whole workbench relative to the DSH shell; 150% by default',
      options: [
        { value: 1, zh: '100%（与 DSH 一致）', en: '100% (matches DSH)' },
        { value: 1.25, zh: '125%', en: '125%' },
        { value: 1.5, zh: '150%（默认）', en: '150% (default)' },
        { value: 1.5, zh: '150%', en: '150%' },
        { value: 1.75, zh: '175%', en: '175%' },
        { value: 2, zh: '200%', en: '200%' },
      ],
      default: 1.5,
    },
    {
      key: 'previewScale',
      group: 'editor',
      type: 'range',
      zh: '预览比例',
      en: 'Preview zoom',
      hintZh: '只影响预览显示，不改变导出结果',
      hintEn: 'Display only; exports are unaffected',
      min: 0.5,
      max: 2,
      step: 0.1,
      default: 1,
    },
    {
      key: 'editorFontSize',
      group: 'editor',
      type: 'range',
      zh: '源码字号',
      en: 'Source font size',
      hintZh: '源码与预览同步缩放',
      hintEn: 'Scales the source and the preview together',
      min: 12,
      max: 22,
      step: 1,
      default: 15,
    },
    {
      key: 'favoritesLimit',
      group: 'editor',
      type: 'range',
      zh: '收藏夹上限',
      en: 'Favourites limit',
      hintZh: '收藏夹最多保存多少条公式（超出时最早的会被移除）',
      hintEn: 'How many favourites are kept; the oldest is dropped beyond the limit',
      min: 1,
      max: 50,
      step: 1,
      default: 10,
    },
    {
      key: 'wrap',
      group: 'editor',
      type: 'switch',
      zh: '自动换行',
      en: 'Word wrap',
      hintZh: '关闭后长公式横向滚动',
      hintEn: 'When off, long formulas scroll horizontally',
      default: true,
    },
  ]

  for (const field of FIELDS) settings.registerField(field)

  // NOTE: the bundled MathJax build is "tex-svg-full", which already ships and
  // pre-activates every TeX package. An enable/disable switch could not remove a
  // package that is already loaded, so the workbench documents the full package
  // set instead of offering a control that does nothing.

  /* ------------------------------------------------------------ controls */

  function MultiChips(props) {
    const selected = Array.isArray(props.value) ? props.value : []
    return h(
      'div',
      { className: 'lx-set-chips' },
      (props.options || []).map(function (option) {
        const on = selected.indexOf(option.value) >= 0
        return h(
          'button',
          {
            key: option.value,
            type: 'button',
            className: LX.cx('lx-set-chip', on && 'lx-set-chip--on'),
            'aria-pressed': on,
            title: LX.pick({ zh: option.hintZh, en: option.hintEn }, ''),
            onClick: function () {
              const next = on
                ? selected.filter(function (value) {
                    return value !== option.value
                  })
                : selected.concat([option.value])
              props.onChange(next)
            },
          },
          LX.pick(option),
        )
      }),
    )
  }

  function renderControl(field, value, onChange) {
    if (field.type === 'select') {
      return h(Select, {
        value: value,
        options: field.options || [],
        onChange: function (event) {
          onChange(event.target.value)
        },
        wrapStyle: { minWidth: 168 },
      })
    }
    if (field.type === 'switch') {
      return h(Switch, { checked: value === true, label: LX.pick(field), onChange })
    }
    if (field.type === 'range') {
      return h(
        'div',
        { className: 'lx-set-range' },
        h(Slider, { value: Number(value), min: field.min, max: field.max, step: field.step, label: LX.pick(field), onChange }),
        h('span', { className: 'lx-set-range-value' }, String(value)),
      )
    }
    if (field.type === 'number') {
      return h(Input, {
        type: 'number',
        value: value,
        min: field.min,
        max: field.max,
        style: { width: 96 },
        onChange: function (event) {
          const parsed = Number(event.target.value)
          onChange(Number.isFinite(parsed) ? parsed : field.default)
        },
      })
    }
    if (field.type === 'textarea') {
      return h(Textarea, {
        value: value || '',
        rows: 3,
        placeholder: field.placeholder || '',
        onChange: function (event) {
          onChange(event.target.value)
        },
      })
    }
    if (field.type === 'multi') {
      return h(MultiChips, { value, options: field.options, onChange })
    }
    return h(Input, {
      type: field.type === 'password' ? 'password' : 'text',
      value: value || '',
      placeholder: field.placeholder || '',
      autoComplete: 'off',
      onChange: function (event) {
        onChange(event.target.value)
      },
    })
  }

  const GROUPS = [
    { id: 'recognition', zh: '识别', en: 'Recognition', icon: 'Sparkle' },
    { id: 'editor', zh: '编辑与预览', en: 'Editor and preview', icon: 'Formula' },
    { id: 'behavior', zh: '行为', en: 'Behavior', icon: 'Bolt' },
  ]

  /* ------------------------------------------------------------ settings */

  function SettingsPanel(props) {
    const values = LX.useSettings()
    const [health, setHealth] = useState(null)
    const [busy, setBusy] = useState(false)
    const open = props.open === true

    useEffect(
      function () {
        if (!open) return undefined
        let alive = true
        setBusy(true)
        const recog = LX.recog
        const promise = recog && typeof recog.health === 'function' ? recog.health() : LX.api.health()
        Promise.resolve(promise)
          .then(function (payload) {
            if (alive) setHealth(payload)
          })
          .catch(function () {
            if (alive) setHealth(null)
          })
          .finally(function () {
            if (alive) setBusy(false)
          })
        return function () {
          alive = false
        }
      },
      [open],
    )

    const groups = useMemo(function () {
      return GROUPS.map(function (group) {
        return {
          ...group,
          fields: settings.fields().filter(function (field) {
            return (field.group || 'general') === group.id
          }),
        }
      }).filter(function (group) {
        return group.fields.length > 0
      })
    }, [open])

    const backendState = health
      ? health.endpoint && health.endpoint.configured
        ? { tone: 'success', zh: '端点已配置', en: 'Endpoint configured' }
        : health.llm && health.llm.vision
          ? { tone: 'success', zh: '对话模型支持读图', en: 'Chat model accepts images' }
          : { tone: 'warn', zh: '暂无可用识别后端', en: 'No recognition backend' }
      : busy
        ? { tone: 'neutral', zh: '检查中…', en: 'Checking…' }
        : { tone: 'warn', zh: 'Host 未连接', en: 'Host unreachable' }

    return h(
      Modal,
      {
        open,
        zh: '公式工作台设置',
        en: 'Workbench settings',
        onClose: props.onClose,
        width: 640,
        footer: [
          h(Button, {
            key: 'help',
            variant: 'ghost',
            size: 'sm',
            onClick: function () {
              if (typeof props.onOpenHelp === 'function') props.onOpenHelp()
            },
          }, t('set.help')),
          h('span', { key: 'spacer', style: { flex: 1 } }),
          h(Button, {
            key: 'reset',
            size: 'sm',
            onClick: function () {
              settings.reset()
              LX.toast(t('set.resetDone'), 'success')
            },
          }, t('set.reset')),
          h(Button, {
            key: 'done',
            size: 'sm',
            variant: 'primary',
            onClick: props.onClose,
          }, t('set.done')),
        ],
      },
      h(
        'div',
        { className: 'lx-set' },
        h(
          'div',
          { className: 'lx-set-status' },
          h('span', { className: 'lx-set-status-label' }, t('set.backendState')),
          h(Badge, { tone: backendState.tone }, LX.pick(backendState)),
          busy ? h(Spinner, { size: 12 }) : null,
          health && health.llm && health.llm.provider
            ? h('code', { className: 'lx-set-model' }, health.llm.provider + ' / ' + health.llm.model)
            : null,
        ),
        groups.map(function (group) {
          const Icon = LX.icons[group.icon] || LX.icons.Settings
          return h(
            'section',
            { key: group.id, className: 'lx-set-group' },
            h(
              'h3',
              { className: 'lx-set-group-title' },
              h(Icon, { size: 14 }),
              h('span', null, LX.pick(group)),
            ),
            group.fields.map(function (field) {
              const inline = field.type === 'switch'
              return h(
                Field,
                {
                  key: field.key,
                  zh: field.zh,
                  en: field.en,
                  hintZh: field.hintZh,
                  hintEn: field.hintEn,
                  inline,
                },
                renderControl(field, values[field.key], function (next) {
                  settings.set(field.key, next)
                }),
              )
            }),
          )
        }),
        h(
          'p',
          { className: 'lx-set-note' },
          t('set.storageNote'),
        ),
      ),
    )
  }

  /* ---------------------------------------------------------------- help */

  function HelpSection(props) {
    return h(
      'section',
      { className: 'lx-help-section' },
      h('h3', { className: 'lx-help-title' }, props.title),
      props.children,
    )
  }

  function HelpTab(props) {
    const rows = [
      ['Ctrl / Cmd + Enter', t('help.k.run')],
      ['Ctrl / Cmd + Z', t('help.k.undo')],
      ['Tab', t('help.k.tab')],
      ['\\ + 命令前缀', t('help.k.complete')],
      ['{ [ (', t('help.k.pairs')],
      ['Esc', t('help.k.escape')],
    ]
    const formats = (LX.render && LX.render.formats) || []
    const features = [
      { icon: 'Grid', zh: '快捷工具：10 张磁贴（常用符号、希腊字母、分数微分、根式角标、极限对数、三角函数、积分运算、大型运算、括号取整、数组矩阵），悬停即展开该类的符号面板，点一下插入到光标处。', en: 'Quick tools: ten tiles (common symbols, Greek, fractions/calculus, roots and scripts, limits and logs, trigonometry, integrals, large operators, brackets and floors, matrices). Hover a tile to expand its symbols, click one to insert it at the caret.' },
      { icon: 'Matrix', zh: '公式模板：代数、几何、不等式、积分、矩阵、三角、统计、数列、物理、化学十类，展开后是可整条插入的现成模板。', en: 'Templates: algebra, geometry, inequalities, integrals, matrices, trigonometry, statistics, sequences, physics and chemistry — each expands into ready-to-insert snippets.' },
      { icon: 'Palette', zh: '格式行：颜色取色即包裹 \textcolor；字体按真实字体渲染预览；字号按真实大小渲染；环境可包 align / aligned / gathered / cases / split / array / eqnarray，选「无环境」则拆掉最外层环境。', en: 'Format row: picking a colour wraps the selection in \textcolor; the font and size menus preview the actual rendering; the environment menu wraps align/aligned/gathered/cases/split/array/eqnarray, and 「none」 strips the outer environment.' },
      { icon: 'Undo', zh: '撤销与清空：撤销按 400ms 合并连续输入，最多保留 120 步；清空一键删掉整个源码。', en: 'Undo and clear: undo merges keystrokes within 400 ms and keeps up to 120 steps; clear empties the whole source.' },
      { icon: 'Upload', zh: '导入与导出：导入可读入 .tex/.txt；导出支持 PNG / JPEG / WebP / SVG / PDF / MathML / HTML / Markdown / LaTeX 九种格式。', en: 'Import and export: import reads .tex/.txt; export covers PNG, JPEG, WebP, SVG, PDF, MathML, HTML, Markdown and LaTeX.' },
      { icon: 'Star', zh: '收藏夹：把当前公式存进收藏夹（默认上限 10 条，可在设置里改），每条带标题、时间、渲染预览与源码，可改名、复制、删除、重新插入，并支持按标题或源码搜索。', en: 'Favourites: save the current formula (limit 10 by default, configurable). Each entry keeps a title, timestamp, render and source; rename, copy, delete, re-insert, and search by title or source.' },
      { icon: 'Image', zh: '图片识别：拖拽、粘贴或选择图片，调用你配置的模型识别为 LaTeX 并插入编辑器。', en: 'Image OCR: drop, paste or pick an image; the configured model returns LaTeX that is inserted into the editor.' },
      { icon: 'Doc', zh: '文档识别：PDF 逐页渲染后识别，可挑页、可批量插入或导出。', en: 'Document OCR: renders each PDF page, recognises it, and lets you pick pages to insert or export.' },
      { icon: 'Globe', zh: '语言：右上角地球按钮在简体中文 / 繁體中文 / English 之间循环。', en: 'Language: the globe button cycles 简体中文 / 繁體中文 / English.' },
      { icon: 'Sparkle', zh: '主题：右上角开关在浅色与深色之间切换（默认跟随系统）。', en: 'Theme: the switch near the top-right toggles light and dark (auto by default).' },
      { icon: 'Lock', zh: '完全离线：渲染与导出都在本机完成，只有识别会把图片发给你配置的后端。', en: 'Fully offline: rendering and export run locally; only OCR sends the image to your backend.' },
    ]

    return h(
      'div',
      { className: 'lx-help lx-scroll' },
      h(
        'header',
        { className: 'lx-help-head' },
        h('h2', { className: 'lx-help-h2' }, t('help.title')),
        h('p', { className: 'lx-help-lead' }, t('help.lead')),
        h(
          'div',
          { className: 'lx-help-actions' },
          h(Button, {
            size: 'sm',
            icon: LX.icons.Settings,
            onClick: function () {
              if (typeof props.onOpenSettings === 'function') props.onOpenSettings()
            },
          }, t('set.title')),
          h(Button, {
            size: 'sm',
            variant: 'ghost',
            icon: LX.icons.Code,
            onClick: function () {
              const readme = t('help.readmePath')
              LX.util.copyText(readme).then(function (ok) {
                LX.toast(ok ? t('help.pathCopied') : t('common.copyFailed'), ok ? 'success' : 'error')
              })
            },
          }, t('help.copyPath')),
        ),
      ),
      h(
        'div',
        { className: 'lx-help-grid' },
        h(
          HelpSection,
          { title: t('help.features') },
          h(
            'ul',
            { className: 'lx-help-list' },
            features.map(function (feature) {
              const Icon = LX.icons[feature.icon] || LX.icons.Info
              return h(
                'li',
                { key: feature.en },
                h('span', { className: 'lx-help-icon' }, h(Icon, { size: 14 })),
                h('span', null, LX.pick(feature)),
              )
            }),
          ),
        ),
        h(
          HelpSection,
          { title: t('help.shortcuts') },
          h(
            'table',
            { className: 'lx-help-table' },
            h('tbody', null, rows.map(function (row) {
              return h(
                'tr',
                { key: row[0] },
                h('td', null, h(Kbd, null, row[0])),
                h('td', null, row[1]),
              )
            })),
          ),
        ),
      ),
      h(
        HelpSection,
        { title: t('help.ocr') },
        h('p', { className: 'lx-help-p' }, t('help.ocrIntro')),
        h(
          'ol',
          { className: 'lx-help-ol' },
          h('li', null, t('help.ocrStep1')),
          h('li', null, t('help.ocrStep2')),
          h('li', null, t('help.ocrStep3')),
        ),
        h('pre', { className: 'lx-help-code' }, t('help.ocrExample')),
      ),
      h(
        HelpSection,
        { title: t('help.exports') },
        h(
          'table',
          { className: 'lx-help-table' },
          h(
            'tbody',
            null,
            (formats.length > 0 ? formats : [{ id: 'svg' }, { id: 'png' }, { id: 'pdf' }, { id: 'latex' }]).map(function (format) {
              return h(
                'tr',
                { key: format.id },
                h('td', null, LX.pick(format, format.id)),
                h('td', null, format.ext ? '.' + format.ext : ''),
                h('td', null, t('help.fmt.' + format.id)),
              )
            }),
          ),
        ),
      ),
      h(
        HelpSection,
        { title: t('help.commands') },
        h('p', { className: 'lx-help-p' }, t('help.commandsBody')),
        h(
          'div',
          { className: 'lx-help-chips' },
          (EXTENSIONS || []).map(function (extension) {
            return h('span', { key: extension.value, className: 'lx-help-chip' }, extension.value)
          }),
        ),
      ),
      h(
        HelpSection,
        { title: t('help.license') },
        h('p', { className: 'lx-help-p' }, t('help.licenseBody')),
        h(
          'ul',
          { className: 'lx-help-list lx-help-list--plain' },
          h('li', null, 'DSH LaTeX Formula Workbench — MIT'),
          h('li', null, 'MathJax 3.2.2 — Apache-2.0 / MPL-2.0 (vendored under vendor/mathjax)'),
          h('li', null, 'PDF.js 3.11.174 — Apache-2.0 (vendored under vendor/pdfjs)'),
        ),
      ),
    )
  }

  /* ------------------------------------------------------------ dictionary */

  LX.addDict('zh', {
    'set.title': '设置',
    'set.help': '查看帮助',
    'set.reset': '恢复默认',
    'set.done': '完成',
    'set.resetDone': '已恢复默认设置',
    'set.backendState': '识别后端',
    'set.storageNote': '这些偏好保存在本机浏览器；识别后端由工作台按需调用，图片不会离开你指定的服务。',
    'help.title': '公式工作台说明',
    'help.lead': '一个免费开源的 LaTeX 公式编辑器：左侧输入源码或点选符号，右侧即时渲染，并支持公式图片与 PDF 文档识别、九种格式导出。渲染完全在本地完成，无需联网。',
    'help.features': '功能',
    'help.shortcuts': '快捷键',
    'help.k.run': '立即渲染当前公式',
    'help.k.tab': '插入两个空格缩进',
    'help.k.complete': '弹出命令补全，↑↓ 选择，Enter 确认',
    'help.k.pairs': '自动补全成对括号',
    'help.k.escape': '关闭补全候选',
    'help.ocr': '识别后端',
    'help.ocrIntro': '识别有两种后端，任选其一即可使用：',
    'help.ocrStep1': '当前对话模型：如果正在使用的模型能读图，图片识别直接调用它，无需任何配置。',
    'help.ocrStep2': 'OpenAI 兼容端点：在设置里填写 /chat/completions 地址与模型名，可指向本机或局域网里的开源视觉模型（vLLM、Ollama、LM Studio 等）。',
    'help.ocrStep3': '两者都不可用时，界面会明确提示，不会伪造结果。',
    'help.ocrExample': '示例：\n地址  http://127.0.0.1:11434/v1/chat/completions\n模型  qwen2.5-vl\n密钥  本机模型留空即可',
    'help.exports': '导出格式',
    'help.fmt.svg': '矢量图，可无限缩放，适合论文与网页',
    'help.fmt.png': '透明背景位图，适合粘贴到文档',
    'help.fmt.jpg': '白底位图，体积更小',
    'help.fmt.webp': '现代位图格式，体积最小',
    'help.fmt.pdf': '单页 PDF，可直接插入报告',
    'help.fmt.mathml': 'MathML 标记，便于与其他编辑器交换',
    'help.fmt.latex': '原始 LaTeX 源码',
    'help.fmt.html': '带内嵌 SVG 的独立网页',
    'help.fmt.markdown': '$$ 包裹的 Markdown 公式块',
    'help.commands': '支持的命令',
    'help.commandsBody': '已内置 MathJax 3 的完整 TeX 组合包（tex-svg-full），以下扩展开箱即用，无需配置：',
    'help.license': '开源许可',
    'help.licenseBody': '本插件以 MIT 许可发布；数学渲染与 PDF 解析使用随包分发的开源库：',
    'help.copyPath': '复制插件路径',
    'help.pathCopied': '插件目录已复制',
    'help.readmePath': 'dsh-latex-editor-plugin/README.md',
  })
  LX.addDict('en', {
    'set.title': 'Settings',
    'set.help': 'Read the docs',
    'set.reset': 'Reset',
    'set.done': 'Done',
    'set.resetDone': 'Defaults restored',
    'set.backendState': 'Recognition backend',
    'set.storageNote': 'Preferences live in this browser. Recognition calls the backend you choose; the image never goes anywhere else.',
    'help.title': 'Workbench documentation',
    'help.lead': 'A free and open-source LaTeX formula editor: type source or click symbols on the left, see the formula render on the right, transcribe formula images and PDF pages, and export in nine formats. Rendering happens entirely on this machine.',
    'help.features': 'Features',
    'help.shortcuts': 'Shortcuts',
    'help.k.run': 'Render the current formula now',
    'help.k.tab': 'Insert a two-space indent',
    'help.k.complete': 'Command completion; ↑↓ to pick, Enter to accept',
    'help.k.pairs': 'Auto-close brackets',
    'help.k.escape': 'Dismiss the completion popup',
    'help.ocr': 'Recognition backends',
    'help.ocrIntro': 'Two backends are available; either one is enough:',
    'help.ocrStep1': 'Chat model: when the model you are chatting with accepts images, OCR calls it directly with no setup.',
    'help.ocrStep2': 'OpenAI-compatible endpoint: set a /chat/completions URL and model name, pointing at any open vision model on this machine or your LAN (vLLM, Ollama, LM Studio, …).',
    'help.ocrStep3': 'When neither is usable the panel says so instead of inventing a result.',
    'help.ocrExample': 'Example:\nURL    http://127.0.0.1:11434/v1/chat/completions\nmodel  qwen2.5-vl\nkey    empty for a local model',
    'help.exports': 'Export formats',
    'help.fmt.svg': 'Vector output, scales cleanly in papers and on the web',
    'help.fmt.png': 'Transparent bitmap for pasting into documents',
    'help.fmt.jpg': 'White-background bitmap, smaller files',
    'help.fmt.webp': 'Modern bitmap with the smallest size',
    'help.fmt.pdf': 'Single-page PDF for reports',
    'help.fmt.mathml': 'MathML markup for exchanging with other editors',
    'help.fmt.latex': 'The raw LaTeX source',
    'help.fmt.html': 'Standalone page with the inline SVG',
    'help.fmt.markdown': 'A $$ fenced Markdown math block',
    'help.commands': 'Supported commands',
    'help.commandsBody': 'The complete MathJax 3 TeX package set is bundled (tex-svg-full); these extensions work out of the box — no configuration needed:',
    'help.license': 'Licenses',
    'help.licenseBody': 'This plugin is MIT licensed. Math rendering and PDF parsing use these bundled open-source libraries:',
    'help.copyPath': 'Copy plugin path',
    'help.pathCopied': 'Plugin directory copied',
    'help.readmePath': 'dsh-latex-editor-plugin/README.md',
  })

  LX.addCss(`
.lx-set{display:flex;flex-direction:column;gap:16px;}
.lx-set-status{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary);}
.lx-set-status-label{font-weight:500;color:var(--dsw-alias-label-primary);}
.lx-set-model{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;opacity:.85;}
.lx-set-group{display:flex;flex-direction:column;gap:11px;}
.lx-set-group-title{margin:0;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);}
.lx-set-note{margin:0;font-size:11.5px;line-height:1.65;color:var(--dsw-alias-label-secondary);}
.lx-set-range{display:flex;align-items:center;gap:10px;width:100%;max-width:320px;}
.lx-set-range .lx-range{flex:1;}
.lx-set-range-value{min-width:32px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);}
.lx-set-chips{display:flex;flex-wrap:wrap;gap:5px;}
.lx-set-chip{height:25px;padding:0 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11.5px;cursor:pointer;}
.lx-set-chip:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);}
.lx-set-chip--on{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent);color:var(--dsw-alias-brand-primary);font-weight:500;}
.lx-set-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}

.lx-help{flex:1;min-height:0;padding:20px 26px 56px;}
.lx-help-head{max-width:860px;margin:0 auto 18px;}
.lx-help-h2{margin:0 0 6px;font-size:18px;font-weight:600;}
.lx-help-lead{margin:0;font-size:13px;line-height:1.75;color:var(--dsw-alias-label-secondary);max-width:760px;}
.lx-help-actions{display:flex;gap:8px;margin-top:12px;}
.lx-help-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;max-width:860px;margin:0 auto 16px;}
.lx-help-section{max-width:860px;margin:0 auto 18px;padding:14px 16px;border-radius:11px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}
.lx-help-grid .lx-help-section{max-width:none;margin:0;}
.lx-help-title{margin:0 0 9px;font-size:13px;font-weight:600;}
.lx-help-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px;}
.lx-help-list li{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);}
.lx-help-list--plain li{padding-left:14px;position:relative;}
.lx-help-list--plain li::before{content:"·";position:absolute;left:4px;color:var(--dsw-alias-brand-primary);}
.lx-help-icon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.lx-help-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.lx-help-table td{padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);vertical-align:top;}
.lx-help-table tr:last-child td{border-bottom:0;}
.lx-help-table td:first-child{white-space:nowrap;color:var(--dsw-alias-label-primary);width:1%;}
.lx-help-p{margin:0 0 8px;font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary);}
.lx-help-ol{margin:0 0 10px;padding-left:20px;font-size:12.5px;line-height:1.75;color:var(--dsw-alias-label-secondary);}
.lx-help-code{margin:0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-primary);white-space:pre-wrap;}
.lx-help-chips{display:flex;flex-wrap:wrap;gap:5px;}
.lx-help-chip{padding:2px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);}
`)

  LX.pages = { SettingsPanel, HelpTab, settingsFields: FIELDS }
})()
