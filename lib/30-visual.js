/**
 * @local/dsh-latex-editor — lib/30-visual.js
 *
 * The visual layer of the workbench:
 *   - SymbolPanel    the classified symbol palette (click inserts LaTeX)
 *   - TemplatePanel  structural templates (fraction, matrix, cases, …)
 *   - StructurePanel the parsed structure of the current formula, with
 *                    click-to-select and structural operations (wrap, delete,
 *                    append a row to an environment)
 * Data comes from `LX.latex` (lib/10-latex.js); rendering is upgraded
 * progressively through `LX.render` (lib/20-render.js) and degrades to a plain
 * monospace command face when MathJax is not available yet.
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
  const pick = LX.pick

  const svgCache = new Map()

  function paletteData() {
    const latex = LX.latex || {}
    return Array.isArray(latex.palette) ? latex.palette : []
  }

  function templateData() {
    const latex = LX.latex || {}
    return Array.isArray(latex.templates) ? latex.templates : []
  }

  /* Quick-tool tiles: one representative formula per category, drawn with MathJax
     the same way the palette upgrades its buttons. */
  const QUICK_PREVIEW = {
    symbols: '\\infty\\;\\partial\\;\\nabla',
    ops: '\\times\\;\\cup\\;\\ne\\;\\approx',
    greek: '\\alpha\\beta\\gamma\\delta',
    arrows: '\\rightarrow\\;\\Leftarrow\\;\\mapsto',
    delims: '\\{\\,[\\,(\\,)\\,]\\,\\}',
    large: '\\sum\\;\\prod\\;\\int\\;\\oint',
    accents: '\\hat{x}\\;\\vec{v}\\;\\bar{z}',
    fonts: '\\mathbb{R}\\;\\mathcal{L}\\;\\mathfrak{g}',
    spacing: 'a\\;b\\quad\\text{ab}',
    physchem: '\\dv{f}{x}\\;\\ce{H2O}',
  }

  const QUICK_ORDER = ['symbols', 'ops', 'greek', 'arrows', 'delims', 'large', 'accents', 'fonts', 'spacing', 'physchem']

  /** Fallback when a category has no hand-picked preview: its first few symbols. */
  function quickPreview(category) {
    const preset = QUICK_PREVIEW[category.id]
    if (preset) return preset
    const items = []
    for (const group of category.groups || []) {
      for (const item of group.items || []) {
        if (!item.tex || item.tex.length > 24) continue
        items.push(item.tex.replace(/§/g, 'x'))
        if (items.length >= 3) break
      }
      if (items.length >= 3) break
    }
    return items.join('\\;')
  }

  /** Source used to draw a button face: the module knows how to resolve `§`. */
  function previewTex(item) {
    const latex = LX.latex
    if (latex && typeof latex.previewTex === 'function') {
      try {
        return latex.previewTex(item.tex || '')
      } catch {
        /* fall through */
      }
    }
    return String(item.tex || '').replace(/§/g, 'x')
  }

  /** Progressive MathJax upgrade: typeset `tex` once, cache the SVG markup. */
  function useSvgUpgrades(items, enabled) {
    const ids = items.map(function (item) {
      return item.tex
    })
    const key = ids.join('\u0000')
    const [version, setVersion] = useState(0)
    const queueRef = useRef(0)
    useEffect(
      function () {
        if (!enabled) return undefined
        const render = LX.render
        if (!render || typeof render.tex2svg !== 'function') return undefined
        const pending = []
        for (let i = 0; i < ids.length; i += 1) {
          const tex = ids[i]
          if (svgCache.has(tex)) continue
          pending.push(tex)
        }
        if (pending.length === 0) return undefined
        const token = ++queueRef.current
        let frame = 0
        let cancelled = false
        let index = 0
        async function step() {
          if (cancelled || token !== queueRef.current) return
          const batch = pending.slice(index, index + 6)
          index += batch.length
          await Promise.all(
            batch.map(async function (tex) {
              try {
                const out = await render.tex2svg(previewTex({ tex }), { display: false, scale: 1.4 })
                const svg = out && out.svg
                const failed = Boolean(out && out.errors && out.errors.length) || /merror|data-mjx-error/.test(svg || '')
                const draws = Boolean(svg) && /<(use|path|rect|line|polygon|circle|ellipse|text)\b/.test(svg)
                svgCache.set(tex, failed || !draws ? null : svg)
              } catch {
                svgCache.set(tex, null)
              }
            }),
          )
          if (cancelled || token !== queueRef.current) return
          setVersion(function (n) {
            return n + 1
          })
          if (index < pending.length) frame = requestAnimationFrame(step)
        }
        frame = requestAnimationFrame(step)
        return function () {
          cancelled = true
          if (frame) cancelAnimationFrame(frame)
        }
      },
      [key, enabled],
    )
    return version
  }

  /* --------------------------------------------------------- symbol face */

  function SymbolFace(props) {
    const item = props.item
    const markup = svgCache.get(item.tex)
    if (markup) {
      return h('span', { className: 'lx-pal-face', dangerouslySetInnerHTML: { __html: markup } })
    }
    // spacing commands and style declarations produce no ink: show the command
    if (item.glyph) return h('span', { className: 'lx-pal-glyph' }, item.glyph)
    return h('span', { className: 'lx-pal-tex', title: item.tex }, item.tex)
  }

  function SymbolButton(props) {
    const item = props.item
    return h(
      'button',
      {
        type: 'button',
        className: 'lx-pal-item',
        title: pick(item) + (item.tex ? '  ' + item.tex : ''),
        'aria-label': pick(item) + ' ' + item.tex,
        onMouseDown: function (event) {
          event.preventDefault()
        },
        onClick: function () {
          props.onInsert(item.tex)
        },
      },
      h(SymbolFace, { item }),
    )
  }

  /** Wrapping category chips: every category stays visible at any panel width. */
  function CategoryChips(props) {
    return h(
      'div',
      { className: 'lx-catchips', role: 'tablist', 'aria-label': props.label },
      (props.options || []).map(function (option) {
        const on = option.value === props.value
        return h(
          'button',
          {
            key: option.value,
            type: 'button',
            role: 'tab',
            'aria-selected': on,
            className: LX.cx('lx-catchip', on && 'lx-catchip--on'),
            onClick: function () {
              if (!on) props.onChange(option.value)
            },
          },
          LX.pick(option),
        )
      }),
    )
  }

  /** One category's symbols, grouped exactly like the palette data (e.g. Greek:
      lower case / upper case), shown in the hover panel. */
  function HoverGroups(props) {
    const groups = props.groups || []
    const all = []
    for (const group of groups) {
      for (const item of group.items || []) all.push(item)
    }
    useSvgUpgrades(all.slice(0, 200), true)
    return h(
      'div',
      { className: 'lx-quick-pop-groups' },
      groups.map(function (group) {
        return h(
          'section',
          { key: group.id, className: 'lx-quick-pop-group' },
          h('h5', { className: 'lx-quick-pop-groupname' }, pick(group)),
          h(
            'div',
            { className: 'lx-pal-grid' },
            (group.items || []).map(function (item, index) {
              return h(SymbolButton, { key: item.tex + ':' + index, item: item, onInsert: props.onInsert })
            }),
          ),
        )
      }),
    )
  }

  /** The floating quick-tool tiles: icon mark + label + caret, like LaTeX Live. */
  function QuickTools(props) {
    const categories = props.categories || []
    const rowRef = useRef(null)

    // a vertical wheel over the tile strip scrolls it sideways, so the tiles past
    // the right edge stay reachable
    useEffect(
      function () {
        const row = rowRef.current
        if (!row) return undefined
        function onWheel(event) {
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
          row.scrollLeft += event.deltaY
          event.preventDefault()
        }
        row.addEventListener('wheel', onWheel, { passive: false })
        return function () {
          row.removeEventListener('wheel', onWheel)
        }
      },
      [],
    )
    const ordered = QUICK_ORDER.map(function (id) {
      return categories.find(function (category) {
        return category.id === id
      })
    })
      .filter(Boolean)
      .concat(
        categories.filter(function (category) {
          return QUICK_ORDER.indexOf(category.id) < 0
        }),
      )
    const previews = ordered.map(function (category) {
      return { tex: quickPreview(category) }
    })
    useSvgUpgrades(previews, props.upgrade !== false)
    return h(
      'div',
      { className: 'lx-quick-row lx-scroll', ref: rowRef, role: 'tablist', 'aria-label': props.label },
      ordered.map(function (category) {
        const on = category.id === props.value
        const preview = quickPreview(category)
        const markup = svgCache.get(preview)
        return h(
          'button',
          {
            key: category.id,
            type: 'button',
            role: 'tab',
            'aria-selected': on,
            className: LX.cx('lx-quick', on && 'lx-quick--on'),
            'aria-label': LX.pick(category),
            onMouseDown: function (event) {
              event.preventDefault()
            },
            onMouseEnter: function (event) {
              if (typeof props.onHover === 'function') props.onHover(category.id, event.currentTarget)
            },
            onMouseLeave: function () {
              if (typeof props.onLeave === 'function') props.onLeave()
            },
            onFocus: function (event) {
              if (typeof props.onHover === 'function') props.onHover(category.id, event.currentTarget)
            },
            onBlur: function () {
              if (typeof props.onLeave === 'function') props.onLeave()
            },
            onClick: function () {
              if (!on) props.onChange(category.id)
            },
          },
          h(
            'span',
            { className: 'lx-quick-icon' },
            markup
              ? h('span', { className: 'lx-quick-math', dangerouslySetInnerHTML: { __html: markup } })
              : h('span', { className: 'lx-quick-fallback' }, t('vis.quick.mark')),
          ),
          h('span', { className: 'lx-quick-label' }, LX.pick(category)),
          h('span', { className: 'lx-quick-caret', 'aria-hidden': true }, '▾'),
        )
      }),
    )
  }

  /* Colour, font family and size: one row of its own under the search box, the
     way the reference editor groups its formatting controls. */
  const FORMAT_COLORS = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2']

  const FORMAT_FAMILIES = [
    { value: '', zh: '字体', en: 'Font' },
    { value: 'mathrm', zh: '正体', en: 'Roman' },
    { value: 'mathbf', zh: '粗体', en: 'Bold' },
    { value: 'mathit', zh: '斜体', en: 'Italic' },
    { value: 'boldsymbol', zh: '粗斜体', en: 'Bold italic' },
    { value: 'mathbb', zh: '双线体', en: 'Blackboard' },
    { value: 'mathcal', zh: '花体', en: 'Calligraphic' },
    { value: 'mathfrak', zh: '哥特体', en: 'Fraktur' },
    { value: 'mathsf', zh: '无衬线', en: 'Sans' },
    { value: 'mathtt', zh: '等宽', en: 'Monospace' },
    { value: 'text', zh: '文本', en: 'Text' },
  ]

  const FORMAT_SIZES = [
    { value: '', zh: '字号', en: 'Size' },
    { value: 'displaystyle', zh: '显示', en: 'Display' },
    { value: 'textstyle', zh: '正文', en: 'Text' },
    { value: 'scriptstyle', zh: '上下标', en: 'Script' },
    { value: 'scriptscriptstyle', zh: '更小', en: 'Script script' },
  ]

  function FormatBar(props) {
    const [color, setColor] = useState('#2563eb')
    const wrap = function (before, after) {
      if (typeof props.onWrap === 'function') props.onWrap(before, after)
    }
    return h(
      'div',
      { className: 'lx-fmt' },
      h(
        'label',
        { className: 'lx-fmt-color', title: t('vis.fmt.color') },
        h('input', {
          type: 'color',
          value: color,
          'aria-label': t('vis.fmt.color'),
          onChange: function (event) {
            setColor(event.target.value)
          },
        }),
        h('span', { className: 'lx-fmt-color-dot', style: { background: color } }),
        h('span', { className: 'lx-sr' }, t('vis.fmt.color')),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'lx-fmt-apply',
          title: t('vis.fmt.applyColor'),
          onClick: function () {
            wrap('\\textcolor{' + color + '}{', '}')
          },
        },
        t('vis.fmt.applyColor'),
      ),
      h(LX.ui.Select, {
        value: '',
        options: FORMAT_FAMILIES,
        wrapStyle: { flex: '1 1 84px', minWidth: 76 },
        'aria-label': t('vis.fmt.family'),
        onChange: function (event) {
          const family = event.target.value
          if (family) wrap('\\' + family + '{', '}')
          event.target.value = ''
        },
      }),
      h(LX.ui.Select, {
        value: '',
        options: FORMAT_SIZES,
        wrapStyle: { flex: '1 1 76px', minWidth: 70 },
        'aria-label': t('vis.fmt.size'),
        onChange: function (event) {
          const style = event.target.value
          if (style) wrap('{\\' + style + ' ', '}')
          event.target.value = ''
        },
      }),
    )
  }

  function matchesQuery(item, query) {
    if (!query) return true
    const needle = query.toLowerCase()
    return (
      String(item.tex || '').toLowerCase().indexOf(needle) >= 0 ||
      String(item.zh || '').indexOf(query) >= 0 ||
      String(item.en || '').toLowerCase().indexOf(needle) >= 0
    )
  }

  function SymbolPanel(props) {
    const categories = paletteData()
    const [categoryId, setCategoryId] = useState(null)
    const [query, setQuery] = useState('')
    const [hoverId, setHoverId] = useState(null)
    const [toolbarHeight, setToolbarHeight] = useState(0)
    const hoverTimer = useRef(0)
    const toolbarRef = useRef(null)
    const active = categories.find(function (category) {
      return category.id === categoryId
    }) || categories[0]

    // keep the hover panel glued under the tile row, whatever the row height is
    useEffect(
      function () {
        const el = toolbarRef.current
        if (!el) return undefined
        const measure = function () {
          setToolbarHeight(el.offsetHeight)
        }
        measure()
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(measure)
          observer.observe(el)
          return function () {
            observer.disconnect()
          }
        }
        return undefined
      },
      [categories.length, query],
    )

    useEffect(
      function () {
        return function () {
          clearTimeout(hoverTimer.current)
        }
      },
      [],
    )

    /* the panel is docked to the pane bottom, so its height budget is whatever
       space is left under the drawer — it must not cover the tile row */
    const syncPopBudget = useCallback(function () {
      const toolbar = toolbarRef.current
      if (!toolbar) return
      const palette = toolbar.closest('.lx-pal')
      const drawer = toolbar.closest('.lx-drawer')
      const pane = toolbar.closest('.lx-ed-pane')
      if (!palette || !drawer || !pane) return
      // the drawer sits below the toolbar and the status strip, so the leftover
      // space is measured from the drawer's own bottom edge
      const belowDrawer = pane.clientHeight - (drawer.offsetTop + drawer.offsetHeight)
      const free = Math.min(belowDrawer - 24, pane.clientHeight * 0.6)
      palette.style.setProperty('--lx-pop-max', Math.max(120, Math.round(free)) + 'px')
    }, [])

    useEffect(
      function () {
        syncPopBudget()
      },
      [query, syncPopBudget],
    )

    const openHover = useCallback(
      function (id, element) {
        clearTimeout(hoverTimer.current)
        setHoverId(id)
        syncPopBudget()
        if (element && typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      },
      [syncPopBudget],
    )
    const closeHover = useCallback(function () {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = setTimeout(function () {
        setHoverId(null)
      }, 180)
    }, [])
    const keepHover = useCallback(function () {
      clearTimeout(hoverTimer.current)
    }, [])
    const hovered = categories.find(function (category) {
      return category.id === hoverId
    }) || null
    const hoverItems = useMemo(
      function () {
        if (!hovered) return []
        const out = []
        for (const group of hovered.groups || []) {
          for (const item of group.items || []) out.push(item)
        }
        return out
      },
      [hovered],
    )

    const searchItems = useMemo(
      function () {
        const needle = query.trim()
        if (!needle) return []
        const out = []
        for (const category of categories) {
          for (const group of category.groups || []) {
            for (const item of group.items || []) {
              if (matchesQuery(item, needle)) out.push(item)
            }
          }
        }
        return out.slice(0, 200)
      },
      [categories, query],
    )

    const visibleItems = useMemo(
      function () {
        if (!active) return []
        if (!query.trim()) {
          const out = []
          for (const group of active.groups || []) {
            for (const item of group.items || []) out.push(item)
          }
          return out
        }
        const out = []
        for (const category of categories) {
          for (const group of category.groups || []) {
            for (const item of group.items || []) {
              if (matchesQuery(item, query.trim())) out.push(item)
            }
          }
        }
        return out
      },
      [active, query, categories],
    )

    if (categories.length === 0) {
      return h(LX.ui.Empty, { icon: LX.icons.Grid, zh: '符号表尚未就绪', en: 'Symbol table unavailable' })
    }

    return h(
      'div',
      { className: 'lx-pal' },
      h(
        'div',
        { className: 'lx-pal-toolbar', ref: toolbarRef },
        h(QuickTools, {
          value: active && active.id,
          label: t('vis.pal.categories'),
          categories: categories,
          onChange: function (next) {
            setCategoryId(next)
          },
          onHover: openHover,
          onLeave: closeHover,
        }),
        h(
          'div',
          { className: 'lx-pal-search' },
          h(LX.ui.Input, {
            value: query,
            placeholder: t('vis.pal.search'),
            'aria-label': t('vis.pal.search'),
            onChange: function (event) {
              setQuery(event.target.value)
            },
          }),
        ),
        h(FormatBar, { onWrap: props.onWrap }),
      ),
      query.trim()
        ? h(
            'div',
            {
              className: 'lx-quick-pop',
              role: 'region',
              'aria-label': t('vis.pal.searchResults'),
            },
            h(
              'div',
              { className: 'lx-quick-pop-head' },
              h('span', { className: 'lx-quick-pop-title' }, t('vis.pal.searchResults')),
              h('span', { className: 'lx-quick-pop-count' }, t('vis.quick.count', { n: searchItems.length })),
            ),
            h(
              'div',
              { className: 'lx-quick-pop-body lx-scroll' },
              searchItems.length === 0
                ? h('p', { className: 'lx-pal-empty' }, t('vis.pal.noMatch'))
                : h(
                    'div',
                    { className: 'lx-pal-grid' },
                    searchItems.map(function (item, index) {
                      return h(SymbolButton, { key: item.tex + ':' + index, item: item, onInsert: props.onInsert })
                    }),
                  ),
            ),
          )
        : hovered
          ? h(
              'div',
              {
                className: 'lx-quick-pop',
                onMouseEnter: keepHover,
                onMouseLeave: closeHover,
                role: 'region',
                'aria-label': LX.pick(hovered),
              },
              h(
                'div',
                { className: 'lx-quick-pop-head' },
                h('span', { className: 'lx-quick-pop-title' }, LX.pick(hovered)),
                h('span', { className: 'lx-quick-pop-count' }, t('vis.quick.count', { n: hoverItems.length })),
              ),
              h('div', { className: 'lx-quick-pop-body lx-scroll' }, h(HoverGroups, { groups: hovered.groups || [], onInsert: props.onInsert })),
            )
          : null,
    )
  }

  /* ------------------------------------------------------- template panel */

  function TemplatePanel(props) {
    const templates = templateData()
    const [groupId, setGroupId] = useState(null)
    const groups = useMemo(
      function () {
        const seen = []
        for (const template of templates) {
          const id = template.group || 'basic'
          if (!seen.some((entry) => entry.id === id)) seen.push({ id, zh: template.groupZh || id, en: template.groupEn || id })
        }
        return seen
      },
      [templates],
    )
    const activeGroup = groupId || (groups[0] && groups[0].id) || 'basic'
    const visible = templates.filter(function (template) {
      return (template.group || 'basic') === activeGroup
    })

    useSvgUpgrades(visible, props.upgrade !== false)

    if (templates.length === 0) {
      return h(LX.ui.Empty, { icon: LX.icons.Matrix, zh: '模板尚未就绪', en: 'Templates unavailable' })
    }

    return h(
      'div',
      { className: 'lx-pal' },
      h(
        'div',
        { className: 'lx-pal-toolbar' },
        h(CategoryChips, {
          value: activeGroup,
          label: t('vis.tpl.categories'),
          options: groups,
          onChange: setGroupId,
        }),
      ),
      h(
        'div',
        { className: 'lx-pal-body lx-scroll' },
        h(
          'div',
          { className: 'lx-tpl-grid' },
          visible.map(function (template) {
            const markup = svgCache.get(template.tex)
            return h(
              'button',
              {
                key: template.id,
                type: 'button',
                className: 'lx-tpl-item',
                title: pick(template),
                'aria-label': pick(template),
                onMouseDown: function (event) {
                  event.preventDefault()
                },
                onClick: function () {
                  props.onInsert(template.tex, template.caret)
                },
              },
              h(
                'span',
                { className: 'lx-tpl-preview' },
                markup
                  ? h('span', { dangerouslySetInnerHTML: { __html: markup } })
                  : h('span', { className: 'lx-pal-tex' }, String(template.tex || '').replace(/§/g, '▮')),
              ),
              h('span', { className: 'lx-tpl-name' }, pick(template)),
            )
          }),
        ),
      ),
    )
  }

  /* ------------------------------------------------------ structure panel */

  const KIND_ICON = {
    command: 'Code',
    env: 'Layers',
    group: 'Grid',
    sup: 'Plus',
    sub: 'Plus',
    text: 'Doc',
    root: 'Sigma',
  }

  const ops = {
    wrap: function (tex, start, end, before, after) {
      if (LX.latex && typeof LX.latex.wrapSelection === 'function') return LX.latex.wrapSelection(tex, start, end, before, after)
      const body = String(tex || '')
      const left = Number.isFinite(start) ? start : body.length
      const right = Number.isFinite(end) ? end : left
      const next = body.slice(0, left) + before + body.slice(left, right) + after + body.slice(right)
      const caret = left + before.length
      return { text: next, selStart: caret, selEnd: caret + (right - left) }
    },
    deleteRange: function (tex, start, end) {
      const body = String(tex || '')
      const next = body.slice(0, start) + body.slice(end)
      return { text: next, selStart: start, selEnd: start }
    },
    replaceRange: function (tex, start, end, snippet) {
      const body = String(tex || '')
      const next = body.slice(0, start) + snippet + body.slice(end)
      return { text: next, selStart: start + snippet.length, selEnd: start + snippet.length }
    },
    insertRow: function (tex, node) {
      const body = String(tex || '')
      if (!node || node.kind !== 'env' || !node.name) return null
      const closeTag = '\\end{' + node.name + '}'
      const closeAt = body.indexOf(closeTag, node.start)
      if (closeAt < 0 || closeAt > node.end) return null
      let insertAt = closeAt
      while (insertAt > node.start && /\s/.test(body[insertAt - 1])) insertAt -= 1
      const head = body.slice(node.start, insertAt)
      const needsRows = head.trim().endsWith('\\\\')
      const snippet = (needsRows ? '' : ' \\\\ ') + ' \n'
      const next = body.slice(0, insertAt) + snippet + body.slice(insertAt)
      const caret = insertAt + snippet.length
      return { text: next, selStart: caret, selEnd: caret }
    },
  }

  const WRAP_ACTIONS = [
    { id: 'frac', zh: '分数', en: 'Fraction', before: '\\frac{', after: '}{}' },
    { id: 'sqrt', zh: '根号', en: 'Root', before: '\\sqrt{', after: '}' },
    { id: 'sup', zh: '上标', en: 'Superscript', before: '^{', after: '}' },
    { id: 'sub', zh: '下标', en: 'Subscript', before: '_{', after: '}' },
    { id: 'paren', zh: '括号', en: 'Parentheses', before: '\\left(', after: '\\right)' },
    { id: 'abs', zh: '绝对值', en: 'Absolute', before: '\\left|', after: '\\right|' },
    { id: 'brace', zh: '花括号', en: 'Braces', before: '\\left\\{', after: '\\right\\}' },
    { id: 'text', zh: '文本', en: 'Text', before: '\\text{', after: '}' },
    { id: 'bold', zh: '加粗', en: 'Bold', before: '\\mathbf{', after: '}' },
    { id: 'overline', zh: '上划线', en: 'Overline', before: '\\overline{', after: '}' },
  ]

  function StructurePanel(props) {
    const tex = props.tex || ''
    const selection = props.selection || { start: 0, end: 0 }
    const [activeIndex, setActiveIndex] = useState(null)
    const [deferred, setDeferred] = useState(tex)

    useEffect(
      function () {
        const timer = setTimeout(function () {
          setDeferred(tex)
        }, 160)
        return function () {
          clearTimeout(timer)
        }
      },
      [tex],
    )

    const rows = useMemo(
      function () {
        const latex = LX.latex
        if (!latex || typeof latex.outline !== 'function') return []
        try {
          return latex.outline(deferred) || []
        } catch {
          return []
        }
      },
      [deferred],
    )

    const active = activeIndex === null ? null : rows[activeIndex] || null
    const range = active
      ? { start: active.start, end: active.end }
      : { start: selection.start, end: selection.end }

    const commit = useCallback(
      function (result) {
        if (!result || typeof props.onCommit !== 'function') return
        props.onCommit(result.text, result.selStart, result.selEnd)
      },
      [props.onCommit],
    )

    return h(
      'div',
      { className: 'lx-tree' },
      h(
        'div',
        { className: 'lx-tree-head' },
        h('span', { className: 'lx-tree-count' }, t('vis.structure.count', { n: rows.length })),
        active
          ? h(
              'span',
              { className: 'lx-tree-range' },
              pick(active.label) + '  [' + active.start + ', ' + active.end + ']',
            )
          : h('span', { className: 'lx-tree-range' }, t('vis.structure.hint')),
      ),
      h(
        'div',
        { className: 'lx-tree-body lx-scroll' },
        rows.length === 0
          ? h('p', { className: 'lx-pal-empty' }, t('vis.structure.empty'))
          : h(
              'ul',
              { className: 'lx-tree-list', role: 'tree' },
              rows.map(function (row, index) {
                const iconName = KIND_ICON[row.kind] || 'Code'
                const Icon = LX.icons[iconName] || LX.icons.Code
                const snippet = String(row.tex || '').replace(/\s+/g, ' ').slice(0, 60)
                const selected = index === activeIndex
                const overlapping = !selected && row.end > selection.start && row.start < selection.end && selection.end > selection.start
                return h(
                  'li',
                  {
                    key: row.start + ':' + row.end + ':' + index,
                    className: LX.cx('lx-tree-row', selected && 'lx-tree-row--on', overlapping && 'lx-tree-row--near'),
                    style: { paddingLeft: 6 + Math.min(row.depth, 9) * 11 },
                    role: 'treeitem',
                    'aria-selected': selected,
                    onClick: function () {
                      setActiveIndex(index)
                      if (typeof props.onSelect === 'function') props.onSelect(row.start, row.end)
                    },
                  },
                  h(Icon, { size: 13 }),
                  h('span', { className: 'lx-tree-label' }, pick(row.label)),
                  h('span', { className: 'lx-tree-tex' }, snippet),
                )
              }),
            ),
      ),
      h(
        'div',
        { className: 'lx-tree-ops' },
        WRAP_ACTIONS.map(function (action) {
          return h(
            'button',
            {
              key: action.id,
              type: 'button',
              className: 'lx-tree-op',
              onClick: function () {
                commit(ops.wrap(tex, range.start, range.end, action.before, action.after))
              },
            },
            pick(action),
          )
        }),
        h(
          'button',
          {
            type: 'button',
            className: 'lx-tree-op lx-tree-op--wide',
            onClick: function () {
              const result = ops.insertRow(tex, active)
              if (result) commit(result)
              else LX.toast(t('vis.structure.rowUnavailable'), 'warn')
            },
            title: t('vis.structure.addRowHint'),
          },
          t('vis.structure.addRow'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'lx-tree-op lx-tree-op--wide',
            onClick: function () {
              if (range.end <= range.start) {
                LX.toast(t('vis.structure.nothing'), 'warn')
                return
              }
              commit(ops.deleteRange(tex, range.start, range.end))
            },
          },
          t('vis.structure.remove'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'lx-tree-op lx-tree-op--wide',
            onClick: function () {
              const snippet = tex.slice(range.start, range.end)
              if (!snippet.trim()) {
                LX.toast(t('vis.structure.nothing'), 'warn')
                return
              }
              LX.util.copyText(snippet).then(function (ok) {
                LX.toast(ok ? t('vis.structure.copied') : t('common.copyFailed'), ok ? 'success' : 'error')
              })
            },
          },
          t('vis.structure.copy'),
        ),
      ),
    )
  }

  /* ------------------------------------------------------------ dictionary */

  LX.addDict('zh', {
    'vis.pal.search': '搜索符号或命令',
    'vis.pal.categories': '符号分类',
    'vis.quick.mark': '…',
    'vis.quick.count': '{n} symbols',
    'vis.pal.searchResults': 'Search results',
    'vis.fmt.color': 'Colour',
    'vis.fmt.applyColor': 'Colour',
    'vis.fmt.family': 'Font',
    'vis.fmt.size': 'Size',
    'vis.quick.count': '{n} 个符号',
    'vis.pal.searchResults': '搜索结果',
    'vis.fmt.color': '颜色',
    'vis.fmt.applyColor': '上色',
    'vis.fmt.family': '字体',
    'vis.fmt.size': '字号',
    'vis.tpl.categories': '模板分组',
    'vis.pal.noMatch': '没有匹配的符号',
    'vis.structure.count': '{n} 个节点',
    'vis.structure.hint': '选中一段源码可包裹',
    'vis.structure.empty': '还没有结构可显示',
    'vis.structure.addRow': '环境加一行',
    'vis.structure.addRowHint': '仅对 matrix / cases / aligned 等环境生效',
    'vis.structure.rowUnavailable': '请先选择一个环境节点',
    'vis.structure.remove': '删除选中',
    'vis.structure.copy': '复制片段',
    'vis.structure.copied': '片段已复制',
    'vis.structure.nothing': '当前没有选中内容',
  })
  LX.addDict('en', {
    'vis.pal.search': 'Search symbols or commands',
    'vis.pal.categories': 'Symbol categories',
    'vis.quick.mark': '…',
    'vis.quick.count': '{n} symbols',
    'vis.pal.searchResults': 'Search results',
    'vis.fmt.color': 'Colour',
    'vis.fmt.applyColor': 'Colour',
    'vis.fmt.family': 'Font',
    'vis.fmt.size': 'Size',
    'vis.quick.count': '{n} 个符号',
    'vis.pal.searchResults': '搜索结果',
    'vis.fmt.color': '颜色',
    'vis.fmt.applyColor': '上色',
    'vis.fmt.family': '字体',
    'vis.fmt.size': '字号',
    'vis.tpl.categories': 'Template groups',
    'vis.pal.noMatch': 'No matching symbol',
    'vis.structure.count': '{n} nodes',
    'vis.structure.hint': 'Select source to wrap it',
    'vis.structure.empty': 'Nothing to show yet',
    'vis.structure.addRow': 'Add row',
    'vis.structure.addRowHint': 'Works for matrix / cases / aligned environments',
    'vis.structure.rowUnavailable': 'Select an environment node first',
    'vis.structure.remove': 'Delete selection',
    'vis.structure.copy': 'Copy fragment',
    'vis.structure.copied': 'Fragment copied',
    'vis.structure.nothing': 'Nothing is selected',
  })

  LX.addCss(`
.lx-pal{display:flex;flex-direction:column;height:auto;min-height:0;min-width:0;width:100%;}
.lx-pal-toolbar{display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;min-width:0;}
.lx-pal-cats{flex:1;min-width:0;overflow-x:auto;overflow-y:hidden;display:flex;scrollbar-width:none;}
.lx-pal-cats::-webkit-scrollbar{display:none;}
.lx-pal-search{width:190px;flex:none;}
.lx-pal-body{flex:1 1 0%;min-height:0;min-width:0;padding:8px 10px 14px;}
.lx-pal-group{margin:4px 0 10px;}
.lx-pal-groupname{margin:0 0 5px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);}
.lx-pal-grid{display:flex;flex-wrap:wrap;gap:4px;}
.lx-pal-item{min-width:38px;height:34px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;transition:background .1s,border-color .1s,transform .06s;overflow:hidden;}
.lx-pal-item:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-brand-primary);}
.lx-pal-item:active{transform:scale(.97);}
.lx-pal-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.lx-pal-face{display:inline-flex;align-items:center;justify-content:center;max-width:64px;max-height:26px;overflow:hidden;}
.lx-pal-face svg{max-width:64px;max-height:26px;height:auto;width:auto;}
.lx-pal-glyph{font-size:17px;line-height:1;font-family:"Segoe UI Symbol","Cambria Math","STIX Two Math",serif;}
.lx-pal-tex{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.lx-pal-empty{margin:10px 2px;font-size:12px;color:var(--dsw-alias-label-secondary);}
.lx-tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px;}
.lx-tpl-item{display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:7px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;text-align:left;transition:border-color .12s,background .12s;}
.lx-tpl-item:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);}
.lx-tpl-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.lx-tpl-preview{display:flex;align-items:center;justify-content:center;min-height:26px;overflow:hidden;color:var(--dsw-alias-label-primary);}
.lx-tpl-preview svg{max-width:150px;max-height:34px;height:auto;width:auto;}
.lx-tpl-name{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lx-tree{display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;}
.lx-tree-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;font-size:11.5px;color:var(--dsw-alias-label-secondary);}
.lx-tree-count{font-variant-numeric:tabular-nums;}
.lx-tree-range{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lx-tree-body{flex:1;min-height:0;padding:4px 6px;}
.lx-tree-list{list-style:none;margin:0;padding:0;}
.lx-tree-row{display:flex;align-items:center;gap:6px;height:25px;padding-right:8px;border-radius:6px;cursor:pointer;color:var(--dsw-alias-label-secondary);overflow:hidden;}
.lx-tree-row:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.lx-tree-row--near{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent);color:var(--dsw-alias-label-primary);}
.lx-tree-row--on{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent);color:var(--dsw-alias-label-primary);font-weight:500;}
.lx-tree-label{flex:none;max-width:44%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;}
.lx-tree-tex{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;opacity:.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lx-tree-ops{flex:none;display:flex;flex-wrap:wrap;gap:4px;padding:7px 10px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}
.lx-tree-op{height:24px;padding:0 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:11.5px;cursor:pointer;}
.lx-tree-op:hover{border-color:var(--dsw-alias-brand-primary);}
.lx-tree-op:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.lx-tree-op--wide{padding:0 10px;color:var(--dsw-alias-label-secondary);}
`)

  LX.visual = {
    SymbolPanel,
    QuickTools,
    TemplatePanel,
    StructurePanel,
    ops,
    wrapActions: WRAP_ACTIONS,
    clearRenderCache: function () {
      svgCache.clear()
    },
  }
})()
