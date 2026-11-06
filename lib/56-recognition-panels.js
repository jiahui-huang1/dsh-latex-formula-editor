/**
 * @local/dsh-latex-editor — lib/56-recognition-panels.js
 *
 * The two recognition tabs of the workbench:
 *   LX.recogUI.ImageTab({ t, onInsert, onOpenSettings })
 *   LX.recogUI.DocumentTab({ t, onInsert, onOpenSettings })
 *
 * Both fill the panel body with `<div className="lx-tabpage lx-scroll">` and use
 * only LX.ui primitives. All user-visible strings are `ocr.*` / `doc.*`
 * dictionary keys contributed through LX.addDict below; all CSS is prefixed
 * `lx-ocr-` / `lx-doc-` and uses only theme tokens.
 *
 * Shell contract: `t` is optional (defaults to LX.t) and may be omitted;
 * `onInsert(latex)` receives sanitized LaTeX with no `$` delimiters;
 * `onOpenSettings()` takes no arguments and is offered whenever the Host has no
 * usable vision backend.
 */
;(function () {
  'use strict'

  const LX = window.__LX
  if (!LX || !LX.React || !LX.ui || !LX.icons || !LX.settings || !LX.util) return
  if (LX.recogUI) return

  const React = LX.React
  const h = LX.h
  const { useCallback, useEffect, useRef, useState } = React
  const ui = LX.ui
  const icons = LX.icons
  const cx = LX.cx
  const util = LX.util

  /* ------------------------------------------------------------ constants */

  const useSettings =
    typeof LX.useSettings === 'function'
      ? LX.useSettings
      : function useSettingsFallback() {
          return LX.settings.values
        }

  const TAB_STYLE = { flex: '1 1 auto', minHeight: 0, padding: '20px 24px', boxSizing: 'border-box' }
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024
  const MAX_PDF_BYTES = 50 * 1024 * 1024
  const MAX_PDF_PAGES = 100
  const THUMB_MAX_WIDTH = 140
  const FALLBACK_DOC_MAX_PAGES = 30
  const RECOGNIZE_MAX_EDGE = 1700
  const FATAL_CODES = ['NO_HOST', 'NO_BACKEND', 'MODEL_NO_VISION']
  const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif'
  const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|avif)$/i
  const PDF_ACCEPT = '.pdf,application/pdf'

  /* --------------------------------------------------------------- errors */

  const ERROR_TEXT = {
    NO_HOST: ['ocr.error.NO_HOST', 'ocr.error.NO_HOST.hint'],
    NO_BACKEND: ['ocr.error.NO_BACKEND', 'ocr.error.NO_BACKEND.hint'],
    MODEL_NO_VISION: ['ocr.error.MODEL_NO_VISION', 'ocr.error.MODEL_NO_VISION.hint'],
    TIMEOUT: ['ocr.error.TIMEOUT', 'ocr.error.TIMEOUT.hint'],
    BAD_IMAGE: ['ocr.error.BAD_IMAGE', 'ocr.error.BAD_IMAGE.hint'],
    EMPTY_RESULT: ['ocr.error.EMPTY_RESULT', 'ocr.error.EMPTY_RESULT.hint'],
    HTTP: ['ocr.error.HTTP', 'ocr.error.HTTP.hint'],
    FILE_TYPE: ['ocr.error.fileType'],
    FILE_SIZE: ['ocr.error.fileTooLarge', 'ocr.error.fileTooLarge.hint'],
    LOAD_FAIL: ['ocr.error.loadFailed', 'ocr.error.loadFailed.hint'],
    PDF_TYPE: ['doc.err.notPdf'],
    PDF_SIZE: ['doc.err.tooLarge', 'doc.err.tooLarge.hint'],
    PDF_PAGES: ['doc.err.tooManyPages', 'doc.err.tooManyPages.hint'],
    PDF_OPEN: ['doc.err.openFailed', 'doc.err.openFailed.hint'],
    PDF_PASSWORD: ['doc.err.password', 'doc.err.password.hint'],
    PDF_ENGINE: ['doc.err.engineFailed', 'doc.err.engineFailed.hint'],
  }

  function errorCopy(t, code, message, vars) {
    const entry = ERROR_TEXT[code] || ERROR_TEXT.HTTP
    const merged = Object.assign({ message: message || '' }, vars || {})
    return {
      title: t(entry[0], merged),
      detail: entry[1] ? t(entry[1], merged) : message || '',
    }
  }

  function failureOf(error) {
    const code = error && typeof error.code === 'string' && ERROR_TEXT[error.code] ? error.code : 'HTTP'
    return { code: code, message: (error && error.message) || '' }
  }

  function isFatal(code) {
    return FATAL_CODES.indexOf(code) >= 0
  }

  function isAbort(error) {
    return Boolean(error && (error.name === 'AbortError' || error.code === 'CANCELLED'))
  }

  function toast(message, tone) {
    if (typeof LX.toast === 'function') LX.toast(message, tone)
  }

  /* --------------------------------------------------------------- health */

  function healthUsable(payload) {
    if (!payload || typeof payload !== 'object') return false
    if (payload.ok === false) return false
    const llm = payload.llm || {}
    const endpoint = payload.endpoint || {}
    return Boolean((llm.available === true && llm.vision === true) || endpoint.configured === true)
  }

  function healthVisionMissing(payload) {
    if (!payload) return false
    const llm = payload.llm || {}
    const endpoint = payload.endpoint || {}
    return llm.available === true && llm.vision !== true && endpoint.configured !== true
  }

  function backendLabel(t, value) {
    const key = String(value || 'auto')
    if (key === 'llm') return t('ocr.backend.llm')
    if (key === 'endpoint') return t('ocr.backend.endpoint')
    if (key === 'auto') return t('ocr.backend.auto')
    return key
  }

  function docCap() {
    const raw = Number(LX.settings.values.docMaxPages)
    const cap = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : FALLBACK_DOC_MAX_PAGES
    return Math.min(MAX_PDF_PAGES, Math.max(1, cap))
  }

  /* ------------------------------------------------------- small elements */

  function StatusLine(props) {
    const t = props.t
    const health = props.health
    const meta = props.meta
    const loading = health === undefined
    const usable = healthUsable(health)
    const badges = []
    if (!loading && health) {
      const llm = health.llm || {}
      const endpoint = health.endpoint || {}
      if (llm.available === true && llm.vision === true) {
        badges.push({ key: 'model', tone: 'neutral', text: llm.model || llm.provider || t('ocr.backend.llm') })
      } else if (endpoint.configured === true) {
        badges.push({ key: 'endpoint', tone: 'neutral', text: endpoint.model || llm.model || t('ocr.backend.endpoint') })
      }
      if (healthVisionMissing(health)) {
        badges.push({ key: 'vision', tone: 'warn', text: t('ocr.status.visionMissing') })
      }
      if (health.backend) badges.push({ key: 'backend', tone: 'brand', text: backendLabel(t, health.backend) })
    }
    if (meta && meta.ms) badges.push({ key: 'ms', tone: 'neutral', text: t('ocr.meta.ms', { ms: meta.ms }) })
    return h(
      'div',
      { className: 'lx-ocr-status', role: 'status' },
      loading ? h(ui.Spinner, { size: 12 }) : h('span', { className: cx('lx-ocr-status__dot', usable ? 'lx-ocr-status__dot--ok' : 'lx-ocr-status__dot--err') }),
      h('span', { className: 'lx-ocr-status__label' }, loading ? t('ocr.status.checking') : usable ? t('ocr.status.ready') : t('ocr.status.unavailable')),
      badges.map(function (badge) {
        return h(ui.Badge, { key: badge.key, tone: badge.tone }, badge.text)
      }),
      h(ui.IconButton, {
        icon: icons.Refresh,
        size: 24,
        className: 'lx-ocr-status__refresh',
        label: t('ocr.status.refresh'),
        onClick: props.onRefresh,
      }),
    )
  }

  function HintCard(props) {
    const t = props.t
    return h(
      'div',
      { className: 'lx-ocr-hintcard', role: 'note' },
      h('span', { className: 'lx-ocr-hintcard__icon' }, h(icons.Info, { size: 16 })),
      h(
        'div',
        { className: 'lx-ocr-hintcard__body' },
        h('p', { className: 'lx-ocr-hintcard__title' }, t('ocr.enable.title')),
        h('p', { className: 'lx-ocr-hintcard__text' }, props.visionMissing ? t('ocr.enable.visionBody') : t('ocr.enable.body')),
      ),
      typeof props.onOpenSettings === 'function'
        ? h(ui.Button, { size: 'sm', variant: 'primary', icon: icons.Settings, onClick: props.onOpenSettings }, t('ocr.enable.cta'))
        : null,
    )
  }

  function ErrorBox(props) {
    const t = props.t
    const copy = errorCopy(t, props.code, props.message, props.vars)
    const showSettings =
      typeof props.onOpenSettings === 'function' &&
      (props.code === 'NO_HOST' || props.code === 'NO_BACKEND' || props.code === 'MODEL_NO_VISION')
    const actions = []
    if (typeof props.onRetry === 'function') {
      actions.push(h(ui.Button, { key: 'retry', size: 'sm', icon: icons.Refresh, onClick: props.onRetry }, props.retryLabel || t('ocr.retry')))
    }
    if (showSettings) {
      actions.push(h(ui.Button, { key: 'settings', size: 'sm', variant: 'primary', icon: icons.Settings, onClick: props.onOpenSettings }, t('ocr.enable.cta')))
    }
    return h(
      'div',
      { className: 'lx-ocr-error', role: 'alert' },
      h('span', { className: 'lx-ocr-error__icon' }, h(icons.Alert, { size: 16 })),
      h(
        'div',
        { className: 'lx-ocr-error__body' },
        h('p', { className: 'lx-ocr-error__title' }, copy.title),
        copy.detail ? h('p', { className: 'lx-ocr-error__detail' }, copy.detail) : null,
        actions.length ? h('div', { className: 'lx-ocr-error__actions' }, actions) : null,
      ),
    )
  }

  function NoticeLine(props) {
    const t = props.t
    const notice = props.notice
    if (!notice) return null
    let text = ''
    if (notice.code === 'CAP_REACHED') text = t('doc.notice.capReached', notice.vars || {})
    else if (notice.code === 'CANCELLED') text = t('doc.notice.cancelled')
    else if (notice.code === 'NO_PAGES') text = t('doc.notice.noPages')
    else if (notice.code === 'NOTHING') text = t('doc.notice.nothing')
    else if (notice.code === 'BUSY') text = t('doc.notice.busy')
    else if (notice.code === 'CAPPED') text = t('doc.notice.capped', notice.vars || {})
    if (!text) return null
    return h(
      'div',
      { className: 'lx-ocr-note', role: 'status' },
      h(icons.Info, { size: 14 }),
      h('span', null, text),
    )
  }

  function isImageFile(file) {
    if (!file) return false
    const type = String(file.type || '')
    const name = String(file.name || '')
    if (/^image\/svg/i.test(type) || /\.svg$/i.test(name)) return false
    if (/^image\//i.test(type)) return true
    return !type && IMAGE_EXTENSIONS.test(name)
  }

  /**
   * A document-level paste listener must not steal a paste aimed at another
   * surface (for example a settings field opened in a modal above this tab).
   * Page-level pastes (body/document as target) still belong to the tab.
   */
  function pasteBelongsToTab(event, root) {
    if (!root || event.defaultPrevented) return false
    const target = event.target
    if (!target) return true
    if (target === root) return true
    if (typeof root.contains === 'function' && root.contains(target)) return true
    const tag = target.tagName ? String(target.tagName).toLowerCase() : ''
    if (tag === 'body' || tag === 'html') return true
    return false
  }

  /**
   * Re-probe the Host after the recognition backend settings change, so the
   * status line and the "how to enable" card stay honest without a manual
   * refresh. Debounced: the settings panel persists on every keystroke.
   */
  function useBackendHealthRefresh(settings, bump) {
    const keyRef = useRef(null)
    const bumpRef = useRef(bump)
    bumpRef.current = bump
    const key =
      String(settings.backend || '') + '|' + String(settings.endpointUrl || '') + '|' + String(settings.endpointModel || '')
    useEffect(
      function () {
        if (keyRef.current === null) {
          keyRef.current = key
          return undefined
        }
        if (keyRef.current === key) return undefined
        keyRef.current = key
        const timer = setTimeout(function () {
          bumpRef.current()
        }, 500)
        return function () {
          clearTimeout(timer)
        }
      },
      [key],
    )
  }

  /* ------------------------------------------------------------- image tab */

  function ImageTab(props) {
    const t = typeof props.t === 'function' ? props.t : LX.t
    const onInsert = typeof props.onInsert === 'function' ? props.onInsert : null
    const onOpenSettings = typeof props.onOpenSettings === 'function' ? props.onOpenSettings : null
    const settings = useSettings()

    const [health, setHealth] = useState(undefined)
    const [healthTick, setHealthTick] = useState(0)
    const [image, setImage] = useState(null)
    const [hint, setHint] = useState('')
    const [phase, setPhase] = useState('idle') /* idle | reading | recognizing | done */
    const [latex, setLatex] = useState('')
    const [meta, setMeta] = useState(null)
    const [failure, setFailure] = useState(null)
    const [cancelled, setCancelled] = useState(false)
    const [dragging, setDragging] = useState(false)

    const inputRef = useRef(null)
    const rootRef = useRef(null)
    const abortRef = useRef(null)
    const aliveRef = useRef(true)
    const loadTokenRef = useRef(0)
    const dragDepthRef = useRef(0)

    const recognizing = phase === 'recognizing'
    const reading = phase === 'reading'
    const usable = healthUsable(health)

    useEffect(function () {
      aliveRef.current = true
      return function () {
        aliveRef.current = false
        if (abortRef.current) {
          const controller = abortRef.current
          abortRef.current = null
          try {
            controller.abort()
          } catch (error) {
            /* ignore */
          }
        }
      }
    }, [])

    useEffect(
      function () {
        let alive = true
        setHealth(undefined)
        const api = LX.recog
        if (!api || typeof api.health !== 'function') {
          setHealth(null)
          return function () {
            alive = false
          }
        }
        api.health({ force: healthTick > 0 }).then(function (payload) {
          if (alive) setHealth(payload)
        })
        return function () {
          alive = false
        }
      },
      [healthTick],
    )

    const pickFile = useCallback(function () {
      if (reading) return
      if (inputRef.current) inputRef.current.click()
    }, [reading])

    const acceptFile = useCallback(function (file) {
      if (!file) return
      const name = String(file.name || '')
      const type = String(file.type || '')
      const svg = /^image\/svg/i.test(type) || /\.svg$/i.test(name)
      const typedImage = /^image\//i.test(type) && !svg
      const extensionImage = !type && IMAGE_EXTENSIONS.test(name)
      if (svg || !(typedImage || extensionImage)) {
        setFailure({ code: 'FILE_TYPE' })
        return
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setFailure({ code: 'FILE_SIZE', vars: { size: util.formatBytes(MAX_IMAGE_BYTES) } })
        return
      }
      const api = LX.recog
      if (!api || typeof api.downscaleImage !== 'function') {
        setFailure({ code: 'NO_HOST' })
        return
      }
      const token = (loadTokenRef.current += 1)
      if (abortRef.current) {
        const running = abortRef.current
        abortRef.current = null
        try {
          running.abort()
        } catch (error) {
          /* ignore */
        }
      }
      setFailure(null)
      setMeta(null)
      setLatex('')
      setPhase('idle')
      setCancelled(false)
      setPhase('reading')
      util
        .fileToDataUrl(file)
        .then(function (raw) {
          return api.downscaleImage(raw, 1600).then(function (normalized) {
            return { raw: raw, normalized: normalized }
          })
        })
        .then(function (result) {
          if (!aliveRef.current || token !== loadTokenRef.current) return
          setImage({
            name: name,
            size: file.size,
            width: result.normalized.width,
            height: result.normalized.height,
            sourceWidth: result.normalized.sourceWidth || result.normalized.width,
            sourceHeight: result.normalized.sourceHeight || result.normalized.height,
            scaled: Boolean(result.normalized.scaled),
            previewUrl: result.raw,
            dataUrl: result.normalized.dataUrl,
          })
          setPhase('idle')
        })
        .catch(function (error) {
          if (!aliveRef.current || token !== loadTokenRef.current) return
          setFailure({ code: 'LOAD_FAIL', message: (error && error.message) || '' })
          setPhase('idle')
        })
    }, [])

    const acceptRef = useRef(acceptFile)
    useEffect(
      function () {
        acceptRef.current = acceptFile
      },
      [acceptFile],
    )

    /* Clipboard paste while this tab is mounted (and visible). */
    useEffect(function () {
      function onPaste(event) {
        const root = rootRef.current
        if (!root || root.getClientRects().length === 0) return
        if (!pasteBelongsToTab(event, root)) return
        const clipboard = event.clipboardData
        if (!clipboard) return
        let file = null
        if (clipboard.files && clipboard.files.length) {
          for (let index = 0; index < clipboard.files.length; index += 1) {
            if (isImageFile(clipboard.files[index])) {
              file = clipboard.files[index]
              break
            }
          }
        }
        if (!file && clipboard.items && clipboard.items.length) {
          for (let index = 0; index < clipboard.items.length; index += 1) {
            const item = clipboard.items[index]
            if (!item || item.kind !== 'file') continue
            const candidate = item.getAsFile()
            if (candidate && isImageFile(candidate)) {
              file = candidate
              break
            }
          }
        }
        if (!file) return
        event.preventDefault()
        acceptRef.current(file)
      }
      document.addEventListener('paste', onPaste)
      return function () {
        document.removeEventListener('paste', onPaste)
      }
    }, [])

    const refreshHealth = useCallback(function () {
      setHealthTick(function (value) {
        return value + 1
      })
    }, [])
    useBackendHealthRefresh(settings, refreshHealth)

    const recognize = useCallback(
      function () {
        if (!image) return
        const api = LX.recog
        if (!api || typeof api.recognizeImage !== 'function') {
          setFailure({ code: 'NO_HOST' })
          return
        }
        if (abortRef.current) {
          try {
            abortRef.current.abort()
          } catch (error) {
            /* ignore */
          }
        }
        const controller = new AbortController()
        abortRef.current = controller
        setPhase('recognizing')
        setFailure(null)
        setCancelled(false)
        function settle() {
          if (abortRef.current === controller) abortRef.current = null
        }
        api
          .recognizeImage(image.dataUrl, { hint: hint, backend: settings.backend, signal: controller.signal })
          .then(
            function (result) {
              if (!aliveRef.current || abortRef.current !== controller) return
              settle()
              if (controller.signal.aborted) return
              setLatex(result.latex)
              setMeta(result)
              setPhase('done')
            },
            function (error) {
              if (!aliveRef.current || abortRef.current !== controller) return
              settle()
              if (controller.signal.aborted || isAbort(error)) {
                setPhase(latex ? 'done' : 'idle')
                setCancelled(true)
                return
              }
              const info = failureOf(error)
              setFailure(info)
              setPhase(latex ? 'done' : 'idle')
              if (isFatal(info.code)) {
                if (api.invalidateHealth) api.invalidateHealth()
                setHealthTick(function (value) {
                  return value + 1
                })
              }
            },
          )
      },
      [image, hint, settings.backend, latex],
    )

    const cancelRecognize = useCallback(function () {
      const controller = abortRef.current
      if (!controller) return
      try {
        controller.abort()
      } catch (error) {
        /* ignore */
      }
    }, [])

    function clearImage() {
      if (abortRef.current) {
        const controller = abortRef.current
        abortRef.current = null
        try {
          controller.abort()
        } catch (error) {
          /* ignore */
        }
      }
      loadTokenRef.current += 1
      setImage(null)
      setLatex('')
      setMeta(null)
      setFailure(null)
      setCancelled(false)
      setPhase('idle')
      if (inputRef.current) inputRef.current.value = ''
    }

    async function copyLatex() {
      const value = String(latex || '').trim()
      if (!value) return
      const ok = await util.copyText(value)
      toast(ok ? t('ocr.copied') : t('ocr.copyFailed'), ok ? 'success' : 'error')
    }

    function insertLatex() {
      const value = String(latex || '').trim()
      if (!value) {
        toast(t('ocr.nothingToInsert'), 'warn')
        return
      }
      if (!onInsert) return
      onInsert(value)
    }

    function onDragEnter(event) {
      event.preventDefault()
      event.stopPropagation()
      dragDepthRef.current += 1
      setDragging(true)
    }

    function onDragOver(event) {
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    function onDragLeave(event) {
      event.preventDefault()
      event.stopPropagation()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (!dragDepthRef.current) setDragging(false)
    }

    function onDrop(event) {
      event.preventDefault()
      event.stopPropagation()
      dragDepthRef.current = 0
      setDragging(false)
      const files = event.dataTransfer && event.dataTransfer.files
      if (files && files.length) acceptRef.current(files[0])
    }

    function onDropZoneClick() {
      if (!reading) pickFile()
    }

    function onPickClick(event) {
      event.stopPropagation()
      pickFile()
    }

    function onInputChange(event) {
      const files = event.target.files
      if (files && files.length) acceptFile(files[0])
      event.target.value = ''
    }

    const dropZone = h(
      'div',
      {
        className: cx('lx-ocr-drop', dragging && 'lx-ocr-drop--active'),
        role: 'group',
        'aria-label': t('ocr.drop.title'),
        onClick: onDropZoneClick,
        onDragEnter: onDragEnter,
        onDragOver: onDragOver,
        onDragLeave: onDragLeave,
        onDrop: onDrop,
      },
      reading
        ? h(
            'div',
            { className: 'lx-ocr-drop__busy' },
            h(ui.Spinner, { size: 22 }),
            h('p', { className: 'lx-ocr-drop__sub' }, t('ocr.reading')),
          )
        : [
            h('span', { key: 'icon', className: 'lx-ocr-drop__icon' }, h(icons.Image, { size: 26 })),
            h('p', { key: 'title', className: 'lx-ocr-drop__title' }, dragging ? t('ocr.drop.active') : t('ocr.drop.title')),
            h('p', { key: 'sub', className: 'lx-ocr-drop__sub' }, t('ocr.drop.sub')),
            h(
              'div',
              { key: 'actions', className: 'lx-ocr-drop__actions' },
              h(ui.Button, { variant: 'primary', icon: icons.Upload, onClick: onPickClick }, t('ocr.choose')),
              h(
                'span',
                { className: 'lx-ocr-drop__paste' },
                h(icons.Paste, { size: 13 }),
                h('span', null, t('ocr.drop.paste')),
                h(ui.Kbd, null, 'Ctrl'),
                h('span', null, '+'),
                h(ui.Kbd, null, 'V'),
              ),
            ),
          ],
    )

    const preview =
      image && !reading
        ? h(
            'div',
            { className: 'lx-ocr-preview' },
            h('div', { className: 'lx-ocr-preview__frame' }, h('img', { className: 'lx-ocr-preview__img', src: image.previewUrl, alt: image.name || t('ocr.imageFallback') })),
            h(
              'div',
              { className: 'lx-ocr-preview__side' },
              h('div', { className: 'lx-ocr-preview__name', title: image.name }, image.name || t('ocr.imageFallback')),
              h(
                'div',
                { className: 'lx-ocr-preview__badges' },
                h(ui.Badge, { tone: 'neutral' }, util.formatBytes(image.size)),
                h(ui.Badge, { tone: 'neutral' }, t('ocr.dimensions', { w: image.width, h: image.height })),
                image.scaled ? h(ui.Badge, { tone: 'warn' }, t('ocr.badge.scaled', { max: 1600 })) : null,
              ),
              h(
                'div',
                { className: 'lx-ocr-preview__actions' },
                h(ui.Button, { size: 'sm', icon: icons.Image, onClick: onPickClick }, t('ocr.replace')),
                h(ui.Button, { size: 'sm', variant: 'ghost', icon: icons.Trash, onClick: clearImage }, t('ocr.remove')),
              ),
            ),
          )
        : null

    const form = image
      ? h(
          'div',
          { className: 'lx-ocr-form' },
          h(
            ui.Field,
            { label: t('ocr.hint.label'), hint: t('ocr.hint.help') },
            h(ui.Input, {
              value: hint,
              placeholder: t('ocr.hint.placeholder'),
              maxLength: 300,
              disabled: recognizing,
              onChange: function (event) {
                setHint(event.target.value)
              },
            }),
          ),
          h(
            'div',
            { className: 'lx-ocr-run' },
            h(
              ui.Button,
              { variant: 'primary', icon: icons.Sparkle, loading: recognizing, disabled: reading, onClick: recognize },
              recognizing ? t('ocr.recognizing') : t('ocr.recognize'),
            ),
            recognizing ? h(ui.Button, { icon: icons.Stop, onClick: cancelRecognize }, t('ocr.cancel')) : null,
            !recognizing && !latex ? h('p', { className: 'lx-ocr-idlehint' }, t('ocr.result.emptyHint')) : null,
          ),
        )
      : null

    const result =
      latex || meta
        ? h(
            'div',
            { className: 'lx-ocr-result' },
            h(
              'div',
              { className: 'lx-ocr-result__head' },
              h('div', { className: 'lx-ocr-result__title' }, h(icons.Formula, { size: 15 }), h('span', null, t('ocr.result.label'))),
              meta
                ? h(
                    'div',
                    { className: 'lx-ocr-result__meta' },
                    h(ui.Badge, { tone: 'brand' }, backendLabel(t, meta.backend)),
                    meta.model ? h(ui.Badge, { tone: 'neutral' }, meta.model) : null,
                    meta.ms ? h(ui.Badge, { tone: 'neutral' }, t('ocr.meta.ms', { ms: meta.ms })) : null,
                  )
                : null,
            ),
            h(ui.Textarea, {
              className: 'lx-ocr-tex',
              value: latex,
              rows: 6,
              spellCheck: false,
              placeholder: t('ocr.result.placeholder'),
              onChange: function (event) {
                setLatex(event.target.value)
              },
            }),
            h(
              'div',
              { className: 'lx-ocr-result__actions' },
              h(ui.Button, { size: 'sm', icon: icons.Copy, disabled: !String(latex || '').trim(), onClick: copyLatex }, t('ocr.copy')),
              h(
                ui.Button,
                { size: 'sm', variant: 'primary', icon: icons.Check, disabled: !String(latex || '').trim() || !onInsert, onClick: insertLatex },
                t('ocr.insert'),
              ),
              h(
                ui.Button,
                { size: 'sm', icon: icons.Refresh, loading: recognizing, disabled: recognizing, onClick: recognize },
                recognizing ? t('ocr.recognizing') : t('ocr.again'),
              ),
            ),
          )
        : null

    return h(
      'div',
      { className: 'lx-tabpage lx-scroll lx-ocr-page', ref: rootRef, style: TAB_STYLE },
      h('input', {
        ref: inputRef,
        type: 'file',
        accept: IMAGE_ACCEPT,
        className: 'lx-ocr-fileinput',
        tabIndex: -1,
        'aria-hidden': 'true',
        onChange: onInputChange,
      }),
      h(StatusLine, { t: t, health: health, meta: meta, onRefresh: refreshHealth }),
      health !== undefined && !usable
        ? h(HintCard, { t: t, visionMissing: healthVisionMissing(health), onOpenSettings: onOpenSettings })
        : null,
      image && !reading ? preview : dropZone,
      form,
      failure
        ? h(ErrorBox, {
            t: t,
            code: failure.code,
            message: failure.message,
            vars: failure.vars,
            onRetry: image && failure.code !== 'FILE_TYPE' && failure.code !== 'FILE_SIZE' && failure.code !== 'LOAD_FAIL' ? recognize : null,
            retryLabel: t('ocr.retry'),
            onOpenSettings: onOpenSettings,
          })
        : null,
      cancelled
        ? h('div', { className: 'lx-ocr-note', role: 'status' }, h(icons.Info, { size: 14 }), h('span', null, t('ocr.notice.cancelled')))
        : null,
      result,
    )
  }

  /* ---------------------------------------------------------- document tab */

  function DocumentTab(props) {
    const t = typeof props.t === 'function' ? props.t : LX.t
    const onInsert = typeof props.onInsert === 'function' ? props.onInsert : null
    const onOpenSettings = typeof props.onOpenSettings === 'function' ? props.onOpenSettings : null
    const settings = useSettings()

    const [health, setHealth] = useState(undefined)
    const [healthTick, setHealthTick] = useState(0)
    const [docInfo, setDocInfo] = useState(null)
    const [pages, setPages] = useState([])
    const [phase, setPhase] = useState('empty') /* empty | loading | ready */
    const [loadError, setLoadError] = useState(null)
    const [runError, setRunError] = useState(null)
    const [notice, setNotice] = useState(null)
    const [running, setRunning] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0, current: 0 })
    const [dragging, setDragging] = useState(false)

    const inputRef = useRef(null)
    const rootRef = useRef(null)
    const docRef = useRef(null)
    const abortRef = useRef(null)
    const aliveRef = useRef(true)
    const loadTokenRef = useRef(0)
    const thumbSessionRef = useRef(0)
    const dragDepthRef = useRef(0)
    const loadFileRef = useRef(null)

    const cap = docCap()
    const selectedCount = pages.reduce(function (total, page) {
      return total + (page.selected ? 1 : 0)
    }, 0)
    const attempted = pages.filter(function (page) {
      return page.status === 'done' || page.status === 'error'
    })
    const completed = pages.filter(function (page) {
      return page.status === 'done' && String(page.latex || '').trim()
    })
    const pendingThumbs = pages.filter(function (page) {
      return page.thumbState === 'pending'
    }).length
    const usable = healthUsable(health)

    useEffect(function () {
      aliveRef.current = true
      return function () {
        aliveRef.current = false
        thumbSessionRef.current += 1
        if (abortRef.current) {
          const controller = abortRef.current
          abortRef.current = null
          try {
            controller.abort()
          } catch (error) {
            /* ignore */
          }
        }
        const doc = docRef.current
        docRef.current = null
        if (doc && LX.recog && typeof LX.recog.closePdf === 'function') LX.recog.closePdf(doc)
      }
    }, [])

    useEffect(
      function () {
        let alive = true
        setHealth(undefined)
        const api = LX.recog
        if (!api || typeof api.health !== 'function') {
          setHealth(null)
          return function () {
            alive = false
          }
        }
        api.health({ force: healthTick > 0 }).then(function (payload) {
          if (alive) setHealth(payload)
        })
        return function () {
          alive = false
        }
      },
      [healthTick],
    )

    const refreshHealth = useCallback(function () {
      setHealthTick(function (value) {
        return value + 1
      })
    }, [])
    useBackendHealthRefresh(settings, refreshHealth)

    const pickFile = useCallback(function () {
      if (phase === 'loading') return
      if (inputRef.current) inputRef.current.click()
    }, [phase])

    async function renderThumbnails(doc, total, session) {
      const concurrency = 2
      let next = 1
      async function worker() {
        while (aliveRef.current && session === thumbSessionRef.current) {
          const number = next
          next += 1
          if (number > total) return
          try {
            const dataUrl = await LX.recog.thumbnail(doc, number, THUMB_MAX_WIDTH)
            if (!aliveRef.current || session !== thumbSessionRef.current) return
            setPages(function (current) {
              return current.map(function (page) {
                return page.n === number ? Object.assign({}, page, { thumb: dataUrl, thumbState: 'ready' }) : page
              })
            })
          } catch (error) {
            if (!aliveRef.current || session !== thumbSessionRef.current) return
            setPages(function (current) {
              return current.map(function (page) {
                return page.n === number ? Object.assign({}, page, { thumbState: 'error' }) : page
              })
            })
          }
        }
      }
      await Promise.all([worker(), worker()])
    }

    async function loadDocument(file) {
      if (!file) return
      if (running) {
        setNotice({ code: 'BUSY' })
        return
      }
      if (abortRef.current) {
        const controller = abortRef.current
        abortRef.current = null
        try {
          controller.abort()
        } catch (error) {
          /* ignore */
        }
      }
      const token = (loadTokenRef.current += 1)
      thumbSessionRef.current += 1
      const previous = docRef.current
      docRef.current = null
      if (previous && LX.recog && typeof LX.recog.closePdf === 'function') LX.recog.closePdf(previous)
      setLoadError(null)
      setRunError(null)
      setNotice(null)
      setDocInfo(null)
      setPages([])
      setProgress({ done: 0, total: 0, current: 0 })
      setRunning(false)
      setCancelling(false)
      const name = String(file.name || '')
      const type = String(file.type || '')
      if (!/\.pdf$/i.test(name) && type !== 'application/pdf') {
        setLoadError({ code: 'PDF_TYPE' })
        setPhase('empty')
        return
      }
      if (file.size > MAX_PDF_BYTES) {
        setLoadError({ code: 'PDF_SIZE', vars: { size: util.formatBytes(MAX_PDF_BYTES) } })
        setPhase('empty')
        return
      }
      const api = LX.recog
      if (!api || typeof api.openPdf !== 'function') {
        setLoadError({ code: 'PDF_ENGINE' })
        setPhase('empty')
        return
      }
      setPhase('loading')
      try {
        const opened = await api.openPdf(file)
        if (!aliveRef.current || token !== loadTokenRef.current) {
          if (typeof api.closePdf === 'function') api.closePdf(opened.doc)
          return
        }
        if (opened.pages > MAX_PDF_PAGES) {
          if (typeof api.closePdf === 'function') api.closePdf(opened.doc)
          setLoadError({ code: 'PDF_PAGES', vars: { n: opened.pages, max: MAX_PDF_PAGES } })
          setPhase('empty')
          return
        }
        docRef.current = opened.doc
        const selected = Math.min(opened.pages, cap)
        const items = []
        for (let number = 1; number <= opened.pages; number += 1) {
          items.push({
            n: number,
            selected: number <= selected,
            thumb: '',
            thumbState: 'pending',
            status: 'idle',
            latex: '',
            meta: null,
            error: null,
          })
        }
        setDocInfo({
          title: opened.title || name.replace(/\.pdf$/i, ''),
          pages: opened.pages,
          name: name,
          size: file.size,
        })
        setPages(items)
        setPhase('ready')
        const session = (thumbSessionRef.current += 1)
        renderThumbnails(opened.doc, opened.pages, session)
      } catch (error) {
        const info = failureOf(error)
        setLoadError({ code: info.code, message: info.message })
        setPhase('empty')
      }
    }

    useEffect(
      function () {
        loadFileRef.current = loadDocument
      },
      [loadDocument],
    )

    /* Clipboard paste while this tab is mounted (and visible). */
    useEffect(function () {
      function onPaste(event) {
        const root = rootRef.current
        if (!root || root.getClientRects().length === 0) return
        if (!pasteBelongsToTab(event, root)) return
        const clipboard = event.clipboardData
        if (!clipboard) return
        let file = null
        if (clipboard.files && clipboard.files.length) {
          for (let index = 0; index < clipboard.files.length; index += 1) {
            const candidate = clipboard.files[index]
            if (candidate && (/pdf$/i.test(String(candidate.type || '')) || /\.pdf$/i.test(String(candidate.name || '')))) {
              file = candidate
              break
            }
          }
        }
        if (!file) {
          const files = clipboard.files
          if (files && files.length && files[0] && files[0].size > 0) file = files[0]
        }
        if (!file) return
        event.preventDefault()
        if (loadFileRef.current) loadFileRef.current(file)
      }
      document.addEventListener('paste', onPaste)
      return function () {
        document.removeEventListener('paste', onPaste)
      }
    }, [])

    function resetDocument() {
      if (running) return
      loadTokenRef.current += 1
      thumbSessionRef.current += 1
      const doc = docRef.current
      docRef.current = null
      if (doc && LX.recog && typeof LX.recog.closePdf === 'function') LX.recog.closePdf(doc)
      setDocInfo(null)
      setPages([])
      setPhase('empty')
      setLoadError(null)
      setRunError(null)
      setNotice(null)
      setProgress({ done: 0, total: 0, current: 0 })
      setRunning(false)
      setCancelling(false)
      if (inputRef.current) inputRef.current.value = ''
    }

    function togglePage(number) {
      if (running) return
      const target = pages.find(function (page) {
        return page.n === number
      })
      if (!target) return
      if (!target.selected && selectedCount >= cap) {
        setNotice({ code: 'CAP_REACHED', vars: { max: cap } })
        return
      }
      setNotice(null)
      setPages(function (current) {
        return current.map(function (page) {
          return page.n === number ? Object.assign({}, page, { selected: !page.selected }) : page
        })
      })
    }

    function selectAll() {
      if (running) return
      setNotice(null)
      setPages(function (current) {
        return current.map(function (page) {
          return Object.assign({}, page, { selected: page.n <= cap })
        })
      })
    }

    function selectNone() {
      if (running) return
      setNotice(null)
      setPages(function (current) {
        return current.map(function (page) {
          return Object.assign({}, page, { selected: false })
        })
      })
    }

    function updateResult(number, value) {
      setPages(function (current) {
        return current.map(function (page) {
          return page.n === number ? Object.assign({}, page, { latex: value }) : page
        })
      })
    }

    function setPageStatus(number, patch) {
      setPages(function (current) {
        return current.map(function (page) {
          return page.n === number ? Object.assign({}, page, patch) : page
        })
      })
    }

    async function runPages(numbers) {
      if (!numbers.length) {
        setNotice({ code: 'NO_PAGES' })
        return
      }
      if (running) return
      const doc = docRef.current
      const api = LX.recog
      if (!doc || !api || typeof api.pageToDataUrl !== 'function') {
        setRunError({ code: 'PDF_ENGINE' })
        return
      }
      const total = numbers.length
      const controller = new AbortController()
      abortRef.current = controller
      setRunning(true)
      setCancelling(false)
      setRunError(null)
      setNotice(null)
      setProgress({ done: 0, total: total, current: numbers[0] })
      let done = 0
      let cancelled = false
      try {
        for (let index = 0; index < numbers.length; index += 1) {
          const number = numbers[index]
          if (controller.signal.aborted) {
            cancelled = true
            break
          }
          if (!aliveRef.current) return
          setProgress({ done: done, total: total, current: number })
          setPageStatus(number, { status: 'running', error: null })
          try {
            const image = await api.pageToDataUrl(doc, number, {
              scale: Number(settings.docScale) || 2,
              maxEdge: RECOGNIZE_MAX_EDGE,
            })
            if (controller.signal.aborted) {
              cancelled = true
              break
            }
            const result = await api.recognizeImage(image.dataUrl, {
              backend: settings.backend,
              signal: controller.signal,
            })
            if (!aliveRef.current) return
            done += 1
            setPageStatus(number, { status: 'done', latex: result.latex, meta: result, error: null })
            setProgress({ done: done, total: total, current: number })
          } catch (error) {
            if (!aliveRef.current) return
            if (controller.signal.aborted || isAbort(error)) {
              cancelled = true
              break
            }
            const info = failureOf(error)
            done += 1
            setPageStatus(number, { status: 'error', error: info })
            setProgress({ done: done, total: total, current: number })
            if (isFatal(info.code)) {
              setRunError(info)
              if (api.invalidateHealth) api.invalidateHealth()
              setHealthTick(function (value) {
                return value + 1
              })
              break
            }
          }
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (aliveRef.current) {
          setRunning(false)
          setCancelling(false)
          setPages(function (current) {
            return current.map(function (page) {
              return page.status === 'running' ? Object.assign({}, page, { status: 'idle' }) : page
            })
          })
          if (cancelled) setNotice({ code: 'CANCELLED' })
        }
      }
    }

    function startRun() {
      if (running) return
      const selected = pages
        .filter(function (page) {
          return page.selected
        })
        .map(function (page) {
          return page.n
        })
      if (!selected.length) {
        setNotice({ code: 'NO_PAGES' })
        return
      }
      const batch = selected.slice(0, cap)
      const pending = runPages(batch)
      if (batch.length < selected.length) setNotice({ code: 'CAPPED', vars: { max: cap } })
      pending.catch(function (error) {
        if (!aliveRef.current) return
        setRunning(false)
        setCancelling(false)
        setRunError(failureOf(error))
      })
    }

    function retryPage(number) {
      if (running) return
      runPages([number]).catch(function (error) {
        if (!aliveRef.current) return
        setRunning(false)
        setCancelling(false)
        setRunError(failureOf(error))
      })
    }

    function cancelRun() {
      const controller = abortRef.current
      if (!controller) return
      setCancelling(true)
      try {
        controller.abort()
      } catch (error) {
        /* ignore */
      }
    }

    async function copyPage(page) {
      const value = String(page.latex || '').trim()
      if (!value) return
      const ok = await util.copyText(value)
      toast(ok ? t('doc.copied') : t('doc.copyFailed'), ok ? 'success' : 'error')
    }

    function insertPage(page) {
      const value = String(page.latex || '').trim()
      if (!value) {
        toast(t('doc.nothingToInsert'), 'warn')
        return
      }
      if (!onInsert) return
      onInsert(value)
    }

    async function copyAll() {
      const chunks = completed.map(function (page) {
        return String(page.latex || '').trim()
      })
      if (!chunks.length) {
        setNotice({ code: 'NOTHING' })
        return
      }
      const ok = await util.copyText(chunks.join('\n\n'))
      toast(ok ? t('doc.copiedAll') : t('doc.copyFailed'), ok ? 'success' : 'error')
    }

    function sanitizeFileName(value) {
      const cleaned = String(value || '')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60)
        .trim()
      return cleaned || 'latex-document'
    }

    function exportTex() {
      if (!completed.length) {
        setNotice({ code: 'NOTHING' })
        return
      }
      const base = sanitizeFileName(docInfo && docInfo.title)
      const source = (docInfo && (docInfo.name || docInfo.title)) || ''
      const lines = [
        '% LaTeX recognized with @local/dsh-latex-editor',
        '% Source: ' + source,
        '% Pages: ' + completed.length,
        '',
      ]
      completed.forEach(function (page) {
        lines.push('% --- Page ' + page.n + ' ---')
        lines.push(String(page.latex || '').trim())
        lines.push('')
      })
      const name = base + '.tex'
      util.download(name, lines.join('\n'), 'application/x-tex;charset=utf-8')
      toast(t('doc.exported', { name: name }), 'success')
    }

    function exportWord() {
      if (!completed.length) {
        setNotice({ code: 'NOTHING' })
        return
      }
      const base = sanitizeFileName(docInfo && docInfo.title)
      const title = (docInfo && docInfo.title) || t('doc.titleFallback')
      const body = completed
        .map(function (page) {
          return '<h2>' + esc(t('doc.page', { n: page.n })) + '</h2><p>' + esc(String(page.latex || '').trim()) + '</p>'
        })
        .join('')
      const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>' + esc(title) + '</title></head><body><h1>' + esc(title) + '</h1>' + body + '</body></html>'
      const name = base + '.doc'
      util.download(name, html, 'application/msword;charset=utf-8')
      remember(name)
      toast(t('doc.exported', { name: name }), 'success')
    }

    function esc(text) {
      return String(text).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')
    }

    const HISTORY_KEY = 'ocrHistory.v1'
    const HISTORY_DAYS = 15
    const [records, setRecords] = useState(function () {
      return readRecords()
    })
    const savedRef = useRef(false)

    function readRecords() {
      const stored = LX.storage.get(HISTORY_KEY, [])
      const cutoff = Date.now() - HISTORY_DAYS * 24 * 3600 * 1000
      return (Array.isArray(stored) ? stored : []).filter(function (item) {
        return item && item.createdAt >= cutoff && item.pages && item.pages.length
      })
    }

    function remember(name) {
      if (savedRef.current || !completed.length) return
      savedRef.current = true
      const cutoff = Date.now() - HISTORY_DAYS * 24 * 3600 * 1000
      const next = [
        {
          id: 'r' + Date.now(),
          title: (docInfo && docInfo.title) || name || t('doc.titleFallback'),
          createdAt: Date.now(),
          pages: completed.map(function (page) {
            return { n: page.n, latex: String(page.latex || '') }
          }),
        },
      ].concat(
        readRecords().filter(function (item) {
          return item.createdAt >= cutoff
        }),
      ).slice(0, 20)
      LX.storage.set(HISTORY_KEY, next)
      setRecords(next)
    }

    function redownload(record, kind) {
      const base = sanitizeFileName(record.title)
      if (kind === 'tex') {
        const lines = ['% ' + record.title, '']
        record.pages.forEach(function (page) {
          lines.push('% --- Page ' + page.n + ' ---', page.latex.trim(), '')
        })
        util.download(base + '.tex', lines.join('\n'), 'application/x-tex;charset=utf-8')
      } else if (kind === 'md') {
        const lines = ['# ' + record.title, '']
        record.pages.forEach(function (page) {
          lines.push('## ' + t('doc.page', { n: page.n }), '', '$$', page.latex.trim(), '$$', '')
        })
        util.download(base + '.md', lines.join('\n'), 'text/markdown;charset=utf-8')
      } else {
        const body = record.pages
          .map(function (page) {
            return '<h2>' + esc(t('doc.page', { n: page.n })) + '</h2><p>' + esc(page.latex.trim()) + '</p>'
          })
          .join('')
        util.download(base + '.doc', '<html><head><meta charset="utf-8"></head><body><h1>' + esc(record.title) + '</h1>' + body + '</body></html>', 'application/msword;charset=utf-8')
      }
      toast(t('doc.exported', { name: base }), 'success')
    }

    function exportMarkdown() {
      if (!completed.length) {
        setNotice({ code: 'NOTHING' })
        return
      }
      const base = sanitizeFileName(docInfo && docInfo.title)
      const title = (docInfo && docInfo.title) || t('doc.titleFallback')
      const lines = ['# ' + title, '']
      completed.forEach(function (page) {
        lines.push('## ' + t('doc.page', { n: page.n }))
        lines.push('')
        lines.push('$$')
        lines.push(String(page.latex || '').trim())
        lines.push('$$')
        lines.push('')
      })
      const name = base + '.md'
      util.download(name, lines.join('\n'), 'text/markdown;charset=utf-8')
      toast(t('doc.exported', { name: name }), 'success')
    }

    function onDragEnter(event) {
      if (running) return
      event.preventDefault()
      event.stopPropagation()
      dragDepthRef.current += 1
      setDragging(true)
    }

    function onDragOver(event) {
      if (running) return
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    function onDragLeave(event) {
      event.preventDefault()
      event.stopPropagation()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (!dragDepthRef.current) setDragging(false)
    }

    function onDrop(event) {
      event.preventDefault()
      event.stopPropagation()
      dragDepthRef.current = 0
      setDragging(false)
      if (running) return
      const files = event.dataTransfer && event.dataTransfer.files
      if (files && files.length) {
        if (loadFileRef.current) loadFileRef.current(files[0])
      }
    }

    function onDropZoneClick() {
      if (running || phase === 'loading') return
      pickFile()
    }

    function onPickClick(event) {
      event.stopPropagation()
      pickFile()
    }

    function onInputChange(event) {
      const files = event.target.files
      if (files && files.length) {
        if (loadFileRef.current) loadFileRef.current(files[0])
      }
      event.target.value = ''
    }

    function renderPageCard(page) {
      const statusLabel =
        page.status === 'running'
          ? t('doc.status.running')
          : page.status === 'done'
            ? t('doc.status.done')
            : page.status === 'error'
              ? t('doc.status.error')
              : ''
      return h(
        'div',
        {
          key: page.n,
          className: cx('lx-doc-page', page.selected && 'lx-doc-page--on', 'lx-doc-page--' + page.status),
          title: t('doc.page', { n: page.n }),
          onClick: function () {
            togglePage(page.n)
          },
        },
        h(
          'div',
          { className: 'lx-doc-page__thumb' },
          page.thumb
            ? h('img', { src: page.thumb, alt: t('doc.page', { n: page.n }), draggable: false })
            : h(
                'div',
                { className: 'lx-doc-page__skel' },
                page.thumbState === 'error' ? h(icons.Alert, { size: 16 }) : h(ui.Spinner, { size: 14 }),
              ),
        ),
        h(
          'div',
          { className: 'lx-doc-page__foot' },
          h('span', { className: 'lx-doc-page__num' }, t('doc.page', { n: page.n })),
          h(ui.Button, {
            size: 'sm',
            variant: page.selected ? 'primary' : 'default',
            className: 'lx-doc-page__pick',
            icon: page.selected ? icons.Check : icons.Plus,
            'aria-pressed': page.selected,
            'aria-label': t('doc.page', { n: page.n }) + ' · ' + (page.selected ? t('doc.status.selected') : t('doc.status.unselected')),
            title: page.selected ? t('doc.status.selected') : t('doc.status.unselected'),
            disabled: running || cancelling,
            onClick: function (event) {
              event.stopPropagation()
              togglePage(page.n)
            },
          }),
        ),
        statusLabel ? h('span', { className: cx('lx-doc-page__status', 'lx-doc-page__status--' + page.status) }, statusLabel) : null,
      )
    }

    function renderResultRow(page) {
      const isError = page.status === 'error'
      return h(
        'div',
        { key: page.n, className: cx('lx-doc-result', isError && 'lx-doc-result--error') },
        h(
          'div',
          { className: 'lx-doc-result__head' },
          h(ui.Badge, { tone: isError ? 'error' : 'brand' }, t('doc.page', { n: page.n })),
          !isError && page.meta
            ? h(
                'span',
                { className: 'lx-doc-result__meta' },
                [backendLabel(t, page.meta.backend), page.meta.model, page.meta.ms ? t('ocr.meta.ms', { ms: page.meta.ms }) : '']
                  .filter(Boolean)
                  .join(' · '),
              )
            : null,
          h(
            'div',
            { className: 'lx-doc-result__actions' },
            isError
              ? h(
                  ui.Button,
                  { size: 'sm', icon: icons.Refresh, disabled: running || cancelling, onClick: function () { retryPage(page.n) } },
                  t('doc.retry'),
                )
              : [
                  h(
                    ui.Button,
                    { key: 'copy', size: 'sm', icon: icons.Copy, disabled: !String(page.latex || '').trim(), onClick: function () { copyPage(page) } },
                    t('doc.copy'),
                  ),
                  h(
                    ui.Button,
                    {
                      key: 'insert',
                      size: 'sm',
                      variant: 'primary',
                      icon: icons.Check,
                      disabled: !String(page.latex || '').trim() || !onInsert,
                      onClick: function () { insertPage(page) },
                    },
                    t('doc.insert'),
                  ),
                ],
          ),
        ),
        isError
          ? (function () {
              const copy = errorCopy(t, page.error && page.error.code, page.error && page.error.message)
              return h(
                'div',
                { className: 'lx-doc-result__error' },
                h(icons.Alert, { size: 15 }),
                h(
                  'div',
                  null,
                  h('p', { className: 'lx-doc-result__errtitle' }, copy.title),
                  copy.detail ? h('p', { className: 'lx-doc-result__errdetail' }, copy.detail) : null,
                ),
              )
            })()
          : h(ui.Textarea, {
              className: 'lx-doc-result__tex',
              value: page.latex,
              rows: 3,
              spellCheck: false,
              onChange: function (event) {
                updateResult(page.n, event.target.value)
              },
            }),
      )
    }

    const dropZone = h(
      'div',
      {
        className: cx('lx-doc-drop', dragging && 'lx-doc-drop--active'),
        role: 'group',
        'aria-label': t('doc.drop.title'),
        onClick: onDropZoneClick,
        onDragEnter: onDragEnter,
        onDragOver: onDragOver,
        onDragLeave: onDragLeave,
        onDrop: onDrop,
      },
      phase === 'loading'
        ? h(
            'div',
            { className: 'lx-doc-drop__busy' },
            h(ui.Spinner, { size: 22 }),
            h('p', { className: 'lx-doc-drop__sub' }, t('doc.loading')),
          )
        : [
            h('span', { key: 'icon', className: 'lx-doc-drop__icon' }, h(icons.Doc, { size: 28 })),
            h('p', { key: 'title', className: 'lx-doc-drop__title' }, dragging ? t('doc.drop.active') : t('doc.drop.title')),
            h('p', { key: 'sub', className: 'lx-doc-drop__sub' }, t('doc.drop.sub')),
            h(
              'div',
              { key: 'actions', className: 'lx-doc-drop__actions' },
              h(ui.Button, { variant: 'primary', icon: icons.Upload, loading: phase === 'loading', onClick: onPickClick }, t('doc.choose')),
            ),
          ],
    )

    const emptyBody = h(
      'div',
      { className: 'lx-doc-empty' },
      dropZone,
      loadError ? h(ErrorBox, { t: t, code: loadError.code, message: loadError.message, vars: loadError.vars, onOpenSettings: onOpenSettings }) : null,
      h(NoticeLine, { t: t, notice: notice }),
      h(
        'div',
        { className: 'lx-doc-tips' },
        h('p', null, t('doc.tip.step1')),
        h('p', null, t('doc.tip.step2')),
        h('p', null, t('doc.tip.step3')),
      ),
    )

    const documentBody = docInfo
      ? h(
          'div',
          { className: 'lx-doc-body' },
          runError ? h(ErrorBox, { t: t, code: runError.code, message: runError.message, onOpenSettings: onOpenSettings }) : null,
          h(
            'div',
            { className: 'lx-doc-head' },
            h(
              'div',
              { className: 'lx-doc-head__main' },
              h('span', { className: 'lx-doc-head__icon' }, h(icons.Doc, { size: 18 })),
              h(
                'div',
                { className: 'lx-doc-head__text' },
                h('div', { className: 'lx-doc-head__title', title: docInfo.title }, docInfo.title || t('doc.titleFallback')),
                h(
                  'div',
                  { className: 'lx-doc-head__badges' },
                  h(ui.Badge, { tone: 'brand' }, t('doc.pages', { n: docInfo.pages })),
                  h(ui.Badge, { tone: 'neutral' }, util.formatBytes(docInfo.size)),
                ),
              ),
            ),
            h(
              'div',
              { className: 'lx-doc-head__actions' },
              h(ui.Button, { size: 'sm', icon: icons.Upload, disabled: running, onClick: onPickClick }, t('doc.replace')),
              h(ui.IconButton, { icon: icons.Close, size: 28, label: t('doc.close'), disabled: running, onClick: resetDocument }),
            ),
          ),
          h(
            'div',
            { className: 'lx-doc-toolbar' },
            h(
              'div',
              { className: 'lx-doc-toolbar__left' },
              h(ui.Button, { size: 'sm', icon: icons.Grid, disabled: running, onClick: selectAll }, t('doc.selectAll')),
              h(ui.Button, { size: 'sm', icon: icons.Close, disabled: running, onClick: selectNone }, t('doc.selectNone')),
              h('span', { className: 'lx-doc-toolbar__count' }, t('doc.selected', { selected: selectedCount, total: pages.length })),
            ),
            h(
              'div',
              { className: 'lx-doc-toolbar__right' },
              h(
                ui.Button,
                {
                  size: 'sm',
                  variant: 'primary',
                  icon: icons.Play,
                  loading: running && !cancelling,
                  disabled: running || !selectedCount,
                  onClick: startRun,
                },
                running ? (cancelling ? t('doc.cancelling') : t('doc.recognizing')) : t('doc.startCount', { n: selectedCount }),
              ),
              running ? h(ui.Button, { size: 'sm', icon: icons.Stop, disabled: cancelling, onClick: cancelRun }, t('doc.cancel')) : null,
            ),
          ),
          pages.length > cap ? h('p', { className: 'lx-doc-hint' }, t('doc.hint.cap', { max: cap, selected: selectedCount, total: pages.length })) : null,
          progress.total > 0
            ? h(
                'div',
                { className: 'lx-doc-progress' },
                h(ui.ProgressBar, { value: progress.total ? progress.done / progress.total : 0 }),
                h(
                  'div',
                  { className: 'lx-doc-progress__row' },
                  h('span', null, t('doc.progress', { done: progress.done, total: progress.total })),
                  running ? h('span', { className: 'lx-doc-progress__current' }, t('doc.current', { n: progress.current })) : null,
                ),
              )
            : null,
          h(NoticeLine, { t: t, notice: notice }),
          h('div', { className: 'lx-doc-stripwrap' }, h('div', { className: 'lx-doc-strip lx-scroll' }, pages.map(renderPageCard))),
          pendingThumbs > 0 ? h('p', { className: 'lx-doc-hint' }, t('doc.rendering')) : null,
          h(
            'div',
            { className: 'lx-doc-results' },
            h(
              'div',
              { className: 'lx-doc-results__head' },
              h('h3', { className: 'lx-doc-section__title' }, t('doc.results')),
              attempted.length ? h(ui.Badge, { tone: 'brand' }, String(attempted.length)) : null,
            ),
            attempted.length
              ? attempted.map(renderResultRow)
              : h('p', { className: 'lx-doc-results__hint' }, t('doc.noResults.hint')),
          ),
          h(
            'div',
            { className: 'lx-doc-footer' },
            h(ui.Button, { size: 'sm', icon: icons.Copy, disabled: !completed.length, onClick: copyAll }, t('doc.copyAll')),
            h(ui.Button, { size: 'sm', icon: icons.Download, disabled: !completed.length, onClick: exportWord }, t('doc.exportWord')),
            h(ui.Button, { size: 'sm', icon: icons.Download, disabled: !completed.length, onClick: exportTex }, t('doc.exportTex')),
            h(ui.Button, { size: 'sm', icon: icons.Download, disabled: !completed.length, onClick: exportMarkdown }, t('doc.exportMd')),
          ),
        )
      : null

    const historyCard = h(
      'section',
      { className: 'lx-doc-history' },
      h(
        'div',
        { className: 'lx-doc-history__head' },
        h(
          'div',
          null,
          h('h3', { className: 'lx-doc-section__title' }, t('doc.history')),
          h('p', { className: 'lx-doc-history__hint' }, t('doc.historyHint')),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'lx-doc-history__refresh',
            onClick: function () {
              setRecords(readRecords())
              toast(t('doc.historyRefreshed'), 'success')
            },
          },
          t('doc.refresh'),
        ),
      ),
      h(
        'div',
        { className: 'lx-doc-history__list' },
        records.length === 0
          ? h('p', { className: 'lx-doc-history__empty' }, t('doc.historyEmpty'))
          : records.map(function (record) {
              return h(
                'div',
                { key: record.id, className: 'lx-doc-history__row' },
                h(
                  'div',
                  { className: 'lx-doc-history__meta' },
                  h('span', { className: 'lx-doc-history__title' }, record.title),
                  h(
                    'span',
                    { className: 'lx-doc-history__time' },
                    new Date(record.createdAt).toLocaleString() + ' · ' + t('doc.pages', { n: record.pages.length }),
                  ),
                ),
                h(
                  'div',
                  { className: 'lx-doc-history__actions' },
                  h('button', { type: 'button', className: 'lx-doc-history__btn', onClick: function () { redownload(record, 'doc') } }, t('doc.exportWord')),
                  h('button', { type: 'button', className: 'lx-doc-history__btn', onClick: function () { redownload(record, 'tex') } }, t('doc.exportTex')),
                  h('button', { type: 'button', className: 'lx-doc-history__btn', onClick: function () { redownload(record, 'md') } }, t('doc.exportMd')),
                ),
              )
            }),
      ),
    )

    return h(
      'div',
      { className: 'lx-tabpage lx-scroll lx-doc-tab', ref: rootRef, style: TAB_STYLE },
      historyCard,
      h('input', {
        ref: inputRef,
        type: 'file',
        accept: PDF_ACCEPT,
        className: 'lx-doc-fileinput',
        tabIndex: -1,
        'aria-hidden': 'true',
        onChange: onInputChange,
      }),
      h(StatusLine, { t: t, health: health, onRefresh: refreshHealth }),
      health !== undefined && !usable
        ? h(HintCard, { t: t, visionMissing: healthVisionMissing(health), onOpenSettings: onOpenSettings })
        : null,
      docInfo ? documentBody : emptyBody,
    )
  }

  /* ------------------------------------------------------------- exports */

  LX.recogUI = {
    ImageTab: ImageTab,
    DocumentTab: DocumentTab,
  }

  /* -------------------------------------------------------------- strings */

  LX.addDict('zh', {
    'ocr.status.checking': '正在检查识别服务…',
    'ocr.status.ready': '识别服务就绪',
    'ocr.status.unavailable': '识别服务不可用',
    'ocr.status.refresh': '重新检查识别服务',
    'ocr.status.visionMissing': '当前模型不支持图片',
    'ocr.backend.auto': '自动选择',
    'ocr.backend.llm': 'Harness 模型',
    'ocr.backend.endpoint': '自定义端点',
    'ocr.reading': '正在读取图片…',
    'ocr.drop.title': '拖拽公式图片到这里',
    'ocr.drop.sub': '点击选择文件，或直接粘贴截图 · 支持 PNG / JPG / WebP / GIF',
    'ocr.drop.active': '松开即可载入图片',
    'ocr.drop.paste': '粘贴截图',
    'ocr.choose': '选择图片',
    'ocr.replace': '重新选择',
    'ocr.remove': '移除',
    'ocr.imageFallback': '粘贴的图片',
    'ocr.dimensions': '{w} × {h}',
    'ocr.badge.scaled': '已压缩到 {max}px',
    'ocr.hint.label': '识别提示（可选）',
    'ocr.hint.help': '可以补充公式来源或特殊要求，帮助模型更准确地转写。',
    'ocr.hint.placeholder': '例如：保留 \\begin{aligned} 结构；这是物理公式',
    'ocr.recognize': '开始识别',
    'ocr.recognizing': '识别中…',
    'ocr.cancel': '取消',
    'ocr.result.label': '识别结果（可编辑）',
    'ocr.result.placeholder': '识别出的 LaTeX 会显示在这里',
    'ocr.result.emptyHint': '点击「开始识别」把图片转成 LaTeX。',
    'ocr.copy': '复制',
    'ocr.insert': '发送到编辑器',
    'ocr.again': '重新识别',
    'ocr.retry': '重试',
    'ocr.copied': '已复制 LaTeX',
    'ocr.copyFailed': '复制失败，请手动选择文本',
    'ocr.nothingToInsert': '没有可发送的 LaTeX',
    'ocr.meta.ms': '{ms} ms',
    'ocr.enable.title': '如何启用识别',
    'ocr.enable.body': '在「设置」里选择识别后端：优先使用 Harness 的多模态模型，或填写任意 OpenAI 兼容的视觉端点。图片只会发送到本机 Host。',
    'ocr.enable.visionBody': '当前模型不支持图片输入。请在「设置」中改用支持视觉的模型，或配置视觉端点。',
    'ocr.enable.cta': '打开设置',
    'ocr.notice.cancelled': '已取消识别。',
    'ocr.error.NO_HOST': '无法连接本地识别服务',
    'ocr.error.NO_HOST.hint': 'Host 端可能未加载，或识别路由不可达。请确认插件 Host 已启用后重试。',
    'ocr.error.NO_BACKEND': '尚未配置识别后端',
    'ocr.error.NO_BACKEND.hint': '请在设置中选择一个后端，或填写 OpenAI 兼容的视觉端点。',
    'ocr.error.MODEL_NO_VISION': '当前模型不支持图片输入',
    'ocr.error.MODEL_NO_VISION.hint': '请换用支持视觉的模型，或在设置中配置视觉端点。',
    'ocr.error.TIMEOUT': '识别超时',
    'ocr.error.TIMEOUT.hint': '请求超过时限。请重试，或换一张更小的图片。',
    'ocr.error.BAD_IMAGE': '图片无法识别',
    'ocr.error.BAD_IMAGE.hint': '图片可能损坏、格式不受支持或过大。请换一张图片。',
    'ocr.error.EMPTY_RESULT': '没有识别到公式',
    'ocr.error.EMPTY_RESULT.hint': '可以换一张更清晰的图片，或补充识别提示后重试。',
    'ocr.error.HTTP': '识别服务返回错误',
    'ocr.error.HTTP.hint': '错误详情：{message}',
    'ocr.error.fileType': '仅支持 PNG / JPG / WebP / GIF 图片',
    'ocr.error.fileTooLarge': '图片过大',
    'ocr.error.fileTooLarge.hint': '单张图片不能超过 {size}。',
    'ocr.error.loadFailed': '无法读取图片',
    'ocr.error.loadFailed.hint': '文件可能已损坏或格式不受支持。',
    'doc.drop.title': '拖拽 PDF 到这里',
    'doc.drop.sub': '点击选择文件 · 仅支持 PDF · 最大 50 MB、100 页',
    'doc.drop.active': '松开即可载入 PDF',
    'doc.choose': '选择 PDF',
    'doc.replace': '重新选择',
    'doc.close': '关闭文档',
    'doc.loading': '正在解析 PDF…',
    'doc.rendering': '正在生成页面预览…',
    'doc.titleFallback': '未命名文档',
    'doc.pages': '{n} 页',
    'doc.selected': '已选 {selected} / {total} 页',
    'doc.hint.cap': '已选 {selected} / {total} 页 · 单次最多选择 {max} 页，其余页面请分批识别。',
    'doc.selectAll': '全选',
    'doc.selectNone': '全不选',
    'doc.startCount': '开始识别（{n} 页）',
    'doc.recognizing': '识别中…',
    'doc.cancelling': '正在取消…',
    'doc.cancel': '取消',
    'doc.progress': '已完成 {done} / {total} 页',
    'doc.current': '正在识别第 {n} 页',
    'doc.results': '识别结果',
    'doc.noResults.hint': '识别完成后，逐页结果会显示在这里。',
    'doc.page': '第 {n} 页',
    'doc.status.running': '识别中',
    'doc.status.done': '完成',
    'doc.status.error': '失败',
    'doc.status.selected': '已选中',
    'doc.status.unselected': '未选中',
    'doc.copy': '复制',
    'doc.insert': '发送到编辑器',
    'doc.retry': '重试本页',
    'doc.copyAll': '复制全部',
    'doc.exportWord': 'Download Word',
    'doc.history': 'Recent recognitions',
    'doc.historyHint': 'Results from the last 15 days can be downloaded again without using quota.',
    'doc.historyEmpty': 'No document recognitions yet',
    'doc.historyRefreshed': 'Records refreshed',
    'doc.refresh': 'Refresh',
    'doc.pages': '{n} pages',
    'doc.exportTex': '导出 .tex',
    'doc.exportMd': '导出 .md',
    'doc.copied': '已复制本页 LaTeX',
    'doc.copiedAll': '已复制全部结果',
    'doc.copyFailed': '复制失败，请手动选择文本',
    'doc.nothingToInsert': '没有可发送的 LaTeX',
    'doc.exported': '已导出 {name}',
    'doc.notice.capReached': '单次最多选择 {max} 页，请先取消部分已选页面。',
    'doc.notice.cancelled': '已取消识别。',
    'doc.notice.noPages': '请至少选择一页。',
    'doc.notice.nothing': '还没有可导出的识别结果。',
    'doc.notice.busy': '识别进行中，请先取消或等待完成。',
    'doc.notice.capped': '已超过单次上限，本次只识别前 {max} 页。',
    'doc.tip.step1': '1. 选择或拖入一个 PDF（≤ 50 MB、≤ 100 页）',
    'doc.tip.step2': '2. 勾选需要识别的页面，默认选中前若干页',
    'doc.tip.step3': '3. 逐页识别后，复制、发送到编辑器或导出 .tex / .md',
    'doc.err.notPdf': '仅支持 PDF 文件',
    'doc.err.tooLarge': 'PDF 过大',
    'doc.err.tooLarge.hint': '单个 PDF 不能超过 {size}。',
    'doc.err.tooManyPages': 'PDF 页数过多',
    'doc.err.tooManyPages.hint': '最多支持 {max} 页，当前文件有 {n} 页。',
    'doc.err.openFailed': '无法打开 PDF',
    'doc.err.openFailed.hint': '文件可能已损坏：{message}',
    'doc.err.password': 'PDF 受密码保护',
    'doc.err.password.hint': '暂不支持加密 PDF，请先移除密码后重试。',
    'doc.err.engineFailed': 'PDF 引擎加载失败',
    'doc.err.engineFailed.hint': '未能加载内置的 PDF.js，请刷新页面后重试。',
  })

  LX.addDict('en', {
    'ocr.status.checking': 'Checking the recognition service…',
    'ocr.status.ready': 'Recognition service ready',
    'ocr.status.unavailable': 'Recognition service unavailable',
    'ocr.status.refresh': 'Check the recognition service again',
    'ocr.status.visionMissing': 'Current model has no image input',
    'ocr.backend.auto': 'Auto',
    'ocr.backend.llm': 'Harness model',
    'ocr.backend.endpoint': 'Custom endpoint',
    'ocr.reading': 'Reading the image…',
    'ocr.drop.title': 'Drop a formula image here',
    'ocr.drop.sub': 'Click to choose a file, or paste a screenshot · PNG / JPG / WebP / GIF',
    'ocr.drop.active': 'Release to load the image',
    'ocr.drop.paste': 'paste a screenshot',
    'ocr.choose': 'Choose image',
    'ocr.replace': 'Replace',
    'ocr.remove': 'Remove',
    'ocr.imageFallback': 'Pasted image',
    'ocr.dimensions': '{w} × {h}',
    'ocr.badge.scaled': 'Downscaled to {max}px',
    'ocr.hint.label': 'Recognition hint (optional)',
    'ocr.hint.help': 'Add context or special instructions to help the model transcribe more accurately.',
    'ocr.hint.placeholder': 'e.g. keep the \\begin{aligned} structure; this is a physics formula',
    'ocr.recognize': 'Recognize',
    'ocr.recognizing': 'Recognizing…',
    'ocr.cancel': 'Cancel',
    'ocr.result.label': 'Result (editable)',
    'ocr.result.placeholder': 'The recognized LaTeX will appear here',
    'ocr.result.emptyHint': 'Click “Recognize” to turn the image into LaTeX.',
    'ocr.copy': 'Copy',
    'ocr.insert': 'Send to editor',
    'ocr.again': 'Recognize again',
    'ocr.retry': 'Retry',
    'ocr.copied': 'LaTeX copied',
    'ocr.copyFailed': 'Copy failed; select the text manually',
    'ocr.nothingToInsert': 'There is no LaTeX to send',
    'ocr.meta.ms': '{ms} ms',
    'ocr.enable.title': 'How to enable recognition',
    'ocr.enable.body': 'Choose a recognition backend in Settings: prefer the Harness vision model, or configure any OpenAI-compatible vision endpoint. Images are only sent to the local Host.',
    'ocr.enable.visionBody': 'The current model does not accept images. Switch to a vision-capable model in Settings, or configure a vision endpoint.',
    'ocr.enable.cta': 'Open settings',
    'ocr.notice.cancelled': 'Recognition cancelled.',
    'ocr.error.NO_HOST': 'Cannot reach the local recognition service',
    'ocr.error.NO_HOST.hint': 'The Host half may not be loaded, or the recognition route is unreachable. Make sure the plugin Host is enabled and retry.',
    'ocr.error.NO_BACKEND': 'No recognition backend configured',
    'ocr.error.NO_BACKEND.hint': 'Choose a backend in Settings, or configure an OpenAI-compatible vision endpoint.',
    'ocr.error.MODEL_NO_VISION': 'The current model has no image input',
    'ocr.error.MODEL_NO_VISION.hint': 'Switch to a vision-capable model, or configure a vision endpoint in Settings.',
    'ocr.error.TIMEOUT': 'Recognition timed out',
    'ocr.error.TIMEOUT.hint': 'The request took too long. Retry, or use a smaller image.',
    'ocr.error.BAD_IMAGE': 'The image could not be recognized',
    'ocr.error.BAD_IMAGE.hint': 'The image may be corrupted, unsupported or too large. Try another image.',
    'ocr.error.EMPTY_RESULT': 'No formula was recognized',
    'ocr.error.EMPTY_RESULT.hint': 'Try a sharper image, or add a recognition hint and retry.',
    'ocr.error.HTTP': 'The recognition service returned an error',
    'ocr.error.HTTP.hint': 'Details: {message}',
    'ocr.error.fileType': 'Only PNG / JPG / WebP / GIF images are supported',
    'ocr.error.fileTooLarge': 'The image is too large',
    'ocr.error.fileTooLarge.hint': 'A single image cannot exceed {size}.',
    'ocr.error.loadFailed': 'Could not read the image',
    'ocr.error.loadFailed.hint': 'The file may be corrupted or in an unsupported format.',
    'doc.drop.title': 'Drop a PDF here',
    'doc.drop.sub': 'Click to choose a file · PDF only · up to 50 MB and 100 pages',
    'doc.drop.active': 'Release to load the PDF',
    'doc.choose': 'Choose PDF',
    'doc.replace': 'Replace',
    'doc.close': 'Close document',
    'doc.loading': 'Parsing the PDF…',
    'doc.rendering': 'Rendering page previews…',
    'doc.titleFallback': 'Untitled document',
    'doc.pages': '{n} pages',
    'doc.selected': '{selected} / {total} pages selected',
    'doc.hint.cap': '{selected} / {total} pages selected · at most {max} pages per run; recognize the rest in batches.',
    'doc.selectAll': 'Select all',
    'doc.selectNone': 'Select none',
    'doc.startCount': 'Recognize ({n} pages)',
    'doc.recognizing': 'Recognizing…',
    'doc.cancelling': 'Cancelling…',
    'doc.cancel': 'Cancel',
    'doc.progress': '{done} / {total} pages done',
    'doc.current': 'Recognizing page {n}',
    'doc.results': 'Results',
    'doc.noResults.hint': 'Per-page results will appear here when recognition finishes.',
    'doc.page': 'Page {n}',
    'doc.status.running': 'Running',
    'doc.status.done': 'Done',
    'doc.status.error': 'Failed',
    'doc.status.selected': 'Selected',
    'doc.status.unselected': 'Not selected',
    'doc.copy': 'Copy',
    'doc.insert': 'Send to editor',
    'doc.retry': 'Retry page',
    'doc.copyAll': 'Copy all',
    'doc.exportTex': 'Export .tex',
    'doc.exportMd': 'Export .md',
    'doc.copied': 'Page LaTeX copied',
    'doc.copiedAll': 'All results copied',
    'doc.copyFailed': 'Copy failed; select the text manually',
    'doc.nothingToInsert': 'There is no LaTeX to send',
    'doc.exported': 'Exported {name}',
    'doc.notice.capReached': 'At most {max} pages can be selected at once; unselect a few pages first.',
    'doc.notice.cancelled': 'Recognition cancelled.',
    'doc.notice.noPages': 'Select at least one page.',
    'doc.notice.nothing': 'There are no recognized results to export yet.',
    'doc.notice.busy': 'Recognition is running; cancel it or wait for it to finish.',
    'doc.notice.capped': 'Over the per-run limit; only the first {max} pages are recognized this time.',
    'doc.tip.step1': '1. Choose or drop a PDF (≤ 50 MB, ≤ 100 pages)',
    'doc.tip.step2': '2. Select the pages to recognize; the first pages are preselected',
    'doc.tip.step3': '3. Recognize page by page, then copy, send to the editor or export .tex / .md',
    'doc.err.notPdf': 'Only PDF files are supported',
    'doc.err.tooLarge': 'The PDF is too large',
    'doc.err.tooLarge.hint': 'A single PDF cannot exceed {size}.',
    'doc.err.tooManyPages': 'The PDF has too many pages',
    'doc.err.tooManyPages.hint': 'At most {max} pages are supported; this file has {n}.',
    'doc.err.openFailed': 'Could not open the PDF',
    'doc.err.openFailed.hint': 'The file may be corrupted: {message}',
    'doc.err.password': 'The PDF is password protected',
    'doc.err.password.hint': 'Encrypted PDFs are not supported; remove the password and retry.',
    'doc.err.engineFailed': 'The PDF engine failed to load',
    'doc.err.engineFailed.hint': 'The bundled PDF.js could not be loaded. Refresh the page and retry.',
  })

  /* ----------------------------------------------------------------- CSS */

  LX.addCss(`
.lx-ocr-page,.lx-doc-tab{display:flex;flex-direction:column;gap:14px;}
.lx-ocr-fileinput,.lx-doc-fileinput{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}

.lx-ocr-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:24px;font-size:12px;color:var(--dsw-alias-label-secondary);}
.lx-ocr-status__dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-border-l2);flex:none;}
.lx-ocr-status__dot--ok{background:var(--dsw-alias-state-success-primary);}
.lx-ocr-status__dot--err{background:var(--dsw-alias-state-error-primary);}
.lx-ocr-status__label{font-size:12.5px;font-weight:500;color:var(--dsw-alias-label-primary);}
.lx-ocr-status__refresh{margin-left:auto;}

.lx-ocr-hintcard{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.lx-ocr-hintcard__icon{display:flex;color:var(--dsw-alias-state-warn-primary);margin-top:2px;}
.lx-ocr-hintcard__body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
.lx-ocr-hintcard__title{margin:0;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);}
.lx-ocr-hintcard__text{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);}

.lx-ocr-drop,.lx-doc-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:220px;padding:36px 24px;border:1.5px dashed var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);text-align:center;cursor:pointer;transition:border-color .15s,background .15s;}
.lx-ocr-drop:hover,.lx-doc-drop:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);}
.lx-ocr-drop--active,.lx-doc-drop--active{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,var(--dsw-alias-bg-layer-1));}
.lx-ocr-drop__icon,.lx-doc-drop__icon{display:grid;place-items:center;width:48px;height:48px;border-radius:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);}
.lx-ocr-drop__title,.lx-doc-drop__title{margin:0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);}
.lx-ocr-drop__sub,.lx-doc-drop__sub{margin:0;max-width:430px;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);}
.lx-ocr-drop__actions,.lx-doc-drop__actions{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:6px;}
.lx-ocr-drop__paste{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.lx-ocr-drop__busy,.lx-doc-drop__busy{display:flex;flex-direction:column;align-items:center;gap:10px;}

.lx-ocr-preview{display:flex;gap:14px;align-items:stretch;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);}
.lx-ocr-preview__frame{flex:0 0 auto;display:flex;align-items:center;justify-content:center;max-width:42%;min-width:120px;padding:6px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);}
.lx-ocr-preview__img{display:block;max-width:100%;max-height:220px;border-radius:4px;background:var(--dsw-alias-bg-base);}
.lx-ocr-preview__side{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:8px;}
.lx-ocr-preview__name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lx-ocr-preview__badges{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.lx-ocr-preview__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.lx-ocr-form{display:flex;flex-direction:column;gap:10px;}
.lx-ocr-run{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.lx-ocr-idlehint{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary);}

.lx-ocr-result{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);}
.lx-ocr-result__head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
.lx-ocr-result__title{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-secondary);}
.lx-ocr-result__meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.lx-ocr-tex{min-height:120px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.65;}
.lx-ocr-result__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}

.lx-ocr-error{display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 38%,transparent);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--dsw-alias-bg-layer-1));}
.lx-ocr-error__icon{display:flex;color:var(--dsw-alias-state-error-primary);margin-top:1px;}
.lx-ocr-error__body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
.lx-ocr-error__title{margin:0;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);}
.lx-ocr-error__detail{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;}
.lx-ocr-error__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:5px;}
.lx-ocr-note{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);}
.lx-ocr-note svg{flex:none;}

.lx-doc-empty,.lx-doc-body{display:flex;flex-direction:column;gap:14px;}
.lx-doc-tips{display:flex;flex-direction:column;gap:4px;padding:0 4px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);}
.lx-doc-tips p{margin:0;}

.lx-doc-head{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);}
.lx-doc-head__main{display:flex;align-items:center;gap:9px;flex:1;min-width:0;}
.lx-doc-head__icon{display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);}
.lx-doc-head__text{display:flex;flex-direction:column;gap:4px;min-width:0;}
.lx-doc-head__title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);}
.lx-doc-head__badges{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.lx-doc-head__actions{display:flex;align-items:center;gap:6px;flex:none;}

.lx-doc-history{margin:18px 0 4px;padding:16px 18px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);}
.lx-doc-history__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.lx-doc-history__hint{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary);}
.lx-doc-history__refresh{flex:none;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;cursor:pointer;}
.lx-doc-history__refresh:hover{border-color:var(--lx-accent, #2563eb);}
.lx-doc-history__list{margin-top:12px;display:flex;flex-direction:column;gap:8px;}
.lx-doc-history__empty{margin:0;padding:12px 14px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:12.5px;color:var(--dsw-alias-label-secondary);}
.lx-doc-history__row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);}
.lx-doc-history__meta{display:flex;flex-direction:column;gap:2px;min-width:0;}
.lx-doc-history__title{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:44ch;}
.lx-doc-history__time{font-size:11px;color:var(--dsw-alias-label-secondary);}
.lx-doc-history__actions{display:flex;gap:6px;flex-wrap:wrap;}
.lx-doc-history__btn{height:26px;padding:0 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:11.5px;cursor:pointer;}
.lx-doc-history__btn:hover{border-color:var(--lx-accent, #2563eb);}
/* the image drop zone starts where the document drop zone starts (not centred) */
.lx-ocr-page{justify-content:flex-start !important;}
.lx-doc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.lx-doc-toolbar__left,.lx-doc-toolbar__right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.lx-doc-toolbar__count{font-size:12px;color:var(--dsw-alias-label-secondary);}
.lx-doc-hint{margin:0;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);}
.lx-doc-progress{display:flex;flex-direction:column;gap:5px;}
.lx-doc-progress__row{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.lx-doc-progress__current{color:var(--dsw-alias-label-primary);}

.lx-doc-stripwrap{min-width:0;}
.lx-doc-strip{display:flex;gap:10px;align-items:flex-start;overflow-x:auto;overflow-y:hidden;padding:2px 2px 10px;}
.lx-doc-page{position:relative;flex:0 0 auto;display:flex;flex-direction:column;gap:6px;width:118px;padding:6px;border:1.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;transition:border-color .12s,background .12s;}
.lx-doc-page:hover{border-color:var(--dsw-alias-border-l2);}
.lx-doc-page--on{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 6%,var(--dsw-alias-bg-layer-1));}
.lx-doc-page__thumb{display:flex;align-items:center;justify-content:center;height:132px;overflow:hidden;border-radius:6px;background:var(--dsw-alias-bg-layer-2);}
.lx-doc-page__thumb img{display:block;max-width:100%;max-height:100%;}
.lx-doc-page__skel{display:grid;place-items:center;width:100%;height:100%;color:var(--dsw-alias-label-secondary);animation:lx-doc-pulse 1.4s ease-in-out infinite;}
@keyframes lx-doc-pulse{0%,100%{opacity:.45;}50%{opacity:.95;}}
.lx-doc-page__foot{display:flex;align-items:center;justify-content:space-between;gap:6px;}
.lx-doc-page__num{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.lx-doc-page .lx-doc-page__pick{width:26px;min-width:26px;padding:0;}
.lx-doc-page__status{position:absolute;top:10px;left:10px;padding:1px 6px;border-radius:5px;font-size:10px;line-height:15px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);}
.lx-doc-page__status--running{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent);color:var(--dsw-alias-brand-primary);}
.lx-doc-page__status--done{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent);color:var(--dsw-alias-state-success-primary);}
.lx-doc-page__status--error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent);color:var(--dsw-alias-state-error-primary);}

.lx-doc-results{display:flex;flex-direction:column;gap:10px;}
.lx-doc-results__head{display:flex;align-items:center;gap:8px;}
.lx-doc-section__title{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);}
.lx-doc-results__hint{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary);}
.lx-doc-result{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.lx-doc-result--error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);}
.lx-doc-result__head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.lx-doc-result__meta{font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.lx-doc-result__actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:auto;}
.lx-doc-result__tex{min-height:74px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.6;}
.lx-doc-result__error{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);}
.lx-doc-result__error svg{flex:none;margin-top:1px;color:var(--dsw-alias-state-error-primary);}
.lx-doc-result__errtitle{margin:0;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);}
.lx-doc-result__errdetail{margin:2px 0 0;line-height:1.55;}
.lx-doc-footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}

@media (max-width:520px){
  .lx-ocr-preview{flex-direction:column;}
  .lx-ocr-preview__frame{max-width:100%;}
  .lx-ocr-page,.lx-doc-tab{padding:14px 14px !important;}
}
`)
})()
