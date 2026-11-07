/**
 * @local/dsh-latex-editor — Host half.
 *
 * Owns three things:
 *  1. Static delivery of the browser modules and the vendored MathJax/PDF.js builds
 *     (`/plugins/latex-editor/lib/*`, `/plugins/latex-editor/vendor/*`).
 *  2. A recognition endpoint used by the 图片识别 / 文档识别 tabs. It prefers the
 *     harness' own model (through `ctx.llm`) and falls back to a user-configured
 *     OpenAI-compatible vision endpoint, so the plugin needs no bundled OCR model.
 *  3. A `latex_formula` agent tool that exposes the same two operations (recognize a
 *     local image, save a formula file) to the model.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PREFIX = '/plugins/latex-editor'
// The web shell addresses a client bundle as /plugins/<package-name>/client.js,
// while the panel's own assets use the short prefix above; serve both.
const PREFIX_ALIASES = ['/plugins/dsh-latex-formula-editor']
const ALL_PREFIXES = [PREFIX].concat(PREFIX_ALIASES)
const MAX_JSON_BYTES = 24 * 1024 * 1024
const MAX_LATEX_CHARS = 64 * 1024

const STATIC_ROOTS = {
  lib: path.join(HERE, 'lib'),
  vendor: path.join(HERE, 'vendor'),
}

/** Root-level files the client loader may request (single path segment). */
const ROOT_FILES = {
  'client.js': path.join(HERE, 'client.js'),
}

const CONTENT_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

const IMAGE_MEDIA_TYPES = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
}

/* --------------------------------------------------------------- utilities */

function homeDirectory() {
  const configured = process.env.DSH_HOME && process.env.DSH_HOME.trim()
  return configured || path.join(os.homedir(), '.dsh')
}

/** Recognition settings the panel writes through `POST /plugins/latex-editor/settings`. */
function settingsFile() {
  return path.join(homeDirectory(), 'latex-editor', 'settings.json')
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: message, code })
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('request body too large'), { code: 'BAD_IMAGE' }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Split a `data:` URL into decoded bytes plus its declared media type. */
function decodeDataUrl(value) {
  if (typeof value !== 'string') return null
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(value)
  if (!match) return null
  const declared = (match[1] || '').toLowerCase()
  const mediaType = IMAGE_MEDIA_TYPES[declared]
  if (!mediaType) return null
  if (match[2]) {
    const base64 = match[3].replace(/\s/g, '')
    const bytes = Buffer.from(base64, 'base64')
    return { bytes, mediaType }
  }
  return { bytes: Buffer.from(decodeURIComponent(match[3]), 'utf8'), mediaType }
}

function mediaTypeFromName(name) {
  const ext = path.extname(String(name || '')).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return null
}

