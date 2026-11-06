/**
 * dsh-latex-formula-editor — Client entry.
 *
 * The bundle's `dsh.client` declaration loads this file as the browser half. It
 *   - loads the workbench modules from the Host (`/plugins/latex-editor/lib/*.js`,
 *     in filename order, cached for the page lifetime),
 *   - registers the merged zh/en dictionaries with the harness locale service,
 *   - registers the left-column entry (`sidebar.panellist`) and the panel it opens
 *     (`main`, keyed by the same id).
 */
window.__ModuleLoader__.load({
  id: 'dsh-latex-formula-editor',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState } = React

    window.__LX_REACT__ = React

    const NS = 'latex-editor'
    const ASSET = '/plugins/latex-editor/lib/'
    const MODULES = ['00-core', '10-latex', '20-render', '30-visual', '35-tiles', '40-recognition', '45-convert', '50-app', '56-recognition-panels', '60-settings-help', '90-skin']
    const NAV_LABEL = { zh: '公式编辑器', en: 'Formula Editor' }

    const MARK_PATH =
      'M643.015111 128c9.557333 0 18.773333 3.811556 25.486222 10.581333l0.398223 0.398223 88.974222 91.989333a36.010667 36.010667 0 0 1-51.313778 50.460444l-0.455111-0.398222-78.392889-81.009778H167.025778l196.835555 293.432889a36.010667 36.010667 0 0 1 0.227556 39.822222l-0.284445 0.455112-196.892444 290.247111h460.8l78.392889-81.009778a36.010667 36.010667 0 0 1 50.517333-1.251556l0.398222 0.398223c14.165333 13.653333 14.677333 36.181333 1.251556 50.460444l-0.398222 0.455111-88.974222 91.989333a36.010667 36.010667 0 0 1-25.372445 10.979556H98.986667a36.010667 36.010667 0 0 1-30.264889-55.466667l0.512-0.739555 221.297778-326.428445-220.899556-329.329777a36.010667 36.010667 0 0 1 29.013333-56.035556h544.369778z m306.460445 262.542222c13.880889 13.937778 14.051556 36.408889 0.398222 50.517334L878.876444 512l70.542223 70.542222a36.010667 36.010667 0 0 1-50.460445 51.313778l-0.398222-0.398222-70.542222-70.599111-70.542222 70.599111a36.010667 36.010667 0 0 1-51.370667-50.517334L777.102222 512l-70.542222-70.542222a36.010667 36.010667 0 0 1 50.460444-51.313778l70.940445 70.940444 70.542222-70.542222a36.010667 36.010667 0 0 1 50.972445 0z'


    const loaded = new Map()
    let chain = null

    function loadOne(name) {
      const src = ASSET + name + '.js'
      const cached = loaded.get(src)
      if (cached) return cached
      const promise = new Promise(function (resolve, reject) {
        const script = document.createElement('script')
        script.src = src
        script.async = true
        script.onload = function () {
          resolve(true)
        }
        script.onerror = function () {
          loaded.delete(src)
          reject(new Error('failed to load ' + src))
        }
        document.head.appendChild(script)
      })
      loaded.set(src, promise)
      return promise
    }

    /** Resolves once every workbench module has executed. Idempotent. */
    function loadWorkbench() {
      if (chain === null) {
        chain = MODULES.reduce(function (previous, name) {
          return previous.then(function () {
            return loadOne(name).catch(function (error) {
              /* A missing optional module degrades one feature, not the panel. */
              if (name === '00-core') throw error
              console.error('[latex-editor] module ' + name + ' did not load', error)
            })
          })
        }, Promise.resolve())
        chain.catch(function () {
          chain = null
        })
      }
      return chain
    }

    function guessLanguage() {
      const raw = (document.documentElement.getAttribute('lang') || navigator.language || 'en').toLowerCase()
      return raw.startsWith('zh') ? 'zh' : 'en'
    }

    function navLabel() {
      const LX = window.__LX
      if (LX && LX.t) {
        const text = LX.t('nav.label')
        if (text && text !== 'nav.label') return text
      }
      return NAV_LABEL[guessLanguage()]
    }

    /* -------------------------------------------------------- sidebar icon */

    function NavIcon(props) {
      const size = (props && props.size) || 20
      return h(
        'svg',
        {
          viewBox: '0 0 1024 1024',
          width: size,
          height: size,
          fill: 'currentColor',
          'aria-hidden': true,
          focusable: false,
          style: { display: 'block' },
        },
        h('path', { d: MARK_PATH }),
      )
    }

    /* ----------------------------------------------------------- panel body */

    function Skeleton(props) {
      const text = props.error ? props.error : NAV_LABEL[guessLanguage()] + '…'
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            height: '100%',
            minHeight: 240,
            color: 'var(--dsw-alias-label-secondary)',
            fontSize: 13,
            padding: 24,
            textAlign: 'center',
          },
        },
        props.error ? null : h('span', { className: 'lx-spinner', style: { width: 18, height: 18, borderWidth: 2 } }),
        h('span', null, text),
      )
    }

    function WorkbenchPanel() {
      const [state, setState] = useState({ ready: false, error: null })

      useEffect(function () {
        let alive = true
        loadWorkbench().then(
          function () {
            if (alive) setState({ ready: true, error: null })
          },
          function (error) {
            if (alive) setState({ ready: false, error: String((error && error.message) || error) })
          },
        )
        return function () {
          alive = false
        }
      }, [])

      if (state.error) return h(Skeleton, { error: state.error })
      const LX = window.__LX
      if (!state.ready || !LX || !LX.app || typeof LX.app.Workbench !== 'function') return h(Skeleton, {})
      return h(LX.app.Workbench)
    }

    return {
      inject: ['slots', 'locale'],
      apply: function apply(ctx) {
        let disposed = false

        const ready = loadWorkbench()
        ctx.effect(
          function () {
            disposed = false
            ready
              .then(function () {
                if (disposed) return
                const LX = window.__LX
                if (!LX) return
                ctx.locale.register(NS, { zh: LX.dicts.zh, en: LX.dicts.en })
                LX.setTranslator(ctx.locale.bind(NS))
                LX.setLanguage(LX.lang())
              })
              .catch(function (error) {
                console.error('[latex-editor] workbench modules failed to load', error)
              })
            return function () {
              disposed = true
            }
          },
          'latex-editor: locale dictionaries',
        )

        ctx.effect(
          function () {
            return ctx.slots.inject('sidebar.panellist', function () {
              return ctx.slots.register(
                { name: 'sidebar.panellist', id: 'latex-editor', order: 16, label: navLabel, locale: NS },
                function (props) {
                  return h(NavIcon, { size: props && props.size })
                },
              )
            })
          },
          'latex-editor: sidebar entry',
        )

        ctx.effect(
          function () {
            return ctx.slots.inject('main', function () {
              return ctx.slots.register({ name: 'main', key: 'latex-editor', locale: NS }, function () {
                return h(WorkbenchPanel)
              })
            })
          },
          'latex-editor: main panel',
        )
      },
    }
  },
})
