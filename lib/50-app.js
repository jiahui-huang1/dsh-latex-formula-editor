/**
 * @local/dsh-latex-editor — lib/50-app.js
 *
 * The workbench shell: header with tabs (编辑器 / 图片识别 / 文档识别 / 帮助),
 * the LaTeX source editor with syntax highlighting, bracket matching and command
 * autocompletion, the live MathJax preview, the symbol/template/structure drawer,
 * the export bar and the share-link/import/history actions.
 */
;(function () {
  'use strict'
  const LX = window.__LX
  if (!LX || !LX.React) return
  const React = LX.React
  const h = LX.h
  const { useCallback, useEffect, useMemo, useRef, useState } = React
  const t = function (key, vars) {
    return LX.t(key, vars)
  }
  const { Button, IconButton, Input, Switch, Segmented, Tabs, Badge, Spinner, ProgressBar, Empty, Modal, Field, Select } = LX.ui

  const FORMAT_SHORT = {
    svg: 'SVG',
    png: 'PNG',
    jpg: 'JPG',
    webp: 'WebP',
    pdf: 'PDF',
    mathml: 'MathML',
    latex: 'LaTeX',
    html: 'HTML',
    markdown: 'Markdown',
  }

  /** Base size of the rendered formula (zoom multiplies this). */
  const TEX_SCALE = 1.18

  const DOC_KEY = 'document.v1'
  const HISTORY_KEY = 'history.v1'
  const TAB_KEY = 'tab.v1'
  const TAB_IDS = ['editor', 'image', 'document', 'favorites', 'help']
  const SAMPLES = [
    { id: 'quadratic', zh: '求根公式', en: 'Quadratic roots', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
    {
      id: 'gauss',
      zh: '高斯积分', en: 'Gaussian integral', tex: '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,\\mathrm{d}x = \\sqrt{\\pi}',
    },
    {
      id: 'euler',
      zh: '欧拉恒等式', en: 'Euler identity', tex: 'e^{i\\pi} + 1 = 0',
    },
    {
      id: 'matrix',
      zh: '矩阵与分段', en: 'Matrix and cases',
      tex: 'A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix},\\qquad f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}',
    },
    {
      id: 'maxwell',
      zh: '麦克斯韦方程', en: 'Maxwell equations',
      tex: '\\begin{aligned} \\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\ \\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t} \\end{aligned}',
    },
    {
      id: 'physics',
      zh: '物理与化学', en: 'Physics and chemistry',
      tex: '\\dv{f}{x},\\quad \\ce{H2O ->[\\text{heat}] H2 + O2},\\quad \\cancel{(x+1)}\\frac{(x+1)^2}{x-1}',
    },
  ]

  /* --------------------------------------------------------------- helpers */

  function readDocument() {
    const stored = LX.storage.get(DOC_KEY, null)
    if (stored && typeof stored.tex === 'string') return stored.tex
    if (stored && Array.isArray(stored.lines)) return stored.lines.join('\n')
    return 'E = mc^2'
  }

  function readTab() {
    const stored = LX.storage.get(TAB_KEY, '')
    return TAB_IDS.indexOf(stored) >= 0 ? stored : 'editor'
  }

  function fmtNumber(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  /** Measure the caret's position inside a textarea through a hidden mirror. */
  function caretPoint(textarea, container, offset) {
    if (!textarea || !container) return { left: 0, top: 0 }
    const style = window.getComputedStyle(textarea)
    const mirror = document.createElement('div')
    const properties = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'letterSpacing',
      'lineHeight',
      'textTransform',
      'textIndent',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
    ]
    for (const property of properties) mirror.style[property] = style[property]
    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.overflowWrap = 'break-word'
    mirror.style.wordBreak = 'break-word'
    mirror.style.width = textarea.clientWidth + 'px'
    mirror.style.top = '0'
    mirror.style.left = '0'
    mirror.style.pointerEvents = 'none'
    mirror.scrollTop = textarea.scrollTop
    const before = document.createTextNode(textarea.value.slice(0, offset))
    const marker = document.createElement('span')
    marker.textContent = '\u200b'
    mirror.appendChild(before)
    mirror.appendChild(marker)
    container.appendChild(mirror)
    const left = marker.offsetLeft - textarea.scrollLeft
    const top = marker.offsetTop - textarea.scrollTop
    container.removeChild(mirror)
    return { left, top }
  }

  /* ---------------------------------------------------------- syntax layer */

  const FALLBACK_RULES = [
    { cls: 'command', regex: /\\[a-zA-Z@]+\*?/g },
    { cls: 'brace', regex: /[{}[\]()]/g },
    { cls: 'number', regex: /(?<![\w.])\d+(?:\.\d+)?/g },
    { cls: 'comment', regex: /%.*$/gm },
  ]

  function highlightTokens(source) {
    const latex = LX.latex
    if (latex && typeof latex.tokenize === 'function') {
      try {
        const tokens = latex.tokenize(source)
        if (Array.isArray(tokens)) return tokens
      } catch {
        /* fall through to the local rules */
      }
    }
    const spans = []
    for (const rule of FALLBACK_RULES) {
      rule.regex.lastIndex = 0
      let match = rule.regex.exec(source)
      let guard = 0
      while (match && guard < 4000) {
        guard += 1
        spans.push({ from: match.index, to: match.index + match[0].length, cls: rule.cls })
        match = rule.regex.exec(source)
      }
    }
    spans.sort(function (a, b) {
      return a.from - b.from
    })
    const out = []
    let cursor = 0
    for (const span of spans) {
      if (span.from < cursor) continue
      if (!/^\s*$/.test(source.slice(span.from, span.to))) out.push(span)
      cursor = span.to
    }
    return out
  }

  function buildHighlight(source, tokens, matchPair) {
    if (!source) return null
    const marks = new Set()
    if (matchPair) {
      if (matchPair.a >= 0) marks.add(matchPair.a)
      if (matchPair.b >= 0) marks.add(matchPair.b)
    }
    const length = source.length
    const pieces = []
    let tokenIndex = 0
    let cursor = 0
    let runClass = ''
    let runText = ''
    function flush() {
      if (runText) {
        pieces.push({ cls: runClass, text: runText })
        runText = ''
      }
    }
    for (let i = 0; i < length; i += 1) {
      while (tokenIndex < tokens.length && tokens[tokenIndex].to <= i) tokenIndex += 1
      const token = tokens[tokenIndex]
      const cls = marks.has(i) ? 'match' : token && i >= token.from && i < token.to ? token.cls : ''
      if (cls !== runClass) {
        flush()
        runClass = cls
      }
      runText += source[i]
      cursor = i + 1
    }
    flush()
    return pieces.map(function (piece, index) {
      if (!piece.cls) return piece.text
      return h('span', { key: 'tk' + index, className: 'lx-ed-tk-' + piece.cls }, piece.text)
    })
  }

  /** Offsets of the bracket pair adjacent to the caret, or nulls. */
  function findBracketPair(source, caret) {
    const pairs = { '{': '}', '[': ']', '(': ')' }
    const closers = { '}': '{', ']': '[', ')': '(' }
    for (const probe of [caret, caret - 1]) {
      if (probe < 0 || probe >= source.length) continue
      const ch = source[probe]
      if (pairs[ch]) {
        let depth = 0
        for (let i = probe; i < source.length; i += 1) {
          if (source[i] === '\\') {
            i += 1
            continue
          }
          if (source[i] === ch) depth += 1
          else if (source[i] === pairs[ch]) {
            depth -= 1
            if (depth === 0) return { a: probe, b: i }
          }
        }
        return { a: probe, b: -1 }
      }
      if (closers[ch]) {
        let depth = 0
        for (let i = probe; i >= 0; i -= 1) {
          if (source[i] === ch) depth += 1
          else if (source[i] === closers[ch]) {
            depth -= 1
            if (depth === 0) return { a: i, b: probe }
          }
        }
        return { a: -1, b: probe }
      }
    }
    return null
  }

  /* ------------------------------------------------------------- the editor */

  function EditorSurface(props) {
    const { value, onChange, fontSize, wrap } = props
    const textareaRef = useRef(null)
    const overlayRef = useRef(null)
    const gutterRef = useRef(null)
    const containerRef = useRef(null)
    const caretBoxRef = useRef(null)
    const mirrorRef = useRef(null)
    const pendingSelection = useRef(null)
    const [caret, setCaret] = useState(0)
    const [selection, setSelection] = useState({ start: 0, end: 0 })
    const [suggest, setSuggest] = useState(null)
    const [lineCount, setLineCount] = useState(1)

    useEffect(
      function () {
        setLineCount(Math.max(1, String(value).split('\n').length))
      },
      [value],
    )

    useEffect(
      function () {
        if (typeof props.onSelectionChange === 'function') props.onSelectionChange(selection.start, selection.end)
      },
      [selection.start, selection.end],
    )

    useEffect(
      function () {
        const pending = pendingSelection.current
        const area = textareaRef.current
        if (!pending || !area) return
        pendingSelection.current = null
        area.focus()
        area.setSelectionRange(pending.start, pending.end)
        setCaret(pending.start)
        setSelection({ start: pending.start, end: pending.end })
      },
      [value],
    )

    const applyEdit = useCallback(
      function (nextValue, selStart, selEnd) {
        pendingSelection.current = { start: selStart, end: selEnd === undefined ? selStart : selEnd }
        onChange(nextValue)
      },
      [onChange],
    )

    const insertSnippet = useCallback(
      function (snippet, caret) {
        const area = textareaRef.current
        if (!area) return
        const start = area.selectionStart
        const end = area.selectionEnd
        const latex = LX.latex
        if (latex && typeof latex.insertAt === 'function') {
          const result = latex.insertAt(value, start, end, snippet, typeof caret === 'number' ? caret : undefined)
          applyEdit(result.text, result.selStart, result.selEnd)
          return
        }
        const next = value.slice(0, start) + snippet + value.slice(end)
        applyEdit(next, start + snippet.length)
      },
      [applyEdit, value],
    )

    const wrapSnippet = useCallback(
      function (before, after) {
        const area = textareaRef.current
        if (!area) return
        // "无环境": strip the outermost environment pair of the document
        if (before === String.fromCharCode(1) + 'strip-env') {
          const bs = String.fromCharCode(92)
          const beginTok = bs + 'begin{'
          const endTok = bs + 'end{'
          const open = value.indexOf(beginTok)
          const close = value.lastIndexOf(endTok)
          let stripped = value
          if (open >= 0 && close > open && value.slice(0, open).trim() === '') {
            const afterBegin = value.slice(open + beginTok.length)
            const nameEnd = afterBegin.indexOf('}')
            const endClose = value.indexOf('}', close)
            if (nameEnd >= 0 && endClose > 0 && value.slice(endClose + 1).trim() === '') {
              stripped = value.slice(open + beginTok.length + nameEnd + 1, close).trim()
            }
          }
          if (stripped !== value) applyEdit(stripped, 0, 0)
          return
        }
        const start = area.selectionStart
        const end = area.selectionEnd
        const latex = LX.latex
        if (latex && typeof latex.wrapSelection === 'function') {
          const result = latex.wrapSelection(value, start, end, before, after)
          applyEdit(result.text, result.selStart, result.selEnd)
          return
        }
        const next = value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end)
        applyEdit(next, start + before.length, start + before.length + (end - start))
      },
      [applyEdit, value],
    )

    useEffect(
      function () {
        if (typeof props.registerInsert === 'function') props.registerInsert(insertSnippet)
        if (typeof props.registerWrap === 'function') props.registerWrap(wrapSnippet)
      },
      [insertSnippet, wrapSnippet, props.registerInsert, props.registerWrap],
    )

    /**
     * Draw our own caret: the textarea's glyphs are transparent (the highlight
     * overlay paints them), and a transparent-colour textarea loses its caret in
     * several themes, so measure the caret box in a mirror element instead.
     */
    const positionCaret = useCallback(function () {
      const area = textareaRef.current
      const box = caretBoxRef.current
      const mirror = mirrorRef.current
      if (!area || !box || !mirror) return
      if (document.activeElement !== area || area.selectionStart !== area.selectionEnd) {
        box.style.display = 'none'
        return
      }
      const cs = window.getComputedStyle(area)
      mirror.style.boxSizing = 'border-box'
      mirror.style.width = area.clientWidth + 'px'
      mirror.style.font = cs.font
      mirror.style.lineHeight = cs.lineHeight
      mirror.style.letterSpacing = cs.letterSpacing
      mirror.style.tabSize = cs.tabSize
      mirror.style.padding = cs.padding
      mirror.style.whiteSpace = area.wrap === 'off' ? 'pre' : 'pre-wrap'
      mirror.style.wordBreak = 'break-word'
      mirror.style.overflowWrap = 'break-word'
      mirror.textContent = String(area.value).slice(0, area.selectionStart)
      const mark = document.createElement('span')
      mark.textContent = '\u200b'
      mirror.appendChild(mark)
      const left = mark.offsetLeft - area.scrollLeft
      const top = mark.offsetTop - area.scrollTop
      const probe = document.createElement('span')
      probe.textContent = 'Hxg'
      mirror.appendChild(probe)
      const glyphH = probe.getBoundingClientRect().height
      mirror.textContent = ''
      const fontSize = parseFloat(cs.fontSize) || 16
      const height = Math.round(glyphH || fontSize * 1.16)
      box.style.display = 'block'
      box.style.height = height + 'px'
      box.style.transform = 'translate(' + left + 'px,' + top + 'px)'
    }, [])

    const syncScroll = useCallback(
      function () {
        const area = textareaRef.current
        if (!area) return
        if (overlayRef.current) {
          overlayRef.current.scrollTop = area.scrollTop
          overlayRef.current.scrollLeft = area.scrollLeft
        }
        if (gutterRef.current) gutterRef.current.scrollTop = area.scrollTop
        positionCaret()
      },
      [positionCaret],
    )

    const updateCaret = useCallback(function () {
      const area = textareaRef.current
      if (!area) return
      setCaret(area.selectionStart)
      setSelection({ start: area.selectionStart, end: area.selectionEnd })
      positionCaret()
    }, [positionCaret])

    useEffect(
      function () {
        positionCaret()
      },
    )

    useEffect(
      function () {
        function onResize() {
          positionCaret()
        }
        window.addEventListener('resize', onResize)
        return function () {
          window.removeEventListener('resize', onResize)
        }
      },
      [positionCaret],
    )

    /** Command autocompletion: show candidates for the `\word` under the caret. */
    const refreshSuggest = useCallback(
      function () {
        const area = textareaRef.current
        const latex = LX.latex
        if (!area || !latex || typeof latex.completions !== 'function') {
          setSuggest(null)
          return
        }
        const caretAt = area.selectionStart
        if (area.selectionEnd !== caretAt) {
          setSuggest(null)
          return
        }
        const before = String(area.value).slice(0, caretAt)
        const match = /\\[a-zA-Z]{2,}$/.exec(before)
        if (!match) {
          setSuggest(null)
          return
        }
        const prefix = match[1].toLowerCase()
        let all = []
        try {
          all = latex.completions() || []
        } catch {
          all = []
        }
        const candidates = []
        for (const entry of all) {
          const cmd = String(entry.cmd || '').replace(/^\\/, '')
          if (!cmd.toLowerCase().startsWith(prefix)) continue
          candidates.push(entry)
          if (candidates.length >= 8) break
        }
        if (candidates.length === 0) {
          setSuggest(null)
          return
        }
        const point = caretPoint(area, containerRef.current, caretAt)
        setSuggest({ items: candidates, index: 0, start: match.index, end: caretAt, left: point.left, top: point.top + 22 })
      },
      [],
    )

    const acceptSuggestion = useCallback(
      function (entry) {
        const area = textareaRef.current
        if (!area || !suggest) return
        const cmd = String(entry.cmd || '')
        const current = String(area.value)
        const next = current.slice(0, suggest.start) + cmd + current.slice(suggest.end)
        applyEdit(next, suggest.start + cmd.length)
        setSuggest(null)
      },
      [applyEdit, suggest],
    )

    const tokens = useMemo(
      function () {
        return highlightTokens(value)
      },
      [value],
    )
    const matchPair = useMemo(
      function () {
        return findBracketPair(value, caret)
      },
      [value, caret],
    )
    const highlighted = useMemo(
      function () {
        return buildHighlight(value, tokens, matchPair)
      },
      [value, tokens, matchPair],
    )

    function onKeyDown(event) {
      if (suggest) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setSuggest(function (current) {
            if (!current) return current
            const delta = event.key === 'ArrowDown' ? 1 : -1
            const nextIndex = (current.index + delta + current.items.length) % current.items.length
            return { ...current, index: nextIndex }
          })
          return
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault()
          const index = suggest.index || 0
          acceptSuggestion(suggest.items[index])
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setSuggest(null)
          return
        }
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const area = event.currentTarget
        const start = area.selectionStart
        const end = area.selectionEnd
        applyEdit(value.slice(0, start) + '  ' + value.slice(end), start + 2)
        return
      }
      const pairs = { '{': '}', '[': ']', '(': ')' }
      if (pairs[event.key] && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const area = event.currentTarget
        const start = area.selectionStart
        const end = area.selectionEnd
        event.preventDefault()
        applyEdit(value.slice(0, start) + event.key + pairs[event.key] + value.slice(end), start + 1)
        return
      }
      if ((event.key === '}' || event.key === ']' || event.key === ')') && !event.ctrlKey && !event.metaKey) {
        const area = event.currentTarget
        if (value[area.selectionStart] === event.key && area.selectionStart === area.selectionEnd) {
          event.preventDefault()
          applyEdit(value, area.selectionStart + 1)
          return
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        if (typeof props.onRun === 'function') props.onRun()
      }
    }

    const lines = []
    for (let i = 1; i <= Math.min(lineCount, 2000); i += 1) lines.push(i)

    return h(
      'div',
      { className: 'lx-ed-surface', ref: containerRef },
      h(
        'div',
        { className: 'lx-ed-gutter lx-ed-gutter--off', ref: gutterRef, 'aria-hidden': true },
        h(
          'div',
          { className: 'lx-ed-gutter-inner' },
          lines.map(function (line) {
            return h('div', { key: line, className: 'lx-ed-lineno' }, line)
          }),
        ),
      ),
      h(
        'div',
        { className: LX.cx('lx-ed-stack', !wrap && 'lx-ed-stack--nowrap'), style: { fontSize: fontSize + 'px' } },
        h('pre', { className: 'lx-ed-overlay', ref: overlayRef, 'aria-hidden': true }, highlighted),
        h('textarea', {
          ref: textareaRef,
          className: 'lx-ed-input',
          value,
          spellCheck: false,
          autoCapitalize: 'off',
          autoCorrect: 'off',
          autoComplete: 'off',
          wrap: 'soft',
          onChange: function (event) {
            onChange(event.target.value)
            updateCaret()
            setTimeout(refreshSuggest, 0)
          },
          onScroll: syncScroll,
          onKeyDown: onKeyDown,
          onKeyUp: function (event) {
            updateCaret()
            if (event.key === 'Escape') return
            setTimeout(refreshSuggest, 0)
          },
          onClick: function () {
            updateCaret()
            setSuggest(null)
          },
          onSelect: positionCaret,
          onFocus: function () {
            setTimeout(positionCaret, 0)
          },
          onBlur: function () {
            const box = caretBoxRef.current
            if (box) box.style.display = 'none'
            setTimeout(function () {
              setSuggest(null)
            }, 140)
          },
          'aria-label': t('ed.label'),
        }),
        h('div', { className: 'lx-ed-mirror', ref: mirrorRef, 'aria-hidden': 'true' }),
        h('span', { className: 'lx-ed-caret', ref: caretBoxRef, 'aria-hidden': 'true' }),
        suggest
          ? h(
              'div',
              { className: 'lx-ed-suggest', style: { left: Math.max(4, suggest.left), top: Math.max(4, suggest.top) } },
              suggest.items.map(function (entry, index) {
                return h(
                  'button',
                  {
                    key: entry.cmd + index,
                    type: 'button',
                    className: LX.cx('lx-ed-suggest-row', index === (suggest.index || 0) && 'lx-ed-suggest-row--on'),
                    onMouseDown: function (event) {
                      event.preventDefault()
                      acceptSuggestion(entry)
                    },
                  },
                  h('code', null, entry.cmd),
                  h('span', null, LX.pick(entry)),
                )
              }),
            )
          : null,
      ),
    )
  }

  /* ------------------------------------------------------------ the preview */

  function PreviewPane(props) {
    const { tex, settings, surface, onSurface } = props
    const [scale, setScale] = useState(Number(settings.previewScale) || 1)
    /*
     * The zoom buttons only override the view for this session, while the
     * setting is the default for every pane — so follow it when it changes
     * instead of keeping the value read at mount time.
     */
    useEffect(
      function () {
        setScale(Number(settings.previewScale) || 1)
      },
      [settings.previewScale],
    )
    /* Numbering is a document-level option: the settings panel and the pane
       header must always agree, so there is no local copy to drift. */
    const numbered = Boolean(settings.numbered)
    const [state, setState] = useState({ status: 'idle', svg: '', errors: [], ms: 0 })
    const [manualTick, setManualTick] = useState(0)
    const requestRef = useRef(0)
    const containerRef = useRef(null)
    const mountedRef = useRef(false)
    const manualRef = useRef({ local: 0, remote: Number(props.renderTick) || 0 })

    const extensions = useMemo(
      function () {
        return Array.isArray(settings.extensions) ? settings.extensions : []
      },
      [settings.extensions],
    )

    const source = useMemo(
      function () {
        const latex = LX.latex
        const normalized = latex && typeof latex.normalize === 'function' ? latex.normalize(tex) : String(tex || '')
        return normalized
      },
      [tex],
    )

    useEffect(
      function () {
        const render = LX.render
        if (!render || typeof render.tex2svg !== 'function') {
          setState({ status: 'unavailable', svg: '', errors: [], ms: 0 })
          return undefined
        }
        if (!source.trim()) {
          setState({ status: 'empty', svg: '', errors: [], ms: 0 })
          return undefined
        }
        const remote = Number(props.renderTick) || 0
        const manual = manualTick !== manualRef.current.local || remote !== manualRef.current.remote
        const firstPaint = !mountedRef.current
        mountedRef.current = true
        manualRef.current = { local: manualTick, remote: remote }
        /* With live preview off, render the first paint and then only when the
           user asks for it (the render button or Ctrl/Cmd+Enter). */
        if (settings.livePreview === false && !firstPaint && !manual) return undefined
        const token = ++requestRef.current
        const timer = setTimeout(
          function () {
            const started = LX.util.now()
            setState(function (current) {
              return { ...current, status: 'rendering' }
            })
            Promise.resolve()
              .then(function () {
                return render.ensure(extensions)
              })
              .then(function () {
                return render.tex2svg(source, { display: true, numbered, extensions, scale: TEX_SCALE })
              })
              .then(function (result) {
                if (token !== requestRef.current) return
                setState({
                  status: 'ready',
                  svg: result && result.svg ? result.svg : '',
                  errors: (result && result.errors) || [],
                  ms: Math.round(LX.util.now() - started),
                })
              })
              .catch(function (error) {
                if (token !== requestRef.current) return
                setState({ status: 'failed', svg: '', errors: [{ message: String((error && error.message) || error) }], ms: 0 })
              })
          },
          settings.livePreview === false ? 40 : 160,
        )
        return function () {
          clearTimeout(timer)
        }
      },
      [source, numbered, extensions, settings.livePreview, manualTick, props.renderTick],
    )

    const hasErrors = state.errors.length > 0 && state.status !== 'rendering'

    return h(
      'div',
      { className: 'lx-pv' },
      h(
        'div',
        { className: 'lx-pv-head' },
        h(
          'div',
          { className: 'lx-pv-group' },
          h(Segmented, {
            value: surface,
            options: [
              { value: 'transparent', zh: '透明', en: 'Transparent' },
              { value: 'white', zh: '白底', en: 'White' },
              { value: 'dark', zh: '深色', en: 'Dark' },
            ],
            onChange: function (value) {
              if (typeof onSurface === 'function') onSurface(value)
            },
          }),
        ),
        h(
          'div',
          { className: 'lx-pv-group' },
          h(IconButton, {
            icon: LX.icons.ZoomOut,
            label: t('pv.zoomOut'),
            size: 26,
            onClick: function () {
              setScale(function (value) {
                return Math.max(0.4, Math.round((value - 0.2) * 100) / 100)
              })
            },
          }),
          h('span', { className: 'lx-pv-scale', title: t('pv.scale') }, Math.round(scale * 100) + '%'),
          h(IconButton, {
            icon: LX.icons.ZoomIn,
            label: t('pv.zoomIn'),
            size: 26,
            onClick: function () {
              setScale(function (value) {
                return Math.min(3, Math.round((value + 0.2) * 100) / 100)
              })
            },
          }),
          h(IconButton, {
            icon: LX.icons.Refresh,
            label: t('pv.reset'),
            size: 26,
            onClick: function () {
              setScale(Number(settings.previewScale) || 1)
            },
          }),
        ),
        settings.livePreview === false
          ? h(
              'div',
              { className: 'lx-pv-group' },
              h(IconButton, {
                icon: LX.icons.Play,
                label: t('pv.render'),
                size: 26,
                onClick: function () {
                  setManualTick(function (value) {
                    return value + 1
                  })
                },
              }),
            )
          : null,
        h(
          'span',
          { className: 'lx-pv-meta' },
          state.status === 'ready' ? t('pv.meta', { ms: state.ms }) : state.status === 'rendering' ? t('pv.rendering') : '',
        ),
        h(
          'label',
          { className: 'lx-pv-toggle' },
          h('span', null, t('pv.numbered')),
          h(Switch, {
            checked: numbered,
            label: t('pv.numbered'),
            onChange: function (value) {
              LX.settings.set('numbered', value)
            },
          }),
        ),
      ),
      h(
        'div',
        { className: LX.cx('lx-pv-canvas', 'lx-pv-canvas--' + surface), ref: containerRef },
        h(
          'div',
          { className: 'lx-pv-stage', style: { zoom: scale } },
          state.status === 'rendering' && !state.svg
            ? h('div', { className: 'lx-pv-placeholder' }, h(Spinner, { size: 18 }))
            : state.svg
              ? h('div', { className: 'lx-pv-math', dangerouslySetInnerHTML: { __html: state.svg } })
              : state.status === 'empty'
                ? h('div', { className: 'lx-pv-placeholder' }, t('pv.empty'))
                : state.status === 'unavailable'
                  ? h('div', { className: 'lx-pv-placeholder' }, t('pv.unavailable'))
                  : state.status === 'failed'
                    ? h('div', { className: 'lx-pv-placeholder' }, t('pv.failed'))
                    : h('div', { className: 'lx-pv-placeholder' }, t('pv.empty')),
        ),
      ),
      hasErrors
        ? h(
            'div',
            { className: 'lx-pv-errors lx-scroll' },
            state.errors.slice(0, 4).map(function (error, index) {
              return h('div', { key: index, className: 'lx-pv-error' }, h(LX.icons.Alert, { size: 13 }), h('span', null, error.message))
            }),
          )
        : null,
    )
  }

  /* ------------------------------------------------------------ export bar */

  function ExportBar(props) {
    const { tex } = props
    const surface = props.surface === 'dark' || props.surface === 'white' ? props.surface : 'transparent'
    const [busy, setBusy] = useState(null)
    const [openId, setOpenId] = useState(null)
    const [popStyle, setPopStyle] = useState(null)
    /* Index of the expanded MathML group inside the open menu (-1 = none). */
    const [subOpen, setSubOpen] = useState(-1)
    const rootRef = useRef(null)
    LX.ui.useOutsideClick(rootRef, function () {
      setOpenId(null)
      setPopStyle(null)
    }, Boolean(openId))

    /* The panel lives inside a scroll box with overflow:hidden, so an
       absolutely positioned menu can be clipped at the bottom. Place the popup
       against the viewport and flip it above the button when there is no room
       below (tall windows and the compact 700×840 layout both matter). */
    const openMenu = function (menu, event) {
      setSubOpen(-1)
      if (openId === menu.id) {
        setOpenId(null)
        setPopStyle(null)
        return
      }
      const rect = event && event.currentTarget ? event.currentTarget.getBoundingClientRect() : null
      if (!rect) {
        setOpenId(menu.id)
        return
      }
      /* The panel can be CSS-zoomed by the UI-scale setting, while
         getBoundingClientRect() already reports visual pixels. Measure the
         zoom of the ancestor chain and translate the viewport math back into
         the popup's own (zoomed) coordinate space. */
      let zoom = 1
      let node = event && event.currentTarget ? event.currentTarget : null
      while (node && node !== document.documentElement) {
        const z = parseFloat(window.getComputedStyle(node).zoom)
        if (z && z !== 1) zoom *= z
        node = node.parentElement
      }
      const rowHeight = 33 * zoom
      const height = menu.items.length * rowHeight + 12 * zoom
      const gap = 6 * zoom
      const heightVisual = Math.min(height, window.innerHeight - 16)
      const roomBelow = window.innerHeight - rect.bottom - gap
      const top = roomBelow >= heightVisual
        ? rect.bottom + gap
        : Math.max(8, rect.top - gap - heightVisual)
      const width = 210 * zoom
      setPopStyle({
        position: 'fixed',
        top: top / zoom + 'px',
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) / zoom + 'px',
        maxHeight: (window.innerHeight - 16) / zoom + 'px',
        overflowY: 'auto',
      })
      setOpenId(menu.id)
    }

    useEffect(
      function () {
        if (!openId) return undefined
        const close = function (event) {
          if (event && event.target && rootRef.current && rootRef.current.contains(event.target)) return
          setOpenId(null)
          setPopStyle(null)
        }
        window.addEventListener('resize', close)
        window.addEventListener('scroll', close, true)
        return function () {
          window.removeEventListener('resize', close)
          window.removeEventListener('scroll', close, true)
        }
      },
      [openId],
    )

    /* A single-file page: the formula as vector SVG plus its LaTeX source, so
       anyone can open it offline without DSH or this plugin. */
    const shareHtmlPage = function (markup, source) {
      const escape = (LX.util && LX.util.escapeHtml) || function (value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      }
      return [
        '<!doctype html>',
        '<html lang="zh-CN">',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>LaTeX</title>',
        '<style>',
        '*{box-sizing:border-box}',
        'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;',
        'background:#ffffff;color:#1f2328;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}',
        'main{width:min(760px,100%)}',
        '.lx-share-card{border:1px solid #e3e6ea;border-radius:12px;padding:28px;display:flex;justify-content:center;overflow:auto;background:#fff}',
        '.lx-share-card svg{display:block;width:auto;height:auto;min-width:min(180px,100%);max-width:100%}',
        'details{margin-top:18px;border-top:1px solid #eceff1;padding-top:12px}',
        'summary{cursor:pointer;color:#57606a}',
        'pre{margin:10px 0 0;padding:12px;background:#f6f8fa;border-radius:8px;overflow:auto;',
        'font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word}',
        '.lx-share-hint{color:#8b949e;font-size:13px;margin:14px 0 0}',
        '@media (prefers-color-scheme:dark){body{background:#111318;color:#e6e8ec}.lx-share-hint{color:#9aa4b2}}',
        '</style>',
        '<main>',
        '<div class="lx-share-card">' + markup + '</div>',
        '<details><summary>LaTeX</summary><pre>' + escape(source) + '</pre></details>',
        '<p class="lx-share-hint">' + escape(t('exp.htmlHint')) + '</p>',
        '</main>',
        '</html>',
      ].join('\n')
    }
    const shareHtml = async function () {
      setOpenId(null)
      if (!tex.trim()) {
        LX.toast(t('exp.emptySource'), 'error')
        return
      }
      try {
        const artifact = await LX.render.exportAs('svg', tex, { display: true, background: '#ffffff' })
        const raw = await artifact.blob.text()
        const markup = raw.replace(/^<\?xml[^>]*\?>\s*/, '')
        LX.util.download('formula-' + fileStamp() + '.html', shareHtmlPage(markup, tex), 'text/html;charset=utf-8')
        LX.toast(t('exp.saved', { format: 'HTML' }), 'success')
      } catch (error) {
        LX.toast(String((error && error.message) || error), 'error')
      }
    }
    const copy = function (text) {
      LX.util.copyText(text).then(function (ok) {
        LX.toast(ok ? t('exp.copied') : t('common.copyFailed'), ok ? 'success' : 'error')
      })
    }
    const copyConverted = function (kind) {
      const convert = LX.convert || {}
      const text = kind === 'ascii' ? convert.texToAsciiMath(tex) : convert.texToTypst(tex)
      copy(text)
      const unsupported = typeof convert.unsupportedEnvs === 'function' ? convert.unsupportedEnvs(tex, kind) : []
      if (unsupported.length) LX.toast(t('exp.partialEnvs', { names: unsupported.join(', ') }), 'warn')
      setOpenId(null)
    }
    const download = async function (formatId, label) {
      setBusy(formatId)
      setOpenId(null)
      try {
        const artifact = await LX.render.exportAs(formatId, tex, { scale: 3, display: true })
        if (artifact && artifact.blob) {
          LX.util.download(artifact.filename, artifact.blob)
        }
        LX.toast(t('exp.saved', { format: label || String(formatId).toUpperCase() }), 'success')
      } catch (error) {
        LX.toast(String((error && error.message) || error), 'error')
      } finally {
        setBusy(null)
      }
    }
    const mathml = async function (wrap) {
      const render = LX.render
      if (!render || typeof render.tex2mathml !== 'function') {
        LX.toast(t('exp.unavailable'), 'error')
        return
      }
      try {
        const raw = await render.tex2mathml(tex, {})
        let text = raw
        if (wrap === 'mml' || wrap === 'm') {
          const prefix = wrap === 'mml' ? 'mml' : 'm'
          const prefixed = raw.replace(
            /<(\/?)([A-Za-z][A-Za-z0-9._-]*)(?=[\s/>])/g,
            function (match, close, name) {
              return /^xml/i.test(name) ? match : '<' + close + prefix + ':' + name
            },
          ).replace(' xmlns="', ' xmlns:' + prefix + '="')
          const doc = new DOMParser().parseFromString(prefixed, 'application/xml')
          text = doc.querySelector('parsererror') ? raw : prefixed
        }
        if (wrap === 'attr') {
          const head = raw.slice(0, raw.indexOf('>'))
          text = /\sdisplay\s*=/.test(head) ? raw : raw.replace('<math', '<math display="block"')
        }
        copy(text)
      } catch (error) {
        LX.toast(String((error && error.message) || error), 'error')
      }
    }
    const omml = async function () {
      const render = LX.render
      if (!render || typeof render.tex2mathml !== 'function' || !LX.convert) {
        LX.toast(t('exp.unavailable'), 'error')
        return
      }
      try {
        const raw = await render.tex2mathml(tex, {})
        copy(LX.convert.mathmlToOmml(raw))
      } catch (error) {
        LX.toast(String((error && error.message) || error), 'error')
      }
    }
    const svgCode = function () {
      const node = document.querySelector('.lx-pv-math svg')
      if (!node) {
        LX.toast(t('exp.emptySource'), 'error')
        return
      }
      copy(node.outerHTML)
      setOpenId(null)
    }
    const fileStamp = function () {
      const now = new Date()
      const pad = function (value) {
        return value < 10 ? '0' + value : String(value)
      }
      return (
        String(now.getFullYear()) +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) +
        '-' +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds())
      )
    }
    const documentText = function (kind) {
      setOpenId(null)
      if (!tex.trim()) {
        LX.toast(t('exp.emptySource'), 'error')
        return
      }
      if (kind === 'tex') {
        LX.util.download('formula-' + fileStamp() + '.tex', tex + '\n', 'application/x-tex;charset=utf-8')
        LX.toast(t('exp.saved', { format: 'LaTeX (.tex)' }), 'success')
        return
      }
      const body =
        LX.render && typeof LX.render.stripMathDelimiters === 'function'
          ? LX.render.stripMathDelimiters(tex)
          : tex
      LX.util.download('formula-' + fileStamp() + '.md', '$$\n' + body + '\n$$\n', 'text/markdown;charset=utf-8')
      LX.toast(t('exp.saved', { format: 'Markdown (.md)' }), 'success')
    }
    const docx = async function () {
      setBusy('docx')
      setOpenId(null)
      try {
        if (!LX.docx || typeof LX.docx.build !== 'function') {
          LX.toast(t('exp.unavailable'), 'error')
          return
        }
        const blob = await LX.docx.build({ pages: [{ n: 1, tex: tex }] })
        LX.util.download(
          'formula-' + fileStamp() + '.docx',
          blob,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        LX.toast(t('exp.saved', { format: 'Word (.docx)' }), 'success')
      } catch (error) {
        LX.toast(String((error && error.message) || error), 'error')
      } finally {
        setBusy(null)
      }
    }
    /*
     * Copying an image needs a secure context and a clipboard that accepts
     * blobs (an http panel on a LAN address has neither). Downloading the PNG
     * keeps the action useful instead of dead-ending on a toast.
     */
    const savePngInstead = function (artifact) {
      LX.util.download(artifact.filename, artifact.blob)
      LX.toast(t('exp.copyImageSaved'), 'warn')
    }
    const copyImage = async function () {
      setBusy('png')
      setOpenId(null)
      let artifact = null
      try {
        /* Copy what the preview shows: an opaque card on the white/dark
           surfaces, so the pasted image stays readable in Word, slides and
           dark chat windows; transparent keeps a transparent PNG. */
        const background = surface === 'white' ? '#ffffff' : surface === 'dark' ? '#16181d' : undefined
        const options = { scale: 3, display: true }
        if (background) options.background = background
        if (surface === 'dark') options.color = '#f2f4f8'
        artifact = await LX.render.exportAs('png', tex, options)
        if (!artifact || !artifact.blob) {
          LX.toast(t('exp.unavailable'), 'error')
          return
        }
        if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof window.ClipboardItem !== 'function') {
          savePngInstead(artifact)
          return
        }
        const written = navigator.clipboard.write([new window.ClipboardItem({ 'image/png': artifact.blob })])
        written.catch(function () {})
        await Promise.race([
          written,
          new Promise(function (_, reject) {
            setTimeout(function () {
              const blocked = new Error(t('exp.copyImageBlocked'))
              blocked.code = 'copy-blocked'
              reject(blocked)
            }, 6000)
          }),
        ])
        LX.toast(t('exp.copiedImage'), 'success')
      } catch (error) {
        if (artifact && error && (error.name === 'NotAllowedError' || error.code === 'copy-blocked')) {
          savePngInstead(artifact)
          return
        }
        LX.toast(String((error && error.message) || error), 'error')
      } finally {
        setBusy(null)
      }
    }

    const MENUS = [
      {
        id: 'image',
        icon: LX.icons.Image,
        label: t('exp.image'),
        items: [
          { label: 'SVG', run: function () { download('svg', 'SVG') } },
          { label: 'PNG', run: function () { download('png', 'PNG') } },
          { label: 'JPG', run: function () { download('jpg', 'JPG') } },
        ],
      },
      {
        id: 'code',
        icon: LX.icons.Code,
        label: t('exp.code'),
        items: [
          { label: 'LaTeX', run: function () { copy(tex); setOpenId(null) } },
          { label: 'AsciiMath', run: function () { copyConverted('ascii') } },
          { label: 'Typst', run: function () { copyConverted('typst') } },
          { label: 'SVG Code', run: svgCode },
          { label: t('exp.htmlInline'), run: function () { copy('<span class="math">$' + tex + '$</span>'); setOpenId(null) } },
          { label: t('exp.htmlBlock'), run: function () { copy('<div class="math">$$' + tex + '$$</div>'); setOpenId(null) } },
          {
            label: 'MathML',
            sub: [
              { label: 'MathML', run: function () { mathml('plain'); setOpenId(null) } },
              { label: 'MathML (mml:)', run: function () { mathml('mml'); setOpenId(null) } },
              { label: 'MathML (m:)', run: function () { mathml('m'); setOpenId(null) } },
              { label: 'MathML (attr:)', run: function () { mathml('attr'); setOpenId(null) } },
            ],
          },
          { label: 'OMML', run: function () { omml(); setOpenId(null) } },
        ],
      },
      {
        id: 'document',
        icon: LX.icons.Doc,
        label: t('exp.document'),
        items: [
          { label: 'Word (.docx)', run: docx },
          { label: 'LaTeX (.tex)', run: function () { documentText('tex') } },
          { label: 'Markdown (.md)', run: function () { documentText('md') } },
          { label: 'HTML (.html)', run: shareHtml },
        ],
      },
      {
        id: 'escape',
        icon: LX.icons.Code,
        label: t('exp.escape'),
        items: [
          { label: t('exp.escBslash'), run: function () { copy(tex.split(bs).join(bs + bs)); setOpenId(null) } },
          { label: '$...$', run: function () { copy('$' + tex + '$'); setOpenId(null) } },
          { label: '$$...$$', run: function () { copy('$$' + tex + '$$'); setOpenId(null) } },
          { label: '\(...\)', run: function () { copy(bs + '(' + tex + bs + ')'); setOpenId(null) } },
          { label: '\[...\]', run: function () { copy(bs + '[' + tex + bs + ']'); setOpenId(null) } },
          { label: t('exp.json'), run: function () { copy(JSON.stringify(tex)); setOpenId(null) } },
        ],
      },
    ]

    return h(
      'div',
      { className: 'lx-exp2', ref: rootRef },
      h(
        'div',
        { className: 'lx-exp2-cell' },
        h(
          'button',
          {
            type: 'button',
            className: LX.cx('lx-fmt-cell lx-fmt-btn', busy === 'png' && 'lx-fmt-cell--on'),
            title: t('exp.copyPng'),
            onClick: copyImage,
          },
          h(LX.icons.Copy, { size: 13 }),
          h('span', { className: 'lx-fmt-label' }, t('exp.copyPng')),
        ),
      ),
      MENUS.map(function (menu) {
        const on = openId === menu.id
        return h(
          'div',
          { key: menu.id, className: 'lx-exp2-cell' },
          h(
            'button',
            {
              type: 'button',
              className: LX.cx('lx-fmt-cell lx-fmt-btn', on && 'lx-fmt-cell--on'),
              onClick: function (event) {
                openMenu(menu, event)
              },
            },
            h(menu.icon, { size: 13 }),
            h('span', { className: 'lx-fmt-label' }, menu.label),
            h('span', { className: 'lx-texmenu-caret', 'aria-hidden': true }, '▾'),
          ),
          on
            ? h(
                'div',
                { className: 'lx-exp2-pop', role: 'menu', style: popStyle || undefined },
                menu.items.map(function (item, index) {
                  if (item.sub) {
                    const open = subOpen === index
                    return h(
                      'div',
                      { key: index, className: 'lx-exp2-group' },
                      h(
                        'button',
                        {
                          type: 'button',
                          role: 'menuitem',
                          'aria-expanded': open,
                          className: 'lx-texmenu-row lx-texmenu-row--group',
                          onClick: function () {
                            setSubOpen(open ? -1 : index)
                          },
                        },
                        h('span', { className: 'lx-texmenu-name' }, item.label),
                        h('span', { className: 'lx-texmenu-caret', 'aria-hidden': true }, open ? '▾' : '▸'),
                      ),
                      open
                        ? item.sub.map(function (child, childIndex) {
                            return h(
                              'button',
                              {
                                key: childIndex,
                                type: 'button',
                                role: 'menuitem',
                                className: 'lx-texmenu-row lx-texmenu-row--sub',
                                onClick: child.run,
                              },
                              h('span', { className: 'lx-texmenu-name' }, child.label),
                            )
                          })
                        : null,
                    )
                  }
                  return h(
                    'button',
                    {
                      key: index,
                      type: 'button',
                      role: 'menuitem',
                      className: 'lx-texmenu-row',
                      onClick: item.run,
                    },
                    h('span', { className: 'lx-texmenu-name' }, item.label),
                  )
                }),
              )
            : null,
        )
      }),
    )
  }

  /* --------------------------------------------------------------- history */

  function readHistory() {
    const stored = LX.storage.get(HISTORY_KEY, [])
    return Array.isArray(stored) ? stored.filter(function (item) {
      return item && typeof item.tex === 'string' && item.tex.trim()
    }) : []
  }

  /* ------------------------------------------------------------- the shell */

  function Workbench() {
    const settings = LX.useSettings()
    /* The host locale is only the default: an explicit choice must survive reloads. */
    useEffect(
      function () {
        const saved = settings.language
        LX.setLanguage(saved === 'zh' || saved === 'zhHant' || saved === 'en' ? saved : null)
      },
      [settings.language],
    )
    const [tab, setTab] = useState(readTab)
    const [tex, setTex] = useState(readDocument)
    const [selection, setSelection] = useState({ start: 0, end: 0 })
    const [drawer, setDrawer] = useState('quick')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)
    const [historyConfirm, setHistoryConfirm] = useState(false)
    const [samplesOpen, setSamplesOpen] = useState(false)
    const [renderTick, setRenderTick] = useState(0)
    const [history, setHistory] = useState(readHistory)
    const insertRef = useRef(null)
    const wrapRef = useRef(null)
    const fileRef = useRef(null)
    const shellRef = useRef(null)
    const [compact, setCompact] = useState(0)
    const themeMode = settings.themeMode === 'dark' || settings.themeMode === 'light' ? settings.themeMode : 'auto'
    const [systemDark, setSystemDark] = useState(function () {
      try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
      } catch (e) {
        return false
      }
    })
    useEffect(function () {
      let media
      try {
        media = window.matchMedia('(prefers-color-scheme: dark)')
      } catch (e) {
        return undefined
      }
      const onChange = function (event) {
        setSystemDark(event.matches)
      }
      if (media.addEventListener) media.addEventListener('change', onChange)
      else if (media.addListener) media.addListener(onChange)
      return function () {
        if (media.removeEventListener) media.removeEventListener('change', onChange)
        else if (media.removeListener) media.removeListener(onChange)
      }
    }, [])
    const darkTheme = themeMode === 'dark' || (themeMode === 'auto' && systemDark)
    const [surface, setSurface] = useState(function () {
      return darkTheme ? 'dark' : 'white'
    })
    useEffect(
      function () {
        setSurface(darkTheme ? 'dark' : 'white')
      },
      [darkTheme],
    )
    const uiScale = Math.min(2, Math.max(1, Number(settings.uiScale) || 1))

    useEffect(
      function () {
        const el = shellRef.current
        if (!el || typeof ResizeObserver !== 'function') return undefined
        const measure = function () {
          // the shell is laid out at panelWidth / uiScale, so its own width is the
          // effective width media queries cannot see
          const width = el.clientWidth
          setCompact(width < 620 ? 2 : width < 860 ? 1 : 0)
          // percentages and vw inside a zoomed box resolve against the unzoomed
          // containing block, so hand the modals a concrete budget instead
          el.style.setProperty('--lx-modal-max', Math.max(280, Math.min(680, width - 32)) + 'px')
          el.style.setProperty('--lx-modal-maxh', Math.max(240, Math.min(780, el.clientHeight - 32)) + 'px')
          el.style.setProperty('--lx-pop-max', Math.max(180, Math.min(420, el.clientHeight * 0.55)) + 'px')
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return function () {
          observer.disconnect()
        }
      },
      [uiScale],
    )

    const undoStack = useRef([])
    const previousTex = useRef(tex)
    const lastUndoPush = useRef(0)

    useEffect(
      function () {
        const now = Date.now()
        if (previousTex.current !== tex && now - lastUndoPush.current > 400) {
          undoStack.current.push(previousTex.current)
          if (undoStack.current.length > 120) undoStack.current.shift()
          lastUndoPush.current = now
        }
        previousTex.current = tex
      },
      [tex],
    )

    const undo = useCallback(
      function () {
        let next = undoStack.current.pop()
        while (next !== undefined && next === tex) next = undoStack.current.pop()
        if (next === undefined) {
          LX.toast(t('ed.undoEmpty'), 'warn')
          return
        }
        previousTex.current = next
        setTex(next)
      },
      [tex],
    )

    const persist = useMemo(
      function () {
        return LX.util.debounce(function (value) {
          LX.storage.set(DOC_KEY, { tex: value, updatedAt: Date.now() })
          setHistory(function (current) {
            const trimmed = String(value || '').trim()
            if (!trimmed) return current
            const next = [{ tex: value, at: Date.now() }].concat(
              current.filter(function (item) {
                return item.tex.trim() !== trimmed
              }),
            ).slice(0, Number(LX.settings.get('recentLimit')) || 24)
            LX.storage.set(HISTORY_KEY, next)
            return next
          })
        }, 900)
      },
      [],
    )

    useEffect(
      function () {
        persist(tex)
      },
      [tex, persist],
    )

    useEffect(
      function () {
        /* A reload or a closed panel must not drop the last <900ms of typing:
           the debounce keeps the pending value, so flush it on the way out. */
        const flush = function () {
          persist.flush()
        }
        window.addEventListener('pagehide', flush)
        window.addEventListener('beforeunload', flush)
        return function () {
          window.removeEventListener('pagehide', flush)
          window.removeEventListener('beforeunload', flush)
        }
      },
      [persist],
    )

    useEffect(
      function () {
        LX.storage.set(TAB_KEY, tab)
      },
      [tab],
    )

    /* Deleting a single entry keeps the list usable without a confirmation:
       the action is small and the document itself is untouched. */
    const removeHistory = useCallback(function (dropIndex) {
      setHistory(function (current) {
        const next = current.filter(function (item, index) {
          return index !== dropIndex
        })
        LX.storage.set(HISTORY_KEY, next)
        return next
      })
    }, [])

    const clearHistory = useCallback(function () {
      setHistory([])
      LX.storage.set(HISTORY_KEY, [])
      setHistoryConfirm(false)
      LX.toast(t('hist.cleared'), 'success')
    }, [])

    const insert = useCallback(function (snippet, caret) {
      if (insertRef.current) insertRef.current(snippet, caret)
      else setTex(function (current) {
        return current + snippet
      })
    }, [])

    const wrap = useCallback(function (before, after) {
      if (wrapRef.current) wrapRef.current(before, after)
    }, [])

    const [langOpen, setLangOpen] = useState(false)
    const langRef = useRef(null)
    LX.ui.useOutsideClick(langRef, function () {
      setLangOpen(false)
    }, langOpen)

    const LANGS = [
      { value: 'zh', label: '简体中文' },
      { value: 'zhHant', label: '繁體中文' },
      { value: 'en', label: 'English' },
    ]

    const cycleLanguage = useCallback(function () {
      const order = ['zh', 'zhHant', 'en']
      const index = order.indexOf(LX.lang())
      const next = order[(index + 1) % order.length]
      LX.settings.set('language', next)
      LX.setLanguage(next)
    }, [])

    const favorite = useCallback(
      function () {
        const text = String(tex || '').trim()
        if (!text) {
          LX.toast(t('fav.empty'), 'warn')
          return
        }
        if (!LX.favorites || typeof LX.favorites.add !== 'function') return
        const result = LX.favorites.add(text)
        if (result.ok) LX.toast(result.dropped ? t('fav.addedDropped') : t('fav.added'), 'success')
        else if (result.reason === 'duplicate') LX.toast(t('fav.duplicate'), 'info')
        else LX.toast(t('fav.empty'), 'warn')
      },
      [tex],
    )

    const sendToEditor = useCallback(function (snippet) {
      const trimmedSnippet = String(snippet || '').trim()
      if (!trimmedSnippet) return
      setTab('editor')
      setTex(function (current) {
        if (LX.settings.get('autoClearOnRecognize') !== false) return trimmedSnippet
        const existing = String(current || '')
        if (!existing.trim()) return trimmedSnippet
        const separator = /\s$/.test(existing) ? '' : '\n'
        return existing + separator + trimmedSnippet
      })
      LX.toast(t('app.sentToEditor'), 'success')
    }, [])

    const importFile = useCallback(function () {
      if (fileRef.current && /\S/.test(tex)) {
        const keep = window.confirm(t('app.confirmImport'))
        if (!keep) return
      }
      if (fileRef.current) fileRef.current.click()
    }, [tex])

    const loadTextFile = useCallback(function (file) {
      if (!file) return
      const name = String(file.name || '')
      const type = String(file.type || '')
      if (!/\.(tex|txt)$/i.test(name) && !/^text\/plain/i.test(type)) {
        LX.toast(t('app.importType'), 'error')
        return
      }
      const reader = new FileReader()
      reader.onload = function () {
        const text = String(reader.result || '')
        setTex(function (current) {
          const trimmed = current.trim()
          return trimmed && trimmed !== 'E = mc^2' ? current + '\n\n' + text : text
        })
        LX.toast(t('app.imported', { name: name }), 'success')
      }
      reader.readAsText(file)
    }, [])

    const onFile = useCallback(function (event) {
      const file = event.target.files && event.target.files[0]
      event.target.value = ''
      loadTextFile(file)
    }, [loadTextFile])

    const [dropping, setDropping] = useState(false)
    const dragDepth = useRef(0)
    const onDragEnter = function (event) {
      if (!event.dataTransfer || Array.prototype.indexOf.call(event.dataTransfer.types || [], 'Files') < 0) return
      event.preventDefault()
      dragDepth.current += 1
      setDropping(true)
    }
    const onDragOver = function (event) {
      if (!event.dataTransfer || Array.prototype.indexOf.call(event.dataTransfer.types || [], 'Files') < 0) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = function () {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDropping(false)
    }
    const onDrop = function (event) {
      if (!event.dataTransfer) return
      event.preventDefault()
      dragDepth.current = 0
      setDropping(false)
      const file = event.dataTransfer.files && event.dataTransfer.files[0]
      loadTextFile(file)
    }

    const tabs = [
      { value: 'editor', zh: '编辑器', en: 'Editor', icon: LX.icons.Sigma },
      { value: 'image', zh: '图片识别', en: 'Image OCR', icon: LX.icons.Image },
      { value: 'document', zh: '文档识别', en: 'Document OCR', icon: LX.icons.Doc },
      { value: 'favorites', zh: '收藏夹', en: 'Favourites', icon: LX.icons.Star },
      { value: 'help', zh: '帮助', en: 'Help', icon: LX.icons.Help },
    ]

    const stats = useMemo(
      function () {
        const latex = LX.latex
        if (latex && typeof latex.stats === 'function') {
          try {
            return latex.stats(tex)
          } catch {
            /* ignore */
          }
        }
        return { chars: String(tex || '').length, commands: 0, depth: 0 }
      },
      [tex],
    )

    const drawerOptions = [
      { value: 'quick', zh: '快捷工具', en: 'Quick tools', icon: LX.icons.Grid },
      { value: 'template', zh: '公式模板', en: 'Templates', icon: LX.icons.Matrix },
    ]

    const drawerContent = LX.tiles && LX.tiles.Panel
      ? h(LX.tiles.Panel, {
          mode: drawer === 'template' ? 'template' : 'quick',
          onInsert: insert,
          onWrap: wrap,
          onClear: function () {
            setTex('')
          },
          onUndo: undo,
          onFavorite: favorite,
          onImport: importFile,
        })
      : drawer === 'template'
        ? h(LX.visual.TemplatePanel, { onInsert: insert })
        : h(LX.visual.SymbolPanel, { onInsert: insert, onWrap: wrap })

    const imageTab = LX.recogUI && LX.recogUI.ImageTab
      ? h(LX.recogUI.ImageTab, { t, onInsert: sendToEditor, onOpenSettings: function () { setSettingsOpen(true) } })
      : h(Empty, { icon: LX.icons.Image, zh: '图片识别模块不可用', en: 'Image recognition is unavailable' })

    const documentTab = LX.recogUI && LX.recogUI.DocumentTab
      ? h(LX.recogUI.DocumentTab, { t, onInsert: sendToEditor, onOpenSettings: function () { setSettingsOpen(true) } })
      : h(Empty, { icon: LX.icons.Doc, zh: '文档识别模块不可用', en: 'Document recognition is unavailable' })

    return h(
      'div',
      { className: 'lx-root', 'data-theme': darkTheme ? 'dark' : 'light', style: { '--lx-ui-scale': String(uiScale) } },
      h('style', { key: 'lx-style' }, LX.styleText()),
      h(
        'div',
        {
          className: 'lx-shell',
          ref: shellRef,
          'data-compact': String(compact),
        },
      h(LX.ui.ToastHost),
      h(
        'div',
        { className: 'lx-app' },
        h(
          'header',
          { className: 'lx-app-head' },
          h(
            'div',
            { className: 'lx-app-brand' },
            h('span', { className: 'lx-app-mark' }, h(LX.icons.LatexMark, { size: 34 })),
            h(
              'div',
              { className: 'lx-app-titles' },
              h('h1', { className: 'lx-app-title' }, t('app.title')),
              h('p', { className: 'lx-app-sub' }, t('app.subtitle')),
            ),
            h(Badge, { tone: 'brand' }, 'Open Source'),
          ),
          h(
            'div',
            { className: 'lx-app-tabs' },
            h(Tabs, {
              value: tab,
              items: tabs,
              label: t('app.tabs'),
              onChange: setTab,
            }),
          ),
          h(
            'div',
            { className: 'lx-app-actions' },
            h(
              'div',
              { className: 'lx-langmenu', ref: langRef },
              h(IconButton, {
                icon: LX.icons.Globe,
                label: t('app.language'),
                size: 30,
                onClick: function () {
                  setLangOpen(!langOpen)
                },
              }),
              langOpen
                ? h(
                    'div',
                    { className: 'lx-langmenu-pop', role: 'menu' },
                    LANGS.map(function (entry) {
                      const on = LX.lang() === entry.value
                      return h(
                        'button',
                        {
                          key: entry.value,
                          type: 'button',
                          role: 'menuitemradio',
                          'aria-checked': on,
                          className: LX.cx('lx-langmenu-row', on && 'lx-langmenu-row--on'),
                          onClick: function () {
                            LX.settings.set('language', entry.value)
                            LX.setLanguage(entry.value)
                            setLangOpen(false)
                          },
                        },
                        h('span', { className: 'lx-langmenu-name' }, entry.label),
                        on ? h(LX.icons.Check, { size: 13 }) : null,
                      )
                    }),
                  )
                : null,
            ),
            h(
              'button',
              {
                type: 'button',
                role: 'switch',
                'aria-checked': darkTheme,
                'aria-label': t('app.theme'),
                title: t('app.theme'),
                className: LX.cx('lx-theme-switch', darkTheme && 'lx-theme-switch--on'),
                onClick: function () {
                  LX.settings.set('themeMode', darkTheme ? 'light' : 'dark')
                },
              },
              h('span', { className: 'lx-theme-track' }),
              h(
                'span',
                { className: 'lx-theme-knob' },
                darkTheme ? h(LX.icons.Moon, { size: 12 }) : h(LX.icons.Sun, { size: 12 }),
              ),
            ),
            h(IconButton, {
              icon: LX.icons.History,
              label: t('app.history'),
              size: 30,
              onClick: function () {
                setHistoryOpen(true)
              },
            }),
            h(IconButton, {
              icon: LX.icons.Sparkle,
              label: t('app.samples'),
              size: 30,
              onClick: function () {
                setSamplesOpen(true)
              },
            }),
            h(IconButton, {
              icon: LX.icons.Settings,
              label: t('set.title'),
              size: 30,
              onClick: function () {
                setSettingsOpen(true)
              },
            }),
          ),
          h('input', {
            ref: fileRef,
            type: 'file',
            accept: '.tex,.txt,text/plain',
            style: { display: 'none' },
            onChange: onFile,
          }),
        ),
        h(
          'div',
          { className: 'lx-app-body' },
          /* The image tab stays mounted so an upload, a running recognition and
             its result survive tab switches (the document tab keeps its own
             module-level session for the same reason). */
          h('div', { className: 'lx-tabpage', style: tab === 'image' ? undefined : { display: 'none' } }, imageTab),
          tab === 'editor'
            ? h(
                'div',
                {
                  className: LX.cx('lx-tabpage', dropping && 'lx-tabpage--drop'),
                  onDragEnter: onDragEnter,
                  onDragOver: onDragOver,
                  onDragLeave: onDragLeave,
                  onDrop: onDrop,
                },
                dropping
                  ? h(
                      'div',
                      { className: 'lx-drop-hint' },
                      h(LX.icons.Upload, { size: 18 }),
                      h('span', null, t('app.dropHint')),
                    )
                  : null,
                h(
                  'div',
                  { className: 'lx-ed-split' },
                  h(
                    'section',
                    { className: 'lx-ed-pane' },
                    h(
                      'div',
                      { className: 'lx-ed-tools' },
                      h(Segmented, {
                        value: drawer,
                        options: drawerOptions,
                        onChange: function (value) {
                          setDrawer(value)
                        },
                      }),
                    ),
                    drawer
                      ? h(
                          'div',
                          { className: 'lx-drawer' },
                          h('div', { className: 'lx-drawer-body' }, drawerContent),
                        )
                      : null,
                    h(EditorSurface, {
                      value: tex,
                      onChange: setTex,
                      fontSize: Number(settings.editorFontSize) || 16,
                      wrap: settings.wrap !== false,
                      registerInsert: function (fn) {
                        insertRef.current = fn
                      },
                      registerWrap: function (fn) {
                        wrapRef.current = fn
                      },
                      onSelectionChange: function (start, end) {
                        setSelection({ start, end })
                      },
                      onRun: function () {
                        setRenderTick(function (value) {
                          return value + 1
                        })
                      },
                    }),
                  ),
                  h(
                    'section',
                    { className: 'lx-pv-pane' },
                    h(ExportBar, { tex, surface }),
                    h(PreviewPane, { tex, settings, surface, onSurface: setSurface, renderTick }),
                  ),
                ),
              )
            : tab === 'document'
                ? h('div', { className: 'lx-tabpage' }, documentTab)
                : tab === 'favorites'
                  ? h('div', { className: 'lx-tabpage' },
                      LX.tiles && LX.tiles.FavoritesPage
                        ? h(LX.tiles.FavoritesPage, { onInsert: sendToEditor })
                        : h(Empty, { icon: LX.icons.Star, zh: '收藏夹不可用', en: 'Favourites unavailable' }),
                    )
                : tab === 'help'
                  ? h(
                      'div',
                      { className: 'lx-tabpage lx-scroll' },
                      LX.pages && LX.pages.HelpTab
                        ? h(LX.pages.HelpTab, { onOpenSettings: function () { setSettingsOpen(true) } })
                        : h(Empty, { icon: LX.icons.Help, zh: '帮助文档不可用', en: 'Documentation unavailable' }),
                    )
                  : null,
        ),
      ),
      LX.pages && LX.pages.SettingsPanel
        ? h(LX.pages.SettingsPanel, {
            open: settingsOpen,
            onClose: function () {
              setSettingsOpen(false)
            },
            onOpenHelp: function () {
              setSettingsOpen(false)
              setTab('help')
            },
          })
        : null,
      h(
        Modal,
        {
          open: samplesOpen,
          zh: '示例公式',
          en: 'Sample formulas',
          onClose: function () {
            setSamplesOpen(false)
          },
          width: 560,
        },
        h(
          'div',
          { className: 'lx-samples' },
          SAMPLES.map(function (sample) {
            return h(
              'button',
              {
                key: sample.id,
                type: 'button',
                className: 'lx-sample',
                onClick: function () {
                  setTex(sample.tex)
                  setSamplesOpen(false)
                },
              },
              h('span', { className: 'lx-sample-name' }, LX.pick(sample)),
              h('code', { className: 'lx-sample-tex' }, sample.tex),
            )
          }),
        ),
      ),
      h(
        Modal,
        {
          open: historyOpen,
          zh: '最近编辑',
          en: 'Recent formulas',
          onClose: function () {
            setHistoryOpen(false)
          },
          width: 620,
          footer: history.length
            ? [
                h(
                  Button,
                  {
                    key: 'clear',
                    size: 'sm',
                    variant: 'ghost',
                    onClick: function () {
                      setHistoryConfirm(true)
                    },
                  },
                  t('hist.clear'),
                ),
              ]
            : null,
        },
        history.length === 0
          ? h(Empty, { icon: LX.icons.History, zh: '还没有历史记录', en: 'No history yet' })
          : h(
              'div',
              { className: 'lx-history' },
              history.map(function (item, index) {
                return h(
                  'div',
                  { key: index, className: 'lx-history-item' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lx-history-row',
                      onClick: function () {
                        setTex(item.tex)
                        setHistoryOpen(false)
                        setTab('editor')
                      },
                    },
                    h('code', null, item.tex.replace(/\s+/g, ' ').slice(0, 140)),
                    h('span', { className: 'lx-history-time' }, new Date(item.at).toLocaleString()),
                  ),
                  h(IconButton, {
                    icon: LX.icons.Trash,
                    label: t('hist.delete'),
                    size: 26,
                    onClick: function () {
                      removeHistory(index)
                    },
                  }),
                )
              }),
            ),
      ),
      h(
        Modal,
        {
          open: historyConfirm,
          zh: '清空最近编辑？',
          en: 'Clear recent formulas?',
          onClose: function () {
            setHistoryConfirm(false)
          },
          footer: [
            h(
              Button,
              {
                key: 'cancel',
                size: 'sm',
                variant: 'ghost',
                onClick: function () {
                  setHistoryConfirm(false)
                },
              },
              t('common.cancel'),
            ),
            h(
              Button,
              {
                key: 'clear',
                size: 'sm',
                variant: 'danger',
                onClick: clearHistory,
              },
              t('hist.clear'),
            ),
          ],
        },
        h('p', { className: 'lx-modal__text' }, t('hist.clearBody')),
      ),
      ),
    )
  }

  /* ------------------------------------------------------------ dictionary */

  LX.addDict('zh', {
    'nav.label': '公式编辑器',
    'app.title': 'LaTeX 公式编辑器',
    'app.subtitle': '免费开源 · 离线渲染 · 多格式导出',
    'app.tabs': '工作台视图',
    'app.language': '切换语言',
    'app.theme': '切换主题',
    'app.samples': '示例',
    'app.import': '导入',
    'app.history': '历史',
    'hist.delete': '删除这条记录',
    'hist.clear': '清空历史',
    'hist.clearBody': '清空后这些记录会全部删除，无法恢复；当前编辑中的公式不受影响。',
    'hist.cleared': '历史已清空',
    'app.sentToEditor': '已发送到编辑器',
    'app.confirmImport': '导入会追加到当前公式，继续吗？',
    'app.imported': '已导入 {name}',
    'app.importType': '只支持 .tex 或 .txt 文件',
    'app.dropHint': '松开以把 .tex / .txt 导入编辑器',
    'ed.label': 'LaTeX 源码',
    'ed.undo': '撤销',
    'ed.undoEmpty': '没有可撤销的操作',
    'ed.clear': '清空',
    'ed.hint': 'Ctrl+Enter 渲染 · Tab 缩进',
    'ed.stats.chars': '{n} 字符',
    'ed.stats.commands': '{n} 命令',
    'ed.stats.depth': '深度 {n}',
    'pv.zoomIn': '放大',
    'pv.zoomOut': '缩小',
    'pv.reset': '重置比例',
    'pv.render': '渲染',
    'pv.scale': '预览比例',
    'pv.numbered': '公式编号',
    'pv.empty': '在上方输入 LaTeX，这里即时预览',
    'pv.unavailable': '渲染器尚未就绪',
    'pv.failed': '渲染失败',
    'pv.rendering': '渲染中…',
    'pv.meta': '渲染用时 {ms} ms',
    'pv.copySvg': '复制 SVG',
    'pv.svgCopied': 'SVG 已复制',
    'exp.image': '输出图片',
    'exp.code': '输出代码',
    'exp.document': '输出文档',
    'exp.escape': '转义',
    'exp.htmlHint': '单个 HTML 文件，双击即可离线查看；公式是矢量图，可自由缩放。',
    'exp.htmlInline': 'HTML 行内公式',
    'exp.htmlBlock': 'HTML 独立公式',
    'exp.escBslash': '反斜杠转义',
    'exp.json': 'JSON 字符串',
    'exp.title': '导出',
    'exp.download': '下载',
    'exp.copyLatex': '复制 LaTeX',
    'exp.copyMathml': '复制 MathML',
    'exp.copied': '已复制到剪贴板',
    'exp.saved': '已导出 {format}',
    'exp.partialEnvs': '以下环境未完全转换：{names}',
    'exp.copyPng': '复制图片',
    'exp.copiedImage': '图片已复制到剪贴板',
    'exp.copyImageSaved': '无法写入剪贴板，已改为下载 PNG',
    'exp.copyImageUnsupported': '当前浏览器不支持复制图片',
    'exp.copyImageBlocked': '未能写入剪贴板，请允许浏览器访问剪贴板后重试',
    'exp.failed': '导出失败：{message}',
    'exp.unavailable': '导出模块尚未就绪',
    'set.title': '设置',
    'common.copyFailed': '复制失败，请手动选择文本复制',
    'common.close': '关闭',
    'common.cancel': '取消',
  })
  LX.addDict('en', {
    'exp.image': 'Image',
    'exp.code': 'Code',
    'exp.document': 'Document',
    'exp.escape': 'Escape',
    'exp.htmlHint': 'A single HTML file that opens offline; the formula stays sharp at any zoom.',
    'exp.htmlInline': 'HTML inline',
    'exp.htmlBlock': 'HTML display',
    'exp.escBslash': 'Escape backslash',
    'exp.json': 'JSON string',
    'nav.label': 'Formula Editor',
    'app.title': 'LaTeX Formula Editor',
    'app.subtitle': 'Open source · offline rendering · multi-format export',
    'app.tabs': 'Workbench views',
    'app.language': 'Switch language',
    'app.theme': 'Switch theme',
    'app.samples': 'Samples',
    'app.import': 'Import',
    'app.history': 'History',
    'hist.delete': 'Delete this entry',
    'hist.clear': 'Clear history',
    'hist.clearBody': 'Every stored formula will be deleted and cannot be restored. The formula you are editing stays as it is.',
    'hist.cleared': 'History cleared',
    'app.sentToEditor': 'Sent to the editor',
    'app.confirmImport': 'The import appends to the current formula. Continue?',
    'app.imported': 'Imported {name}',
    'app.importType': 'Only .tex or .txt files can be imported',
    'app.dropHint': 'Drop to import a .tex / .txt file',
    'ed.label': 'LaTeX source',
    'ed.undo': 'Undo',
    'ed.undoEmpty': 'Nothing to undo',
    'ed.clear': 'Clear',
    'ed.hint': 'Ctrl+Enter to render · Tab to indent',
    'ed.stats.chars': '{n} chars',
    'ed.stats.commands': '{n} commands',
    'ed.stats.depth': 'depth {n}',
    'pv.zoomIn': 'Zoom in',
    'pv.zoomOut': 'Zoom out',
    'pv.reset': 'Reset zoom',
    'pv.render': 'Render',
    'pv.scale': 'Preview zoom',
    'pv.numbered': 'Numbering',
    'pv.empty': 'Type LaTeX above to preview it here',
    'pv.unavailable': 'The renderer is not ready yet',
    'pv.failed': 'Rendering failed',
    'pv.rendering': 'Rendering…',
    'pv.meta': 'rendered in {ms} ms',
    'pv.copySvg': 'Copy SVG',
    'pv.svgCopied': 'SVG copied',
    'exp.title': 'Export',
    'exp.download': 'Download',
    'exp.copyLatex': 'Copy LaTeX',
    'exp.copyMathml': 'Copy MathML',
    'exp.copied': 'Copied to the clipboard',
    'exp.saved': 'Exported {format}',
    'exp.partialEnvs': 'Not fully converted: {names}',
    'exp.copyPng': 'Copy image',
    'exp.copiedImage': 'Image copied to the clipboard',
    'exp.copyImageSaved': 'The clipboard refused the image, so the PNG was downloaded instead',
    'exp.copyImageUnsupported': 'This browser cannot copy images',
    'exp.copyImageBlocked': 'Could not write to the clipboard; allow clipboard access and try again',
    'exp.failed': 'Export failed: {message}',
    'exp.unavailable': 'The export module is not ready yet',
    'set.title': 'Settings',
    'common.copyFailed': 'Copy failed — select the text and copy manually',
    'common.close': 'Close',
    'common.cancel': 'Cancel',
  })

  LX.addCss(`
.lx-app{display:flex;flex-direction:column;height:100%;min-height:0;}
.lx-app-head{flex:none;display:flex;align-items:center;gap:14px;padding:9px 20px;border-bottom:1px solid var(--dsw-alias-border-l1);min-height:56px;}
.lx-app-brand{display:flex;align-items:center;gap:10px;min-width:0;flex:0 0 auto;}
.lx-app-mark{width:30px;height:30px;flex:none;border-radius:9px;display:grid;place-items:center;color:#fff;background:#2563eb;box-shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.05);}
.lx-app-titles{min-width:0;}
.lx-app-title{margin:0;font-size:14px;font-weight:600;letter-spacing:.01em;white-space:nowrap;}
.lx-app-sub{margin:1px 0 0;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;}
.lx-app-tabs{flex:1 1 auto;min-width:0;display:flex;justify-content:center;overflow-x:auto;scrollbar-width:none;}
.lx-app-tabs::-webkit-scrollbar{display:none;}
.lx-app-actions{display:flex;align-items:center;gap:6px;flex:none;}
.lx-app-body{flex:1;min-height:0;display:flex;min-width:0;overflow:hidden;}
.lx-tabpage{flex:1 1 0%;min-height:0;min-width:0;display:flex;flex-direction:column;}
.lx-tabpage--drop{position:relative;}
.lx-drop-hint{position:absolute;inset:6px;z-index:6;display:flex;align-items:center;justify-content:center;gap:8px;border:2px dashed var(--dsw-alias-brand-primary);border-radius:10px;background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 78%, transparent);color:var(--dsw-alias-brand-primary);font-size:13px;pointer-events:none;}
.lx-ed-split{flex:1 1 0%;min-height:0;min-width:0;display:flex;}
.lx-ed-pane{flex:1 1 0;min-width:0;display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--dsw-alias-border-l1);}
.lx-pv-pane{flex:1 1 0;min-width:0;display:flex;flex-direction:column;min-height:0;}
.lx-ed-tools{flex:none;display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0;overflow:hidden;}
.lx-ed-tools-spacer{flex:1;}
.lx-ed-surface{position:relative;flex:1;min-height:0;display:flex;background:var(--dsw-alias-bg-layer-1);}
.lx-ed-gutter{flex:none;width:44px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);border-right:1px solid var(--dsw-alias-border-l1);user-select:none;}
.lx-ed-gutter-inner{padding:10px 0;}
.lx-ed-lineno{height:22.4px;line-height:22.4px;padding-right:9px;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.65;}
.lx-ed-stack{position:relative;flex:1;min-width:0;overflow:hidden;}
.lx-ed-overlay,.lx-ed-input{position:absolute;inset:0;margin:0;padding:10px 14px;border:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:22.4px;letter-spacing:0;tab-size:2;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;overflow:auto;}
.lx-ed-overlay{pointer-events:none;color:var(--dsw-alias-label-primary);background:transparent;overflow:hidden;}
.lx-ed-input{background:transparent;color:var(--lx-caret,var(--dsw-alias-label-primary));-webkit-text-fill-color:transparent;caret-color:transparent;resize:none;outline:none;z-index:1;}
.lx-ed-mirror{position:absolute;inset:0;visibility:hidden;pointer-events:none;z-index:-1;overflow:hidden;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
.lx-ed-caret{position:absolute;left:0;top:0;display:none;width:1px;background:var(--lx-caret,var(--dsw-alias-label-primary));pointer-events:none;z-index:3;will-change:transform;animation:lx-caret-blink 1.06s steps(1,end) infinite;}
@keyframes lx-caret-blink{0%,49%{opacity:1}50%,100%{opacity:.15}}
@media (prefers-reduced-motion: reduce){.lx-ed-caret{animation:none;opacity:1;}}
.lx-ed-input::selection{background:color-mix(in srgb,var(--lx-accent,#2563eb) 26%,transparent);}
.lx-ed-stack--nowrap .lx-ed-overlay,.lx-ed-stack--nowrap .lx-ed-input{white-space:pre;overflow-wrap:normal;word-break:normal;}
.lx-ed-tk-command{color:#7a6df0;font-weight:500;}
.lx-ed-tk-brace{color:var(--dsw-alias-label-secondary);opacity:.75;}
.lx-ed-tk-math{color:var(--dsw-alias-state-success-primary);}
.lx-ed-tk-number{color:var(--dsw-alias-state-warn-primary);}
.lx-ed-tk-text{color:var(--dsw-alias-label-primary);}
.lx-ed-tk-comment{color:var(--dsw-alias-label-secondary);font-style:italic;}
.lx-ed-tk-env{color:var(--dsw-alias-brand-primary);font-weight:500;}
.lx-ed-suggest{position:absolute;z-index:20;min-width:210px;max-height:230px;overflow:auto;padding:4px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));box-shadow:0 16px 34px -16px rgba(0,0,0,.45);}
.lx-ed-suggest-row{display:flex;align-items:center;gap:8px;width:100%;height:26px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;text-align:left;font-size:12px;}
.lx-ed-suggest-row code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-primary);font-size:12px;}
.lx-ed-suggest-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lx-ed-suggest-row--on,.lx-ed-suggest-row:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);}
.lx-ed-suggest-row--on span,.lx-ed-suggest-row:hover span{color:var(--dsw-alias-label-primary);}
.lx-ed-status{flex:none;display:flex;align-items:center;gap:14px;min-width:0;padding:5px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;background:var(--dsw-alias-bg-layer-1);}
.lx-ed-status-spacer{flex:1;}
.lx-ed-status-hint{opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lx-drawer{flex:none;height:236px;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);}
.lx-drawer-body{display:block;min-width:0;}

.lx-pv{display:flex;flex-direction:column;min-height:0;min-width:0;flex:1 1 0%;}
.lx-pv-head{flex:none;display:flex;align-items:center;gap:8px 6px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap;min-width:0;overflow:hidden;}
.lx-pv-group{display:flex;align-items:center;gap:4px;}
.lx-pv-scale{min-width:42px;text-align:center;font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.lx-pv-toggle{margin-left:auto;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.lx-pv-canvas{flex:1 1 0%;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;overflow:auto;padding:26px 22px;}
.lx-pv-canvas--transparent{background-image:linear-gradient(45deg,rgba(128,128,128,.12) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.12) 75%),linear-gradient(45deg,rgba(128,128,128,.12) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.12) 75%);background-size:16px 16px;background-position:0 0,8px 8px;}
.lx-pv-canvas--white{background:#ffffff;}
.lx-pv-canvas--dark{background:#16181d;}
.lx-pv-canvas--dark .lx-pv-placeholder{color:#9aa3b2;}
.lx-pv-stage{display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary);max-width:100%;}
.lx-pv-canvas--dark .lx-pv-stage{color:#f2f4f8;}
.lx-pv-math{display:flex;align-items:center;justify-content:center;max-width:100%;overflow:auto;}
.lx-pv-math svg{max-width:100%;height:auto;}
.lx-pv-placeholder{font-size:12.5px;color:var(--dsw-alias-label-secondary);text-align:center;padding:20px;max-width:340px;line-height:1.7;}
.lx-pv-errors{flex:none;max-height:96px;overflow:auto;margin:0 10px;padding:7px 10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 34%,transparent);}
.lx-pv-error{display:flex;gap:7px;align-items:flex-start;font-size:11.5px;color:var(--dsw-alias-state-error-primary);line-height:1.6;}
.lx-pv-error + .lx-pv-error{margin-top:4px;}
.lx-pv-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 10px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.lx-pv-meta{font-variant-numeric:tabular-nums;}

.lx-exp{flex:none;display:flex;align-items:center;gap:6px 8px;padding:7px 10px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex-wrap:wrap;min-width:0;}
.lx-exp-label{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary);flex:none;}
.lx-exp-formats{display:flex;align-items:center;gap:4px;flex-wrap:wrap;}
.lx-exp-chip{height:24px;min-width:38px;padding:0 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:11.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;}
.lx-exp-chip:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);}
.lx-exp-chip:disabled{opacity:.5;cursor:default;}
.lx-exp-chip--copy{color:var(--dsw-alias-label-secondary);background:transparent;}
.lx-exp-sep{width:1px;height:16px;background:var(--dsw-alias-border-l1);}
.lx-exp-copy{display:flex;align-items:center;gap:4px;}

.lx-samples{display:flex;flex-direction:column;gap:6px;}
.lx-sample{display:flex;flex-direction:column;gap:5px;padding:10px 12px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);text-align:left;cursor:pointer;}
.lx-sample:hover{border-color:var(--dsw-alias-brand-primary);}
.lx-sample:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.lx-sample-name{font-size:12.5px;font-weight:600;}
.lx-sample-tex{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lx-history{display:flex;flex-direction:column;gap:4px;}
.lx-history-item{display:flex;align-items:center;gap:6px;}
.lx-history-item .lx-history-row{flex:1 1 auto;min-width:0;}
.lx-history-row{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:8px;border:1px solid transparent;background:var(--dsw-alias-bg-layer-1);text-align:left;cursor:pointer;}
.lx-history-row:hover{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);}
.lx-history-row code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lx-history-time{font-size:10.5px;color:var(--dsw-alias-label-secondary);}
@media (max-width:1360px){
  .lx-app-sub{max-width:250px;}
}
@media (max-width:1180px){
  .lx-app-sub{display:none;}
  .lx-app-tabs{justify-content:flex-start;}
  .lx-app-actions .lx-btn--ghost .lx-btn__label{display:none;}
  .lx-app-actions .lx-btn--ghost{padding:0 7px;}
}
@media (max-width:1080px){
  .lx-ed-split{flex-direction:column;}
  .lx-ed-pane{border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1);}
}
`)

  LX.app = { Workbench, EditorSurface, PreviewPane, ExportBar, SAMPLES }
})()