/** Sniff common raster magic bytes so a renamed file still works. */
function sniffMediaType(bytes) {
  if (!bytes || bytes.length < 12) return null
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (bytes.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  return null
}

/**
 * Pull LaTeX out of whatever the model answered: fenced blocks, `$$…$$`, `\[…\]`,
 * or plain text. Also drops prose the model adds around the formula.
 */
function extractLatex(raw) {
  let text = String(raw === null || raw === undefined ? '' : raw).trim()
  if (text.length === 0) return ''
  const fence = /```(?:latex|tex|math)?\s*([\s\S]*?)```/i.exec(text)
  if (fence && fence[1] && fence[1].trim()) text = fence[1].trim()
  const display = /\$\$([\s\S]*?)\$\$/.exec(text)
  if (display && display[1] && display[1].trim()) text = display[1].trim()
  const bracket = /\\\[([\s\S]*?)\\\]/.exec(text)
  if (bracket && bracket[1] && bracket[1].trim()) text = bracket[1].trim()
  text = text.replace(/^\s*(?:latex|tex)\s*[:：]\s*/i, '')
  text = text.replace(/^\${1,2}/, '').replace(/\${1,2}$/, '')
  text = text.replace(/\\\[|\\\]/g, '')
  return text.trim()
}

const PROMPT_BASE = [
  'You transcribe mathematical formulas from images into LaTeX.',
  'Return ONLY the LaTeX source of the formula, with no explanation, no prose, no markdown fence and no surrounding $ or $$.',
  'Use standard LaTeX math commands (amsmath is available).',
  'Preserve multi-line structures with the matching environment (align, cases, matrix, array).',
  'If the image contains no formula, return an empty string.',
].join(' ')

function buildPrompt(hint, instruction) {
  const parts = [PROMPT_BASE]
  const global = typeof instruction === 'string' && instruction.trim() ? instruction.trim() : ''
  if (global) parts.push('Additional instruction: ' + global)
  if (typeof hint === 'string' && hint.trim()) parts.push('Extra context from the user: ' + hint.trim())
  return parts.join(' ')
}

/* ------------------------------------------------------------------ plugin */

/** Cordis activates the plugin only once the web server service is available. */
export const inject = ['webServer']

/**
 * Read a service without triggering Cordis' "cannot get property X without
 * inject" guard: ctx.get() is evaluated first, the property access is defensive.
 */
function service(ctx, name) {
  try {
    const viaGet = ctx.get?.(name)
    if (viaGet !== undefined && viaGet !== null) return viaGet
  } catch {
    /* ignore */
  }
  try {
    return ctx[name]
  } catch {
    return undefined
  }
}

export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const webServer = service(ctx, 'webServer')
  const disposers = []

  const OVERRIDABLE = ['backend', 'endpointUrl', 'endpointModel', 'endpointKey', 'prompt']

  /** Merge settings written by the panel into the row configuration. */
  function applyOverrides(value) {
    if (!value || typeof value !== 'object') return
    const patch = {}
    for (const key of OVERRIDABLE) {
      if (value[key] === undefined) continue
      patch[key] = value[key]
    }
    Object.assign(config, normalizeConfig({ ...config, ...patch }))
  }

  async function loadOverrides() {
    try {
      const raw = await readFile(settingsFile(), 'utf8')
      applyOverrides(JSON.parse(raw))
    } catch {
      /* no panel settings saved yet */
    }
  }

  async function saveOverrides(value) {
    const target = settingsFile()
    await mkdir(path.dirname(target), { recursive: true })
    const patch = {}
    for (const key of OVERRIDABLE) patch[key] = config[key]
    await writeFile(target, JSON.stringify(patch, null, 2) + '\n', 'utf8')
    return value
  }

  void loadOverrides()

  /* --------------------------------------------------------------- static */

  const staticCache = new Map()

  async function serveStatic(res, requestPath) {
    const segments = requestPath.split('/').filter(Boolean)
    // The browser half is imported by DSH from /plugins/<id>/client.js, so the
    // root entry has to be served too (it lives next to index.js, not in lib/).
    let resolved
    if (segments.length === 1) {
      const rootFile = ROOT_FILES[segments[0]]
      if (!rootFile) return sendError(res, 404, 'NOT_FOUND', 'not found')
      resolved = rootFile
    } else {
      const rootName = segments[0]
      const rootDir = STATIC_ROOTS[rootName]
      if (!rootDir) return sendError(res, 404, 'NOT_FOUND', 'not found')
      const relative = segments.slice(1).join('/')
      resolved = path.resolve(rootDir, relative)
      if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
        return sendError(res, 403, 'FORBIDDEN', 'path escapes the plugin directory')
      }
    }
    const ext = path.extname(resolved).toLowerCase()
    const type = CONTENT_TYPES[ext]
    if (!type) return sendError(res, 404, 'NOT_FOUND', 'unsupported asset type')
    try {
      const info = await stat(resolved)
      if (!info.isFile()) return sendError(res, 404, 'NOT_FOUND', 'not a file')
      const cached = staticCache.get(resolved)
      let body
      if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
        body = cached.body
      } else {
        body = await readFile(resolved)
        staticCache.set(resolved, { body, mtimeMs: info.mtimeMs, size: info.size })
      }
      res.writeHead(200, {
        'content-type': type,
        'content-length': body.length,
        'cache-control': 'no-cache',
        etag: '"' + info.mtimeMs.toString(36) + '-' + body.length.toString(36) + '"',
      })
      res.end(body)
      return undefined
    } catch (error) {
      if (error && error.code === 'ENOENT') return sendError(res, 404, 'NOT_FOUND', 'not found')
      return sendError(res, 500, 'STATIC_FAILED', String(error?.message ?? error))
    }
  }

  /* ----------------------------------------------------------- recognition */

  /** The provider/model pair a recognition call should use, or a reason it cannot. */
  async function resolveVisionRoute() {
    const llm = service(ctx, 'llm')
    if (!llm) return { error: { code: 'NO_BACKEND', message: 'the llm service is unavailable' } }
    const candidates = []
    if (config.provider && config.model) candidates.push({ provider: config.provider, model: config.model })
    try {
      const selection = ctx.get?.('agentDefaultModel')?.currentSelection?.()
      if (selection && selection.provider && selection.model) candidates.push({ provider: selection.provider, model: selection.model })
    } catch {
      /* selection is advisory */
    }
    const seen = new Set()
    let lastReason = 'no model is configured'
    for (const candidate of candidates) {
      const key = candidate.provider + '/' + candidate.model
      if (seen.has(key)) continue
      seen.add(key)
      try {
        const info = await llm.resolveModelInfo(candidate.provider, candidate.model)
        const modalities = info?.inputModalities || []
        if (modalities.includes('image')) return { provider: candidate.provider, model: candidate.model }
        lastReason = candidate.provider + '/' + candidate.model + ' cannot read images'
      } catch (error) {
        lastReason = String(error?.message ?? error)
      }
    }
    return { error: { code: 'MODEL_NO_VISION', message: lastReason } }
  }

  async function recognizeWithModel(image, hint, signal) {
    const llm = service(ctx, 'llm')
    const attachments = service(ctx, 'attachments')
    if (!llm) throw Object.assign(new Error('the llm service is unavailable'), { code: 'NO_BACKEND' })
    if (!attachments) throw Object.assign(new Error('the attachment service is unavailable'), { code: 'NO_BACKEND' })
    const route = await resolveVisionRoute()
    if (route.error) throw Object.assign(new Error(route.error.message), { code: route.error.code })
    const reference = await attachments.saveImage({ data: image.bytes, mediaType: image.mediaType, name: 'formula.png' })
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt(hint, config.prompt) },
          { type: 'image', attachment: reference },
        ],
      },
    ]
    // The one-shot prepared call pins the adapter registration; the controls handed
    // to `stream` must be exactly the resolved config it prepared (otherwise the
    // adapter rejects the dispatch as a changed call).
    const requested = { provider: route.provider, model: route.model, maxTokens: config.maxOutputTokens, temperature: 0 }
    let stream
    try {
      const prepared = await llm.prepareCall(requested, signal)
      stream = prepared.stream({ ...prepared.config, messages, signal })
    } catch (error) {
      if (error && error.code === 'INVALID_PREPARED_CALL') {
        stream = llm.stream({ ...requested, messages, signal })
      } else {
        throw error
      }
    }
    let text = ''
    let failure = null
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') failure = chunk.reason.failure
      else if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'aborted') failure = chunk.reason.failure
    }
    if (failure) throw Object.assign(new Error(failure.message || 'the model call failed'), { code: 'HTTP' })
    return { latex: extractLatex(text), backend: 'llm', model: route.provider + '/' + route.model }
  }

  async function recognizeWithEndpoint(image, hint, signal) {
    if (!config.endpointUrl) throw Object.assign(new Error('no vision endpoint is configured'), { code: 'NO_BACKEND' })
    const dataUrl = 'data:' + image.mediaType + ';base64,' + image.bytes.toString('base64')
    const headers = { 'content-type': 'application/json' }
    if (config.endpointKey) headers.authorization = 'Bearer ' + config.endpointKey
    const response = await fetch(config.endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.endpointModel || 'default',
        temperature: 0,
        max_tokens: config.maxOutputTokens,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildPrompt(hint, config.prompt) },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw Object.assign(new Error('endpoint returned HTTP ' + response.status + ': ' + text.slice(0, 300)), { code: 'HTTP' })
    }
    let payload = null
    try {
      payload = JSON.parse(text)
    } catch {
      throw Object.assign(new Error('endpoint returned a non-JSON body'), { code: 'HTTP' })
    }
    const content = payload?.choices?.[0]?.message?.content
    const raw = Array.isArray(content)
      ? content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('')
      : typeof content === 'string'
        ? content
        : ''
    return { latex: extractLatex(raw), backend: 'endpoint', model: payload?.model || config.endpointModel || 'endpoint' }
  }

  async function recognize(request, signal) {
    const backend = request.backend === 'llm' || request.backend === 'endpoint' ? request.backend : config.backend
    const decoded = decodeDataUrl(request.image)
    if (!decoded || decoded.bytes.length === 0) {
      throw Object.assign(new Error('the image payload is empty or not a supported raster'), { code: 'BAD_IMAGE' })
    }
    if (decoded.bytes.length > config.maxImageBytes) {
      throw Object.assign(new Error('the image is larger than ' + Math.round(config.maxImageBytes / 1048576) + ' MB'), {
        code: 'BAD_IMAGE',
      })
    }
    const image = { bytes: decoded.bytes, mediaType: decoded.mediaType }
    const started = Date.now()
    const attempts = []
    if (backend === 'llm') attempts.push(recognizeWithModel)
    else if (backend === 'endpoint') attempts.push(recognizeWithEndpoint)
    else {
      attempts.push(recognizeWithModel, recognizeWithEndpoint)
    }
    const failures = []
    for (const attempt of attempts) {
      try {
        const result = await attempt(image, request.hint, signal)
        if (!result.latex) {
          failures.push({ code: 'EMPTY_RESULT', message: 'the model returned no formula' })
          if (backend !== 'auto') break
          continue
        }
        return { ...result, ms: Date.now() - started }
      } catch (error) {
        const code = error?.code || 'HTTP'
        failures.push({ code, message: String(error?.message ?? error) })
        if (backend !== 'auto') break
      }
    }
    const primary = failures.find((item) => item.code !== 'EMPTY_RESULT') || failures[0] || { code: 'NO_BACKEND', message: 'no backend available' }
    const error = new Error(primary.message)
    error.code = primary.code
    error.failures = failures
    throw error
  }

  /* ----------------------------------------------------------------- routes */

  async function handleHealth(res) {
    const llm = service(ctx, 'llm')
    let llmState = { available: Boolean(llm), provider: null, model: null, vision: false, reason: null }
    if (llm) {
      const route = await resolveVisionRoute()
      if (route.provider) {
        llmState = { available: true, provider: route.provider, model: route.model, vision: true, reason: null }
      } else {
        llmState.reason = route.error ? route.error.message : 'no vision model'
      }
    }
    sendJson(res, 200, {
      ok: true,
      version: '1.0.0',
      backend: config.backend,
      llm: llmState,
      endpoint: { configured: Boolean(config.endpointUrl), model: config.endpointModel || null },
    })
  }

  async function handleRecognize(req, res) {
    let body
    try {
      const raw = await readBody(req, MAX_JSON_BYTES)
      body = JSON.parse(raw || '{}')
    } catch (error) {
      sendError(res, 400, error?.code || 'BAD_IMAGE', String(error?.message ?? error))
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    const onClose = () => controller.abort()
    req.on('close', onClose)
    try {
      const result = await recognize(body, controller.signal)
      sendJson(res, 200, result)
    } catch (error) {
      const code = error?.code || 'HTTP'
      const status = code === 'BAD_IMAGE' ? 400 : code === 'NO_BACKEND' || code === 'MODEL_NO_VISION' ? 503 : code === 'EMPTY_RESULT' ? 422 : 502
      sendJson(res, status, { error: String(error?.message ?? error), code, failures: error?.failures || undefined })
    } finally {
      clearTimeout(timer)
      req.off('close', onClose)
    }
  }

  async function handleSave(req, res) {
    let body
    try {
      body = JSON.parse((await readBody(req, MAX_JSON_BYTES)) || '{}')
    } catch (error) {
      sendError(res, 400, 'BAD_REQUEST', String(error?.message ?? error))
      return
    }
    const content = typeof body.content === 'string' ? body.content.slice(0, MAX_LATEX_CHARS) : ''
    if (!content) {
      sendError(res, 400, 'BAD_REQUEST', 'content is required')
      return
    }
    const name = sanitizeFilename(body.filename || 'formula.tex')
    const directory = path.join(homeDirectory(), 'latex-editor', 'exports')
    try {
      await mkdir(directory, { recursive: true })
      const target = path.join(directory, name)
      await writeFile(target, content, 'utf8')
      sendJson(res, 200, { path: target })
    } catch (error) {
      sendError(res, 500, 'SAVE_FAILED', String(error?.message ?? error))
    }
  }

  async function handleSettingsGet(res) {
    sendJson(res, 200, {
      backend: config.backend,
      endpointUrl: config.endpointUrl,
      endpointModel: config.endpointModel,
      endpointConfigured: Boolean(config.endpointUrl),
      keyConfigured: Boolean(config.endpointKey),
      prompt: config.prompt,
    })
  }

  async function handleSettingsPut(req, res) {
    let body
    try {
      body = JSON.parse((await readBody(req, 256 * 1024)) || '{}')
    } catch (error) {
      sendError(res, 400, 'BAD_REQUEST', String(error?.message ?? error))
      return
    }
    try {
      applyOverrides(body)
      await saveOverrides(body)
      sendJson(res, 200, {
        ok: true,
        backend: config.backend,
        endpointConfigured: Boolean(config.endpointUrl),
        keyConfigured: Boolean(config.endpointKey),
      })
    } catch (error) {
      sendError(res, 500, 'SETTINGS_FAILED', String(error?.message ?? error))
    }
  }

  function sanitizeFilename(value) {
    const base = path.basename(String(value || 'formula.tex')).replace(/[^\w.\-]+/g, '-')
    return base.slice(0, 96) || 'formula.tex'
  }

  if (webServer && typeof webServer.register === 'function') {
    const handler = async (req, res) => {
      const method = (req.method || 'GET').toUpperCase()
      let pathname = PREFIX
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        pathname = decodeURIComponent(url.pathname)
      } catch {
        sendError(res, 400, 'BAD_REQUEST', 'malformed request url')
        return
      }
      if (!pathname.startsWith(PREFIX)) {
        sendError(res, 404, 'NOT_FOUND', 'not found')
        return
      }
      const matched = ALL_PREFIXES.filter(function (prefix) {
        return pathname === prefix || pathname.indexOf(prefix + '/') === 0
      })[0]
      if (!matched) {
        sendError(res, 404, 'NOT_FOUND', 'not found')
        return
      }
      const sub = pathname.slice(matched.length) || '/'
      try {
        if (sub === '/health' && (method === 'GET' || method === 'HEAD')) return await handleHealth(res)
        if (sub === '/recognize' && method === 'POST') return await handleRecognize(req, res)
        if (sub === '/save' && method === 'POST') return await handleSave(req, res)
        if (sub === '/settings' && method === 'GET') return await handleSettingsGet(res)
        if (sub === '/settings' && (method === 'PUT' || method === 'POST')) return await handleSettingsPut(req, res)
        if (method === 'GET' || method === 'HEAD') return await serveStatic(res, sub.replace(/^\/+/, ''))
        res.writeHead(405, { allow: 'GET, POST' })
        res.end()
        return undefined
      } catch (error) {
        if (!res.headersSent) sendError(res, 500, 'INTERNAL', String(error?.message ?? error))
        else res.end()
        return undefined
      }
    }
    for (const prefix of ALL_PREFIXES) {
      disposers.push(
        ctx.effect(
          () => webServer.register({ kind: 'prefix', path: prefix, handler }),
          'latex-editor: routes ' + prefix,
        ),
      )
    }
  }

  /* -------------------------------------------------------------- agent tool */

  const tools = service(ctx, 'tools')
  if (tools && typeof tools.register === 'function') {
    const definition = {
      name: 'latex_formula',
      description:
        'LaTeX formula workbench. action="recognize" transcribes a local formula image (png/jpg/webp/gif) into LaTeX using the configured vision model or endpoint; action="save" writes LaTeX/MathML/Markdown text into the session working directory.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', enum: ['recognize', 'save'], description: 'Operation to perform.' },
          image_path: { type: 'string', description: 'Absolute path of the source image; required for action="recognize".' },
          hint: { type: 'string', description: 'Optional context for the transcriber, e.g. the surrounding paragraph.' },
          latex: { type: 'string', description: 'Formula source; required for action="save".' },
          format: { type: 'string', enum: ['tex', 'md', 'mml'], description: 'Output format for action="save" (default tex).' },
          filename: { type: 'string', description: 'Optional output file name for action="save".' },
        },
        required: ['action'],
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render(_args, value) {
          return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
        },
      },
      async execute(args, exec) {
        const request = args && typeof args === 'object' ? args : {}
        if (request.action === 'recognize') {
          const imagePath = typeof request.image_path === 'string' ? request.image_path : ''
          if (!imagePath) throw new Error('image_path is required for action="recognize"')
          const bytes = await readFile(imagePath)
          const mediaType = mediaTypeFromName(imagePath) || sniffMediaType(bytes) || 'image/png'
          const result = await recognize(
            { image: 'data:' + mediaType + ';base64,' + bytes.toString('base64'), hint: request.hint, backend: 'auto' },
            exec?.signal,
          )
          return { latex: result.latex, backend: result.backend, model: result.model, ms: result.ms }
        }
        if (request.action === 'save') {
          const latex = typeof request.latex === 'string' ? request.latex : ''
          if (!latex.trim()) throw new Error('latex is required for action="save"')
          const format = request.format === 'md' || request.format === 'mml' ? request.format : 'tex'
          const name = sanitizeFilename(request.filename || 'formula.' + format)
          let directory = path.join(homeDirectory(), 'latex-editor', 'exports')
          const workingDirectory = ctx.get?.('workingDirectory')
          if (workingDirectory && exec?.agent) {
            try {
              directory = workingDirectory.get?.({ id: exec.agent.id }) || directory
            } catch {
              /* keep the fallback directory */
            }
          }
          await mkdir(directory, { recursive: true })
          const target = path.join(directory, name)
          const body = format === 'md' ? '$$\n' + latex.trim() + '\n$$\n' : latex
          await writeFile(target, body, 'utf8')
          return { path: target, format }
        }
        throw new Error('action must be "recognize" or "save"')
      },
    }
    disposers.push(ctx.effect(() => tools.register(definition), 'latex-editor: latex_formula tool'))
  }

  return () => {
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose()
      } catch {
        /* keep unwinding */
      }
    }
  }
}

function normalizeConfig(value) {
  const source = value && typeof value === 'object' ? value : {}
  const backend = source.backend === 'llm' || source.backend === 'endpoint' || source.backend === 'auto' ? source.backend : 'auto'
  const number = (input, fallback, min, max) => {
    const parsed = Number(input)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, parsed))
  }
  return {
    backend,
    endpointUrl: typeof source.endpointUrl === 'string' ? source.endpointUrl.trim() : '',
    endpointModel: typeof source.endpointModel === 'string' ? source.endpointModel.trim() : '',
    endpointKey: typeof source.endpointKey === 'string' ? source.endpointKey.trim() : '',
    provider: typeof source.provider === 'string' ? source.provider.trim() : '',
    model: typeof source.model === 'string' ? source.model.trim() : '',
    prompt: typeof source.prompt === 'string' ? source.prompt.slice(0, 4000) : '',
    maxImageBytes: number(source.maxImageBytes, 8 * 1024 * 1024, 64 * 1024, 32 * 1024 * 1024),
    timeoutMs: number(source.timeoutMs, 120000, 5000, 600000),
    maxOutputTokens: number(source.maxOutputTokens, 2048, 256, 8192),
  }
}
