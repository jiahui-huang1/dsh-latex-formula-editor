/**
 * @local/dsh-latex-editor — lib/45-convert.js
 *
 * Real converters for the export menu, so "输出代码" never falls back to the
 * raw LaTeX source:
 *   · texToAsciiMath(tex)      LaTeX → AsciiMath (subset, common constructs)
 *   · texToTypst(tex)          LaTeX → Typst math (subset, common constructs)
 *   · mathmlToOmml(mathml)     MathML (MathJax output) → OMML (Word)
 */
;(function () {
  'use strict'
  const LX = window.__LX
  if (!LX) return

  const BS = String.fromCharCode(92)

  /* ------------------------------------------------------------ AsciiMath */

  const AM_SYMBOLS = {
    alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon',
    varepsilon: 'varepsilon', zeta: 'zeta', eta: 'eta', theta: 'theta', vartheta: 'vartheta',
    iota: 'iota', kappa: 'kappa', lambda: 'lambda', mu: 'mu', nu: 'nu', xi: 'xi', pi: 'pi',
    rho: 'rho', sigma: 'sigma', tau: 'tau', upsilon: 'upsilon', phi: 'phi', varphi: 'varphi',
    chi: 'chi', psi: 'psi', omega: 'omega',
    Gamma: 'Gamma', Delta: 'Delta', Theta: 'Theta', Lambda: 'Lambda', Xi: 'Xi', Pi: 'Pi',
    Sigma: 'Sigma', Upsilon: 'Upsilon', Phi: 'Phi', Psi: 'Psi', Omega: 'Omega',
    times: 'xx', div: '-:', cdot: '*', pm: '+-', mp: '-+', ast: '**', star: '**',
    le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=', approx: '~~',
    equiv: '-=', sim: '~', propto: 'prop', infty: 'oo', partial: 'del', nabla: 'grad',
    forall: 'AA', exists: 'EE', emptyset: 'O/', in: 'in', notin: 'notin', cap: 'nn',
    cup: 'uu', subset: 'sub', supset: 'sup', subseteq: 'sube', supseteq: 'supe',
    to: '->', rightarrow: '->', leftarrow: '<-', Rightarrow: '=>', Leftarrow: '<=',
    leftrightarrow: '<->', mapsto: '|->', uparrow: 'uarr', downarrow: 'darr',
    sum: 'sum', prod: 'prod', int: 'int', iint: 'iint', iiint: 'iiint', oint: 'oint',
    lim: 'lim', sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
    log: 'log', ln: 'ln', exp: 'exp', max: 'max', min: 'min',
    ldots: '...', cdots: '...', dots: '...', prime: "'",
    langle: '(:', rangle: ':)', lfloor: '|__', rfloor: '__|', lceil: '|~', rceil: '~|',
    lvert: '|', rvert: '|', lVert: '||', rVert: '||',
    quad: '  ', qquad: '    ', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ',
  }

  /** Read one balanced `{…}` group (or a single token) starting at `i`. */
  function readArg(src, i) {
    let j = i
    while (j < src.length && /\s/.test(src[j])) j += 1
    if (src[j] !== '{') {
      if (src[j] === BS) {
        const m = /^\\([A-Za-z]+|.)/.exec(src.slice(j))
        return { body: m ? m[0] : src[j], next: j + (m ? m[0].length : 1) }
      }
      return { body: src[j] || '', next: j + 1 }
    }
    let depth = 0
    let k = j
    for (; k < src.length; k += 1) {
      const ch = src[k]
      if (ch === BS) {
        k += 1
        continue
      }
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          k += 1
          break
        }
      }
    }
    return { body: src.slice(j + 1, k - 1), next: k }
  }

  function ascii(src) {
    let out = ''
    let i = 0
    while (i < src.length) {
      const ch = src[i]
      if (ch === BS) {
        const m = /^\\([A-Za-z]+)/.exec(src.slice(i))
        const name = m ? m[1] : src[i + 1]
        const after = i + (m ? m[0].length : 2)
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
          const a = readArg(src, after)
          const b = readArg(src, a.next)
          out += '((' + ascii(a.body) + ')/(' + ascii(b.body) + '))'
          i = b.next
          continue
        }
        if (name === 'sqrt') {
          let k = after
          let root = ''
          while (k < src.length && /\s/.test(src[k])) k += 1
          if (src[k] === '[') {
            const close = src.indexOf(']', k)
            root = ascii(src.slice(k + 1, close))
            k = close + 1
          }
          const a = readArg(src, k)
          out += 'sqrt(' + ascii(a.body) + ')' + (root ? 'root(' + root + ',)' : '')
          i = a.next
          continue
        }
        if (name === 'text' || name === 'mathrm' || name === 'mathbf' || name === 'mathit' || name === 'operatorname') {
          const a = readArg(src, after)
          out += '"' + a.body + '"'
          i = a.next
          continue
        }
        if (name === 'left' || name === 'right' || name === 'big' || name === 'Big') {
          i = after
          continue
        }
        if (AM_SYMBOLS[name] !== undefined) {
          out += AM_SYMBOLS[name]
          i = after
          continue
        }
        out += name
        i = after
        continue
      }
      if (ch === '{' || ch === '}') {
        i += 1
        continue
      }
      if (ch === '^') {
        const a = readArg(src, i + 1)
        out += '^' + '(' + ascii(a.body) + ')'
        i = a.next
        continue
      }
      if (ch === '_') {
        const a = readArg(src, i + 1)
        out += '_' + '(' + ascii(a.body) + ')'
        i = a.next
        continue
      }
      if (ch === '~') {
        out += ' '
        i += 1
        continue
      }
      out += ch
      i += 1
    }
    return out.replace(/\s+/g, ' ').trim()
  }

  /* ----------------------------------------------------------------- Typst */

  const TYPST_SYMBOLS = {
    alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon',
    varepsilon: 'epsilon.alt', zeta: 'zeta', eta: 'eta', theta: 'theta', vartheta: 'theta.alt',
    iota: 'iota', kappa: 'kappa', lambda: 'lambda', mu: 'mu', nu: 'nu', xi: 'xi', pi: 'pi',
    rho: 'rho', sigma: 'sigma', tau: 'tau', upsilon: 'upsilon', phi: 'phi', varphi: 'phi.alt',
    chi: 'chi', psi: 'psi', omega: 'omega',
    Gamma: 'Gamma', Delta: 'Delta', Theta: 'Theta', Lambda: 'Lambda', Xi: 'Xi', Pi: 'Pi',
    Sigma: 'Sigma', Upsilon: 'Upsilon', Phi: 'Phi', Psi: 'Psi', Omega: 'Omega',
    times: 'times', div: 'div', cdot: 'dot.op', pm: 'plus.minus', mp: 'minus.plus',
    le: 'lt.eq', leq: 'lt.eq', ge: 'gt.eq', geq: 'gt.eq', ne: 'neq', neq: 'neq',
    approx: 'approx', equiv: 'equiv', sim: 'tilde.op', propto: 'prop',
    infty: 'infinity', partial: 'diff', nabla: 'nabla', forall: 'forall', exists: 'exists',
    emptyset: 'emptyset', in: 'in', notin: 'in.not', cap: 'sect', cup: 'union',
    subset: 'subset', supset: 'supset', subseteq: 'subset.eq', supseteq: 'supset.eq',
    to: 'arrow.r', rightarrow: 'arrow.r', leftarrow: 'arrow.l', Rightarrow: 'arrow.r.double',
    Leftarrow: 'arrow.l.double', leftrightarrow: 'arrow.l.r', mapsto: 'arrow.r.bar',
    sum: 'sum', prod: 'product', int: 'integral', iint: 'integral.double',
    iiint: 'integral.triple', oint: 'integral.cont', lim: 'lim', sin: 'sin', cos: 'cos',
    tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc', log: 'log', ln: 'ln', exp: 'exp',
    max: 'max', min: 'min', ldots: 'dots.h', cdots: 'dots.h.c', dots: 'dots.h',
  }

  function typst(src) {
    let out = ''
    let i = 0
    while (i < src.length) {
      const ch = src[i]
      if (ch === BS) {
        const m = /^\\([A-Za-z]+)/.exec(src.slice(i))
        const name = m ? m[1] : src[i + 1]
        const after = i + (m ? m[0].length : 2)
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
          const a = readArg(src, after)
          const b = readArg(src, a.next)
          out += 'frac(' + typst(a.body) + ', ' + typst(b.body) + ')'
          i = b.next
          continue
        }
        if (name === 'sqrt') {
          let k = after
          let root = ''
          while (k < src.length && /\s/.test(src[k])) k += 1
          if (src[k] === '[') {
            const close = src.indexOf(']', k)
            root = typst(src.slice(k + 1, close))
            k = close + 1
          }
          const a = readArg(src, k)
          out += 'root(' + (root ? root + ', ' : '') + typst(a.body) + ')'
          i = a.next
          continue
        }
        if (name === 'text' || name === 'mathrm' || name === 'operatorname') {
          const a = readArg(src, after)
          out += '"' + a.body + '"'
          i = a.next
          continue
        }
        if (name === 'mathbf') {
          const a = readArg(src, after)
          out += 'bold(' + typst(a.body) + ')'
          i = a.next
          continue
        }
        if (name === 'mathit') {
          const a = readArg(src, after)
          out += 'italic(' + typst(a.body) + ')'
          i = a.next
          continue
        }
        if (name === 'left' || name === 'right' || name === 'big' || name === 'Big') {
          i = after
          continue
        }
        if (TYPST_SYMBOLS[name] !== undefined) {
          out += TYPST_SYMBOLS[name] + ' '
          i = after
          continue
        }
        out += name + ' '
        i = after
        continue
      }
      if (ch === '{' || ch === '}') {
        i += 1
        continue
      }
      if (ch === '^') {
        const a = readArg(src, i + 1)
        out += '^(' + typst(a.body) + ')'
        i = a.next
        continue
      }
      if (ch === '_') {
        const a = readArg(src, i + 1)
        out += '_(' + typst(a.body) + ')'
        i = a.next
        continue
      }
      if (ch === '~') {
        out += ' '
        i += 1
        continue
      }
      out += ch
      i += 1
    }
    return out.replace(/\s+/g, ' ').replace(/\s+([,)])(?![^(]*\))/g, '$1').trim()
  }

  /* ------------------------------------------------------------------ OMML */

  const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

  function esc(text) {
    return String(text)
      .split('&').join('&amp;')
      .split('<').join('&lt;')
      .split('>').join('&gt;')
  }

  function run(text, style) {
    const rPr = style ? '<m:rPr><m:sty m:val="' + style + '"/></m:rPr>' : ''
    return '<m:r>' + rPr + '<m:t xml:space="preserve">' + esc(text) + '</m:t></m:r>'
  }

  /** Recursively convert a MathJax `<math>` subtree into OMML fragments. */
  function conv(node) {
    if (!node) return ''
    const tag = (node.localName || node.nodeName || '').toLowerCase()
    const kids = Array.from(node.children || [])
    const inner = function () {
      return kids.map(conv).join('')
    }
    const argOf = function (name) {
      const found = kids.filter(function (child) {
        return (child.localName || '').toLowerCase() === name
      })[0]
      return found ? conv(found) : ''
    }
    switch (tag) {
      case 'math':
      case 'semantics':
      case 'mrow':
      case 'mstyle':
      case 'mpadded':
      case 'mphantom':
      case 'mtd':
      case 'mtr':
        return inner()
      case 'mi': {
        const text = node.textContent || ''
        const style = /^[A-Za-z]$/.test(text) ? 'i' : 'p'
        return run(text, style)
      }
      case 'mn':
        return run(node.textContent || '', 'p')
      case 'mo':
      case 'mtext':
        return run(node.textContent || '', 'p')
      case 'mspace':
        return run(' ', 'p')
      case 'mfrac':
        return '<m:f><m:num>' + argOf('numerator') + '</m:num><m:den>' + argOf('denominator') + '</m:den></m:f>'
      case 'msqrt':
        return '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>' + inner() + '</m:e></m:rad>'
      case 'mroot':
        return '<m:rad><m:deg>' + argOf('numerator') + '</m:deg><m:e>' + argOf('denominator') + '</m:e></m:rad>'
      case 'msup':
        return '<m:sSup><m:e>' + argOf('base') + '</m:e><m:sup>' + argOf('superscript') + '</m:sup></m:sSup>'
      case 'msub':
        return '<m:sSub><m:e>' + argOf('base') + '</m:e><m:sub>' + argOf('subscript') + '</m:sub></m:sSub>'
      case 'msubsup':
        return '<m:sSubSup><m:e>' + argOf('base') + '</m:e><m:sub>' + argOf('subscript') + '</m:sub><m:sup>' + argOf('superscript') + '</m:sup></m:sSubSup>'
      case 'mover':
        return '<m:limUpp><m:e>' + argOf('base') + '</m:e><m:lim>' + argOf('over') + '</m:lim></m:limUpp>'
      case 'munder':
        return '<m:limLow><m:e>' + argOf('base') + '</m:e><m:lim>' + argOf('under') + '</m:lim></m:limLow>'
      case 'munderover':
        return '<m:limLow><m:e><m:limUpp><m:e>' + argOf('base') + '</m:e><m:lim>' + argOf('over') + '</m:lim></m:limUpp></m:e><m:lim>' + argOf('under') + '</m:lim></m:limLow>'
      case 'mfenced':
        return run('(', 'p') + inner() + run(')', 'p')
      case 'mtable':
        return (
          '<m:eqArr>' +
          kids.map(function (row) {
            return '<m:e>' + conv(row) + '</m:e>'
          }).join('') +
          '</m:eqArr>'
        )
      case 'mtr':
        return inner()
      default:
        return inner()
    }
  }

  function mathmlToOmml(mathml) {
    const text = String(mathml || '')
    if (!text.trim()) throw new Error('empty MathML')
    const doc = new DOMParser().parseFromString(text, 'text/xml')
    const root = doc.querySelector('math')
    if (!root) throw new Error('no <math> element')
    const body = conv(root)
    return (
      '<m:oMathPara xmlns:m="' + OMML_NS + '" xmlns:w="' + W_NS + '">' +
      '<m:oMath>' + body + '</m:oMath></m:oMathPara>'
    )
  }

  LX.convert = {
    texToAsciiMath: function (tex) {
      return ascii(String(tex || ''))
    },
    texToTypst: function (tex) {
      return typst(String(tex || ''))
    },
    mathmlToOmml: mathmlToOmml,
  }
})()
