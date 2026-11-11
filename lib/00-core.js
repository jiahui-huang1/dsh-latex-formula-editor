/**
 * @local/dsh-latex-editor — lib/00-core.js
 *
 * Shared foundation for every browser module of the formula workbench:
 * the `window.__LX` namespace, merged bilingual dictionaries, persisted
 * settings, same-origin API helpers, and the theme-token UI primitives.
 *
 * Every later module is a classic script that reads `window.__LX` and adds its
 * own API under a documented key. No module may redefine another module's key.
 */
;(function () {
  'use strict'

  const React = window.__LX_REACT__
  if (!React) return
  const h = React.createElement
  const LX = (window.__LX = window.__LX || {})

  LX.version = '1.0.0'
  LX.React = React
  LX.h = h
  LX.NS = 'latex-editor'
  LX.BASE = '/plugins/latex-editor'

  /* ------------------------------------------------------------------ i18n */

  const dicts = (LX.dicts = { zh: {}, en: {} })

  /** Contribute keys to one locale dictionary. Later modules may add keys. */
  LX.addDict = function addDict(language, entries) {
    const target = dicts[language] || (dicts[language] = {})
    Object.assign(target, entries || {})
  }

  let boundTranslator = null
  /** Installed by client.js: `ctx.locale.bind(NS)`. */
  LX.setTranslator = function setTranslator(fn) {
    if (typeof fn === 'function') boundTranslator = fn
  }

  /* Simplified → Traditional mapping for the UI vocabulary. The traditional
     dictionary is derived from the simplified one at read time, so every module
     that registers `zh` strings immediately also has `zhHant`. */
  const S2T_PAIRS =
    '简簡 体體 关關 闭閉 开開 设設 置置 项項 图圖 片片 识識 别別 文文 档檔 编編 辑輯 器器 公公 式式 模模 板板 符符 号號 ' +
    '常常 用用 希希 腊臘 分分 数數 微微 根根 式式 角角 标標 极極 限限 对对 三三 函函 积積 运運 算算 大大 型型 括括 取取 整整 组組 阵阵 列列 ' +
    '代代 数數 几幾 何何 不不 等等 矩矩 统统 计計 列列 物物 理理 化化 学學 颜顏 色色 字字 清清 空空 撤撤 销銷 收收 藏藏 环環 境境 导導 入入 ' +
    '项項 目目 明明 时时 间間 搜搜 索索 标標 题題 或或 源源 码碼 插插 入入 复複 制製 删刪 除除 重重 命命 名名 无無 法法 保保 存存 剪剪 贴貼 板板 ' +
    '渲渲 染染 预預 览覽 透透 明明 白白 底底 深深 色色 编編 号號 复複 制製 成成 功功 失失 败敗 错錯 误誤 加加 载載 中中 等等 待待 就就 绪緒 ' +
    '说说 明明 帮幫 助助 示示 例例 重重 置置 恢恢 复複 历歷 史史 分分 享享 链鏈 接接 导導 出出 格格 式式 倍倍 率率 质質 量量 尺尺 寸寸 到到 剪剪 ' +
    '背背 景景 使使 用用 文文 档檔 联聯 系系 我我 们們 免免 费費 开開 源源 离離 线線 多多 语語 言言 简簡 繁繁 主主 题題 浅浅 暗暗 系系 统统 语語 言言 ' +
    '字字 体體 字字 号號 式式 子子 能能 力力 支支 持持 选選 择擇 自自 动動 手手 动動 上上 传傳 重重 试试 换換 行行 拼拼 音音 器器 识識 图圖 像像 ' +
    '算算 法法 调調 用用 服服 务務 配配 置置 保保 留留 恢恢 复复 冷冷 暖暖 浅浅 深深 主主 題題 计計 划劃 项項 目目 文文 件件 夹夾 夹夾'

  const S2T = (function () {
    const map = {}
    const pairs = S2T_PAIRS.split(' ')
    for (const pair of pairs) {
      if (pair.length !== 2) continue
      map[pair.charAt(0)] = pair.charAt(1)
    }
    return map
  })()

  const hantCache = new Map()
  function toHant(text) {
    const input = String(text === undefined || text === null ? '' : text)
    if (!input) return input
    const cached = hantCache.get(input)
    if (cached !== undefined) return cached
    let out = ''
    for (let i = 0; i < input.length; i += 1) {
      const ch = input.charAt(i)
      out += S2T[ch] || ch
    }
    if (hantCache.size > 4000) hantCache.clear()
    hantCache.set(input, out)
    return out
  }
  LX.toHant = toHant

  dicts.zh.__localeTag = 'zh'
  dicts.en.__localeTag = 'en'

  let currentLanguage = null
  /**
   * 'zh' or 'en' — the active locale. The locale service answers the probe key
   * `__localeTag` (whose value is the locale itself), so switching locale in the
   * host re-localizes everything without re-registering the dictionaries.
   */
  LX.lang = function lang() {
    if (currentLanguage) return currentLanguage
    if (typeof boundTranslator === 'function') {
      try {
        const probe = boundTranslator('__localeTag')
        if (probe === 'zh' || probe === 'zhHant' || probe === 'en') {
          currentLanguage = probe
          return probe
        }
      } catch {
        /* fall through to the document language */
      }
    }
    if (currentLanguage) return currentLanguage
    const raw = (document.documentElement.getAttribute('lang') || navigator.language || 'en').toLowerCase()
    currentLanguage = raw.startsWith('zh') ? 'zh' : 'en'
    return currentLanguage
  }
  LX.setLanguage = function setLanguage(value) {
    currentLanguage = value === 'zh' || value === 'zhHant' || value === 'en' ? value : null
  }

  /** Localized label of a `{ zh, en }` pair (used by data tables, not dictionaries). */
  LX.pick = function pick(pair, fallback) {
    if (pair === null || pair === undefined) return fallback === undefined ? '' : fallback
    if (typeof pair === 'string') return pair
    const language = LX.lang()
    if (language === 'zhHant') {
      const traditional = pair.zhHant !== undefined ? pair.zhHant : toHant(pair.zh || pair.en || '')
      if (traditional !== '') return traditional
    }
    const value = pair[language]
    if (value !== undefined && value !== '') return value
    if (fallback !== undefined) return fallback
    return pair.en || pair.zh || ''
  }

  /** Translate `key` with `{name}` interpolation, falling back to the other locale. */
  LX.t = function t(key, vars) {
    if (key === undefined || key === null) return ''
    const language = LX.lang()
    const hant = language === 'zhHant'
    let text = dicts[hant ? 'zh' : language] && dicts[hant ? 'zh' : language][key]
    if (text === undefined) {
      const other = language === 'zh' || hant ? 'en' : 'zh'
      text = dicts[other] && dicts[other][key]
    }
    if (hant && typeof text === 'string') text = toHant(text)
    if (text === undefined) text = key
    if (vars === undefined || vars === null) return text
    return String(text).replace(/\{(\w+)\}/g, function (_match, name) {
      const value = vars[name]
      return value === undefined || value === null ? '' : String(value)
    })
  }

  /* --------------------------------------------------------------- styling */

  const css = (LX.css = [])
  LX.addCss = function addCss(text) {
    if (typeof text === 'string' && text.length > 0) css.push(text)
  }
  LX.styleText = function styleText() {
    return css.join('\n')
  }
  LX.cx = function cx() {
    const out = []
    for (let i = 0; i < arguments.length; i += 1) {
      const value = arguments[i]
      if (!value) continue
      if (typeof value === 'string') out.push(value)
      else if (Array.isArray(value)) out.push(LX.cx.apply(null, value))
      else if (typeof value === 'object') {
        for (const key in value) if (value[key]) out.push(key)
      }
    }
    return out.join(' ')
  }

  /* ----------------------------------------------------------------- utils */

  const util = (LX.util = {})

  util.clamp = function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
  }

  let uidCounter = 0
  util.uid = function uid(prefix) {
    uidCounter += 1
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + uidCounter
  }

  util.sleep = function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms)
    })
  }

  util.debounce = function debounce(fn, delay) {
    let timer = null
    const wrapped = function () {
      const args = arguments
      const self = this
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(function () {
        timer = null
        fn.apply(self, args)
      }, delay)
      return timer
    }
    wrapped.cancel = function () {
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
    return wrapped
  }

  util.formatBytes = function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let index = 0
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024
      index += 1
    }
    const rounded = value >= 100 || index === 0 ? Math.round(value) : Math.round(value * 10) / 10
    return rounded + ' ' + units[index]
  }

  util.escapeHtml = function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  /** Trigger a browser download for a Blob or a string payload. */
  util.download = function download(filename, data, mime) {
    const blob = typeof data === 'string' ? new Blob([data], { type: mime || 'text/plain;charset=utf-8' }) : data
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename || 'formula'
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    setTimeout(function () {
      if (anchor.parentNode) anchor.parentNode.removeChild(anchor)
      URL.revokeObjectURL(url)
    }, 4000)
    return true
  }

  util.downloadText = function downloadText(filename, text, mime) {
    return util.download(filename, String(text), mime || 'text/plain;charset=utf-8')
  }

  util.copyText = async function copyText(text) {
    const value = String(text === undefined || text === null ? '' : text)
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value)
        return true
      }
    } catch {
      /* fall back to the textarea trick below */
    }
    try {
      const area = document.createElement('textarea')
      area.value = value
      area.setAttribute('readonly', 'readonly')
      area.style.position = 'fixed'
      area.style.top = '-1000px'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }

  util.copyBlob = async function copyBlob(blob) {
    try {
      if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        return true
      }
    } catch {
      /* unsupported clipboard image write */
    }
    return false
  }

  util.fileToDataUrl = function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader()
      reader.onload = function () {
        resolve(String(reader.result || ''))
      }
      reader.onerror = function () {
        reject(reader.error || new Error('read failed'))
      }
      reader.readAsDataURL(file)
    })
  }

  util.dataUrlBytes = function dataUrlBytes(dataUrl) {
    const comma = String(dataUrl).indexOf(',')
    if (comma < 0) return 0
    const body = String(dataUrl).slice(comma + 1)
    const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
    return Math.max(0, Math.floor((body.length * 3) / 4) - padding)
  }

  util.dataUrlToBlob = function dataUrlToBlob(dataUrl) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl))
    if (!match) return new Blob([String(dataUrl)], { type: 'text/plain' })
    const mime = match[1] || 'text/plain'
    const payload = match[3] || ''
    if (match[2]) {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      return new Blob([bytes], { type: mime })
    }
    return new Blob([decodeURIComponent(payload)], { type: mime })
  }

  const scriptCache = new Map()
  /** Load one classic script exactly once; resolves when it has executed. */
  util.loadScript = function loadScript(src, globalCheck) {
    if (globalCheck && globalCheck()) return Promise.resolve(true)
    const cached = scriptCache.get(src)
    if (cached) return cached
    const promise = new Promise(function (resolve, reject) {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.crossOrigin = 'same-origin'
      script.onload = function () {
        if (globalCheck && !globalCheck()) {
          reject(new Error('script loaded but did not initialize: ' + src))
          return
        }
        resolve(true)
      }
      script.onerror = function () {
        scriptCache.delete(src)
        reject(new Error('failed to load ' + src))
      }
      document.head.appendChild(script)
    })
    scriptCache.set(src, promise)
    return promise
  }

  util.now = function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
  }

  /* -------------------------------------------------------- storage/settings */

  const PREFIX = 'dsh.latex-editor.'

  const storage = (LX.storage = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(PREFIX + key)
        if (raw === null) return fallback
        return JSON.parse(raw)
      } catch {
        return fallback
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
        return true
      } catch {
        return false
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(PREFIX + key)
      } catch {
        /* ignore */
      }
    },
  })

  /**
   * Declarative settings store. Every field is one descriptor:
   *   { key, group, type: 'select'|'text'|'number'|'switch'|'range'|'multi'|'textarea',
   *     zh, en, hintZh, hintEn, options: [{value, zh, en}], min, max, step, default, unit }
   * Modules register their fields; the settings page renders the merged schema.
   */
  const SETTINGS_KEY = 'settings.v1'
  const fieldRegistry = []
  const fieldKeys = new Set()

  const defaults = {
    backend: 'auto',
    endpointUrl: '',
    endpointModel: '',
    endpointKey: '',
    prompt: '',
    previewScale: 1,
    numbered: false,
    autoClearOnRecognize: true,
    editorFontSize: 16,
    favoritesLimit: 10,
    language: 'auto',
    themeMode: 'auto',
    uiScale: 1.25,
    wrap: true,
    livePreview: true,
    extensions: ['ams', 'color', 'newcommand', 'noundefined', 'cancel', 'bbox', 'physics', 'mhchem', 'unicode', 'textmacros'],
    copyFormat: 'latex',
    recentLimit: 24,
    docScale: 2,
    docMaxPages: 30,
    ocrHistoryDays: 0,
  }

  const values = Object.assign({}, defaults)
  const listeners = new Set()

  /** Bumped whenever a stored default is too small for the current type scale. */
  const SETTINGS_VERSION = 3

  function persistAll() {
    storage.set(SETTINGS_KEY, Object.assign({}, values, { version: SETTINGS_VERSION }))
  }

  function readPersisted() {
    const saved = storage.get(SETTINGS_KEY, null)
    if (saved && typeof saved === 'object') {
      for (const key of Object.keys(saved)) {
        if (key in defaults) values[key] = saved[key]
      }
      const savedVersion = Number(saved.version) || 0
      // The migrations below only ever move an older schema forward: a stored
      // version at or above SETTINGS_VERSION is left untouched, so bumping the
      // version in a future release cannot silently reset user choices.
      if (savedVersion < SETTINGS_VERSION) {
        // v1 shipped a 15px editor and 12-13px chrome; lift once so an existing
        // user actually sees the larger typography instead of a stored 15px.
        const legacyFont = Number(values.editorFontSize)
        values.editorFontSize = Math.max(Number.isFinite(legacyFont) ? legacyFont : 0, defaults.editorFontSize)
        const legacyScale = Number(values.previewScale)
        if (!Number.isFinite(legacyScale) || legacyScale < 1) values.previewScale = 1
        // v3 switched the workbench default to 125%; a stored 100/150/200 from
        // the earlier experiments is replaced once, and only while the saved
        // schema predates v3.
        if (savedVersion < 3) values.uiScale = defaults.uiScale
        persistAll()
      }
    }
  }
  readPersisted()

  const settings = (LX.settings = {
    defaults,
    values,
    get(key) {
      return values[key]
    },
    set(key, value) {
      if (values[key] === value) return
      values[key] = value
      persistAll()
      for (const listener of listeners) {
        try {
          listener(key, value)
        } catch (error) {
          console.error('[latex-editor] settings listener failed', error)
        }
      }
    },
    patch(patch) {
      let changed = false
      for (const key of Object.keys(patch || {})) {
        if (values[key] !== patch[key]) {
          values[key] = patch[key]
          changed = true
        }
      }
      if (!changed) return
      persistAll()
      for (const listener of listeners) {
        try {
          listener(null, null)
        } catch (error) {
          console.error('[latex-editor] settings listener failed', error)
        }
      }
    },
    reset() {
      Object.assign(values, defaults)
      for (const field of fieldRegistry) {
        if (field.default !== undefined) values[field.key] = field.default
      }
      persistAll()
      for (const listener of listeners) {
        try {
          listener(null, null)
        } catch {
          /* ignore */
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return function unsubscribe() {
        listeners.delete(listener)
      }
    },
    registerField(field) {
      if (!field || !field.key || fieldKeys.has(field.key)) return false
      fieldKeys.add(field.key)
      if (values[field.key] === undefined && field.default !== undefined) values[field.key] = field.default
      fieldRegistry.push(field)
      return true
    },
    fields() {
      return fieldRegistry.slice()
    },
    groups() {
      const map = new Map()
      for (const field of fieldRegistry) {
        const group = field.group || 'general'
        if (!map.has(group)) map.set(group, [])
        map.get(group).push(field)
      }
      return map
    },
  })

  /** React binding: re-render on any settings change. */
  LX.useSettings = function useSettings() {
    const [, force] = React.useReducer(function (n) {
      return n + 1
    }, 0)
    React.useEffect(function () {
      return settings.subscribe(function () {
        force()
      })
    }, [])
    return values
  }

  /* ------------------------------------------------------------------- API */

  async function requestJson(method, path, body, options) {
    const opts = options || {}
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timeout = opts.timeoutMs || 120000
    let timer = null
    if (controller) {
      timer = setTimeout(function () {
        controller.abort()
      }, timeout)
    }
    try {
      const response = await fetch(LX.BASE + path, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
        credentials: 'same-origin',
      })
      const text = await response.text()
      let payload = null
      if (text) {
        try {
          payload = JSON.parse(text)
        } catch {
          payload = { error: text.slice(0, 400) }
        }
      }
      if (!response.ok) {
        const message = (payload && (payload.error || payload.message)) || 'HTTP ' + response.status
        const error = new Error(message)
        error.status = response.status
        error.payload = payload
        throw error
      }
      return payload
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('request timed out after ' + Math.round(timeout / 1000) + 's')
      throw error
    } finally {
      if (timer !== null) clearTimeout(timer)
    }
  }

  const api = (LX.api = {
    base: LX.BASE,
    asset(relative) {
      return LX.BASE + '/' + String(relative).replace(/^\/+/, '')
    },
    get(path, options) {
      return requestJson('GET', path, undefined, options)
    },
    post(path, body, options) {
      return requestJson('POST', path, body, options)
    },
    /** Host capability probe; resolves to null when the Host half is absent. */
    async health() {
      try {
        return await requestJson('GET', '/health', undefined, { timeoutMs: 5000 })
      } catch {
        return null
      }
    },
  })

  /* ---------------------------------------------------------- toast bus */

  const toastListeners = new Set()
  LX.toast = function toast(message, tone) {
    if (!message) return
    const entry = { id: util.uid('toast'), message: String(message), tone: tone || 'info' }
    for (const listener of toastListeners) {
      try {
        listener(entry)
      } catch {
        /* ignore */
      }
    }
  }
  LX.onToast = function onToast(listener) {
    toastListeners.add(listener)
    return function () {
      toastListeners.delete(listener)
    }
  }
})()

