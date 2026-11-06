/**
 * @local/dsh-latex-editor — lib/40-recognition.js
 *
 * Recognition core for the formula workbench. No UI and no user-visible text
 * lives here: this module loads the vendored PDF.js build, renders PDF pages to
 * canvases / data URLs, normalizes uploaded images, and bridges the Host
 * recognition route `POST /plugins/latex-editor/recognize`.
 *
 * Public namespace:
 *   LX.recog = {
 *     loadPdfJs()                                  -> Promise<lib>
 *     openPdf(file)                                -> Promise<{doc,pages,title}>
 *     renderPage(doc, n, {scale=2})                -> Promise<HTMLCanvasElement>
 *     thumbnail(doc, n, maxWidth=140)              -> Promise<string /* data URL *\/>
 *     pageToDataUrl(doc, n, {scale,maxEdge,mime})  -> Promise<{dataUrl,width,height}>
 *     recognizeImage(dataUrl, {hint,backend,signal}) -> Promise<{latex,backend,model,ms}>
 *     downscaleImage(dataUrl, maxEdge=1600)        -> Promise<{dataUrl,width,height}>
 *     health({force}?)                             -> Promise<health payload|null>
 *     invalidateHealth()                           -> void
 *     closePdf(doc)                                -> Promise<void>
 *     sanitizeLatex(text)                          -> string
 *     errorCodes                                   -> string[]
 *   }
 *
 * Errors thrown by recognizeImage carry `.code` from `errorCodes`:
 *   NO_HOST · NO_BACKEND · MODEL_NO_VISION · TIMEOUT · BAD_IMAGE ·
 *   EMPTY_RESULT · HTTP. Cancellation rejects with name='AbortError' and
 *   code='CANCELLED' (internal, never localized as a failure).
 */
