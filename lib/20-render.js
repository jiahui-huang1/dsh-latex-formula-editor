/**
 * @local/dsh-latex-editor — lib/20-render.js
 *
 * The rendering + export engine of the workbench.
 *
 * Responsibilities:
 *   - load the vendored MathJax 3.2.2 `tex-svg-full` build once (idempotent),
 *     configured for local SVG font caches so every formula is a self-contained
 *     SVG that can go through `<img>` + `<canvas>` without tainting;
 *   - `tex2svg` — TeX to a *pixel-sized* inline SVG string (width/height baked
 *     in px, `viewBox` kept for crisp scaling) plus a list of TeX errors;
 *   - `tex2mathml` / `tex2html` — the other textual export shapes;
 *   - raster + vector export codecs: SVG, PNG, JPG, WebP and a hand-written,
 *     dependency-free single-page PDF (one image XObject, FlateDecode);
 *   - `formats` + `exportAs(formatId, source, options)` for the export menu.
 *
 * Sizing model (why there is no `getBoundingClientRect` on the hot path):
 * MathJax 3 emits `<svg width="14.3ex" height="2.2ex" viewBox="0 0 1200 480">`.
 * The viewBox is exact ("em/1000" units), while the `ex` attributes depend on
 * the *browser font* of whatever element wraps the SVG, so measuring them in a
 * hidden container would make preview size depend on panel typography and would
 * force a synchronous layout on every keystroke. Instead we derive the real
 * pixel box from the viewBox (`px = units / 1000 * em`) and bake explicit px
 * `width`/`height` into the returned SVG. Preview therefore renders at a fixed,
 * deterministic size (vector, crisp at any devicePixelRatio) and every raster
 * export uses `logical px * scale` for the canvas backing store.
 *
 * TeX errors never throw: MathJax renders an `<merror>` box carrying
 * `data-mjx-error`, which is collected into `errors[]` while the SVG is still
 * returned. Hard failures (loader/startup) produce a small self-contained error
 * SVG instead of breaking the panel.
 *
 * Everything is offline: the only network access is the same-origin
 * `/plugins/latex-editor/vendor/mathjax/tex-svg-full.js` asset.
 */