/* ------------------------------------------------------------------ icons */
;(function () {
  'use strict'
  const LX = window.__LX
  if (!LX || !LX.React) return
  const h = LX.h

  function svg(paths, options) {
    const opts = options || {}
    const rendered = typeof paths === 'function' ? paths(h) : paths
    return function Icon(props) {
      const size = (props && props.size) || opts.size || 16
      return h(
        'svg',
        {
          viewBox: opts.viewBox || '0 0 24 24',
          width: size,
          height: size,
          fill: opts.fill || 'none',
          stroke: opts.fill ? 'none' : 'currentColor',
          strokeWidth: opts.strokeWidth || 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: false,
          style: { display: 'block', flex: 'none', ...(props && props.style) },
        },
        rendered,
      )
    }
  }

  const MARK_PATH =
    'M643.015111 128c9.557333 0 18.773333 3.811556 25.486222 10.581333l0.398223 0.398223 88.974222 91.989333a36.010667 36.010667 0 0 1-51.313778 50.460444l-0.455111-0.398222-78.392889-81.009778H167.025778l196.835555 293.432889a36.010667 36.010667 0 0 1 0.227556 39.822222l-0.284445 0.455112-196.892444 290.247111h460.8l78.392889-81.009778a36.010667 36.010667 0 0 1 50.517333-1.251556l0.398222 0.398223c14.165333 13.653333 14.677333 36.181333 1.251556 50.460444l-0.398222 0.455111-88.974222 91.989333a36.010667 36.010667 0 0 1-25.372445 10.979556H98.986667a36.010667 36.010667 0 0 1-30.264889-55.466667l0.512-0.739555 221.297778-326.428445-220.899556-329.329777a36.010667 36.010667 0 0 1 29.013333-56.035556h544.369778z m306.460445 262.542222c13.880889 13.937778 14.051556 36.408889 0.398222 50.517334L878.876444 512l70.542223 70.542222a36.010667 36.010667 0 0 1-50.460445 51.313778l-0.398222-0.398222-70.542222-70.599111-70.542222 70.599111a36.010667 36.010667 0 0 1-51.370667-50.517334L777.102222 512l-70.542222-70.542222a36.010667 36.010667 0 0 1 50.460444-51.313778l70.940445 70.940444 70.542222-70.542222a36.010667 36.010667 0 0 1 50.972445 0z'

  const p = function (d, extra) {
    return h('path', { d, ...(extra || {}) })
  }

  LX.icons = {
    /* sidebar / brand mark: the sigma of a summation */
    Sigma: svg(
      h('g', null, p('M17.6 6.4H7.9l5.9 6.1-5.9 6.1h9.7'), p('M15.2 3.9h4.4')),
      { strokeWidth: 2 },
    ),
    /* LaTeX Live style mark (filled sigma + boxed cross) from the supplied SVG */
    LatexMark: svg(h('path', { d: MARK_PATH }), { viewBox: '0 0 1024 1024', fill: 'currentColor', strokeWidth: 0 }),
    Formula: svg(h('g', null, p('M5 6h5'), p('M7.5 6v12'), p('M14 10.5l5 5'), p('M19 10.5l-5 5'))),
    Image: svg(
      h('g', null, p('M4 5.6h16v12.8H4z'), h('circle', { cx: 9, cy: 10, r: 1.5 }), p('M4.6 17.8l4.9-4.4 3.2 2.8 3-2.6 3.7 3.2')),
    ),
    Doc: svg(
      h(
        'g',
        null,
        p('M6.5 3.6h7l5 5v11.8h-12z'),
        p('M13.4 3.8v5h5'),
        p('M9 13h6'),
        p('M9 16.2h4.2'),
      ),
    ),
    Download: svg(h('g', null, p('M12 4v10.4'), p('M8.2 11l3.8 3.8 3.8-3.8'), p('M5 19.4h14'))),
    Upload: svg(h('g', null, p('M12 15.4V5'), p('M8.2 8.4L12 4.6l3.8 3.8'), p('M5 19.4h14'))),
    Copy: svg(h('g', null, h('rect', { x: 9, y: 9, width: 10.4, height: 10.4, rx: 2.2 }), p('M6.6 15.2H5.8A1.8 1.8 0 0 1 4 13.4V5.8A1.8 1.8 0 0 1 5.8 4h7.6a1.8 1.8 0 0 1 1.8 1.8v.8'))),
    Trash: svg(h('g', null, p('M4.6 6.6h14.8'), p('M9.4 6.4V4.6h5.2v1.8'), p('M6.6 6.8l.9 12.4h9l.9-12.4'), p('M10.2 10.4v5.4'), p('M13.8 10.4v5.4'))),
    Settings: svg(
      h(
        'g',
        null,
        h('circle', { cx: 12, cy: 12, r: 3 }),
        p('M19.4 13.9a7.8 7.8 0 0 0 0-3.8l1.8-1.3-1.9-3.3-2.1.9a7.8 7.8 0 0 0-3.3-1.9L13.5 2h-3.8l-.4 2.5a7.8 7.8 0 0 0-3.3 1.9l-2.1-.9L2 8.8l1.8 1.3a7.8 7.8 0 0 0 0 3.8L2 15.2l1.9 3.3 2.1-.9a7.8 7.8 0 0 0 3.3 1.9l.4 2.5h3.8l.4-2.5a7.8 7.8 0 0 0 3.3-1.9l2.1.9 1.9-3.3-1.8-1.3z'),
      ),
      { strokeWidth: 1.45 },
    ),
    Help: svg(h('g', null, h('circle', { cx: 12, cy: 12, r: 8.6 }), p('M9.5 9.4a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1 1-1.1 1.8v.5'), h('circle', { cx: 12, cy: 17.2, r: 0.95, fill: 'currentColor', stroke: 'none' }))),
    Sparkle: svg(h('g', null, p('M12 3.4l1.8 4.9 4.9 1.8-4.9 1.8L12 16.8l-1.8-4.9-4.9-1.8 4.9-1.8z'), p('M18.6 15.4l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z'))),
    Share: svg(h('g', null, h('circle', { cx: 6.4, cy: 12, r: 2.4 }), h('circle', { cx: 17.6, cy: 6.4, r: 2.4 }), h('circle', { cx: 17.6, cy: 17.6, r: 2.4 }), p('M8.6 10.9l6.8-3.4'), p('M8.6 13.1l6.8 3.4'))),
    Undo: svg(h('g', null, p('M9.4 7.4L5 11.6l4.4 4.2'), p('M5.4 11.6h8.2a4.6 4.6 0 0 1 0 9.2H10'))),
    Redo: svg(h('g', null, p('M14.6 7.4L19 11.6l-4.4 4.2'), p('M18.6 11.6h-8.2a4.6 4.6 0 0 0 0 9.2H14'))),
    Close: svg(h('g', null, p('M6.2 6.2l11.6 11.6'), p('M17.8 6.2L6.2 17.8')), { strokeWidth: 2 }),
    Sun: svg(h('g', null,
      h('circle', { cx: 12, cy: 12, r: 4.2 }),
      p('M12 2.6v2.2'), p('M12 19.2v2.2'), p('M2.6 12h2.2'), p('M19.2 12h2.2'),
      p('M5.4 5.4l1.6 1.6'), p('M17 17l1.6 1.6'), p('M18.6 5.4L17 7'), p('M7 17l-1.6 1.6'),
    )),
    Moon: svg(p('M20 14.4A8.4 8.4 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4z')),
    Globe: svg(
      h('g', null,
        h('circle', { cx: 12, cy: 12, r: 8.2 }),
        p('M3.8 12h16.4'),
        p('M12 3.8c2.6 2.4 3.9 5.2 3.9 8.2s-1.3 5.8-3.9 8.2c-2.6-2.4-3.9-5.2-3.9-8.2s1.3-5.8 3.9-8.2z'),
      ),
    ),
    Palette: svg(
      h('g', null,
        h('path', { d: 'M12 3.6c4.7 0 8.4 3.5 8.4 7.6 0 2.1-1.7 3.4-3.6 3.4h-1.6c-1 0-1.7.7-1.7 1.6 0 .6.2.9.5 1.4.3.5.4.9.4 1.4 0 1.2-1 2-2.4 2-4.7 0-8.4-3.7-8.4-8.7S7.3 3.6 12 3.6z' }),
        h('circle', { cx: 8.6, cy: 10.2, r: 1.25, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 12.4, cy: 7.9, r: 1.25, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 16.1, cy: 10.2, r: 1.25, fill: 'currentColor', stroke: 'none' }),
      ),
    ),
    FontA: svg(h('g', null, p('M5 18.4l5.4-12.8 5.4 12.8'), p('M7.2 14.2h6.4'))),
    TextSize: svg(h('g', null, p('M4.6 17.6l4-10.2 4 10.2'), p('M6.3 14.1h4.6'), p('M14.4 17.6l3-7.4 3 7.4'), p('M15.6 15.2h3.6')), { strokeWidth: 1.7 }),
    EnvGrid: svg(h('g', null, h('rect', { x: 4.2, y: 5.4, width: 15.6, height: 13.2, rx: 1.8 }), p('M4.2 10.2h15.6'), p('M10.6 10.2v8.4'))),
    Star: svg(p('M12 4.4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 10l5.4-.8z')),
    ChevronDown: svg(p('M6.4 9.4l5.6 5.2 5.6-5.2'), { strokeWidth: 2 }),
    ChevronRight: svg(p('M9.4 6.4l5.2 5.6-5.2 5.6'), { strokeWidth: 2 }),
    Check: svg(p('M4.8 12.6l4.6 4.4 9.8-9.8'), { strokeWidth: 2.1 }),
    Plus: svg(h('g', null, p('M12 5v14'), p('M5 12h14')), { strokeWidth: 2 }),
    Eye: svg(h('g', null, p('M2.6 12S6.4 5.6 12 5.6 21.4 12 21.4 12 17.6 18.4 12 18.4 2.6 12 2.6 12z'), h('circle', { cx: 12, cy: 12, r: 2.9 }))),
    Code: svg(h('g', null, p('M8.6 7.6L4 12l4.6 4.4'), p('M15.4 7.6L20 12l-4.6 4.4'))),
    Layers: svg(h('g', null, p('M12 3.4l8.4 4.2-8.4 4.2L3.6 7.6z'), p('M4.8 12.4l7.2 3.6 7.2-3.6'), p('M4.8 16.6l7.2 3.6 7.2-3.6'))),
    Palette: svg(h('g', null, p('M12 3.6a8.4 8.4 0 0 0 0 16.8c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.4-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h1.6a4.2 4.2 0 0 0 4.2-4.2c0-3.7-3.7-6.6-8.4-6.6z'), h('circle', { cx: 8.2, cy: 10.4, r: 1.15, fill: 'currentColor', stroke: 'none' }), h('circle', { cx: 12, cy: 7.6, r: 1.15, fill: 'currentColor', stroke: 'none' }), h('circle', { cx: 15.8, cy: 9.8, r: 1.15, fill: 'currentColor', stroke: 'none' }))),
    Refresh: svg(h('g', null, p('M20 12a8 8 0 1 1-2.6-5.9'), p('M20.4 4.2v4.6h-4.6'))),
    Play: svg(p('M8.4 5.6l10 6.4-10 6.4z')),
    Stop: svg(h('rect', { x: 6.6, y: 6.6, width: 10.8, height: 10.8, rx: 1.8 })),
    Alert: svg(h('g', null, p('M12 3.8l9 15.6H3z'), p('M12 9.4v4.6'), h('circle', { cx: 12, cy: 16.6, r: 0.95, fill: 'currentColor', stroke: 'none' }))),
    Info: svg(h('g', null, h('circle', { cx: 12, cy: 12, r: 8.6 }), p('M12 11v5.6'), h('circle', { cx: 12, cy: 8, r: 0.95, fill: 'currentColor', stroke: 'none' }))),
    Search: svg(h('g', null, h('circle', { cx: 10.8, cy: 10.8, r: 6.4 }), p('M15.6 15.6l4.4 4.4'))),
    External: svg(h('g', null, p('M13.6 4.6H19.4V10.4'), p('M19 5L11 13'), p('M18 14.4v4.4a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18.8V8a1.6 1.6 0 0 1 1.6-1.6H10'))),
    Save: svg(h('g', null, p('M5 4.6h11.2L19.4 8v11.4H5z'), p('M8.2 4.8v5h6.6v-5'), p('M8.2 15.6h7.6'))),
    Paste: svg(h('g', null, p('M8.4 5.6H6.2A1.6 1.6 0 0 0 4.6 7.2v12.2H17V7.2a1.6 1.6 0 0 0-1.6-1.6h-2.2'), h('rect', { x: 8.6, y: 3.4, width: 6.8, height: 4, rx: 1.4 }), p('M8 12.8h6'), p('M8 16.2h4'))),
    ZoomIn: svg(h('g', null, h('circle', { cx: 10.8, cy: 10.8, r: 6.4 }), p('M15.6 15.6l4.4 4.4'), p('M8.4 10.8h4.8'), p('M10.8 8.4v4.8'))),
    ZoomOut: svg(h('g', null, h('circle', { cx: 10.8, cy: 10.8, r: 6.4 }), p('M15.6 15.6l4.4 4.4'), p('M8.4 10.8h4.8'))),
    Grid: svg(h('g', null, h('rect', { x: 4, y: 4, width: 7, height: 7, rx: 1.4 }), h('rect', { x: 13, y: 4, width: 7, height: 7, rx: 1.4 }), h('rect', { x: 4, y: 13, width: 7, height: 7, rx: 1.4 }), h('rect', { x: 13, y: 13, width: 7, height: 7, rx: 1.4 }))),
    History: svg(h('g', null, p('M3.8 12a8.2 8.2 0 1 0 2.5-5.9'), p('M3.6 4.4v4.4h4.4'), p('M12 7.8V12l3 1.8'))),
    Matrix: svg(h('g', null, p('M6.4 4.6H4.6v14.8h1.8'), p('M17.6 4.6h1.8v14.8h-1.8'), h('circle', { cx: 9.4, cy: 9.2, r: 0.9, fill: 'currentColor', stroke: 'none' }), h('circle', { cx: 14.6, cy: 9.2, r: 0.9, fill: 'currentColor', stroke: 'none' }), h('circle', { cx: 9.4, cy: 14.8, r: 0.9, fill: 'currentColor', stroke: 'none' }), h('circle', { cx: 14.6, cy: 14.8, r: 0.9, fill: 'currentColor', stroke: 'none' }))),
    Fraction: svg(h('g', null, p('M7 6.6h3'), p('M14 17.4h3'), p('M5.4 12h13.2'))),
    Sqrt: svg(h('g', null, p('M3.6 12.4h2.2l2 6.6 3.4-12.4h5.4'), p('M17.4 6.6H21v11.2h-3.6'))),
    Integrate: svg(h('g', null, p('M14.6 4.8c-1.6 0-2.4 1-2.4 2.6v9.2c0 1.6-.8 2.6-2.4 2.6'), p('M9.6 9.4h4.4'))),
    Star: svg(p('M12 3.8l2.6 5.4 5.8.8-4.2 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.6 10l5.8-.8z')),
    Lock: svg(h('g', null, h('rect', { x: 5, y: 10.4, width: 14, height: 9.6, rx: 2.2 }), p('M8.4 10.2V7.8a3.6 3.6 0 0 1 7.2 0v2.4'))),
    Bolt: svg(p('M13.4 3.4L6 13.2h4.4l-.6 7.4 7.6-9.8h-4.4z')),
  }
})()