;(function () {
  'use strict'

  const LX = window.__LX
  if (!LX || !LX.React || !LX.api || !LX.util || LX.recog) return

  const util = LX.util
  const api = LX.api
  if (typeof api.asset !== 'function' || typeof api.post !== 'function' || typeof api.get !== 'function') return

  const PDFJS_SRC = api.asset('vendor/pdfjs/pdf.min.js')
  const PDFJS_WORKER_SRC = api.asset('vendor/pdfjs/pdf.worker.min.js')

  const RECOGNIZE_PATH = '/recognize'
  const HEALTH_PATH = '/health'
  const RECOGNIZE_TIMEOUT_MS = 120000
  const HEALTH_TIMEOUT_MS = 5000
  const HEALTH_TTL_MS = 30000
  const DEFAULT_MAX_EDGE = 1600
  /* Keep the encoded image comfortably under the Host default maxImageBytes (8 MB). */
  const MAX_ENCODED_BYTES = Math.round(3.6 * 1024 * 1024)

  const ERROR_CODES = Object.freeze([
    'NO_HOST',
    'NO_BACKEND',
    'MODEL_NO_VISION',
    'TIMEOUT',
    'BAD_IMAGE',
    'EMPTY_RESULT',
    'HTTP',
  ])

  /** Server-side codes we also understand, mapped onto the documented set. */
  const CODE_ALIASES = {
    NO_HOST: 'NO_HOST',
    HOST_UNAVAILABLE: 'NO_HOST',
    HOST_NOT_LOADED: 'NO_HOST',
    ROUTE_NOT_FOUND: 'NO_HOST',
    NO_BACKEND: 'NO_BACKEND',
    BACKEND_UNAVAILABLE: 'NO_BACKEND',
    BACKEND_NOT_CONFIGURED: 'NO_BACKEND',
    NO_MODEL: 'NO_BACKEND',
    NO_VISION: 'MODEL_NO_VISION',
    MODEL_NO_VISION: 'MODEL_NO_VISION',
    VISION_UNSUPPORTED: 'MODEL_NO_VISION',
    TIME_OUT: 'TIMEOUT',
    TIMEOUT: 'TIMEOUT',
    TIMED_OUT: 'TIMEOUT',
    INVALID_IMAGE: 'BAD_IMAGE',
    BAD_IMAGE: 'BAD_IMAGE',
    IMAGE_TOO_LARGE: 'BAD_IMAGE',
    EMPTY_RESULT: 'EMPTY_RESULT',
    NO_LATEX: 'EMPTY_RESULT',
    EMPTY: 'EMPTY_RESULT',
    HTTP: 'HTTP',
    INTERNAL: 'HTTP',
    INTERNAL_ERROR: 'HTTP',
  }

  /* ------------------------------------------------------------- errors */

  function makeError(code, message, extra) {
    const error = new Error(message || code || 'recognition failed')
    error.name = 'RecognitionError'
    error.code = code || 'HTTP'
    if (extra) {
      for (const key of Object.keys(extra)) {
        if (extra[key] !== undefined) error[key] = extra[key]
      }
    }
    return error
  }

  function abortError() {
    const error = new Error('recognition cancelled')
    error.name = 'AbortError'
    error.code = 'CANCELLED'
    return error
  }

  function isAbort(error) {
    return Boolean(error && (error.name === 'AbortError' || error.code === 'CANCELLED'))
  }

  /* ------------------------------------------------------ result cleanup */

  /**
   * Normalize a backend answer: strip a wrapping ```latex fence and paired
   * display delimiters (`$$…$$`, `\[…\]`, `\(…\)`, `$…$`) without touching any
   * legitimate math inside the formula.
   */
  function sanitizeLatex(input) {
    let text = String(input === undefined || input === null ? '' : input)
      .replace(/\r\n?/g, '\n')
      .trim()
    if (!text) return ''

    function stripFence(value) {
      let next = value
      const open = /^```[ \t]*([A-Za-z]*)[ \t]*\n?/.exec(next)
      if (open && (!open[1] || /^(latex|tex|math|katex)$/i.test(open[1]))) {
        next = next.slice(open[0].length)
        next = next.replace(/\n?```[ \t]*$/, '')
      }
      return next.trim()
    }

    text = stripFence(text)

    const paired = [
      /^\$\$([\s\S]*)\$\$$/,
      /^\\\[([\s\S]*)\\\]$/,
      /^\\\(([\s\S]*)\\\)$/,
    ]
    for (const pattern of paired) {
      const match = pattern.exec(text)
      if (match) {
        text = String(match[1] || '').trim()
        break
      }
    }
    /* A single `$` pair is only unwrapped when it is unambiguous. */
    if (/^\$[^$]*\$$/.test(text) && (text.match(/\$/g) || []).length === 2) {
      text = text.slice(1, -1).trim()
    }
    /* A fence may have wrapped the delimiters (```latex\n$$\n…\n$$\n```). */
    text = stripFence(text)
    return text.trim()
  }

  function buildResult(payload, requestedBackend) {
    const latex = sanitizeLatex(payload && payload.latex)
    if (!latex) throw makeError('EMPTY_RESULT', 'the backend returned no usable LaTeX')
    const ms = Number(payload.ms)
    return {
      latex: latex,
      backend:
        typeof payload.backend === 'string' && payload.backend
          ? payload.backend
          : requestedBackend || 'auto',
      model: typeof payload.model === 'string' ? payload.model : '',
      ms: Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0,
    }
  }

  /* --------------------------------------------------- failure classifier */

  function classifyFailure(error) {
    const payload = error && error.payload && typeof error.payload === 'object' ? error.payload : null
    const status = error && typeof error.status === 'number' ? error.status : 0
    const message = String(
      (payload && (payload.error || payload.message)) || (error && error.message) || '',
    ).trim()
    const rawCode = payload && typeof payload.code === 'string' ? payload.code.toUpperCase() : ''
    if (rawCode && CODE_ALIASES[rawCode]) {
      /* The Host maps an aborted/timed-out request to a generic HTTP code. */
      if (CODE_ALIASES[rawCode] === 'HTTP' && /abort|timed?\s*out|timeout|etimedout/i.test(message)) {
        return makeError('TIMEOUT', message, { status: status || undefined, serverCode: rawCode })
      }
      return makeError(CODE_ALIASES[rawCode], message, { status: status || undefined, serverCode: rawCode })
    }
    if (status >= 200 && status < 300) {
      return makeError('EMPTY_RESULT', message || 'the recognition route returned no LaTeX')
    }
    if (status === 404) return makeError('NO_HOST', message || 'recognition route not found', { status })
    if (status === 503) return makeError('NO_BACKEND', message, { status })
    if (status === 504) return makeError('TIMEOUT', message, { status })
    if (status === 413) return makeError('BAD_IMAGE', message, { status })

    if (/timed?\s*out|timeout|etimedout|econnreset|socket hang up/i.test(message)) {
      return makeError('TIMEOUT', message, { status: status || undefined })
    }
    if (/no\s+(usable\s+|available\s+)?backend|backend\s+(is\s+)?(not\s+(available|configured)|unavailable)|not\s+configured|没有可用|未配置|无可用/i.test(message)) {
      return makeError('NO_BACKEND', message, { status: status || undefined })
    }
    if (/vision|image\s+input|multimodal|多模态|不支持图片|does\s+not\s+support\s+images?/i.test(message)) {
      return makeError('MODEL_NO_VISION', message, { status: status || undefined })
    }
    if (/failed to fetch|network\s*error|load failed|fetch failed|connection\s+(refused|reset)|econnrefused|enotfound/i.test(message)) {
      return makeError('NO_HOST', message, { status: status || undefined })
    }
    if (!status) return makeError('NO_HOST', message || 'could not reach the Host recognition route')
    if (/image|decode|invalid|corrupt|unsupported|too\s+large|payload|base64/i.test(message)) {
      return makeError('BAD_IMAGE', message, { status })
    }
    return makeError('HTTP', message || 'HTTP ' + status, { status })
  }

  /* ------------------------------------------------------------ aborting */

  function raceWithAbort(promise, signal) {
    if (!signal) return promise
    if (signal.aborted) return Promise.reject(abortError())
    return new Promise(function (resolve, reject) {
      let settled = false
      function onAbort() {
        if (settled) return
        settled = true
        try {
          signal.removeEventListener('abort', onAbort)
        } catch (error) {
          /* ignore */
        }
        reject(abortError())
      }
      try {
        signal.addEventListener('abort', onAbort)
      } catch (error) {
        /* signal misbehaving: fall through without abort support */
        return promise.then(resolve, reject)
      }
      promise.then(
        function (value) {
          if (settled) return
          settled = true
          try {
            signal.removeEventListener('abort', onAbort)
          } catch (error) {
            /* ignore */
          }
          resolve(value)
        },
        function (error) {
          if (settled) return
          settled = true
          try {
            signal.removeEventListener('abort', onAbort)
          } catch (error2) {
            /* ignore */
          }
          reject(error)
        },
      )
    })
  }

  /* ------------------------------------------------------ image helpers */

  function loadImageElement(dataUrl) {
    return new Promise(function (resolve, reject) {
      const image = new Image()
      image.onload = function () {
        resolve(image)
      }
      image.onerror = function () {
        reject(makeError('BAD_IMAGE', 'the image could not be decoded'))
      }
      try {
        image.decoding = 'async'
        image.src = dataUrl
      } catch (error) {
        reject(makeError('BAD_IMAGE', (error && error.message) || 'invalid image'))
      }
    })
  }

  function canvasDataUrl(canvas, mime, quality) {
    let url
    try {
      url = typeof quality === 'number' ? canvas.toDataURL(mime, quality) : canvas.toDataURL(mime)
    } catch (error) {
      throw makeError('BAD_IMAGE', (error && error.message) || 'canvas export failed')
    }
    if (!url || url === 'data:,' || url.length < 32) {
      throw makeError('BAD_IMAGE', 'canvas export failed')
    }
    return url
  }

  function releaseCanvas(canvas) {
    if (!canvas) return
    try {
      canvas.width = 0
      canvas.height = 0
    } catch (error) {
      /* ignore */
    }
  }

  function createCanvas(width, height) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    return canvas
  }

  function fillWhite(context, width, height) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }

  /**
   * Canvas-based normalizer: keeps an upload small enough for the route while
   * retaining glyph edges. Returns the image actually sent for recognition.
   * `width`/`height` are the normalized pixel dimensions; `sourceWidth` /
   * `sourceHeight` keep the original ones for display.
   */
  async function downscaleImage(dataUrl, maxEdge) {
    const source = String(dataUrl || '')
    if (!/^data:image\//i.test(source)) throw makeError('BAD_IMAGE', 'not an image data URL')
    const limit = Math.max(320, Number(maxEdge) || DEFAULT_MAX_EDGE)
    const image = await loadImageElement(source)
    const sourceWidth = image.naturalWidth || image.width || 0
    const sourceHeight = image.naturalHeight || image.height || 0
    if (!sourceWidth || !sourceHeight) throw makeError('BAD_IMAGE', 'empty image')
    const ratio = Math.min(1, limit / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * ratio))
    const height = Math.max(1, Math.round(sourceHeight * ratio))
    const canvas = createCanvas(width, height)
    try {
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw makeError('BAD_IMAGE', 'canvas 2d context unavailable')
      fillWhite(context, canvas.width, canvas.height)
      context.imageSmoothingEnabled = true
      if ('imageSmoothingQuality' in context) context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const preferPng = /^data:image\/(png|gif|webp)/i.test(source)
      let output = canvasDataUrl(canvas, preferPng ? 'image/png' : 'image/jpeg', preferPng ? undefined : 0.92)
      if (util.dataUrlBytes(output) > MAX_ENCODED_BYTES) {
        output = canvasDataUrl(canvas, 'image/jpeg', 0.9)
      }
      return {
        dataUrl: output,
        width: width,
        height: height,
        sourceWidth: sourceWidth,
        sourceHeight: sourceHeight,
        scaled: ratio < 0.999,
      }
    } finally {
      releaseCanvas(canvas)
    }
  }

  /* ------------------------------------------------------------- PDF.js */

  let pdfjsLoading = null

  function loadPdfJs() {
    if (window.pdfjsLib) {
      applyWorkerSrc(window.pdfjsLib)
      return Promise.resolve(window.pdfjsLib)
    }
    if (!pdfjsLoading) {
      pdfjsLoading = util
        .loadScript(PDFJS_SRC, function () {
          return Boolean(window.pdfjsLib)
        })
        .then(function () {
          if (!window.pdfjsLib) throw makeError('PDF_ENGINE', 'PDF.js did not initialize')
          applyWorkerSrc(window.pdfjsLib)
          return window.pdfjsLib
        })
        .catch(function (error) {
          pdfjsLoading = null
          throw error && error.code ? error : makeError('PDF_ENGINE', (error && error.message) || 'could not load PDF.js')
        })
    }
    return pdfjsLoading
  }

  function applyWorkerSrc(lib) {
    if (!lib) return
    if (!lib.GlobalWorkerOptions) lib.GlobalWorkerOptions = {}
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC
  }

  async function openPdf(file) {
    if (!file || typeof file.arrayBuffer !== 'function') throw makeError('PDF_OPEN', 'no file supplied')
    let pdfjs
    try {
      pdfjs = await loadPdfJs()
    } catch (error) {
      throw error && error.code ? error : makeError('PDF_ENGINE', (error && error.message) || 'could not load PDF.js')
    }
    let bytes
    try {
      bytes = new Uint8Array(await file.arrayBuffer())
    } catch (error) {
      throw makeError('PDF_OPEN', (error && error.message) || 'could not read the PDF')
    }
    let task
    try {
      task = pdfjs.getDocument({ data: bytes, disableAutoFetch: true })
    } catch (error) {
      throw makeError('PDF_OPEN', (error && error.message) || 'invalid PDF')
    }
    let doc
    try {
      doc = await task.promise
    } catch (error) {
      if (error && error.name === 'PasswordException') {
        throw makeError('PDF_PASSWORD', (error && error.message) || 'password protected PDF')
      }
      throw makeError('PDF_OPEN', (error && error.message) || 'invalid PDF')
    }
    let title = ''
    try {
      const metadata = await doc.getMetadata()
      const info = metadata && metadata.info
      if (info && typeof info.Title === 'string') title = info.Title
    } catch (error) {
      title = ''
    }
    title = String(title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
    return { doc: doc, pages: doc.numPages, title: title }
  }

  function pageNumber(doc, n) {
    const value = Math.floor(Number(n))
    if (!doc || typeof doc.getPage !== 'function') throw makeError('PDF_OPEN', 'no PDF document')
    if (!Number.isFinite(value) || value < 1 || value > doc.numPages) {
      throw makeError('PDF_OPEN', 'page ' + n + ' is out of range')
    }
    return value
  }

  async function renderPage(doc, n, options) {
    const opts = options || {}
    const scale = Math.max(0.1, Number(opts.scale) || 2)
    const number = pageNumber(doc, n)
    const page = await doc.getPage(number)
    try {
      const viewport = page.getViewport({ scale: scale })
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
      const canvas = createCanvas(viewport.width * dpr, viewport.height * dpr)
      canvas.style.width = Math.ceil(viewport.width) + 'px'
      canvas.style.height = Math.ceil(viewport.height) + 'px'
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw makeError('PDF_OPEN', 'canvas 2d context unavailable')
      fillWhite(context, canvas.width, canvas.height)
      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
      const task = page.render({
        canvasContext: context,
        viewport: viewport,
        transform: transform,
        intent: 'display',
      })
      await task.promise
      return canvas
    } finally {
      try {
        page.cleanup()
      } catch (error) {
        /* ignore */
      }
    }
  }

  async function thumbnail(doc, n, maxWidth) {
    const target = Math.max(40, Number(maxWidth) || 140)
    const number = pageNumber(doc, n)
    const page = await doc.getPage(number)
    let canvas = null
    try {
      const base = page.getViewport({ scale: 1 })
      const dpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1))
      const viewport = page.getViewport({ scale: (target / base.width) * dpr })
      canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw makeError('PDF_OPEN', 'canvas 2d context unavailable')
      fillWhite(context, canvas.width, canvas.height)
      const task = page.render({ canvasContext: context, viewport: viewport, intent: 'display' })
      await task.promise
      return canvasDataUrl(canvas, 'image/jpeg', 0.72)
    } finally {
      releaseCanvas(canvas)
      try {
        page.cleanup()
      } catch (error) {
        /* ignore */
      }
    }
  }

  /**
   * Render one page for recognition and produce a bounded data URL. The page is
   * rasterized at `scale` (respecting device pixel ratio up to 2) and then, when
   * needed, reduced to `maxEdge` on its longest side. PNG keeps thin math
   * strokes crisp; an oversized PNG is re-encoded as JPEG before it leaves.
   */
  async function pageToDataUrl(doc, n, options) {
    const opts = options || {}
    const scale = Math.max(0.5, Number(opts.scale) || 2)
    const maxEdge = Math.max(240, Number(opts.maxEdge) || 1700)
    const mime = opts.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    const canvas = await renderPage(doc, n, { scale: scale })
    let scaled = null
    try {
      const ratio = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height))
      let output = canvas
      if (ratio < 0.999) {
        scaled = createCanvas(canvas.width * ratio, canvas.height * ratio)
        const context = scaled.getContext('2d', { alpha: false })
        if (!context) throw makeError('BAD_IMAGE', 'canvas 2d context unavailable')
        fillWhite(context, scaled.width, scaled.height)
        context.imageSmoothingEnabled = true
        if ('imageSmoothingQuality' in context) context.imageSmoothingQuality = 'high'
        context.drawImage(canvas, 0, 0, scaled.width, scaled.height)
        output = scaled
      }
      let dataUrl = canvasDataUrl(output, mime, mime === 'image/jpeg' ? 0.92 : undefined)
      if (util.dataUrlBytes(dataUrl) > MAX_ENCODED_BYTES) {
        dataUrl = canvasDataUrl(output, 'image/jpeg', 0.9)
      }
      return { dataUrl: dataUrl, width: output.width, height: output.height }
    } finally {
      releaseCanvas(canvas)
      releaseCanvas(scaled)
    }
  }

  function closePdf(doc) {
    if (!doc || typeof doc.destroy !== 'function') return Promise.resolve()
    try {
      return Promise.resolve(doc.destroy()).catch(function () {})
    } catch (error) {
      return Promise.resolve()
    }
  }

  /* ------------------------------------------------------------ recognize */

  async function recognizeImage(dataUrl, options) {
    const opts = options || {}
    const image = String(dataUrl || '')
    if (!/^data:image\//i.test(image)) throw makeError('BAD_IMAGE', 'not an image data URL')
    const requestedBackend =
      typeof opts.backend === 'string' && opts.backend
        ? opts.backend
        : (LX.settings && LX.settings.values && LX.settings.values.backend) || 'auto'
    const body = { image: image, backend: requestedBackend }
    const hint = typeof opts.hint === 'string' ? opts.hint.trim() : ''
    if (hint) body.hint = hint.slice(0, 500)

    let payload
    try {
      const request = api.post(RECOGNIZE_PATH, body, { timeoutMs: RECOGNIZE_TIMEOUT_MS })
      payload = await raceWithAbort(request, opts.signal)
    } catch (error) {
      if ((opts.signal && opts.signal.aborted) || isAbort(error)) throw abortError()
      if (error && error.code && ERROR_CODES.indexOf(error.code) >= 0) throw error
      throw classifyFailure(error)
    }
    if (opts.signal && opts.signal.aborted) throw abortError()
    if (!payload || typeof payload !== 'object') {
      throw makeError('HTTP', 'the recognition route returned an empty response')
    }
    if (typeof payload.latex !== 'string') {
      const fallbackMessage = String(payload.error || payload.message || '')
      if (/^\s*</.test(fallbackMessage)) {
        /* A same-origin HTML page instead of the JSON route: the Host half is absent. */
        throw makeError('NO_HOST', 'the recognition route is not served by this Host')
      }
      throw makeError('HTTP', fallbackMessage || 'malformed recognition response')
    }
    return buildResult(payload, requestedBackend)
  }

  /* --------------------------------------------------------------- health */

  let healthCache = null
  let healthCachedAt = 0

  function health(options) {
    const force = Boolean(options && options.force)
    const now = Date.now()
    if (!force && healthCache && healthCachedAt && now - healthCachedAt < HEALTH_TTL_MS) {
      return healthCache
    }
    healthCachedAt = now
    healthCache = Promise.resolve()
      .then(function () {
        return api.get(HEALTH_PATH, { timeoutMs: HEALTH_TIMEOUT_MS })
      })
      .then(function (payload) {
        return payload && typeof payload === 'object' ? payload : null
      })
      .catch(function () {
        return null
      })
    return healthCache
  }

  function invalidateHealth() {
    healthCache = null
    healthCachedAt = 0
  }

  LX.recog = {
    loadPdfJs: loadPdfJs,
    openPdf: openPdf,
    renderPage: renderPage,
    thumbnail: thumbnail,
    pageToDataUrl: pageToDataUrl,
    recognizeImage: recognizeImage,
    downscaleImage: downscaleImage,
    health: health,
    invalidateHealth: invalidateHealth,
    closePdf: closePdf,
    sanitizeLatex: sanitizeLatex,
    errorCodes: ERROR_CODES,
  }
})()