;(function () {
  'use strict'

  const LX = window.__LX
  if (!LX) return

  /* ------------------------------------------------------------------ i18n */

  LX.addDict('zh', {
    'exp.htmlTitle': '公式预览',
    'exp.renderErrorLabel': '渲染错误',
    'exp.loadFailed': '数学渲染引擎加载失败：{message}',
    'exp.renderFailed': '公式渲染失败：{message}',
    'exp.texError': 'TeX 语法错误',
    'exp.unknownError': '未知错误',
    'exp.empty': '公式为空',
    'exp.emptySource': '公式为空，没有可导出的内容',
    'exp.noSvg': '没有可导出的图形',
    'exp.imageFailed': '无法解码 SVG 图像',
    'exp.canvasFailed': '当前浏览器无法创建画布',
    'exp.webpUnsupported': '当前浏览器不支持 WebP 编码',
    'exp.unknownFormat': '未知的导出格式：{format}',
    'exp.mmlUnsupported': '当前 MathJax 构建不支持 MathML 输出',
    'exp.download': '导出',
  })

  LX.addDict('en', {
    'exp.htmlTitle': 'Formula preview',
    'exp.renderErrorLabel': 'Render error',
    'exp.loadFailed': 'Could not load the math renderer: {message}',
    'exp.renderFailed': 'Could not render the formula: {message}',
    'exp.texError': 'TeX syntax error',
    'exp.unknownError': 'Unknown error',
    'exp.empty': 'Empty formula',
    'exp.emptySource': 'The formula is empty — nothing to export',
    'exp.noSvg': 'Nothing to draw',
    'exp.imageFailed': 'Could not decode the SVG image',
    'exp.canvasFailed': 'This browser cannot create a canvas',
    'exp.webpUnsupported': 'This browser cannot encode WebP',
    'exp.unknownFormat': 'Unknown export format: {format}',
    'exp.mmlUnsupported': 'This MathJax build cannot produce MathML',
    'exp.download': 'Export',
  })

  /* ------------------------------------------------------------- constants */

  /** TeX font x-height in em units (`FontData.params.x_height` in MathJax 3). */
  const X_HEIGHT = 0.442
  const DEFAULT_EM = 16
  const DEFAULT_DISPLAY_SCALE = 1

  /**
   * TeX extension packages that ship inside the vendored `tex-svg-full` bundle
   * (`MathJax.loader.preLoad("[tex]/…")` at the end of the build). Anything not
   * in this list is rejected before it reaches MathJax.
   */
  const KNOWN_EXTENSIONS = [
    'action',
    'ams',
    'amscd',
    'autoload',
    'bbox',
    'boldsymbol',
    'braket',
    'bussproofs',
    'cancel',
    'cases',
    'centernot',
    'color',
    'colortbl',
    'colorv2',
    'configmacros',
    'empheq',
    'enclose',
    'extpfeil',
    'gensymb',
    'html',
    'mathtools',
    'mhchem',
    'newcommand',
    'noerrors',
    'noundefined',
    'physics',
    'require',
    'setoptions',
    'tagformat',
    'textcomp',
    'textmacros',
    'unicode',
    'upgreek',
    'verb',
  ]

  /** A curated default set (mirrors `LX.settings.defaults.extensions`). */
  const DEFAULT_EXTENSIONS = [
    'ams',
    'color',
    'newcommand',
    'noundefined',
    'cancel',
    'bbox',
    'physics',
    'mhchem',
    'unicode',
    'textmacros',
  ]

  const FORMATS = [
    { id: 'svg', zh: 'SVG 矢量图', en: 'SVG vector', ext: 'svg', mime: 'image/svg+xml;charset=utf-8' },
    { id: 'png', zh: 'PNG 图片', en: 'PNG image', ext: 'png', mime: 'image/png' },
    { id: 'jpg', zh: 'JPG 图片', en: 'JPG image', ext: 'jpg', mime: 'image/jpeg' },
    { id: 'webp', zh: 'WebP 图片', en: 'WebP image', ext: 'webp', mime: 'image/webp' },
    { id: 'pdf', zh: 'PDF 文档', en: 'PDF document', ext: 'pdf', mime: 'application/pdf' },
    { id: 'mathml', zh: 'MathML', en: 'MathML', ext: 'mathml', mime: 'application/mathml+xml;charset=utf-8' },
    { id: 'latex', zh: 'LaTeX 源码', en: 'LaTeX source', ext: 'tex', mime: 'text/x-tex;charset=utf-8' },
    { id: 'html', zh: 'HTML 网页', en: 'HTML page', ext: 'html', mime: 'text/html;charset=utf-8' },
    { id: 'markdown', zh: 'Markdown', en: 'Markdown', ext: 'md', mime: 'text/markdown;charset=utf-8' },
  ]

  /** Same-origin route for the vendored bundle (never a CDN). */
  const MATHJAX_URL = LX.api.asset('vendor/mathjax/tex-svg-full.js')

  /** Canvas hard limits, kept below the smallest engine limit (Chrome/Safari). */
  const MAX_CANVAS_SIDE = 16384
  const MAX_CANVAS_AREA = 40 * 1024 * 1024

  const A4 = { width: 595.276, height: 841.89 }
  const LETTER = { width: 612, height: 792 }

  const utf8Encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null

  /* ---------------------------------------------------------------- state */

  let loadPromise = null
  let mathjaxReady = false
  let configuredPackages = []
  const warned = new Set()

  /* -------------------------------------------------------------- helpers */

  function warnOnce(key, message) {
    if (warned.has(key)) return
    warned.add(key)
    try {
      console.warn(message)
    } catch {
      /* ignore */
    }
  }

  function messageOf(error) {
    if (!error) return LX.t('exp.unknownError')
    if (typeof error === 'string') return error
    return error.message || String(error)
  }

  function num(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  function positive(value, fallback) {
    const parsed = num(value, fallback)
    return parsed > 0 ? parsed : fallback
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
  }

  function roundPx(value) {
    const rounded = Math.round(num(value, 0) * 100) / 100
    return Number.isFinite(rounded) ? rounded : 0
  }

  function utf8Bytes(text) {
    const string = String(text === undefined || text === null ? '' : text)
    if (utf8Encoder) return utf8Encoder.encode(string)
    const out = new Uint8Array(string.length)
    for (let index = 0; index < string.length; index += 1) out[index] = string.charCodeAt(index) & 0xff
    return out
  }

  function concatBytes(chunks) {
    let total = 0
    for (const chunk of chunks) total += chunk.length
    const out = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }

  function escapeXml(text) {
    return String(text === undefined || text === null ? '' : text).replace(/[&<>"']/g, function (char) {
      switch (char) {
        case '&':
          return '&amp;'
        case '<':
          return '&lt;'
        case '>':
          return '&gt;'
        case '"':
          return '&quot;'
        default:
          return '&#39;'
      }
    })
  }

  function decodeEntities(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&#x([0-9a-f]+);/gi, function (_match, hex) {
        const code = parseInt(hex, 16)
        return Number.isFinite(code) ? String.fromCodePoint(code) : ''
      })
      .replace(/&#(\d+);/g, function (_match, dec) {
        const code = parseInt(dec, 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : ''
      })
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
  }

  function truncate(text, max) {
    const value = String(text === undefined || text === null ? '' : text)
    return value.length > max ? value.slice(0, max - 1) + '…' : value
  }

  /* --------------------------------------------------------- svg geometry */

  /** Locate the opening `<svg …>` tag, honoring quoted attribute values. */
  function rootSvgMarkup(markup) {
    const text = String(markup === undefined || markup === null ? '' : markup)
    const start = text.search(/<svg[\s/>]/i)
    if (start < 0) return null
    let quote = ''
    let end = -1
    for (let index = start + 4; index < text.length; index += 1) {
      const char = text.charAt(index)
      if (quote) {
        if (char === quote) quote = ''
        continue
      }
      if (char === '"' || char === "'") {
        quote = char
        continue
      }
      if (char === '>') {
        end = index
        break
      }
    }
    if (end < 0) return null
    return { start: start, end: end + 1, tag: text.slice(start, end + 1) }
  }

  function getAttr(tag, name) {
    const source = String(tag === undefined || tag === null ? '' : tag)
    const doubleQuoted = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(source)
    if (doubleQuoted) return doubleQuoted[1]
    const singleQuoted = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*'([^']*)'", 'i').exec(source)
    return singleQuoted ? singleQuoted[1] : null
  }

  function setRootAttr(tag, name, value) {
    const source = String(tag)
    const text = String(value)
    const doubleQuoted = new RegExp('(\\s)' + name + '\\s*=\\s*"[^"]*"', 'i')
    if (doubleQuoted.test(source)) {
      return source.replace(doubleQuoted, function (_match, space) {
        return space + name + '="' + text + '"'
      })
    }
    const singleQuoted = new RegExp("(\\s)" + name + "\\s*=\\s*'[^']*'", 'i')
    if (singleQuoted.test(source)) {
      return source.replace(singleQuoted, function (_match, space) {
        return space + name + '="' + text + '"'
      })
    }
    if (/\/>\s*$/.test(source)) {
      return source.replace(/\s*\/>\s*$/, ' ' + name + '="' + text + '"/>')
    }
    return source.replace(/>\s*$/, ' ' + name + '="' + text + '">')
  }

  /** Apply `transform` to the opening `<svg>` tag only. */
  function mapRootTag(markup, transform) {
    const text = String(markup === undefined || markup === null ? '' : markup)
    const info = rootSvgMarkup(text)
    if (!info) return text
    return text.slice(0, info.start) + transform(info.tag) + text.slice(info.end)
  }

  function parseViewBox(value) {
    if (!value) return null
    const parts = String(value)
      .trim()
      .split(/[\s,]+/)
      .map(function (part) {
        return Number(part)
      })
    if (parts.length !== 4) return null
    for (const part of parts) if (!Number.isFinite(part)) return null
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
  }

  function parseLength(value) {
    if (value === null || value === undefined || value === '') return null
    const match = /^\s*(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([a-zA-Z%]*)\s*$/.exec(String(value))
    if (!match) return null
    const amount = Number(match[1])
    if (!Number.isFinite(amount)) return null
    return { value: amount, unit: (match[2] || 'px').toLowerCase() }
  }

  function lengthToPx(length, em, xHeight) {
    if (!length) return null
    switch (length.unit) {
      case 'px':
        return length.value
      case 'ex':
        return length.value * xHeight * em
      case 'em':
        return length.value * em
      case 'pt':
        return (length.value * 96) / 72
      case 'pc':
        return length.value * 16
      case 'in':
        return length.value * 96
      case 'cm':
        return (length.value * 96) / 2.54
      case 'mm':
        return (length.value * 96) / 25.4
      default:
        return null
    }
  }

  function toSvgString(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') {
      if (typeof value.outerHTML === 'string' && value.outerHTML) return value.outerHTML
      if (typeof value.svg === 'string') return value.svg
    }
    return ''
  }

  /**
   * Measure an SVG's logical (CSS px) box.
   *
   * `viewBox` is authoritative ("1 unit = 1/1000 em"); the `ex` attributes and
   * the style are only used when there is no viewBox (percentage-width layout).
   */
  function measureSvg(input, emOption) {
    const markup = toSvgString(input)
    const em = positive(emOption, DEFAULT_EM)
    const info = rootSvgMarkup(markup)
    const tag = info ? info.tag : ''
    const viewBox = parseViewBox(getAttr(tag, 'viewBox'))
    const widthLength = parseLength(getAttr(tag, 'width'))
    const heightLength = parseLength(getAttr(tag, 'height'))
    let xHeight = X_HEIGHT
    let emWidth = null
    let emHeight = null
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
      emWidth = viewBox.width / 1000
      emHeight = viewBox.height / 1000
      if (widthLength && widthLength.unit === 'ex' && widthLength.value > 0) {
        const derived = emWidth / widthLength.value
        if (derived > 0.05 && derived < 2) xHeight = derived
      }
    }
    let width = lengthToPx(widthLength, em, xHeight)
    let height = lengthToPx(heightLength, em, xHeight)
    if (!(width > 0) && emWidth) width = emWidth * em
    if (!(height > 0) && emHeight) height = emHeight * em
    const percentageWidth = Boolean(widthLength && widthLength.unit === '%')
    const depth = viewBox ? (viewBox.y + viewBox.height) / 1000 : 0
    return {
      width: Number.isFinite(width) && width > 0 ? width : 0,
      height: Number.isFinite(height) && height > 0 ? height : 0,
      em: em,
      xHeight: xHeight,
      emWidth: emWidth,
      emHeight: emHeight,
      depth: depth,
      viewBox: viewBox,
      percentageWidth: percentageWidth,
    }
  }

  /** Bake explicit pixel `width`/`height` into the root `<svg>` tag. */
  function applyPixelSize(markup, width, height) {
    const targetWidth = roundPx(positive(width, 0.01))
    const targetHeight = roundPx(positive(height, 0.01))
    return mapRootTag(markup, function (tag) {
      let next = setRootAttr(tag, 'width', String(targetWidth))
      next = setRootAttr(next, 'height', String(targetHeight))
      return next
    })
  }

  /** Replace `currentColor` with a concrete ink colour for raster/standalone use. */
  function replaceCurrentColor(markup, color) {
    const ink = String(color || '#000000')
    return String(markup === undefined || markup === null ? '' : markup).replace(
      /((?:fill|stroke|stop-color|flood-color)\s*=\s*")currentColor(")/gi,
      function (_match, prefix, suffix) {
        return prefix + ink + suffix
      },
    )
  }

  /* ---------------------------------------------------------- mathjax cfg */

  function canonicalPackage(raw) {
    if (typeof raw !== 'string') return ''
    const name = raw
      .trim()
      .toLowerCase()
      .replace(/^\[tex\]\//, '')
      .replace(/[^a-z0-9_-]/g, '')
    if (!name) return ''
    if (name === 'ams_cd' || name === 'ams-cd') return 'amscd'
    if (name === 'color-v2') return 'colorv2'
    return name
  }

  function settingsExtensions() {
    const stored = LX.settings && typeof LX.settings.get === 'function' ? LX.settings.get('extensions') : null
    return Array.isArray(stored) ? stored : DEFAULT_EXTENSIONS
  }

  /** Union of the settings list and an explicit `extensions` argument. */
  function mergeExtensions(extra) {
    const seen = new Set()
    const out = []
    const push = function (raw) {
      const name = canonicalPackage(raw)
      if (!name || seen.has(name)) return
      if (KNOWN_EXTENSIONS.indexOf(name) < 0) {
        warnOnce('ext:' + name, '[latex-editor] unsupported TeX package "' + raw + '" ignored')
        return
      }
      seen.add(name)
      out.push(name)
    }
    settingsExtensions().forEach(push)
    if (Array.isArray(extra)) extra.forEach(push)
    return out
  }

  function mathjaxGlobalCheck() {
    return Boolean(window.MathJax && window.MathJax.startup && window.MathJax.startup.document)
  }

  function setUpMathJaxConfig(packages, loads) {
    window.MathJax = {
      startup: { typeset: false },
      options: {
        enableMenu: false,
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'annotation', 'annotation-xml'],
      },
      svg: {
        fontCache: 'local',
        displayAlign: 'center',
        displayIndent: '0',
        mtextInheritFont: false,
        merrorInheritFont: false,
      },
      tex: {
        packages: { '[+]': packages },
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        processEscapes: true,
        processEnvironments: true,
        // 'ams' lets \tag and the ams numbered environments emit their numbers;
        // 'none' silently dropped every \tag (and the 公式编号 switch did nothing).
        tags: 'ams',
        tagSide: 'right',
        tagIndent: '0.8em',
      },
      loader: { load: loads },
    }
  }

  async function waitForMathJax(mj) {
    if (!mj) throw new Error('MathJax is not available')
    if (mj.startup && mj.startup.promise) {
      try {
        await mj.startup.promise
      } catch (error) {
        warnOnce('startup:' + messageOf(error), '[latex-editor] MathJax startup warning: ' + messageOf(error))
      }
    }
    if (typeof mj.tex2svgPromise !== 'function') {
      for (let attempt = 0; attempt < 60 && typeof mj.tex2svgPromise !== 'function'; attempt += 1) {
        await LX.util.sleep(10)
      }
    }
    if (typeof mj.tex2svgPromise !== 'function') throw new Error('MathJax startup did not finish')
    mathjaxReady = true
    return true
  }

  async function startMathJax(wanted) {
    const existing = window.MathJax
    if (existing && existing.version && mathjaxGlobalCheck()) {
      // Someone already booted the same bundle (e.g. a hot reload): reuse it.
      configuredPackages = wanted.slice()
      await waitForMathJax(existing)
      return true
    }
    const loads = wanted
      .filter(function (name) {
        return name !== 'base'
      })
      .map(function (name) {
        return '[tex]/' + name
      })
    setUpMathJaxConfig(wanted, loads)
    await LX.util.loadScript(MATHJAX_URL, mathjaxGlobalCheck)
    const mj = window.MathJax
    await waitForMathJax(mj)
    configuredPackages = wanted.slice()
    return true
  }

  /**
   * TeX packages that MathJax considers active. The combined `tex-svg-full`
   * build starts with every bundled package in this list (MathJax flattens the
   * `packages` option there), so this is mainly used to avoid re-activating a
   * package that is already live.
   */
  function activePackages() {
    const mj = window.MathJax
    const list = mj && mj.config && mj.config.tex ? mj.config.tex.packages : null
    return Array.isArray(list) ? list : []
  }

  /**
   * Best-effort activation for a package requested after startup. Uses the same
   * `Configuration#add` path as MathJax's own `\require{}`; the vendored full
   * build already pre-loads every package, so this normally resolves without
   * touching the network and without registering anything twice.
   */
  async function activateExtraPackages(wanted) {
    if (!mathjaxReady) return false
    const active = activePackages()
    const missing = wanted.filter(function (name) {
      return active.indexOf(name) < 0 && configuredPackages.indexOf(name) < 0
    })
    if (missing.length === 0) return true
    configuredPackages = configuredPackages.concat(missing)
    const mj = window.MathJax
    if (!mj || !mj.loader || typeof mj.loader.load !== 'function') return true
    const document = mj.startup && mj.startup.document
    const inputJax = document && document.inputJax ? document.inputJax[0] : null
    const canAdd = Boolean(inputJax && inputJax.configuration && typeof inputJax.configuration.add === 'function')
    await Promise.all(
      missing.map(function (name) {
        return Promise.resolve()
          .then(function () {
            return mj.loader.load('[tex]/' + name)
          })
          .then(function () {
            if (canAdd) inputJax.configuration.add(name, inputJax)
          })
          .catch(function (error) {
            warnOnce('pkg:' + name, '[latex-editor] could not enable TeX package "' + name + '": ' + messageOf(error))
          })
      }),
    )
    return true
  }

  /** Idempotent MathJax load + package configuration. */
  function ensure(extensions) {
    const wanted = mergeExtensions(extensions)
    if (!loadPromise) {
      loadPromise = startMathJax(wanted).catch(function (error) {
        loadPromise = null
        throw error
      })
    }
    return loadPromise.then(function () {
      return activateExtraPackages(wanted)
    })
  }

  function currentMathJax() {
    const mj = window.MathJax
    if (!mj || typeof mj.tex2svgPromise !== 'function') throw new Error(LX.t('exp.loadFailed', { message: 'not ready' }))
    return mj
  }

  /* ------------------------------------------------------------- errors */

  function collectErrors(markup, errors) {
    const found = []
    const pattern = /data-mjx-error="([^"]*)"/g
    let match = pattern.exec(markup)
    while (match) {
      const message = decodeEntities(match[1]).trim()
      if (message && found.indexOf(message) < 0) found.push(message)
      match = pattern.exec(markup)
    }
    if (found.length === 0 && /data-mml-node="merror"/.test(markup)) found.push(LX.t('exp.texError'))
    for (const message of found) errors.push({ message: message })
    return errors
  }

  function errorSvg(message, em, scale) {
    const text = truncate(String(message || LX.t('exp.unknownError')), 120)
    const factor = positive(scale, 1)
    const label = LX.t('exp.renderErrorLabel')
    const fontSize = 12
    const padding = 10
    const boxWidth = Math.round(Math.min(760, Math.max(160, padding * 2 + text.length * 7.1)))
    const boxHeight = 34
    const width = boxWidth * factor
    const height = boxHeight * factor
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      roundPx(width) +
      '" height="' +
      roundPx(height) +
      '" viewBox="0 0 ' +
      boxWidth +
      ' ' +
      boxHeight +
      '" role="img" aria-label="' +
      escapeXml(label + ': ' + text) +
      '">' +
      '<rect x="0.5" y="0.5" width="' +
      (boxWidth - 1) +
      '" height="' +
      (boxHeight - 1) +
      '" rx="5" fill="#fff5f5" stroke="#e5484d" stroke-width="1"/>' +
      '<text x="' +
      padding +
      '" y="22" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="' +
      fontSize +
      '" fill="#b42318">' +
      escapeXml(text) +
      '</text>' +
      '</svg>'
    )
  }

  function failureResult(message, em, scale) {
    const svg = errorSvg(message, em, scale)
    const box = measureSvg(svg, em)
    return {
      svg: svg,
      width: roundPx(box.width),
      height: roundPx(box.height),
      errors: [{ message: String(message) }],
    }
  }

  /* ---------------------------------------------------- percentage layouts */

  function readMinWidthEx(container, svg) {
    const sources = []
    if (container && typeof container.getAttribute === 'function') sources.push(container.getAttribute('style') || '')
    if (svg && typeof svg.getAttribute === 'function') sources.push(svg.getAttribute('style') || '')
    for (const source of sources) {
      const match = /min-width\s*:\s*(-?(?:\d+\.?\d*|\.\d+))\s*(ex|px|em)/i.exec(source)
      if (match) return { value: Number(match[1]), unit: match[2].toLowerCase() }
    }
    return null
  }

  /**
   * MathJax emits `width="100%"` + no viewBox for tagged/table layouts (the
   * native `\tag`/ams numbering uses stretchy inner SVGs). Those cannot be
   * baked without a viewport, so measure one clone inside a fixed hidden host
   * and synthesize an explicit px viewport (this path is never on the live
   * preview hot path — only tagged math hits it).
   */
  function measurePercentageSvg(container, em, containerWidthOption) {
    if (typeof document === 'undefined' || !document.documentElement) return null
    const svg = container && typeof container.querySelector === 'function' ? container.querySelector('svg') : null
    if (!svg) return null
    const minWidth = readMinWidthEx(container, svg)
    let naturalWidth = 0
    if (minWidth) {
      if (minWidth.unit === 'ex') naturalWidth = minWidth.value * X_HEIGHT * em
      else if (minWidth.unit === 'em') naturalWidth = minWidth.value * em
      else naturalWidth = minWidth.value
    }
    if (!(naturalWidth > 0)) naturalWidth = positive(containerWidthOption, 8 * em)
    const hostWidth = Math.round(clamp(naturalWidth + em, 48, 4000))
    const host = document.createElement('div')
    host.setAttribute('aria-hidden', 'true')
    host.setAttribute(
      'style',
      'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;width:' +
        hostWidth +
        'px;height:auto;contain:layout;',
    )
    let markup = ''
    let width = 0
    let height = 0
    document.documentElement.appendChild(host)
    try {
      const clone = container.cloneNode(true)
      host.appendChild(clone)
      const cloneSvg = clone.querySelector('svg')
      if (!cloneSvg) return null
      const heightLength = parseLength(cloneSvg.getAttribute('height'))
      let measuredHeight = 0
      if (heightLength) measuredHeight = lengthToPx(heightLength, em, X_HEIGHT) || 0
      if (!(measuredHeight > 0) && typeof cloneSvg.getBoundingClientRect === 'function') {
        const rect = cloneSvg.getBoundingClientRect()
        if (rect && rect.height > 0) measuredHeight = rect.height
      }
      width = hostWidth
      height = roundPx(positive(measuredHeight, 2 * em))
      markup = mapRootTag(cloneSvg.outerHTML, function (tag) {
        let next = setRootAttr(tag, 'width', String(roundPx(width)))
        next = setRootAttr(next, 'height', String(roundPx(height)))
        if (!getAttr(next, 'viewBox')) {
          next = setRootAttr(next, 'viewBox', '0 0 ' + roundPx(width) + ' ' + roundPx(height))
        }
        return next
      })
      return { markup: markup, width: width, height: height }
    } catch {
      return null
    } finally {
      if (host.parentNode) host.parentNode.removeChild(host)
    }
  }

  /* ------------------------------------------------------------- tex2svg */

  function prepareTex(source, options) {
    const opts = options || {}
    const raw = String(source === undefined || source === null ? '' : source).trim()
    if (!raw) return ''
    // Accept `$…$`, `$$…$$`, `\[…\]`, `\(…\)` wrappers pasted into the editor.
    let tex = stripMathDelimiters(raw)
    if (opts.numbered && !/\\tag\b/.test(tex)) {
      const number = opts.number === undefined || opts.number === null ? 1 : opts.number
      tex = tex + '\n\\tag{' + String(number) + '}'
    }
    return tex
  }

  function converterOptions(options, em) {
    const opts = options || {}
    const result = {
      display: opts.display !== false || opts.numbered === true,
      em: em,
      ex: em * X_HEIGHT,
    }
    if (opts.containerWidth !== undefined && opts.containerWidth !== null) {
      result.containerWidth = positive(opts.containerWidth, em * 40)
    }
    return result
  }

  function extractSvgElement(container) {
    if (!container) return null
    const tag = container.tagName ? String(container.tagName).toLowerCase() : ''
    if (tag === 'svg') return container
    if (typeof container.querySelector === 'function') return container.querySelector('svg')
    return null
  }

  async function tex2svg(source, options) {
    const opts = options || {}
    const em = positive(opts.em, DEFAULT_EM)
    const scale = positive(opts.scale, DEFAULT_DISPLAY_SCALE)
    const errors = []
    const text = String(source === undefined || source === null ? '' : source)
    if (!text.trim()) return { svg: '', width: 0, height: 0, errors: errors }
    try {
      await ensure(opts.extensions)
    } catch (error) {
      return failureResult(LX.t('exp.loadFailed', { message: messageOf(error) }), em, scale)
    }
    let mj
    try {
      mj = currentMathJax()
    } catch (error) {
      return failureResult(LX.t('exp.loadFailed', { message: messageOf(error) }), em, scale)
    }
    let container = null
    try {
      container = await mj.tex2svgPromise(prepareTex(text, opts), converterOptions(opts, em))
    } catch (error) {
      return failureResult(LX.t('exp.renderFailed', { message: messageOf(error) }), em, scale)
    }
    const element = extractSvgElement(container)
    if (!element) return failureResult(LX.t('exp.renderFailed', { message: LX.t('exp.noSvg') }), em, scale)
    let markup = element.outerHTML || ''
    collectErrors(markup, errors)
    let width = 0
    let height = 0
    const box = measureSvg(markup, em)
    if (box.percentageWidth || !(box.width > 0) || !(box.height > 0)) {
      const measured = measurePercentageSvg(container, em, opts.containerWidth)
      if (measured) {
        markup = measured.markup
        width = measured.width
        height = measured.height
      } else {
        width = box.width
        height = box.height
      }
    } else {
      width = box.width
      height = box.height
    }
    const scaledWidth = roundPx(width * scale)
    const scaledHeight = roundPx(height * scale)
    const svg = applyPixelSize(markup, scaledWidth, scaledHeight)
    return { svg: svg, width: scaledWidth, height: scaledHeight, errors: errors }
  }

  /* ------------------------------------------------------- tex2mathml etc. */

  async function tex2mathml(source, options) {
    const opts = options || {}
    const text = String(source === undefined || source === null ? '' : source)
    if (!text.trim()) return ''
    await ensure(opts.extensions)
    const mj = currentMathJax()
    const fn = mj.tex2mmlPromise || mj.tex2mathmlPromise || mj.tex2mml || mj.tex2mathml
    if (typeof fn !== 'function') throw new Error(LX.t('exp.mmlUnsupported'))
    const em = positive(opts.em, DEFAULT_EM)
    const output = await fn.call(mj, prepareTex(text, opts), {
      display: opts.display !== false || opts.numbered === true,
      em: em,
      ex: em * X_HEIGHT,
    })
    let markup = String(output === undefined || output === null ? '' : output)
    if (markup && !/xmlns\s*=/.test(markup.slice(0, 400))) {
      markup = markup.replace(/^<math\b/i, '<math xmlns="http://www.w3.org/1998/Math/MathML"')
    }
    return markup
  }

  const HTML_STYLE = [
    ':root{color-scheme:light dark}',
    '*{box-sizing:border-box}',
    'html,body{height:100%;margin:0}',
    'body{display:flex;align-items:center;justify-content:center;padding:32px;background:#ffffff;color:#1f2328;',
    'font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;}',
    'main.lx-formula{display:flex;align-items:center;justify-content:center;max-width:100%;overflow:auto;}',
    'main.lx-formula>svg{display:block;max-width:100%;height:auto;}',
    '@media (prefers-color-scheme:dark){body{background:#111318;color:#e6e8ec;}}',
    '@media print{body{padding:0;background:#fff;color:#000;}}',
  ].join('\n')

  async function tex2html(source, options) {
    const opts = options || {}
    const text = String(source === undefined || source === null ? '' : source)
    const title = opts.title || LX.t('exp.htmlTitle')
    const lang = LX.lang()
    const rendered = await tex2svg(text, opts)
    const formula = rendered.svg || errorSvg(LX.t('exp.empty'), DEFAULT_EM, 1)
    const lines = [
      '<!doctype html>',
      '<html lang="' + escapeXml(lang) + '">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="generator" content="dsh-latex-editor (MathJax 3 SVG)">',
      '<title>' + escapeXml(title) + '</title>',
      '<style>',
      HTML_STYLE,
      '</style>',
      '</head>',
      '<body>',
      '<main class="lx-formula" role="img" aria-label="' + escapeXml(text.trim() || title) + '">',
      formula,
      '</main>',
    ]
    if (text.trim()) {
      lines.push('<script type="application/x-tex" id="latex-source">' + escapeXml(text.trim()) + '</script>')
    }
    lines.push('</body>', '</html>', '')
    return lines.join('\n')
  }

  /* -------------------------------------------------------------- raster */

  function normalizeBackground(value) {
    if (value === undefined || value === null) return null
    const text = String(value).trim()
    if (!text || text === 'none' || text === 'transparent' || text === 'rgba(0,0,0,0)') return null
    return text
  }

  function parseColor(value) {
    if (!value) return null
    const text = String(value).trim().toLowerCase()
    const hex = /^#([0-9a-f]{3,8})$/.exec(text)
    if (hex) {
      let digits = hex[1]
      if (digits.length === 3 || digits.length === 4) {
        digits = digits
          .split('')
          .map(function (char) {
            return char + char
          })
          .join('')
      }
      if (digits.length < 6) return null
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16),
      }
    }
    const rgb = /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/.exec(text)
    if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
    return null
  }

  /** Choose a readable ink colour for a background (transparent → black). */
  function autoInk(background) {
    const rgb = parseColor(background)
    if (!rgb) return '#000000'
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
    return luminance < 0.45 ? '#ffffff' : '#000000'
  }

  function fitCanvas(width, height) {
    let factor = 1
    if (width > MAX_CANVAS_SIDE) factor = Math.min(factor, MAX_CANVAS_SIDE / width)
    if (height > MAX_CANVAS_SIDE) factor = Math.min(factor, MAX_CANVAS_SIDE / height)
    const area = width * height * factor * factor
    if (area > MAX_CANVAS_AREA) factor = Math.min(factor, Math.sqrt(MAX_CANVAS_AREA / (width * height)))
    return {
      width: Math.max(1, Math.floor(width * factor)),
      height: Math.max(1, Math.floor(height * factor)),
      factor: factor,
    }
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      const image = new Image()
      image.decoding = 'sync'
      image.onload = function () {
        resolve(image)
      }
      image.onerror = function () {
        reject(new Error(LX.t('exp.imageFailed')))
      }
      image.src = url
    })
  }

  function prepareRasterSvg(source, options) {
    const opts = options || {}
    const ink = String(opts.color || '#000000')
    let markup = replaceCurrentColor(toSvgString(source), ink)
    markup = mapRootTag(markup, function (tag) {
      let next = tag
      next = setRootAttr(next, 'width', String(roundPx(positive(opts.width, 1))))
      next = setRootAttr(next, 'height', String(roundPx(positive(opts.height, 1))))
      if (!getAttr(next, 'viewBox') && opts.viewBox) {
        next = setRootAttr(next, 'viewBox', '0 0 ' + roundPx(opts.viewBox.width) + ' ' + roundPx(opts.viewBox.height))
      }
      if (!getAttr(next, 'xmlns')) next = setRootAttr(next, 'xmlns', 'http://www.w3.org/2000/svg')
      if (!getAttr(next, 'xmlns:xlink')) next = setRootAttr(next, 'xmlns:xlink', 'http://www.w3.org/1999/xlink')
      if (!getAttr(next, 'color')) next = setRootAttr(next, 'color', ink)
      return next
    })
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + markup
  }

  /**
   * Shared rasterization: returns the drawn canvas plus both the pixel box and
   * the logical (CSS px) box, so PDF can map 96dpi px → 72dpi pt.
   */
  async function rasterize(input, options) {
    const opts = options || {}
    const source = toSvgString(input)
    if (!source) throw new Error(LX.t('exp.noSvg'))
    const em = positive(opts.em, DEFAULT_EM)
    const box = measureSvg(source, em)
    const logicalWidth = box.width
    const logicalHeight = box.height
    if (!(logicalWidth > 0) || !(logicalHeight > 0)) throw new Error(LX.t('exp.noSvg'))
    const requested = clamp(num(opts.scale, 2), 0.05, 16)
    const fitted = fitCanvas(logicalWidth * requested, logicalHeight * requested)
    const pxWidth = fitted.width
    const pxHeight = fitted.height
    const background = normalizeBackground(opts.background)
    const color = opts.color ? String(opts.color) : autoInk(background)
    const markup = prepareRasterSvg(source, {
      width: pxWidth,
      height: pxHeight,
      color: color,
      viewBox: box.viewBox,
    })
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      const image = await loadImage(url)
      const canvas = document.createElement('canvas')
      canvas.width = pxWidth
      canvas.height = pxHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error(LX.t('exp.canvasFailed'))
      if (background) {
        context.fillStyle = background
        context.fillRect(0, 0, pxWidth, pxHeight)
      }
      context.drawImage(image, 0, 0, pxWidth, pxHeight)
      return {
        canvas: canvas,
        width: pxWidth,
        height: pxHeight,
        logicalWidth: logicalWidth,
        logicalHeight: logicalHeight,
        effectiveScale: pxWidth / logicalWidth,
        background: background,
        color: color,
      }
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(
          function (blob) {
            if (blob) resolve(blob)
            else reject(new Error(LX.t('exp.canvasFailed')))
          },
          mime,
          quality,
        )
        return
      }
      try {
        resolve(LX.util.dataUrlToBlob(canvas.toDataURL(mime, quality)))
      } catch (error) {
        reject(error)
      }
    })
  }

  async function svgToPng(input, options) {
    const opts = options || {}
    const raster = await rasterize(input, {
      scale: opts.scale,
      background: opts.background,
      color: opts.color,
      em: opts.em,
    })
    return canvasToBlob(raster.canvas, 'image/png')
  }

  async function svgToJpeg(input, options) {
    const opts = options || {}
    const background = normalizeBackground(opts.background) || '#ffffff'
    const raster = await rasterize(input, {
      scale: opts.scale,
      background: background,
      color: opts.color,
      em: opts.em,
    })
    const quality = clamp(num(opts.quality, 0.95), 0.1, 1)
    return canvasToBlob(raster.canvas, 'image/jpeg', quality)
  }

  async function svgToWebp(input, options) {
    const opts = options || {}
    const raster = await rasterize(input, {
      scale: opts.scale,
      background: opts.background,
      color: opts.color,
      em: opts.em,
    })
    const quality = clamp(num(opts.quality, 0.95), 0.1, 1)
    const blob = await canvasToBlob(raster.canvas, 'image/webp', quality)
    if (blob.type !== 'image/webp') throw new Error(LX.t('exp.webpUnsupported'))
    return blob
  }

  /* ----------------------------------------------------------------- pdf */

  function pdfNumber(value) {
    const rounded = Math.round(num(value, 0) * 10000) / 10000
    if (!Number.isFinite(rounded)) return '0'
    return String(rounded)
  }

  function pdfString(text) {
    return String(text)
      .replace(/[\\()]/g, function (char) {
        return '\\' + char
      })
      .replace(/[^\x20-\x7e]/g, '?')
  }

  /**
   * Hand-written single-page PDF (pure, no DOM): Catalog → Pages → Page →
   * image XObject → content stream → Info, with a byte-accurate xref table.
   * `image` must already be encoded (FlateDecode RGB or DCTDecode JPEG).
   */
  function buildPdfBytes(spec) {
    const source = spec || {}
    const image = source.image instanceof Uint8Array ? source.image : new Uint8Array(source.image || [])
    const pageWidth = Math.max(1, num(source.pageWidth, 100))
    const pageHeight = Math.max(1, num(source.pageHeight, 100))
    const imageWidth = Math.max(1, Math.round(num(source.imageWidth, 1)))
    const imageHeight = Math.max(1, Math.round(num(source.imageHeight, 1)))
    const drawWidth = Math.max(0.1, num(source.drawWidth, pageWidth))
    const drawHeight = Math.max(0.1, num(source.drawHeight, pageHeight))
    const x = num(source.x, 0)
    const y = num(source.y, 0)
    const filter = source.filter === 'DCTDecode' ? 'DCTDecode' : 'FlateDecode'
    const colorSpace = source.colorSpace === 'DeviceGray' ? 'DeviceGray' : 'DeviceRGB'
    const producer = pdfString(source.producer || 'dsh-latex-editor')

    const chunks = []
    let size = 0
    const push = function (part) {
      const bytes = typeof part === 'string' ? utf8Bytes(part) : part
      chunks.push(bytes)
      size += bytes.length
      return bytes
    }
    const offsets = []
    const open = function (id) {
      offsets[id] = size
      push(id + ' 0 obj\n')
    }
    const close = function () {
      push('\nendobj\n')
    }

    push('%PDF-1.4\n')
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

    open(1)
    push('<< /Type /Catalog /Pages 2 0 R >>')
    close()

    open(2)
    push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
    close()

    open(3)
    push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
        pdfNumber(pageWidth) +
        ' ' +
        pdfNumber(pageHeight) +
        '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
    )
    close()

    open(4)
    push(
      '<< /Type /XObject /Subtype /Image /Width ' +
        imageWidth +
        ' /Height ' +
        imageHeight +
        ' /ColorSpace /' +
        colorSpace +
        ' /BitsPerComponent 8 /Filter /' +
        filter +
        ' /Length ' +
        image.length +
        ' >>\nstream\n',
    )
    push(image)
    push('\nendstream')
    close()

    const contentText =
      'q\n' +
      pdfNumber(drawWidth) +
      ' 0 0 ' +
      pdfNumber(drawHeight) +
      ' ' +
      pdfNumber(x) +
      ' ' +
      pdfNumber(y) +
      ' cm\n/Im0 Do\nQ\n'
    const contentBytes = utf8Bytes(contentText)
    open(5)
    push('<< /Length ' + contentBytes.length + ' >>\nstream\n')
    push(contentBytes)
    push('\nendstream')
    close()

    open(6)
    push('<< /Producer (' + producer + ') >>')
    close()

    const objectCount = 6
    const xrefOffset = size
    push('xref\n0 ' + (objectCount + 1) + '\n')
    push('0000000000 65535 f \n')
    for (let id = 1; id <= objectCount; id += 1) {
      const offset = offsets[id] || 0
      push(String(offset).padStart(10, '0') + ' 00000 n \n')
    }
    push('trailer\n<< /Size ' + (objectCount + 1) + ' /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n')
    return concatBytes(chunks)
  }

  /** zlib-wrapped DEFLATE (what PDF `/FlateDecode` expects); null if unavailable. */
  async function deflateBytes(bytes) {
    if (typeof CompressionStream !== 'function' || typeof Blob !== 'function' || typeof Response !== 'function') return null
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
      const buffer = await new Response(stream).arrayBuffer()
      const compressed = new Uint8Array(buffer)
      return compressed.length > 0 ? compressed : null
    } catch {
      return null
    }
  }

  function rgbBytesFromRgba(data, width, height) {
    const out = new Uint8Array(width * height * 3)
    let target = 0
    for (let index = 0; index < data.length; index += 4) {
      out[target] = data[index]
      out[target + 1] = data[index + 1]
      out[target + 2] = data[index + 2]
      target += 3
    }
    return out
  }

  async function svgToPdf(input, options) {
    const opts = options || {}
    const background = normalizeBackground(opts.background) || '#ffffff'
    const margin = clamp(num(opts.margin, 12), 0, 400)
    const raster = await rasterize(input, {
      scale: opts.scale,
      background: background,
      color: opts.color,
      em: opts.em,
    })
    const context = raster.canvas.getContext('2d')
    if (!context) throw new Error(LX.t('exp.canvasFailed'))
    const rgba = context.getImageData(0, 0, raster.canvas.width, raster.canvas.height).data
    const rgb = rgbBytesFromRgba(rgba, raster.canvas.width, raster.canvas.height)
    let imageBytes = await deflateBytes(rgb)
    let filter = 'FlateDecode'
    if (!imageBytes) {
      const jpeg = await canvasToBlob(raster.canvas, 'image/jpeg', 0.92)
      imageBytes = new Uint8Array(await jpeg.arrayBuffer())
      filter = 'DCTDecode'
    }
    const logicalWidth = raster.logicalWidth * 0.75
    const logicalHeight = raster.logicalHeight * 0.75
    const paperName = String(opts.paper || 'content').toLowerCase()
    let pageWidth = logicalWidth + margin * 2
    let pageHeight = logicalHeight + margin * 2
    let drawWidth = logicalWidth
    let drawHeight = logicalHeight
    let drawX = margin
    let drawY = margin
    const paper = paperName === 'a4' ? A4 : paperName === 'letter' ? LETTER : null
    if (paper) {
      pageWidth = paper.width
      pageHeight = paper.height
      const availableWidth = Math.max(1, pageWidth - margin * 2)
      const availableHeight = Math.max(1, pageHeight - margin * 2)
      const fit = Math.min(1, availableWidth / drawWidth, availableHeight / drawHeight)
      drawWidth *= fit
      drawHeight *= fit
      drawX = (pageWidth - drawWidth) / 2
      drawY = (pageHeight - drawHeight) / 2
    }
    const bytes = buildPdfBytes({
      pageWidth: pageWidth,
      pageHeight: pageHeight,
      imageWidth: raster.width,
      imageHeight: raster.height,
      drawWidth: drawWidth,
      drawHeight: drawHeight,
      x: drawX,
      y: drawY,
      image: imageBytes,
      filter: filter,
    })
    return new Blob([bytes], { type: 'application/pdf' })
  }

  /* -------------------------------------------------------------- exports */

  function timestamp(date) {
    const value = date || new Date()
    const pad = function (amount) {
      return amount < 10 ? '0' + amount : String(amount)
    }
    return (
      String(value.getFullYear()) +
      pad(value.getMonth() + 1) +
      pad(value.getDate()) +
      '-' +
      pad(value.getHours()) +
      pad(value.getMinutes()) +
      pad(value.getSeconds())
    )
  }

  function textBlob(text, mime) {
    return new Blob([String(text === undefined || text === null ? '' : text)], {
      type: mime || 'text/plain;charset=utf-8',
    })
  }

  function stripMathDelimiters(source) {
    let text = String(source === undefined || source === null ? '' : source).trim()
    const wrapped = function (open, close) {
      if (text.length < open.length + close.length) return false
      if (!text.startsWith(open) || !text.endsWith(close)) return false
      const inner = text.slice(open.length, text.length - close.length)
      return inner.indexOf(open) < 0 && inner.indexOf(close) < 0
    }
    if (wrapped('$$', '$$')) return text.slice(2, -2).trim()
    if (wrapped('\\[', '\\]')) return text.slice(2, -2).trim()
    if (wrapped('\\(', '\\)')) return text.slice(2, -2).trim()
    if (wrapped('$', '$')) return text.slice(1, -1).trim()
    return text
  }

  function latexText(source, options) {
    const opts = options || {}
    const body = stripMathDelimiters(source)
    const header = '% Generated by dsh-latex-editor (MathJax 3 TeX → SVG)\n'
    if (opts.display === false) return header + '\\(' + body + '\\)\n'
    return header + '\\[\n' + body + '\n\\]\n'
  }

  function markdownText(source, options) {
    const opts = options || {}
    const body = stripMathDelimiters(source)
    if (opts.display === false) return '$' + body + '$\n'
    return '$$\n' + body + '\n$$\n'
  }

  function withExtension(filename, extension) {
    const value = String(filename || '').trim() || 'formula'
    if (new RegExp('\\.' + extension + '$', 'i').test(value)) return value
    return value + '.' + extension
  }

  function svgFile(markup, options) {
    const opts = options || {}
    const ink = opts.color || autoInk(normalizeBackground(opts.background)) || '#000000'
    let body = replaceCurrentColor(toSvgString(markup), ink)
    const background = normalizeBackground(opts.background)
    if (background) {
      const info = rootSvgMarkup(body)
      if (info) {
        const box = measureSvg(body, DEFAULT_EM)
        const left = box.viewBox ? box.viewBox.x : 0
        const top = box.viewBox ? box.viewBox.y : 0
        const width = box.viewBox ? box.viewBox.width : box.width
        const height = box.viewBox ? box.viewBox.height : box.height
        const rect =
          '<rect data-lx-background="true" x="' +
          left +
          '" y="' +
          top +
          '" width="' +
          width +
          '" height="' +
          height +
          '" fill="' +
          escapeXml(background) +
          '"/>'
        body = body.slice(0, info.end) + rect + body.slice(info.end)
      }
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + body
  }

  /**
   * Build one downloadable artifact.
   * `formatId` ∈ formats[].id; `options` may carry display, numbered, extensions,
   * scale (raster), background, color, quality, margin, paper, filename, title.
   */
  async function exportAs(formatId, source, options) {
    const opts = options || {}
    const wanted = String(formatId === undefined || formatId === null ? '' : formatId).toLowerCase()
    const format = FORMATS.filter(function (item) {
      return item.id === wanted
    })[0]
    if (!format) throw new Error(LX.t('exp.unknownFormat', { format: formatId }))
    const text = String(source === undefined || source === null ? '' : source)
    if (!text.trim()) throw new Error(LX.t('exp.emptySource'))
    const stamp = timestamp()
    const filename = opts.filename ? withExtension(opts.filename, format.ext) : 'formula-' + stamp + '.' + format.ext
    const common = {
      display: opts.display,
      numbered: opts.numbered,
      number: opts.number,
      extensions: opts.extensions,
      em: opts.em,
      containerWidth: opts.containerWidth,
    }
    if (format.id === 'latex') return { blob: textBlob(latexText(text, opts), format.mime), filename: filename }
    if (format.id === 'markdown') return { blob: textBlob(markdownText(text, opts), format.mime), filename: filename }
    if (format.id === 'mathml') {
      const mathml = await tex2mathml(text, common)
      return { blob: textBlob(mathml, format.mime), filename: filename }
    }
    if (format.id === 'html') {
      const html = await tex2html(text, Object.assign({}, common, { title: opts.title }))
      return { blob: textBlob(html, format.mime), filename: filename }
    }
    const rendered = await tex2svg(text, Object.assign({}, common, { scale: 1 }))
    if (format.id === 'svg') {
      return { blob: textBlob(svgFile(rendered.svg, opts), format.mime), filename: filename }
    }
    const rasterOptions = {
      scale: opts.scale === undefined ? 2 : opts.scale,
      background: opts.background,
      color: opts.color,
      em: opts.em,
      quality: opts.quality,
    }
    if (format.id === 'png') return { blob: await svgToPng(rendered.svg, rasterOptions), filename: filename }
    if (format.id === 'jpg') return { blob: await svgToJpeg(rendered.svg, rasterOptions), filename: filename }
    if (format.id === 'webp') return { blob: await svgToWebp(rendered.svg, rasterOptions), filename: filename }
    if (format.id === 'pdf') {
      return {
        blob: await svgToPdf(
          rendered.svg,
          Object.assign({}, rasterOptions, { margin: opts.margin, paper: opts.paper }),
        ),
        filename: filename,
      }
    }
    throw new Error(LX.t('exp.unknownFormat', { format: formatId }))
  }

  /* ------------------------------------------------------------- registry */

  const render = {
    ensure: ensure,
    tex2svg: tex2svg,
    tex2mathml: tex2mathml,
    tex2html: tex2html,
    svgToPng: svgToPng,
    svgToJpeg: svgToJpeg,
    svgToWebp: svgToWebp,
    svgToPdf: svgToPdf,
    formats: FORMATS,
    exportAs: exportAs,
  }

  // Short aliases for callers that read the raster codecs as `toPng`, etc.
  // They are non-enumerable so `Object.keys(LX.render)` stays exactly the
  // documented contract surface.
  const aliases = { toPng: svgToPng, toJpeg: svgToJpeg, toWebp: svgToWebp, toPdf: svgToPdf, toSvg: null }
  for (const name of Object.keys(aliases)) {
    if (!aliases[name]) continue
    Object.defineProperty(render, name, { value: aliases[name], enumerable: false, configurable: true })
  }

  // Pure helpers used by the offline self-tests (`node --check` + temp harness).
  Object.defineProperty(render, '__test', {
    value: {
      measureSvg: measureSvg,
      applyPixelSize: applyPixelSize,
      replaceCurrentColor: replaceCurrentColor,
      mapRootTag: mapRootTag,
      rootSvgMarkup: rootSvgMarkup,
      parseViewBox: parseViewBox,
      parseLength: parseLength,
      collectErrors: collectErrors,
      buildPdfBytes: buildPdfBytes,
      deflateBytes: deflateBytes,
      autoInk: autoInk,
      parseColor: parseColor,
      stripMathDelimiters: stripMathDelimiters,
      timestamp: timestamp,
      formats: FORMATS,
      knownExtensions: KNOWN_EXTENSIONS,
      defaultExtensions: DEFAULT_EXTENSIONS,
      mathjaxUrl: MATHJAX_URL,
    },
    enumerable: false,
    configurable: false,
  })

  LX.render = render

  /* ------------------------------------------------------------------ css */

  LX.addCss(`
.lx-render-svg{display:flex;align-items:center;justify-content:center;min-width:0;overflow:auto;}
.lx-render-svg>svg{display:block;max-width:100%;height:auto;}
.lx-render-inline>svg{display:inline-block;vertical-align:middle;max-width:100%;height:auto;}
.lx-render-errors{display:flex;flex-direction:column;gap:4px;margin:6px 0 0;padding:0;list-style:none;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary);word-break:break-word;}
.lx-render-error-item{display:flex;gap:6px;align-items:flex-start;}
`)
})()