/* ------------------------------------------------------------- primitives */
;(function () {
  'use strict'
  const LX = window.__LX
  if (!LX || !LX.React) return
  const React = LX.React
  const h = LX.h
  const { useCallback, useEffect, useRef, useState } = React
  const cx = LX.cx

  /* ------------------------------------------------------------- buttons */

  function Button(props) {
    const variant = props.variant || 'default'
    const size = props.size || 'md'
    const rest = { ...props }
    delete rest.variant
    delete rest.size
    delete rest.icon
    delete rest.children
    delete rest.loading
    delete rest.className
    return h(
      'button',
      {
        type: rest.type || 'button',
        ...rest,
        className: cx('lx-btn', 'lx-btn--' + variant, size === 'sm' ? 'lx-btn--sm' : null, props.className),
        disabled: props.disabled || props.loading,
      },
      props.loading ? h(Spinner, { size: 15, tone: 'inherit' }) : props.icon ? h(props.icon, { size: size === 'sm' ? 15 : 17 }) : null,
      props.children === undefined ? null : h('span', { className: 'lx-btn__label' }, props.children),
    )
  }

  function IconButton(props) {
    const rest = { ...props }
    const Icon = rest.icon
    const size = rest.size || 28
    delete rest.icon
    delete rest.size
    delete rest.className
    return h(
      'button',
      {
        type: 'button',
        ...rest,
        'aria-label': props.label,
        title: props.title || props.label,
        className: cx('lx-iconbtn', props.className),
        style: { width: size, height: size, ...(props.style || {}) },
      },
      Icon ? h(Icon, { size: Math.round(size * 0.6) }) : null,
    )
  }

  /* -------------------------------------------------------------- inputs */

  function Input(props) {
    const rest = { ...props }
    delete rest.invalid
    delete rest.className
    return h('input', { ...rest, className: cx('lx-input', props.invalid && 'lx-input--invalid', props.className) })
  }

  function Textarea(props) {
    const rest = { ...props }
    delete rest.className
    return h('textarea', { ...rest, className: cx('lx-textarea', props.className) })
  }

  function Select(props) {
    const value = props.value === undefined || props.value === null ? '' : props.value
    const rest = { ...props }
    delete rest.options
    delete rest.placeholder
    delete rest.className
    return h(
      'span',
      { className: cx('lx-selectwrap', props.className), style: props.wrapStyle },
      h(
        'select',
        { ...rest, className: 'lx-select', value, onChange: props.onChange },
        props.placeholder === undefined ? null : h('option', { value: '' }, props.placeholder),
        (props.options || []).map(function (option) {
          return h('option', { key: option.value, value: option.value }, LX.pick(option))
        }),
      ),
      h(LX.icons.ChevronDown, {
        size: 13,
        style: { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.6 },
      }),
    )
  }

  function Switch(props) {
    const checked = props.checked === true
    return h(
      'button',
      {
        type: 'button',
        role: 'switch',
        'aria-checked': checked,
        'aria-label': props.label,
        disabled: props.disabled,
        className: cx('lx-switch', checked && 'lx-switch--on'),
        onClick: function () {
          if (!props.disabled) props.onChange(!checked)
        },
      },
      h('span', { className: 'lx-switch__knob' }),
    )
  }

  function Slider(props) {
    return h('input', {
      type: 'range',
      className: 'lx-range',
      min: props.min,
      max: props.max,
      step: props.step,
      value: props.value,
      disabled: props.disabled,
      'aria-label': props.label,
      onChange: function (event) {
        props.onChange(Number(event.target.value))
      },
    })
  }

  function Field(props) {
    const label = LX.pick({ zh: props.zh, en: props.en }, props.label)
    const hint = LX.pick({ zh: props.hintZh, en: props.hintEn }, props.hint)
    return h(
      'div',
      { className: cx('lx-field', props.inline && 'lx-field--inline', props.className) },
      h(
        'div',
        { className: 'lx-field__head' },
        h('div', { className: 'lx-field__label' }, label, props.badge ? h(Badge, { tone: 'neutral' }, props.badge) : null),
        hint ? h('p', { className: 'lx-field__hint' }, hint) : null,
      ),
      h('div', { className: 'lx-field__control' }, props.children),
    )
  }

  /* ------------------------------------------------------------- segments */

  function Segmented(props) {
    const items = props.options || []
    return h(
      'div',
      { className: cx('lx-seg', props.block && 'lx-seg--block', props.className), role: 'tablist', 'aria-label': props.label },
      items.map(function (option) {
        const active = option.value === props.value
        return h(
          'button',
          {
            key: option.value,
            type: 'button',
            role: 'tab',
            'aria-selected': active,
            className: cx('lx-seg__item', active && 'lx-seg__item--on'),
            title: LX.pick(option, option.title),
            onClick: function () {
              if (!active) props.onChange(option.value)
            },
          },
          option.icon ? h(option.icon, { size: 14 }) : null,
          h('span', { className: 'lx-seg__label' }, LX.pick(option)),
        )
      }),
    )
  }

  function Tabs(props) {
    const items = props.items || []
    return h(
      'div',
      { className: cx('lx-tabs', props.className), role: 'tablist', 'aria-label': props.label },
      items.map(function (item) {
        const active = item.value === props.value
        return h(
          'button',
          {
            key: item.value,
            type: 'button',
            role: 'tab',
            'aria-selected': active,
            className: cx('lx-tab', active && 'lx-tab--on'),
            onClick: function () {
              if (!active) props.onChange(item.value)
            },
          },
          item.icon ? h(item.icon, { size: 15 }) : null,
          h('span', null, LX.pick(item)),
          item.badge === undefined ? null : h('span', { className: 'lx-tab__badge' }, item.badge),
        )
      }),
    )
  }

  /* -------------------------------------------------------- status pieces */

  function Badge(props) {
    return h('span', { className: cx('lx-badge', 'lx-badge--' + (props.tone || 'neutral'), props.className) }, props.children)
  }

  function Spinner(props) {
    const size = (props && props.size) || 16
    return h('span', {
      className: cx('lx-spinner', props && props.tone === 'inherit' && 'lx-spinner--inherit', props && props.className),
      style: { width: size, height: size, borderWidth: Math.max(1.5, size / 9) },
      role: 'progressbar',
      'aria-label': (props && props.label) || 'loading',
    })
  }

  function ProgressBar(props) {
    const value = LX.util.clamp(Number(props.value) || 0, 0, 1)
    return h(
      'div',
      { className: 'lx-progress', role: 'progressbar', 'aria-valuenow': Math.round(value * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('span', { className: 'lx-progress__fill', style: { width: (value * 100).toFixed(1) + '%' } }),
    )
  }

  function Empty(props) {
    const Icon = props.icon || LX.icons.Info
    return h(
      'div',
      { className: cx('lx-empty', props.className) },
      h('span', { className: 'lx-empty__icon' }, h(Icon, { size: props.iconSize || 26 })),
      h('p', { className: 'lx-empty__title' }, LX.pick({ zh: props.zh, en: props.en }, props.title)),
      props.hint || props.hintZh || props.hintEn
        ? h('p', { className: 'lx-empty__hint' }, LX.pick({ zh: props.hintZh, en: props.hintEn }, props.hint))
        : null,
      props.actions ? h('div', { className: 'lx-empty__actions' }, props.actions) : null,
    )
  }

  function Card(props) {
    return h('div', { className: cx('lx-card', props.className), onClick: props.onClick }, props.children)
  }

  function Divider(props) {
    return h('div', { className: cx('lx-hr', props && props.className), role: 'separator' })
  }

  function Kbd(props) {
    return h('kbd', { className: 'lx-kbd' }, props.children)
  }

  /* --------------------------------------------------------------- modal */

  function Modal(props) {
    const open = props.open === true
    useEffect(
      function () {
        if (!open) return undefined
        function onKey(event) {
          if (event.key === 'Escape') {
            event.stopPropagation()
            props.onClose()
          }
        }
        document.addEventListener('keydown', onKey, true)
        return function () {
          document.removeEventListener('keydown', onKey, true)
        }
      },
      [open],
    )
    if (!open) return null
    return h(
      'div',
      {
        className: 'lx-modal__backdrop',
        onMouseDown: function (event) {
          if (event.target === event.currentTarget) props.onClose()
        },
      },
      h(
        'div',
        {
          className: 'lx-modal',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': LX.pick({ zh: props.zh, en: props.en }, props.title),
          style: { width: props.width || 520 },
        },
        h(
          'div',
          { className: 'lx-modal__head' },
          h('h2', { className: 'lx-modal__title' }, LX.pick({ zh: props.zh, en: props.en }, props.title)),
          h(IconButton, { icon: LX.icons.Close, label: LX.t('common.close'), onClick: props.onClose, size: 26 }),
        ),
        h('div', { className: 'lx-modal__body lx-scroll' }, props.children),
        props.footer ? h('div', { className: 'lx-modal__foot' }, props.footer) : null,
      ),
    )
  }

  /* ---------------------------------------------------------------- toast */

  function ToastHost() {
    const [items, setItems] = useState([])
    useEffect(function () {
      return LX.onToast(function (entry) {
        setItems(function (current) {
          return current.concat([entry]).slice(-4)
        })
        setTimeout(function () {
          setItems(function (current) {
            return current.filter(function (item) {
              return item.id !== entry.id
            })
          })
        }, 3400)
      })
    }, [])
    if (items.length === 0) return null
    return h(
      'div',
      { className: 'lx-toasts', role: 'status', 'aria-live': 'polite' },
      items.map(function (item) {
        return h(
          'div',
          { key: item.id, className: cx('lx-toast', 'lx-toast--' + item.tone) },
          item.tone === 'error'
            ? h(LX.icons.Alert, { size: 15 })
            : item.tone === 'success'
              ? h(LX.icons.Check, { size: 15 })
              : h(LX.icons.Info, { size: 15 }),
          h('span', null, item.message),
        )
      }),
    )
  }

  /* --------------------------------------------------------------- hooks */

  function useOutsideClick(ref, handler, enabled) {
    const saved = useRef(handler)
    saved.current = handler
    useEffect(
      function () {
        if (enabled === false) return undefined
        function onDown(event) {
          if (ref.current && !ref.current.contains(event.target)) saved.current(event)
        }
        document.addEventListener('mousedown', onDown, true)
        return function () {
          document.removeEventListener('mousedown', onDown, true)
        }
      },
      [enabled],
    )
  }

  function useClipboard() {
    const [state, setState] = useState('idle')
    const copy = useCallback(async function (text, label) {
      const ok = await LX.util.copyText(text)
      setState(ok ? 'done' : 'failed')
      if (ok && label) LX.toast(label, 'success')
      setTimeout(function () {
        setState('idle')
      }, 1600)
      return ok
    }, [])
    return { state, copy }
  }

  LX.ui = {
    Button,
    IconButton,
    Input,
    Textarea,
    Select,
    Switch,
    Slider,
    Field,
    Segmented,
    Tabs,
    Badge,
    Spinner,
    ProgressBar,
    Empty,
    Card,
    Divider,
    Kbd,
    Modal,
    ToastHost,
    useOutsideClick,
    useClipboard,
  }
})()

/* ------------------------------------------------------------ base theme */
;(function () {
  'use strict'
  const LX = window.__LX
  if (!LX || typeof LX.addCss !== 'function') return
  LX.addCss(`
.lx-root{display:flex;flex-direction:column;flex:1 1 0%;height:100%;min-height:0;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased;}
.lx-root *,.lx-root *::before,.lx-root *::after{box-sizing:border-box;}
.lx-root :where(button){font:inherit;color:inherit;}
.lx-scroll{overflow:auto;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent;}
.lx-scroll::-webkit-scrollbar{width:10px;height:10px;}
.lx-scroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:6px;border:2px solid transparent;background-clip:content-box;}
.lx-scroll::-webkit-scrollbar-track{background:transparent;}
.lx-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}

.lx-btn{height:30px;padding:0 12px;box-sizing:border-box;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;transition:background .12s,border-color .12s,opacity .12s,transform .06s;user-select:none;}
.lx-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);}
.lx-btn:active:not(:disabled){transform:translateY(.5px);}
.lx-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.lx-btn:disabled{opacity:.45;cursor:default;}
.lx-btn__label{display:inline-block;}
.lx-btn--primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-bg-base);font-weight:500;}
.lx-btn--primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);border-color:transparent;filter:brightness(1.06);}
.lx-btn--ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary);}
.lx-btn--ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:transparent;}
.lx-btn--danger{color:var(--dsw-alias-state-error-primary);}
.lx-btn--danger:hover:not(:disabled){border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2);}
.lx-btn--sm{height:26px;padding:0 9px;font-size:12px;border-radius:7px;gap:5px;}

.lx-iconbtn{display:inline-grid;place-items:center;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s,color .12s,border-color .12s;flex:none;}
.lx-iconbtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.lx-iconbtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.lx-iconbtn:disabled{opacity:.4;cursor:default;}

.lx-input,.lx-textarea,.lx-select{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:13px;outline:none;transition:border-color .12s,box-shadow .12s;}
.lx-input{height:30px;padding:0 10px;}
.lx-textarea{padding:8px 10px;resize:vertical;line-height:1.55;}
.lx-input::placeholder,.lx-textarea::placeholder{color:var(--dsw-alias-label-secondary);opacity:.8;}
.lx-input:focus,.lx-textarea:focus,.lx-select:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent);}
.lx-input--invalid{border-color:var(--dsw-alias-state-error-primary);}
.lx-selectwrap{position:relative;display:inline-flex;align-items:center;min-width:0;}
.lx-select{height:30px;padding:0 26px 0 10px;appearance:none;-webkit-appearance:none;cursor:pointer;}

.lx-switch{position:relative;width:34px;height:20px;flex:none;padding:0;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;transition:background .16s,border-color .16s;}
.lx-switch__knob{position:absolute;top:1.5px;left:1.5px;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .16s,background .16s;}
.lx-switch--on{background:var(--dsw-alias-brand-primary);border-color:transparent;}
.lx-switch--on .lx-switch__knob{transform:translateX(14px);background:var(--dsw-alias-bg-base);}
.lx-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.lx-switch:disabled{opacity:.45;cursor:default;}

.lx-range{width:100%;height:20px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;background:transparent;}

.lx-field{display:flex;flex-direction:column;gap:7px;}
.lx-field--inline{flex-direction:row;align-items:center;justify-content:space-between;gap:16px;}
.lx-field--inline .lx-field__head{flex:1;min-width:0;}
.lx-field__head{display:flex;flex-direction:column;gap:2px;min-width:0;}
.lx-field__label{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);}
.lx-field__hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);}
.lx-field__control{display:flex;align-items:center;gap:8px;min-width:0;}

.lx-seg{display:inline-flex;padding:2px;gap:2px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);min-width:0;max-width:100%;}
.lx-seg--block{display:flex;width:100%;}
.lx-seg--block .lx-seg__item{flex:1;}
.lx-seg__item{height:26px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:background .12s,color .12s;white-space:nowrap;flex:none;}
.lx-seg__item:hover{color:var(--dsw-alias-label-primary);}
.lx-seg__item--on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.12);}
.lx-seg__item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;}

.lx-tabs{display:flex;align-items:center;gap:2px;flex:none;}
.lx-tab{height:34px;padding:0 12px;flex:none;white-space:nowrap;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:color .12s,border-color .12s;}
.lx-tab:hover{color:var(--dsw-alias-label-primary);}
.lx-tab--on{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:500;}
.lx-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}
.lx-tab__badge{min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;display:inline-grid;place-items:center;}

.lx-badge{display:inline-flex;align-items:center;gap:4px;height:19px;padding:0 7px;border-radius:6px;font-size:11px;font-weight:500;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.lx-badge--brand{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary);}
.lx-badge--success{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent);color:var(--dsw-alias-state-success-primary);}
.lx-badge--warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 18%,transparent);color:var(--dsw-alias-state-warn-primary);}
.lx-badge--error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent);color:var(--dsw-alias-state-error-primary);}

.lx-spinner{display:inline-block;border-radius:50%;border-style:solid;border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,transparent);border-top-color:var(--dsw-alias-brand-primary);animation:lx-spin .7s linear infinite;flex:none;}
.lx-spinner--inherit{border-color:color-mix(in srgb,var(--dsw-alias-bg-base) 35%,transparent);border-top-color:var(--dsw-alias-bg-base);}
@keyframes lx-spin{to{transform:rotate(360deg);}}

.lx-progress{position:relative;height:5px;border-radius:3px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;}
.lx-progress__fill{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary);transition:width .2s;}

.lx-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:44px 20px;text-align:center;color:var(--dsw-alias-label-secondary);}
.lx-empty__icon{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);margin-bottom:4px;}
.lx-empty__title{margin:0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);}
.lx-empty__hint{margin:0;font-size:12.5px;line-height:1.6;max-width:420px;}
.lx-empty__actions{margin-top:8px;display:flex;gap:8px;}

.lx-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;}
.lx-hr{height:1px;background:var(--dsw-alias-border-l1);border:0;margin:0;}
.lx-kbd{display:inline-block;padding:1px 5px;border-radius:5px;border:1px solid var(--dsw-alias-border-l1);border-bottom-width:2px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);}

.lx-modal__backdrop{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:24px;background:rgba(12,14,20,.42);backdrop-filter:blur(2px);animation:lx-fade .12s ease-out;}
.lx-modal{display:flex;flex-direction:column;max-height:min(84vh,760px);max-width:96vw;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));box-shadow:0 24px 64px -18px rgba(0,0,0,.5);overflow:hidden;animation:lx-pop .14s ease-out;}
.lx-modal__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);}
.lx-modal__title{margin:0;font-size:14.5px;font-weight:600;}
.lx-modal__body{padding:16px;overflow:auto;min-height:0;}
.lx-modal__foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}
@keyframes lx-fade{from{opacity:0;}to{opacity:1;}}
@keyframes lx-pop{from{opacity:0;transform:translateY(6px) scale(.99);}to{opacity:1;transform:none;}}

.lx-toasts{position:fixed;right:20px;bottom:20px;z-index:80;display:flex;flex-direction:column;gap:8px;pointer-events:none;}
.lx-toast{display:flex;align-items:center;gap:8px;max-width:380px;padding:9px 13px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font-size:12.5px;box-shadow:0 10px 26px -12px rgba(0,0,0,.4);animation:lx-pop .16s ease-out;}
.lx-toast--error{color:var(--dsw-alias-state-error-primary);}
.lx-toast--success{color:var(--dsw-alias-state-success-primary);}
.lx-toast--warn{color:var(--dsw-alias-state-warn-primary);}
`)
})()

/* ------------------------------------------- recognition settings to the Host */

;(function () {
  'use strict'
  const LX = window.__LX
  if (!LX || !LX.api || !LX.settings) return
  const KEYS = ['backend', 'endpointUrl', 'endpointModel', 'endpointKey', 'prompt']
  let pushed = ''

  function payload() {
    const out = {}
    for (const key of KEYS) out[key] = LX.settings.get(key)
    return out
  }

  const push = LX.util.debounce(function () {
    const body = payload()
    const serialized = JSON.stringify(body)
    if (serialized === pushed) return
    LX.api
      .post('/settings', body, { timeoutMs: 6000 })
      .then(function () {
        pushed = serialized
      })
      .catch(function () {
        /* the Host half may be absent; the panel still works without OCR */
      })
  }, 500)

  LX.settings.subscribe(function () {
    push()
  })
  setTimeout(push, 1200)
})()
