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

  /** Split on a top-level separator (ignores `\…`, `{…}` and `[…]`). */
  function splitTop(src, separator) {
    const parts = []
    let depth = 0
    let start = 0
    for (let i = 0; i < src.length; i += 1) {
      if (depth === 0 && src.slice(i, i + separator.length) === separator) {
        parts.push(src.slice(start, i))
        i += separator.length - 1
        start = i + 1
        continue
      }
      const ch = src[i]
      if (ch === BS) {
        i += 1
        continue
      }
      if (ch === '{' || ch === '(' || ch === '[') depth += 1
      else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    }
    parts.push(src.slice(start))
    return parts
  }

  /** Read `\begin{env} … \end{env}` starting right after `\begin`. */
  function readEnv(src, after) {
    const nameArg = readArg(src, after)
    const name = String(nameArg.body || '').trim()
    const endTag = BS + 'end{' + name + '}'
    const endAt = src.indexOf(endTag, nameArg.next)
    return {
      name: name,
      body: endAt >= 0 ? src.slice(nameArg.next, endAt) : src.slice(nameArg.next),
      next: endAt >= 0 ? endAt + endTag.length : src.length,
    }
  }

  /** Environments turned into a real matrix expression by both converters. */
  const MATRIX_ENVS = { pmatrix: 1, bmatrix: 1, vmatrix: 1, matrix: 1 }

  /** Environments the Typst converter turns into exact Typst math. */
  const TYPST_ENVS = { pmatrix: 1, bmatrix: 1, vmatrix: 1, matrix: 1, cases: 1, aligned: 1 }

  function matrixRows(body) {
    return splitTop(body, BS + BS)
      .map(function (row) {
        return splitTop(row, '&')
          .map(function (cell) {
            return String(cell || '').trim()
          })
          .filter(function (cell) {
            return cell.length > 0
          })
      })
      .filter(function (row) {
        return row.length > 0
      })
  }

  function unsupportedEnvs(src, target) {
    const supported = target === 'typst' ? TYPST_ENVS : MATRIX_ENVS
    const text = String(src || '')
    const re = new RegExp(BS + BS + 'begin\\s*\\{\\s*([A-Za-z]+)\\s*\\}', 'g')
    const found = []
    let match = re.exec(text)
    while (match) {
      const name = match[1]
      if (!supported[name] && found.indexOf(name) < 0) found.push(name)
      match = re.exec(text)
    }
    return found
  }

  function asciiMatrix(env, body) {
    const rows = matrixRows(body).map(function (row) {
      return (
        '(' +
        row
          .map(function (cell) {
            return ascii(cell)
          })
          .join(',') +
        ')'
      )
    })
    const content = rows.join(',')
    if (env === 'bmatrix') return '[' + content + ']'
    if (env === 'vmatrix') return '|' + content + '|'
    /* pmatrix / plain matrix: AsciiMath renders `((a,b),(c,d))` as a matrix;
       the outer parens are grouping, so no delimiters are drawn. */
    return '(' + content + ')'
  }

  function typstMatrix(env, body) {
    const rows = matrixRows(body)
      .map(function (row) {
        return row
          .map(function (cell) {
            return typst(cell)
          })
          .join(', ')
      })
      .join('; ')
    const delim = { pmatrix: 'delim: "(", ', bmatrix: 'delim: "[", ', vmatrix: 'delim: "|", ' }[env] || ''
    return 'mat(' + delim + rows + ')'
  }

  /** `cases` becomes Typst's own `cases`; `& quad` keeps the two columns apart. */
  function typstCases(body) {
    const rows = matrixRows(body).map(function (row) {
      return row
        .map(function (cell) {
          return typst(cell)
        })
        .join(' & quad ')
    })
    return 'cases(' + rows.join(', ') + ')'
  }

  /**
   * Small mhchem subset: element symbols upright, digits after a symbol become
   * subscripts, arrows map to Typst arrows, and a `[label]` above an arrow
   * becomes its superscript.
   */
  function typstChem(body) {
    const arrows = {
      '->': 'arrow.r',
      '<-': 'arrow.l',
      '<=>': 'arrow.l.r.double',
      '<->': 'arrow.l.r',
    }
    let out = ''
    let i = 0
    while (i < body.length) {
      const rest = body.slice(i)
      const mText = /^\\(?:text|mathrm|operatorname)\s*\{([^{}]*)\}/.exec(rest)
      if (mText) {
        out += '"' + mText[1] + '" '
        i += mText[0].length
        continue
      }
      const mArrow = /^(<=>|<->|->|<-)/.exec(rest)
      if (mArrow) {
        i += mArrow[0].length
        let label = ''
        const mLabel = /^\s*\[([^\]]*)\]/.exec(body.slice(i))
        if (mLabel) {
          label = '^(' + typstChem(mLabel[1]) + ')'
          i += mLabel[0].length
        }
        out += arrows[mArrow[0]] + label + ' '
        continue
      }
      const mElem = /^([A-Z][a-z]?)(\d*)/.exec(rest)
      if (mElem) {
        /* No trailing space: `"H"_2"O"` is what makes H₂O read as one formula. */
        out += '"' + mElem[1] + '"' + (mElem[2] ? '_' + mElem[2] : '')
        i += mElem[0].length
        continue
      }
      const mCharge = /^\^\{([^{}]*)\}/.exec(rest) || /^\^([0-9]*[+-]?)/.exec(rest)
      if (mCharge) {
        out += '^(' + (mCharge[1] !== undefined ? mCharge[1] : mCharge[2]) + ') '
        i += mCharge[0].length
        continue
      }
      const mDigits = /^\d+/.exec(rest)
      if (mDigits) {
        out += mDigits[0] + ' '
        i += mDigits[0].length
        continue
      }
      const ch = body[i]
      if (ch === '{' || ch === '}') {
        i += 1
        continue
      }
      out += ch + ' '
      i += 1
    }
    return out.replace(/\s+/g, ' ').trim()
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
          const body = ascii(a.body)
          out += root ? 'root(' + root + ')(' + body + ')' : 'sqrt(' + body + ')'
          i = a.next
          continue
        }
        if (name === 'text' || name === 'mathrm' || name === 'mathbf' || name === 'mathit' || name === 'operatorname') {
          const a = readArg(src, after)
          out += '"' + a.body + '"'
          i = a.next
          continue
        }
        if (name === 'mathbb' || name === 'mathcal' || name === 'mathfrak' || name === 'mathsf' || name === 'mathtt' || name === 'boldsymbol') {
          const a = readArg(src, after)
          const wrapped = {
            mathbb: 'bb', mathcal: 'cal', mathfrak: 'frak',
            mathsf: 'sf', mathtt: 'tt', boldsymbol: 'bb',
          }[name]
          out += wrapped + '(' + ascii(a.body) + ')'
          i = a.next
          continue
        }
        if (name === 'begin') {
          const env = readEnv(src, after)
          i = env.next
          if (MATRIX_ENVS[env.name]) {
            out += asciiMatrix(env.name, env.body)
          } else {
            /* Unknown environment: keep the body so content is not lost. */
            out += ascii(env.body)
          }
          continue
        }
        if (name === 'end') {
          const a = readArg(src, after)
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
    infty: 'infinity', partial: 'partial', nabla: 'nabla', forall: 'forall', exists: 'exists',
    emptyset: 'emptyset', in: 'in', notin: 'in.not', cap: 'sect', cup: 'union',
    subset: 'subset', supset: 'supset', subseteq: 'subset.eq', supseteq: 'supset.eq',
    to: 'arrow.r', rightarrow: 'arrow.r', leftarrow: 'arrow.l', Rightarrow: 'arrow.r.double',
    Leftarrow: 'arrow.l.double', leftrightarrow: 'arrow.l.r', mapsto: 'arrow.r.bar',
    sum: 'sum', prod: 'product', int: 'integral', iint: 'integral.double',
    iiint: 'integral.triple', oint: 'integral.cont', lim: 'lim', sin: 'sin', cos: 'cos',
    tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc', log: 'log', ln: 'ln', exp: 'exp',
    max: 'max', min: 'min', ldots: 'dots.h', cdots: 'dots.h.c', dots: 'dots.h',
    quad: 'quad', qquad: 'quad quad',
  }

  /* LaTeX commands whose Typst function has the same name and arity-by-juxtaposition. */
  const TYPST_PASSTHROUGH = {
    overline: 1, underline: 1, hat: 1, tilde: 1, bar: 1, dot: 1, ddot: 1, vec: 1,
    binom: 1, mod: 1, gcd: 1, lcm: 1, deg: 1, abs: 1, floor: 1, ceil: 1, round: 1,
    '|': 1,
  }

  /* Pure formatting commands that carry no content of their own. */
  const TYPST_SKIP = {
    displaystyle: 1, textstyle: 1, scriptstyle: 1, scriptscriptstyle: 1,
    limits: 1, nolimits: 1, mathop: 1, mathrel: 1, mathbin: 1, mathord: 1,
    mathopen: 1, mathclose: 1, mathpunct: 1, phantom: 1, hphantom: 1,
    vphantom: 1, smash: 1, strut: 1,
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
          out += root
            ? 'root(' + root + ', ' + typst(a.body) + ')'
            : 'sqrt(' + typst(a.body) + ')'
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
        if (name === 'mathbb' || name === 'mathcal' || name === 'mathfrak' || name === 'boldsymbol') {
          const a = readArg(src, after)
          const wrapped = { mathbb: 'bb', mathcal: 'cal', mathfrak: 'frak', boldsymbol: 'bold' }[name]
          out += wrapped + '(' + typst(a.body) + ')'
          i = a.next
          continue
        }
        if (name === 'begin') {
          const env = readEnv(src, after)
          i = env.next
          if (env.name === 'cases') {
            out += typstCases(env.body) + ' '
          } else if (MATRIX_ENVS[env.name]) {
            out += typstMatrix(env.name, env.body) + ' '
          } else {
            out += typst(env.body)
          }
          continue
        }
        /* physics package: \dv{f}{x} → frac("d" f, "d" x); \pdv uses partial. */
        if (name === 'dv' || name === 'pdv') {
          const a = readArg(src, after)
          const b = readArg(src, a.next)
          const d = name === 'pdv' ? 'partial' : '"d"'
          out += 'frac(' + d + ' ' + typst(a.body) + ', ' + d + ' ' + typst(b.body) + ')'
          i = b.next
          continue
        }
        /* mhchem: \ce{H2O ->[\text{heat}] H2 + O2} */
        if (name === 'ce' || name === 'pu') {
          const a = readArg(src, after)
          out += typstChem(a.body) + ' '
          i = a.next
          continue
        }
        /*
         * cancel/bcancel/xcancel: Typst draws the strike in markup, so simple
         * bodies (no further commands) go through `#strike[...]`; anything with
         * TeX inside keeps its math and drops only the strike.
         */
        if (name === 'cancel' || name === 'bcancel' || name === 'xcancel') {
          const a = readArg(src, after)
          const body = a.body
          if (body.indexOf(BS) >= 0) out += typst(body) + ' '
          else out += '#strike[' + body + '] '
          i = a.next
          continue
        }
        if (name === 'end') {
          const a = readArg(src, after)
          i = a.next
          continue
        }
        if (name === 'left' || name === 'right' || name === 'big' || name === 'Big') {
          i = after
          continue
        }
        if (TYPST_SYMBOLS[name] !== undefined) {
          /* `x` + `lt.eq` would glue into one identifier, so keep them apart. */
          if (/[A-Za-z0-9]$/.test(out)) out += ' '
          out += TYPST_SYMBOLS[name] + ' '
          i = after
          continue
        }
        /* Row separator `\\`: Typst breaks a line with a single backslash. */
        if (name === '\\') {
          out += ' \\ '
          i = after
          continue
        }
        /* Spacing commands: \, \; \: \! and the escaped space. */
        if (name === ',' || name === ';' || name === ':' || name === '!' || name === ' ') {
          if (name === ',' || name === ' ') out += 'thin '
          else if (name !== '!') out += 'med '
          i = after
          continue
        }
        /* LaTeX commands that are also Typst functions with the same name. */
        if (TYPST_PASSTHROUGH[name]) {
          if (/[A-Za-z0-9]$/.test(out)) out += ' '
          out += name + ' '
          i = after
          continue
        }
        if (TYPST_SKIP[name]) {
          i = after
          continue
        }
        /*
         * Unknown commands (`\dv`, `\ce`, …) must not become a bare identifier:
         * Typst would fail with `unknown variable`. Quoting renders the name as
         * upright text and keeps the file compilable.
         */
        if (/[A-Za-z0-9]$/.test(out)) out += ' '
        out += '"' + name + '" '
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
      /*
       * Typst reads a run like `mc` or `x2` as one (undefined) identifier, while
       * TeX means m·c and x·2. Keep neighbouring letters apart, and do not glue
       * a digit onto a preceding letter; consecutive digits stay one number.
       */
      if (/[A-Za-z0-9]$/.test(out) && /[A-Za-z0-9]/.test(ch)) {
        const prev = out[out.length - 1]
        if (/[A-Za-z]$/.test(prev) || (/[0-9]$/.test(prev) && /[A-Za-z]/.test(ch))) out += ' '
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

  function kidsOf(element) {
    return Array.from((element && element.children) || [])
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
    const elemTag = function (element) {
      return (element.localName || element.nodeName || '').toLowerCase()
    }
    /* One `<m:m>` whose rows are `<m:mr><m:e>…`; Word needs the column count. */
    const ommlMatrix = function (table) {
      const rows = kidsOf(table).filter(function (child) {
        return elemTag(child) === 'mtr'
      })
      let columns = 1
      rows.forEach(function (row) {
        const count = kidsOf(row).filter(function (cell) {
          return elemTag(cell) === 'mtd'
        }).length
        if (count > columns) columns = count
      })
      const rowsXml = rows.map(function (row) {
        const cells = kidsOf(row).filter(function (cell) {
          return elemTag(cell) === 'mtd'
        })
        return '<m:mr>' + cells.map(function (cell) {
          return '<m:e>' + conv(cell) + '</m:e>'
        }).join('') + '</m:mr>'
      }).join('')
      return (
        '<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="' + columns + '"/>' +
        '<m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>' + rowsXml + '</m:m>'
      )
    }
    /* MathJax writes matrices as `<mo>(</mo><mtable>…</mtable><mo>)</mo>`. */
    const delimitedMatrix = function () {
      if (kids.length !== 3) return ''
      if (elemTag(kids[1]) !== 'mtable') return ''
      if (elemTag(kids[0]) !== 'mo' || elemTag(kids[2]) !== 'mo') return ''
      const open = String(kids[0].textContent || '').trim()
      const close = String(kids[2].textContent || '').trim()
      if (!open && !close) return ''
      return (
        '<m:d><m:dPr><m:begChr m:val="' + esc(open) + '"/><m:endChr m:val="' + esc(close) + '"/></m:dPr>' +
        '<m:e>' + ommlMatrix(kids[1]) + '</m:e></m:d>'
      )
    }
    const inner = function () {
      return kids.map(conv).join('')
    }
    const argOf = function (name) {
      const found = kids.filter(function (child) {
        return (child.localName || '').toLowerCase() === name
      })[0]
      return found ? conv(found) : ''
    }
    /* MathJax emits positional children (<mfrac><mrow/><mi/></mfrac>), not
       semantic tags. Prefer the child at a position; fall back to the old
       semantic lookup so hand-written or third-party MathML still works. */
    const argAt = function (index, semanticName) {
      const child = kids[index]
      if (child) {
        const value = conv(child)
        if (value) return value
      }
      return semanticName ? argOf(semanticName) : ''
    }
    switch (tag) {
      case 'math':
      case 'semantics':
      case 'mrow':
      case 'mstyle':
      case 'mpadded':
      case 'mphantom':
      case 'mtd':
      case 'mtr': {
        const delimited = delimitedMatrix()
        if (delimited) return delimited
        return inner()
      }
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
        return '<m:f><m:num>' + argAt(0, 'numerator') + '</m:num><m:den>' + argAt(1, 'denominator') + '</m:den></m:f>'
      case 'msqrt':
        return '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>' + inner() + '</m:e></m:rad>'
      case 'mroot':
        return '<m:rad><m:deg>' + argAt(1, 'denominator') + '</m:deg><m:e>' + argAt(0, 'numerator') + '</m:e></m:rad>'
      case 'msup':
        return '<m:sSup><m:e>' + argAt(0, 'base') + '</m:e><m:sup>' + argAt(1, 'superscript') + '</m:sup></m:sSup>'
      case 'msub':
        return '<m:sSub><m:e>' + argAt(0, 'base') + '</m:e><m:sub>' + argAt(1, 'subscript') + '</m:sub></m:sSub>'
      case 'msubsup':
        return (
          '<m:sSubSup><m:e>' + argAt(0, 'base') + '</m:e><m:sub>' + argAt(1, 'subscript') + '</m:sub>' +
          '<m:sup>' + argAt(2, 'superscript') + '</m:sup></m:sSubSup>'
        )
      case 'mover':
        return '<m:limUpp><m:e>' + argAt(0, 'base') + '</m:e><m:lim>' + argAt(1, 'over') + '</m:lim></m:limUpp>'
      case 'munder':
        return '<m:limLow><m:e>' + argAt(0, 'base') + '</m:e><m:lim>' + argAt(1, 'under') + '</m:lim></m:limLow>'
      case 'munderover':
        return (
          '<m:limLow><m:e><m:limUpp><m:e>' + argAt(0, 'base') + '</m:e><m:lim>' + argAt(2, 'over') + '</m:lim></m:limUpp></m:e>' +
          '<m:lim>' + argAt(1, 'under') + '</m:lim></m:limLow>'
        )
      case 'mfenced': {
        const open = node.getAttribute('open')
        const close = node.getAttribute('close')
        const separators = node.getAttribute('separators')
        const parts = kids.map(conv)
        const joined = separators ? parts.join(run(separators, 'p')) : parts.join('')
        return run(open == null ? '(' : open, 'p') + joined + run(close == null ? ')' : close, 'p')
      }
      case 'mtable':
        return ommlMatrix(node)
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
    unsupportedEnvs: function (tex, target) {
      return unsupportedEnvs(tex, target)
    },
  }
})()
