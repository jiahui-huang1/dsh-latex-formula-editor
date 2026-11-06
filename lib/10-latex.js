/**
 * @local/dsh-latex-editor — lib/10-latex.js
 *
 * The LaTeX core of the formula workbench. Owns `LX.latex`:
 *
 *   palette      10 categories · 37 groups · 438 symbol buttons { tex, zh, en[, glyph] }
 *   templates    48 structural snippets { id, zh, en, group, tex, caret }
 *   insertAt()   caret-marker (`§`) aware insertion
 *   wrapSelection()
 *   parse()      recursive-descent LaTeX subset parser (never throws)
 *   outline()    flattened, selectable node list (max 400 entries)
 *   tokenize()   non-overlapping highlight ranges
 *   normalize()  strip $…$, $$…$$, \[…\], \(…\), outer equation/align wrappers
 *   stats()      { chars, commands, depth }
 *   completions()merged command list for the editor autocomplete
 *
 * Consumer notes
 * --------------
 * • Palette `tex` may contain `§` (U+00A7) as the caret landing marker, e.g.
 *   `\frac{§}{}`.  Insert with `LX.latex.insertAt(text, s, e, item.tex)` — the
 *   marker is stripped and the caret lands on it.  Templates carry the caret as
 *   a numeric index (`caret`) inside a marker-free `tex`; pass both:
 *   `insertAt(text, s, e, tpl.tex, tpl.caret)`.
 * • For MathJax previews render `LX.latex.previewTex(tex)` (marker → `x`) or fall
 *   back to the command text when the render is visually empty (spacing, limits).
 * • Items may carry a single-character `glyph` for the SymbolPanel button face;
 *   items without a faithful single-character form omit it and upgrade via MathJax.
 * • Categories, groups and template groups all carry inline `{ zh, en }`, so
 *   `LX.pick(category)` works; matching dictionary keys are registered as
 *   `pal.<categoryId>`, `pal.g.<groupId>` and `pal.tpl.<templateGroup>`.
 * • `parse()`/`outline()`/`stats()` are total: they degrade instead of throwing
 *   and are bounded (depth 150, node budget 40 000).
 */
;(function () {
  'use strict'

  const LX = window.__LX
  if (!LX || typeof LX !== 'object') return

  /* ====================================================================== */
  /* small helpers                                                          */
  /* ====================================================================== */

  const CARET_MARKER = '\u00a7'

  /** Palette item factory — `tex` is what the button inserts. */
  function S(tex, zh, en) {
    return { tex: tex, zh: zh, en: en }
  }

  function toSource(value) {
    if (typeof value === 'string') return value
    if (value === null || value === undefined) return ''
    return String(value)
  }

  function toInt(value, fallback) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : fallback
    if (typeof value === 'string' && value !== '') {
      const parsed = parseInt(value, 10)
      if (Number.isFinite(parsed)) return parsed
    }
    return fallback
  }

  function hasOwn(target, key) {
    return Object.prototype.hasOwnProperty.call(target, key)
  }

  /* ====================================================================== */
  /* palette — 10 categories, 2-5 groups each, every entry { tex, zh, en }  */
  /* ====================================================================== */

  const PALETTE = [
    {
      id: 'ops',
      zh: '运算与关系',
      en: 'Operators & relations',
      groups: [
        {
          id: 'ops-arith',
          zh: '算术运算',
          en: 'Arithmetic',
          items: [
            S('+', '加号', 'Plus'),
            S('-', '减号', 'Minus'),
            S('\\pm', '正负号', 'Plus-minus'),
            S('\\mp', '负正号', 'Minus-plus'),
            S('\\times', '乘号', 'Times'),
            S('\\cdot', '点乘', 'Dot product'),
            S('\\ast', '星号乘', 'Asterisk'),
            S('\\star', '星形算子', 'Star'),
            S('\\circ', '复合算子', 'Composition'),
            S('\\bullet', '实心圆点', 'Bullet'),
            S('\\oplus', '直和', 'Direct sum'),
            S('\\ominus', '圈减', 'Circled minus'),
            S('\\otimes', '张量积', 'Tensor product'),
            S('\\odot', '圈点积', 'Circled dot'),
            S('\\circledast', '圈星号', 'Circled asterisk'),
            S('\\boxplus', '方框加', 'Boxed plus'),
            S('\\boxtimes', '方框乘', 'Boxed times'),
            S('\\uplus', '多重集并', 'Multiset union'),
            S('\\setminus', '集合减', 'Set minus'),
            S('\\smallsetminus', '小集合减', 'Small set minus'),
            S('\\wr', '花环积', 'Wreath product'),
            S('\\dagger', '单剑号', 'Dagger'),
            S('\\ddagger', '双剑号', 'Double dagger'),
          ],
        },
        {
          id: 'ops-rel',
          zh: '关系符号',
          en: 'Relations',
          items: [
            S('=', '等于', 'Equals'),
            S('\\ne', '不等于', 'Not equal'),
            S('\\approx', '约等于', 'Approximately equal'),
            S('\\equiv', '恒等于', 'Equivalent'),
            S('\\cong', '全等', 'Congruent'),
            S('\\sim', '相似', 'Similar'),
            S('\\simeq', '约相似', 'Similar or equal'),
            S('\\asymp', '渐近等于', 'Asymptotically equal'),
            S('\\propto', '正比于', 'Proportional to'),
            S('\\prec', '先于', 'Precedes'),
            S('\\succ', '后于', 'Succeeds'),
            S('\\preceq', '先于或等于', 'Precedes or equal'),
            S('\\succeq', '后于或等于', 'Succeeds or equal'),
            S('\\triangleq', '定义为', 'Defined as'),
            S('\\models', '满足', 'Models'),
            S('\\vdash', '推出', 'Turnstile'),
            S('\\dashv', '反推出', 'Reversed turnstile'),
            S('\\nvdash', '不可推出', 'Not turnstile'),
            S('\\perp', '垂直', 'Perpendicular'),
            S('\\parallel', '平行', 'Parallel'),
            S('\\mid', '整除', 'Divides'),
            S('\\nmid', '不整除', 'Does not divide'),
            S('\\smile', '上弧', 'Smile'),
            S('\\frown', '下弧', 'Frown'),
            S('\\bowtie', '蝴蝶结', 'Bowtie'),
            S('\\Join', '连接符号', 'Join'),
          ],
        },
        {
          id: 'ops-cmp',
          zh: '比较与不等',
          en: 'Inequalities',
          items: [
            S('<', '小于', 'Less than'),
            S('>', '大于', 'Greater than'),
            S('\\le', '小于等于', 'Less than or equal'),
            S('\\ge', '大于等于', 'Greater than or equal'),
            S('\\leqq', '双线小于等于', 'Double-line less or equal'),
            S('\\geqq', '双线大于等于', 'Double-line greater or equal'),
            S('\\leqslant', '斜线小于等于', 'Slanted less or equal'),
            S('\\geqslant', '斜线大于等于', 'Slanted greater or equal'),
            S('\\lesssim', '小于渐近', 'Less or similar'),
            S('\\gtrsim', '大于渐近', 'Greater or similar'),
            S('\\lessgtr', '小于大于', 'Less greater'),
            S('\\gtrless', '大于小于', 'Greater less'),
            S('\\ll', '远小于', 'Much less than'),
            S('\\gg', '远大于', 'Much greater than'),
            S('\\lll', '极小', 'Much much less'),
            S('\\ggg', '极大', 'Much much greater'),
            S('\\nless', '不小于', 'Not less than'),
            S('\\ngtr', '不大于', 'Not greater than'),
          ],
        },
        {
          id: 'ops-logic',
          zh: '逻辑符号',
          en: 'Logic',
          items: [
            S('\\forall', '全称量词', 'For all'),
            S('\\exists', '存在量词', 'Exists'),
            S('\\nexists', '不存在', 'Does not exist'),
            S('\\neg', '逻辑非', 'Negation'),
            S('\\lnot', '非', 'Not'),
            S('\\land', '逻辑与', 'Logical and'),
            S('\\lor', '逻辑或', 'Logical or'),
            S('\\implies', '蕴含', 'Implies'),
            S('\\impliedby', '被蕴含', 'Implied by'),
            S('\\iff', '当且仅当', 'If and only if'),
            S('\\top', '真', 'Top'),
            S('\\bot', '假', 'Bottom'),
            S('\\therefore', '所以', 'Therefore'),
            S('\\because', '因为', 'Because'),
            S('\\square', '方形', 'Square'),
            S('\\checkmark', '对勾', 'Checkmark'),
          ],
        },
        {
          id: 'ops-sets',
          zh: '集合符号',
          en: 'Sets',
          items: [
            S('\\in', '属于', 'Element of'),
            S('\\notin', '不属于', 'Not element of'),
            S('\\ni', '包含元素', 'Contains'),
            S('\\subset', '真子集', 'Subset'),
            S('\\supset', '真超集', 'Superset'),
            S('\\subseteq', '子集或相等', 'Subset or equal'),
            S('\\supseteq', '超集或相等', 'Superset or equal'),
            S('\\subsetneq', '真子集（不等）', 'Proper subset'),
            S('\\supsetneq', '真超集（不等）', 'Proper superset'),
            S('\\nsupseteq', '非超集', 'Not superset'),
            S('\\sqsubseteq', '方形子集或相等', 'Square subset or equal'),
            S('\\sqsupseteq', '方形超集或相等', 'Square superset or equal'),
            S('\\cup', '并集', 'Union'),
            S('\\cap', '交集', 'Intersection'),
            S('\\emptyset', '空集', 'Empty set'),
            S('\\varnothing', '空集（变体）', 'Empty set (variant)'),
          ],
        },
      ],
    },
    {
      id: 'greek',
      zh: '希腊字母',
      en: 'Greek letters',
      groups: [
        {
          id: 'greek-lower',
          zh: '小写字母',
          en: 'Lowercase',
          items: [
            S('\\alpha', '阿尔法', 'Alpha'),
            S('\\beta', '贝塔', 'Beta'),
            S('\\gamma', '伽马', 'Gamma'),
            S('\\delta', '德尔塔', 'Delta'),
            S('\\epsilon', '艾普西龙', 'Epsilon'),
            S('\\varepsilon', '变体艾普西龙', 'Variant epsilon'),
            S('\\zeta', '泽塔', 'Zeta'),
            S('\\eta', '伊塔', 'Eta'),
            S('\\theta', '西塔', 'Theta'),
            S('\\vartheta', '变体西塔', 'Variant theta'),
            S('\\iota', '约塔', 'Iota'),
            S('\\kappa', '卡帕', 'Kappa'),
            S('\\varkappa', '变体卡帕', 'Variant kappa'),
            S('\\lambda', '拉姆达', 'Lambda'),
            S('\\mu', '缪', 'Mu'),
            S('\\nu', '纽', 'Nu'),
            S('\\xi', '克西', 'Xi'),
            S('\\pi', '派', 'Pi'),
            S('\\varpi', '变体派', 'Variant pi'),
            S('\\rho', '柔', 'Rho'),
            S('\\varrho', '变体柔', 'Variant rho'),
            S('\\sigma', '西格玛', 'Sigma'),
            S('\\varsigma', '变体西格玛', 'Variant sigma'),
            S('\\tau', '陶', 'Tau'),
            S('\\upsilon', '宇普西隆', 'Upsilon'),
            S('\\phi', '斐', 'Phi'),
            S('\\varphi', '变体斐', 'Variant phi'),
            S('\\chi', '凯', 'Chi'),
            S('\\psi', '普西', 'Psi'),
            S('\\omega', '欧米伽', 'Omega'),
          ],
        },
        {
          id: 'greek-upper',
          zh: '大写字母',
          en: 'Uppercase',
          items: [
            S('\\Gamma', '大写伽马', 'Uppercase gamma'),
            S('\\Delta', '大写德尔塔', 'Uppercase delta'),
            S('\\Theta', '大写西塔', 'Uppercase theta'),
            S('\\Lambda', '大写拉姆达', 'Uppercase lambda'),
            S('\\Xi', '大写克西', 'Uppercase xi'),
            S('\\Pi', '大写派', 'Uppercase pi'),
            S('\\Sigma', '大写西格玛', 'Uppercase sigma'),
            S('\\Upsilon', '大写宇普西隆', 'Uppercase upsilon'),
            S('\\Phi', '大写斐', 'Uppercase phi'),
            S('\\Psi', '大写普西', 'Uppercase psi'),
            S('\\Omega', '大写欧米伽', 'Uppercase omega'),
          ],
        },
      ],
    },
    {
      id: 'arrows',
      zh: '箭头',
      en: 'Arrows',
      groups: [
        {
          id: 'arrow-single',
          zh: '单向箭头',
          en: 'Single arrows',
          items: [
            S('\\to', '右箭头', 'Right arrow'),
            S('\\rightarrow', '右箭头', 'Right arrow'),
            S('\\leftarrow', '左箭头', 'Left arrow'),
            S('\\uparrow', '上箭头', 'Up arrow'),
            S('\\downarrow', '下箭头', 'Down arrow'),
            S('\\updownarrow', '上下箭头', 'Up-down arrow'),
            S('\\nearrow', '右上箭头', 'Up-right arrow'),
            S('\\searrow', '右下箭头', 'Down-right arrow'),
            S('\\swarrow', '左下箭头', 'Down-left arrow'),
            S('\\nwarrow', '左上箭头', 'Up-left arrow'),
            S('\\longrightarrow', '长右箭头', 'Long right arrow'),
            S('\\longleftarrow', '长左箭头', 'Long left arrow'),
            S('\\longleftrightarrow', '长左右箭头', 'Long left-right arrow'),
            S('\\mapsto', '映射箭头', 'Maps to'),
            S('\\longmapsto', '长映射箭头', 'Long maps to'),
            S('\\hookrightarrow', '右钩箭头', 'Hooked right arrow'),
            S('\\hookleftarrow', '左钩箭头', 'Hooked left arrow'),
            S('\\twoheadrightarrow', '双头右箭头', 'Two-headed right arrow'),
            S('\\twoheadleftarrow', '双头左箭头', 'Two-headed left arrow'),
            S('\\rightarrowtail', '带尾右箭头', 'Right arrow with tail'),
          ],
        },
        {
          id: 'arrow-double',
          zh: '双线与双向箭头',
          en: 'Double arrows',
          items: [
            S('\\leftrightarrow', '左右箭头', 'Left-right arrow'),
            S('\\Leftrightarrow', '双向箭头', 'Double arrow'),
            S('\\Longleftrightarrow', '长双向箭头', 'Long double arrow'),
            S('\\Rightarrow', '右双线箭头', 'Rightwards double arrow'),
            S('\\Leftarrow', '左双线箭头', 'Leftwards double arrow'),
            S('\\Longrightarrow', '长右双线箭头', 'Long rightwards double arrow'),
            S('\\Longleftarrow', '长左双线箭头', 'Long leftwards double arrow'),
            S('\\rightleftharpoons', '平衡箭头', 'Equilibrium arrows'),
            S('\\leftrightharpoons', '反向平衡箭头', 'Reversed equilibrium arrows'),
            S('\\leftrightarrows', '左右成对箭头', 'Left-right arrow pair'),
            S('\\rightleftarrows', '右左成对箭头', 'Right-left arrow pair'),
            S('\\rightrightarrows', '双右箭头', 'Two right arrows'),
            S('\\leftleftarrows', '双左箭头', 'Two left arrows'),
            S('\\upuparrows', '双上箭头', 'Two up arrows'),
            S('\\downdownarrows', '双下箭头', 'Two down arrows'),
            S('\\nleftrightarrow', '非左右箭头', 'Not left-right arrow'),
            S('\\nLeftrightarrow', '非双向箭头', 'Not double arrow'),
            S('\\Rrightarrow', '右三线箭头', 'Right triple arrow'),
          ],
        },
        {
          id: 'arrow-hook',
          zh: '鱼叉与钩形箭头',
          en: 'Harpoons & hooks',
          items: [
            S('\\rightharpoonup', '右鱼叉（上）', 'Right harpoon up'),
            S('\\rightharpoondown', '右鱼叉（下）', 'Right harpoon down'),
            S('\\leftharpoonup', '左鱼叉（上）', 'Left harpoon up'),
            S('\\leftharpoondown', '左鱼叉（下）', 'Left harpoon down'),
            S('\\upharpoonright', '上鱼叉（右）', 'Up harpoon right'),
            S('\\upharpoonleft', '上鱼叉（左）', 'Up harpoon left'),
            S('\\downharpoonright', '下鱼叉（右）', 'Down harpoon right'),
            S('\\downharpoonleft', '下鱼叉（左）', 'Down harpoon left'),
            S('\\restriction', '限制映射', 'Restriction'),
            S('\\curvearrowright', '弯曲右箭头', 'Curved right arrow'),
            S('\\curvearrowleft', '弯曲左箭头', 'Curved left arrow'),
            S('\\circlearrowright', '顺时针循环箭头', 'Clockwise circular arrow'),
            S('\\circlearrowleft', '逆时针循环箭头', 'Counter-clockwise circular arrow'),
            S('\\rightsquigarrow', '波浪右箭头', 'Squiggly right arrow'),
            S('\\leadsto', '引出箭头', 'Leads to'),
            S('\\dashrightarrow', '虚线右箭头', 'Dashed right arrow'),
          ],
        },
      ],
    },
    {
      id: 'large',
      zh: '大型运算符',
      en: 'Large operators',
      groups: [
        {
          id: 'big-sum',
          zh: '求和与连乘',
          en: 'Sums & products',
          items: [
            S('\\sum', '求和', 'Summation'),
            S('\\prod', '连乘', 'Product'),
            S('\\coprod', '余积', 'Coproduct'),
            S('\\bigoplus', '大直和', 'Big direct sum'),
            S('\\bigotimes', '大张量积', 'Big tensor product'),
            S('\\bigodot', '大圈点积', 'Big circled dot'),
            S('\\bigvee', '大逻辑或', 'Big logical or'),
            S('\\bigwedge', '大逻辑与', 'Big logical and'),
            S('\\biguplus', '大多重集并', 'Big multiset union'),
            S('\\bigcup', '大并集', 'Big union'),
            S('\\bigcap', '大交集', 'Big intersection'),
          ],
        },
        {
          id: 'big-int',
          zh: '积分',
          en: 'Integrals',
          items: [
            S('\\int', '积分', 'Integral'),
            S('\\iint', '二重积分', 'Double integral'),
            S('\\iiint', '三重积分', 'Triple integral'),
            S('\\iiiint', '四重积分', 'Quadruple integral'),
            S('\\oint', '环路积分', 'Contour integral'),
            S('\\idotsint', '省略号积分', 'Integral with dots'),
            S('\\smallint', '小积分号', 'Small integral'),
          ],
        },
        {
          id: 'big-lim',
          zh: '极限与上界',
          en: 'Limits & bounds',
          items: [
            S('\\lim', '极限', 'Limit'),
            S('\\limsup', '上极限', 'Limit superior'),
            S('\\liminf', '下极限', 'Limit inferior'),
            S('\\sup', '上确界', 'Supremum'),
            S('\\inf', '下确界', 'Infimum'),
            S('\\max', '最大值', 'Maximum'),
            S('\\min', '最小值', 'Minimum'),
            S('\\arg', '辐角', 'Argument'),
            S('\\det', '行列式', 'Determinant'),
            S('\\gcd', '最大公约数', 'Greatest common divisor'),
            S('\\Pr', '概率', 'Probability'),
            S('\\ker', '核', 'Kernel'),
          ],
        },
        {
          id: 'big-func',
          zh: '初等函数',
          en: 'Elementary functions',
          items: [
            S('\\exp', '指数函数', 'Exponential'),
            S('\\log', '对数', 'Logarithm'),
            S('\\ln', '自然对数', 'Natural logarithm'),
            S('\\lg', '常用对数', 'Common logarithm'),
            S('\\sin', '正弦', 'Sine'),
            S('\\cos', '余弦', 'Cosine'),
            S('\\tan', '正切', 'Tangent'),
            S('\\cot', '余切', 'Cotangent'),
            S('\\arcsin', '反正弦', 'Arcsine'),
            S('\\arccos', '反余弦', 'Arccosine'),
            S('\\arctan', '反正切', 'Arctangent'),
            S('\\sinh', '双曲正弦', 'Hyperbolic sine'),
            S('\\cosh', '双曲余弦', 'Hyperbolic cosine'),
            S('\\tanh', '双曲正切', 'Hyperbolic tangent'),
          ],
        },
      ],
    },
    {
      id: 'delims',
      zh: '括号与定界符',
      en: 'Delimiters',
      groups: [
        {
          id: 'delim-paren',
          zh: '圆括号与方括号',
          en: 'Round & square brackets',
          items: [
            S('(', '左圆括号', 'Left parenthesis'),
            S(')', '右圆括号', 'Right parenthesis'),
            S('[', '左方括号', 'Left bracket'),
            S(']', '右方括号', 'Right bracket'),
            S('\\{', '左花括号', 'Left brace'),
            S('\\}', '右花括号', 'Right brace'),
            S('\\lparen', '左圆括号', 'Left parenthesis'),
            S('\\rparen', '右圆括号', 'Right parenthesis'),
            S('\\lbrack', '左方括号', 'Left square bracket'),
            S('\\rbrack', '右方括号', 'Right square bracket'),
            S('\\lbrace', '左花括号', 'Left curly brace'),
            S('\\rbrace', '右花括号', 'Right curly brace'),
          ],
        },
        {
          id: 'delim-abs',
          zh: '绝对值与范数',
          en: 'Absolute values & norms',
          items: [
            S('\\lvert', '左竖线', 'Left vertical bar'),
            S('\\rvert', '右竖线', 'Right vertical bar'),
            S('\\lVert', '左双竖线', 'Left double vertical bar'),
            S('\\rVert', '右双竖线', 'Right double vertical bar'),
            S('|', '竖线', 'Vertical bar'),
            S('\\|', '双竖线', 'Double vertical bar'),
          ],
        },
        {
          id: 'delim-floor',
          zh: '取整括号',
          en: 'Floor & ceiling',
          items: [
            S('\\lfloor', '左向下取整', 'Left floor'),
            S('\\rfloor', '右向下取整', 'Right floor'),
            S('\\lceil', '左向上取整', 'Left ceiling'),
            S('\\rceil', '右向上取整', 'Right ceiling'),
          ],
        },
        {
          id: 'delim-corner',
          zh: '角括号与角标',
          en: 'Angles & corners',
          items: [
            S('\\langle', '左角括号', 'Left angle bracket'),
            S('\\rangle', '右角括号', 'Right angle bracket'),
            S('\\ulcorner', '左上角', 'Upper-left corner'),
            S('\\urcorner', '右上角', 'Upper-right corner'),
            S('\\llcorner', '左下角', 'Lower-left corner'),
          ],
        },
        {
          id: 'delim-big',
          zh: '大号定界符',
          en: 'Large delimiters',
          items: [
            S('\\big(', '大左圆括号', 'Big left parenthesis'),
            S('\\big)', '大右圆括号', 'Big right parenthesis'),
            S('\\Big(', '更大左圆括号', 'Bigger left parenthesis'),
            S('\\Big)', '更大右圆括号', 'Bigger right parenthesis'),
            S('\\bigg(', '极大左圆括号', 'Biggest left parenthesis'),
            S('\\bigg)', '极大右圆括号', 'Biggest right parenthesis'),
            S('\\bigl[', '大左方括号', 'Big left bracket'),
            S('\\bigr]', '大右方括号', 'Big right bracket'),
            S('\\biggl\\{', '极大左花括号', 'Biggest left brace'),
            S('\\biggr\\}', '极大右花括号', 'Biggest right brace'),
            S('\\Bigl\\langle', '大左角括号', 'Big left angle bracket'),
            S('\\Bigr\\rangle', '大右角括号', 'Big right angle bracket'),
            S('\\Big\\|', '大双竖线', 'Big double vertical bar'),
          ],
        },
      ],
    },
    {
      id: 'accents',
      zh: '重音与标记',
      en: 'Accents & marks',
      groups: [
        {
          id: 'accent-over',
          zh: '重音符号',
          en: 'Accents',
          items: [
            S('\\hat{\u00a7}', '帽子符号', 'Hat'),
            S('\\check{\u00a7}', '抑扬符', 'Check'),
            S('\\breve{\u00a7}', '短音符', 'Breve'),
            S('\\acute{\u00a7}', '尖音符', 'Acute'),
            S('\\grave{\u00a7}', '沉音符', 'Grave'),
            S('\\tilde{\u00a7}', '波浪号', 'Tilde'),
            S('\\bar{\u00a7}', '横线', 'Bar'),
            S('\\vec{\u00a7}', '向量箭头', 'Vector arrow'),
            S('\\dot{\u00a7}', '单点', 'Dot'),
            S('\\ddot{\u00a7}', '双点', 'Double dot'),
            S('\\mathring{\u00a7}', '小圆圈', 'Ring'),
            S('\\widehat{\u00a7}', '宽帽', 'Wide hat'),
            S('\\widetilde{\u00a7}', '宽波浪', 'Wide tilde'),
          ],
        },
        {
          id: 'accent-line',
          zh: '上下划线',
          en: 'Over & under lines',
          items: [
            S('\\overline{\u00a7}', '上划线', 'Overline'),
            S('\\underline{\u00a7}', '下划线', 'Underline'),
            S('\\overbrace{\u00a7}', '上花括号', 'Overbrace'),
            S('\\underbrace{\u00a7}', '下花括号', 'Underbrace'),
          ],
        },
        {
          id: 'accent-arrow',
          zh: '上下箭头标记',
          en: 'Over & under arrows',
          items: [
            S('\\overleftarrow{\u00a7}', '上方左箭头', 'Over left arrow'),
            S('\\overrightarrow{\u00a7}', '上方右箭头', 'Over right arrow'),
            S('\\overleftrightarrow{\u00a7}', '上方双向箭头', 'Over left-right arrow'),
            S('\\underleftarrow{\u00a7}', '下方左箭头', 'Under left arrow'),
            S('\\underrightarrow{\u00a7}', '下方右箭头', 'Under right arrow'),
            S('\\underleftrightarrow{\u00a7}', '下方双向箭头', 'Under left-right arrow'),
          ],
        },
        {
          id: 'accent-stack',
          zh: '堆叠标记',
          en: 'Stacking marks',
          items: [
            S('\\overset{\u00a7}{}', '上方叠标', 'Overset'),
            S('\\underset{\u00a7}{}', '下方叠标', 'Underset'),
            S('\\stackrel{\u00a7}{}', '堆叠标记', 'Stackrel'),
            S('\\substack{\u00a7}', '堆叠子公式', 'Substack'),
            S('\\genfrac{}{}{}{}{\u00a7}{}', '广义分式', 'Generalized fraction'),
            S('\\xrightarrow{\u00a7}{}', '带文字右箭头', 'Arrow with label above'),
          ],
        },
      ],
    },
    {
      id: 'fonts',
      zh: '字体',
      en: 'Fonts',
      groups: [
        {
          id: 'font-math',
          zh: '数学字体',
          en: 'Math alphabets',
          items: [
            S('\\mathbb{\u00a7}', '黑板粗体', 'Double-struck'),
            S('\\mathcal{\u00a7}', '花体', 'Calligraphic'),
            S('\\mathfrak{\u00a7}', '哥特体', 'Fraktur'),
            S('\\mathscr{\u00a7}', '手写体', 'Script'),
            S('\\mathsf{\u00a7}', '无衬线体', 'Sans-serif'),
            S('\\mathbf{\u00a7}', '粗体', 'Bold'),
            S('\\mathit{\u00a7}', '斜体', 'Italic'),
            S('\\mathrm{\u00a7}', '直立体', 'Roman'),
          ],
        },
        {
          id: 'font-sets',
          zh: '常用数集',
          en: 'Common number sets',
          items: [
            S('\\mathbb{R}', '实数集', 'Real numbers'),
            S('\\mathbb{N}', '自然数集', 'Natural numbers'),
            S('\\mathbb{Z}', '整数集', 'Integers'),
            S('\\mathbb{Q}', '有理数集', 'Rational numbers'),
            S('\\mathbb{C}', '复数集', 'Complex numbers'),
            S('\\mathbb{H}', '四元数集', 'Quaternions'),
            S('\\mathfrak{g}', '李代数', 'Lie algebra'),
            S('\\mathcal{O}', '大 O 记号', 'Big-O notation'),
          ],
        },
        {
          id: 'font-text',
          zh: '文本字体',
          en: 'Text fonts',
          items: [
            S('\\text{\u00a7}', '文本', 'Text'),
            S('\\textbf{\u00a7}', '粗体文本', 'Bold text'),
            S('\\textit{\u00a7}', '斜体文本', 'Italic text'),
            S('\\textsf{\u00a7}', '无衬线文本', 'Sans-serif text'),
            S('\\texttt{\u00a7}', '等宽文本', 'Typewriter text'),
            S('\\emph{\u00a7}', '强调文本', 'Emphasized text'),
            S('\\mbox{\u00a7}', '文本盒', 'Text box'),
          ],
        },
        {
          id: 'font-style',
          zh: '样式与限制',
          en: 'Style & limits',
          items: [
            S('\\displaystyle', '显示样式', 'Display style'),
            S('\\scriptstyle', '上下标样式', 'Script style'),
            S('\\scriptscriptstyle', '二级下标样式', 'Scriptscript style'),
            S('\\limits', '上下限', 'Limits'),
            S('\\nolimits', '取消上下限', 'No limits'),
          ],
        },
      ],
    },
    {
      id: 'spacing',
      zh: '间距与文本',
      en: 'Spacing & text',
      groups: [
        {
          id: 'space',
          zh: '间距',
          en: 'Spacing',
          items: [
            S('\\quad', '全角空格', 'Em quad'),
            S('\\qquad', '双全角空格', 'Two em quads'),
            S('\\,', '窄空格', 'Thin space'),
            S('\\;', '较宽空格', 'Thick space'),
            S('\\:', '中等空格', 'Medium space'),
            S('\\!', '负窄空格', 'Negative thin space'),
            S('\\ ', '控制空格', 'Control space'),
            S('~', '不换行空格', 'Non-breaking space'),
            S('\\enspace', '半角空格', 'En space'),
            S('\\thinspace', '细空格', 'Thin space'),
            S('\\thickspace', '粗空格', 'Thick space'),
            S('\\negthinspace', '负细空格', 'Negative thin space'),
            S('\\hspace{\u00a7}', '水平间距', 'Horizontal space'),
          ],
        },
        {
          id: 'dots',
          zh: '省略号',
          en: 'Dots',
          items: [
            S('\\dots', '通用省略号', 'Dots'),
            S('\\ldots', '低省略号', 'Low dots'),
            S('\\cdots', '居中省略号', 'Centered dots'),
            S('\\vdots', '竖省略号', 'Vertical dots'),
            S('\\ddots', '斜省略号', 'Diagonal dots'),
            S('\\dotsb', '二元运算符省略号', 'Binary-operator dots'),
            S('\\dotsc', '逗号省略号', 'Comma dots'),
          ],
        },
        {
          id: 'opclass',
          zh: '文本与算子类',
          en: 'Text & operator classes',
          items: [
            S('\\operatorname{\u00a7}', '算子名称', 'Operator name'),
            S('\\mathop{\u00a7}', '算子', 'Operator'),
            S('\\mathrel{\u00a7}', '关系符', 'Relation'),
            S('\\mathbin{\u00a7}', '二元运算符', 'Binary operator'),
            S('\\mathord{\u00a7}', '普通符号', 'Ordinary symbol'),
            S('\\mathopen{\u00a7}', '左定界符', 'Open delimiter'),
            S('\\mathclose{\u00a7}', '右定界符', 'Close delimiter'),
            S('\\mathpunct{\u00a7}', '标点', 'Punctuation'),
            S('\\smash{\u00a7}', '消除高度', 'Smash'),
            S('\\phantom{\u00a7}', '占位', 'Phantom'),
            S('\\hphantom{\u00a7}', '水平占位', 'Horizontal phantom'),
          ],
        },
        {
          id: 'misc',
          zh: '编号与样式盒',
          en: 'Tags & boxes',
          items: [
            S('\\tag{\u00a7}', '公式编号', 'Equation tag'),
            S('\\label{\u00a7}', '标签', 'Label'),
            S('\\ref{\u00a7}', '引用', 'Reference'),
            S('\\eqref{\u00a7}', '公式引用', 'Equation reference'),
            S('\\boxed{\u00a7}', '方框', 'Boxed'),
            S('\\cancel{\u00a7}', '斜线删除', 'Cancel'),
            S('\\bcancel{\u00a7}', '反向斜线删除', 'Back cancel'),
            S('\\xcancel{\u00a7}', '交叉删除', 'Cross cancel'),
            S('\\color{\u00a7}', '颜色', 'Color'),
            S('\\textcolor{red}{\u00a7}', '文字颜色', 'Text color'),
          ],
        },
      ],
    },
    {
      id: 'symbols',
      zh: '常用符号',
      en: 'Common symbols',
      groups: [
        {
          id: 'sym-const',
          zh: '常量与算子',
          en: 'Constants & operators',
          items: [
            S('\\infty', '无穷大', 'Infinity'),
            S('\\partial', '偏导符号', 'Partial derivative'),
            S('\\nabla', '梯度算子', 'Nabla'),
            S('\\ell', '手写体 l', 'Script l'),
            S('\\hbar', '约化普朗克常数', 'Reduced Planck constant'),
            S('\\Re', '实部', 'Real part'),
            S('\\Im', '虚部', 'Imaginary part'),
            S('\\aleph', '阿列夫数', 'Aleph'),
            S('\\wp', '魏尔斯特拉斯 p', 'Weierstrass p'),
            S('\\prime', '撇号', 'Prime'),
            S('\\angle', '角', 'Angle'),
            S('\\triangle', '三角形', 'Triangle'),
          ],
        },
        {
          id: 'sym-other',
          zh: '其他符号',
          en: 'Other symbols',
          items: [
            S('\\clubsuit', '梅花', 'Club'),
            S('\\diamondsuit', '方块', 'Diamond'),
            S('\\heartsuit', '红桃', 'Heart'),
            S('\\spadesuit', '黑桃', 'Spade'),
            S('\\flat', '降号', 'Flat'),
            S('\\natural', '还原号', 'Natural'),
            S('\\sharp', '升号', 'Sharp'),
            S('\\backslash', '反斜线', 'Backslash'),
          ],
        },
      ],
    },
    {
      id: 'physchem',
      zh: '物理与化学',
      en: 'Physics & chemistry',
      groups: [
        {
          id: 'phys',
          zh: '物理命令',
          en: 'Physics commands',
          items: [
            S('\\dv{\u00a7}{x}', '一阶导数', 'Derivative'),
            S('\\pdv{\u00a7}{x}', '偏导数', 'Partial derivative'),
            S('\\grad', '梯度', 'Gradient'),
            S('\\div', '散度', 'Divergence'),
            S('\\curl', '旋度', 'Curl'),
            S('\\laplacian', '拉普拉斯算子', 'Laplacian'),
            S('\\abs{\u00a7}', '绝对值', 'Absolute value'),
            S('\\norm{\u00a7}', '范数', 'Norm'),
            S('\\qty(\u00a7)', '自动圆括号', 'Auto parentheses'),
            S('\\qty[\u00a7]', '自动方括号', 'Auto brackets'),
            S('\\qty{\u00a7}', '自动花括号', 'Auto braces'),
            S('\\bra{\u00a7}', '左矢', 'Bra'),
            S('\\ket{\u00a7}', '右矢', 'Ket'),
            S('\\braket{\u00a7}{}', '内积', 'Inner product'),
            S('\\mel{\u00a7}{A}{}', '矩阵元', 'Matrix element'),
            S('\\ev{A}{\u00a7}', '期望值', 'Expectation value'),
            S('\\vb{\u00a7}', '粗体向量', 'Bold vector'),
            S('\\va{\u00a7}', '向量箭头', 'Vector arrow'),
            S('\\vu{\u00a7}', '单位向量', 'Unit vector'),
            S('\\dd', '微分符号 d', 'Differential d'),
            S('\\commutator{A}{B}', '对易子', 'Commutator'),
          ],
        },
        {
          id: 'chem',
          zh: '化学式',
          en: 'Chemical formulas',
          items: [
            S('\\ce{H2O}', '水', 'Water'),
            S('\\ce{CO2}', '二氧化碳', 'Carbon dioxide'),
            S('\\ce{NaCl}', '氯化钠', 'Sodium chloride'),
            S('\\ce{H2SO4}', '硫酸', 'Sulfuric acid'),
            S('\\ce{CH3COOH}', '乙酸', 'Acetic acid'),
            S('\\ce{CaCO3}', '碳酸钙', 'Calcium carbonate'),
            S('\\ce{NH3}', '氨', 'Ammonia'),
            S('\\ce{SO4^2-}', '硫酸根离子', 'Sulfate ion'),
            S('\\ce{Fe^3+}', '铁离子', 'Iron(III) ion'),
            S('\\ce{NH4+}', '铵根离子', 'Ammonium ion'),
            S('\\ce{^{227}_{90}Th+}', '钍同位素离子', 'Thorium isotope ion'),
          ],
        },
        {
          id: 'chem-arrow',
          zh: '化学箭头',
          en: 'Chemical arrows',
          items: [
            S('\\ce{->}', '反应右箭头', 'Reaction arrow'),
            S('\\ce{<=>}', '可逆反应', 'Equilibrium'),
            S('\\ce{<->}', '共振箭头', 'Resonance'),
            S('\\ce{<=>>}', '偏向生成物', 'Equilibrium favoring products'),
            S('\\ce{<<=>}', '偏向反应物', 'Equilibrium favoring reactants'),
            S('\\ce{->[\\text{heat}]}', '加热条件', 'Heating'),
            S('\\ce{->[\\text{cat.}]}', '催化条件', 'Catalyst'),
          ],
        },
        {
          id: 'chem-unit',
          zh: '单位与量值',
          en: 'Units & quantities',
          items: [
            S('\\pu{123 kJ/mol}', '单位量值', 'Quantity with unit'),
            S('\\pu{1.0e-3 M}', '浓度', 'Concentration'),
            S('\\pu{9.8 m/s^2}', '加速度', 'Acceleration'),
          ],
        },
      ],
    },
  ]

  /** Optional single-character glyphs used as the SymbolPanel button face. */
  const GLYPHS = {
    '+': '+', '-': '−', '\\pm': '±', '\\mp': '∓',
    '\\times': '×', '\\cdot': '⋅', '\\ast': '∗', '\\star': '⋆',
    '\\circ': '∘', '\\bullet': '•', '\\oplus': '⊕', '\\ominus': '⊖',
    '\\otimes': '⊗', '\\odot': '⊙', '\\circledast': '⊛', '\\boxplus': '⊞',
    '\\boxtimes': '⊠', '\\uplus': '⊎', '\\setminus': '∖', '\\smallsetminus': '∖',
    '\\wr': '≀', '\\dagger': '†', '\\ddagger': '‡', '=': '=',
    '\\ne': '≠', '\\approx': '≈', '\\equiv': '≡', '\\cong': '≅',
    '\\sim': '∼', '\\simeq': '≃', '\\asymp': '≍', '\\propto': '∝',
    '\\prec': '≺', '\\succ': '≻', '\\preceq': '⪯', '\\succeq': '⪰',
    '\\triangleq': '≜', '\\models': '⊨', '\\vdash': '⊢', '\\dashv': '⊣',
    '\\perp': '⊥', '\\parallel': '∥', '\\mid': '∣', '\\nmid': '∤',
    '\\smile': '⌣', '\\frown': '⌢', '\\bowtie': '⋈', '\\Join': '⋈',
    '\\nvdash': '⊬', '<': '<', '>': '>', '\\le': '≤',
    '\\ge': '≥', '\\leqq': '≦', '\\geqq': '≧', '\\leqslant': '⩽',
    '\\geqslant': '⩾', '\\lesssim': '≲', '\\gtrsim': '≳', '\\lessgtr': '≶',
    '\\gtrless': '≷', '\\ll': '≪', '\\gg': '≫', '\\lll': '⋘',
    '\\ggg': '⋙', '\\nless': '≮', '\\ngtr': '≯', '\\forall': '∀',
    '\\exists': '∃', '\\nexists': '∄', '\\neg': '¬', '\\lnot': '¬',
    '\\land': '∧', '\\lor': '∨', '\\implies': '⟹', '\\impliedby': '⟸',
    '\\iff': '⟺', '\\top': '⊤', '\\bot': '⊥', '\\therefore': '∴',
    '\\because': '∵', '\\square': '□', '\\checkmark': '✓', '\\in': '∈',
    '\\notin': '∉', '\\ni': '∋', '\\subset': '⊂', '\\supset': '⊃',
    '\\subseteq': '⊆', '\\supseteq': '⊇', '\\subsetneq': '⊊', '\\supsetneq': '⊋',
    '\\nsupseteq': '⊉', '\\sqsubseteq': '⊑', '\\sqsupseteq': '⊒', '\\cup': '∪',
    '\\cap': '∩', '\\emptyset': '∅', '\\varnothing': '∅', '\\alpha': 'α',
    '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ϵ',
    '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ',
    '\\vartheta': 'ϑ', '\\iota': 'ι', '\\kappa': 'κ', '\\varkappa': 'ϰ',
    '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ',
    '\\pi': 'π', '\\varpi': 'ϖ', '\\rho': 'ρ', '\\varrho': 'ϱ',
    '\\sigma': 'σ', '\\varsigma': 'ς', '\\tau': 'τ', '\\upsilon': 'υ',
    '\\phi': 'ϕ', '\\varphi': 'φ', '\\chi': 'χ', '\\psi': 'ψ',
    '\\omega': 'ω', '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ',
    '\\Lambda': 'Λ', '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Sigma': 'Σ',
    '\\Upsilon': 'Υ', '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
    '\\to': '→', '\\rightarrow': '→', '\\leftarrow': '←', '\\uparrow': '↑',
    '\\downarrow': '↓', '\\updownarrow': '↕', '\\nearrow': '↗', '\\searrow': '↘',
    '\\swarrow': '↙', '\\nwarrow': '↖', '\\longrightarrow': '⟶', '\\longleftarrow': '⟵',
    '\\longleftrightarrow': '⟷', '\\mapsto': '↦', '\\longmapsto': '⟼', '\\hookrightarrow': '↪',
    '\\hookleftarrow': '↩', '\\twoheadrightarrow': '↠', '\\twoheadleftarrow': '↞', '\\rightarrowtail': '↣',
    '\\leftrightarrow': '↔', '\\Leftrightarrow': '⇔', '\\Longleftrightarrow': '⟺', '\\Rightarrow': '⇒',
    '\\Leftarrow': '⇐', '\\Longrightarrow': '⟹', '\\Longleftarrow': '⟸', '\\rightleftharpoons': '⇌',
    '\\leftrightharpoons': '⇋', '\\leftrightarrows': '⇆', '\\rightleftarrows': '⇄', '\\rightrightarrows': '⇉',
    '\\leftleftarrows': '⇇', '\\upuparrows': '⇈', '\\downdownarrows': '⇊', '\\nleftrightarrow': '↮',
    '\\nLeftrightarrow': '⇎', '\\Rrightarrow': '⇛', '\\rightharpoonup': '⇀', '\\rightharpoondown': '⇁',
    '\\leftharpoonup': '↼', '\\leftharpoondown': '↽', '\\upharpoonright': '↾', '\\upharpoonleft': '↿',
    '\\downharpoonright': '⇂', '\\downharpoonleft': '⇃', '\\restriction': '↾', '\\curvearrowright': '↷',
    '\\curvearrowleft': '↶', '\\circlearrowright': '↻', '\\circlearrowleft': '↺', '\\rightsquigarrow': '⇝',
    '\\leadsto': '⇝', '\\dashrightarrow': '⇢', '\\sum': '∑', '\\prod': '∏',
    '\\coprod': '∐', '\\bigoplus': '⨁', '\\bigotimes': '⨂', '\\bigodot': '⨀',
    '\\bigvee': '⋁', '\\bigwedge': '⋀', '\\biguplus': '⨄', '\\bigcup': '⋃',
    '\\bigcap': '⋂', '\\int': '∫', '\\iint': '∬', '\\iiint': '∭',
    '\\iiiint': '⨌', '\\oint': '∮', 
    '\\smallint': '∫', '(': '(', ')': ')', '[': '[',
    ']': ']', '\\{': '{', '\\}': '}', '\\lparen': '(',
    '\\rparen': ')', '\\lbrack': '[', '\\rbrack': ']', '\\lbrace': '{',
    '\\rbrace': '}', '\\lvert': '|', '\\rvert': '|', '\\lVert': '‖',
    '\\rVert': '‖', '|': '|', '\\|': '‖', '\\lfloor': '⌊',
    '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉', '\\langle': '⟨',
    '\\rangle': '⟩', '\\ulcorner': '⌜', '\\urcorner': '⌝', '\\llcorner': '⌞',
    '\\big(': '(', '\\big)': ')', '\\Big(': '(', '\\Big)': ')',
    '\\bigg(': '(', '\\bigg)': ')', '\\bigl[': '[', '\\bigr]': ']',
    '\\biggl\\{': '{', '\\biggr\\}': '}', '\\Bigl\\langle': '⟨', '\\Bigr\\rangle': '⟩',
    '\\Big\\|': '‖', '\\mathbb{R}': 'ℝ', '\\mathbb{N}': 'ℕ', '\\mathbb{Z}': 'ℤ',
    '\\mathbb{Q}': 'ℚ', '\\mathbb{C}': 'ℂ', '\\mathbb{H}': 'ℍ', '\\dots': '…',
    '\\ldots': '…', '\\cdots': '⋯', '\\vdots': '⋮', '\\ddots': '⋱',
    '\\dotsb': '⋯', '\\dotsc': '…', '\\infty': '∞', '\\partial': '∂',
    '\\nabla': '∇', '\\ell': 'ℓ', '\\hbar': 'ℏ', '\\Re': 'ℜ',
    '\\Im': 'ℑ', '\\aleph': 'ℵ', '\\wp': '℘', '\\prime': '′',
    '\\angle': '∠', '\\triangle': '△', '\\clubsuit': '♣', '\\diamondsuit': '♢',
    '\\heartsuit': '♡', '\\spadesuit': '♠', '\\flat': '♭', '\\natural': '♮',
    '\\sharp': '♯', '\\backslash': '\\', '\\grad': '∇', '\\bra{§}': '⟨',
    '\\ket{§}': '⟩', '\\dd': 'd', '\\ce{->}': '→', '\\ce{<=>}': '⇌',
    '\\ce{<->}': '↔',
  }

  for (let i = 0; i < PALETTE.length; i += 1) {
    const groups = PALETTE[i].groups
    for (let j = 0; j < groups.length; j += 1) {
      const items = groups[j].items
      for (let k = 0; k < items.length; k += 1) {
        const glyph = GLYPHS[items[k].tex]
        if (glyph !== undefined) items[k].glyph = glyph
      }
    }
  }

  /* ====================================================================== */
  /* structural templates                                                   */
  /* ====================================================================== */

  const TEMPLATE_GROUPS = [
    { id: 'frac', zh: '分式与根式', en: 'Fractions & roots' },
    { id: 'large', zh: '求和与积分', en: 'Sums & integrals' },
    { id: 'calc', zh: '极限与导数', en: 'Limits & derivatives' },
    { id: 'matrix', zh: '矩阵与行列式', en: 'Matrices & determinants' },
    { id: 'case', zh: '分段与对齐', en: 'Cases & alignment' },
    { id: 'accent', zh: '重音与修饰', en: 'Accents & marks' },
    { id: 'delim', zh: '定界符', en: 'Delimiters' },
    { id: 'func', zh: '函数与对数', en: 'Functions & logarithms' },
    { id: 'misc', zh: '其他结构', en: 'Other structures' },
  ]

  /** `tex` may contain `§`; the marker is removed and `caret` records its spot. */
  const RAW_TEMPLATES = [
    { id: 'frac', zh: '分数', en: 'Fraction', group: 'frac', tex: '\\frac{\u00a7}{}' },
    { id: 'cfrac', zh: '连分数', en: 'Continued fraction', group: 'frac', tex: '\\cfrac{1}{1 + \\cfrac{1}{\u00a7}}' },
    { id: 'nested-frac', zh: '嵌套分数', en: 'Nested fraction', group: 'frac', tex: '\\frac{\u00a7}{\\frac{}{}}' },
    { id: 'sqrt', zh: '平方根', en: 'Square root', group: 'frac', tex: '\\sqrt{\u00a7}' },
    { id: 'root', zh: 'n 次根号', en: 'Nth root', group: 'frac', tex: '\\sqrt[n]{\u00a7}' },
    { id: 'binom', zh: '二项式系数', en: 'Binomial coefficient', group: 'frac', tex: '\\binom{\u00a7}{}' },
    { id: 'sum', zh: '求和（带上下限）', en: 'Summation with limits', group: 'large', tex: '\\sum_{i=1}^{n} \u00a7' },
    { id: 'prod', zh: '连乘（带上下限）', en: 'Product with limits', group: 'large', tex: '\\prod_{i=1}^{n} \u00a7' },
    { id: 'int', zh: '定积分', en: 'Definite integral', group: 'large', tex: '\\int_{a}^{b} \u00a7 \\, \\mathrm{d}x' },
    { id: 'iint', zh: '二重积分', en: 'Double integral', group: 'large', tex: '\\iint_{D} \u00a7 \\, \\mathrm{d}A' },
    { id: 'iiint', zh: '三重积分', en: 'Triple integral', group: 'large', tex: '\\iiint_{V} \u00a7 \\, \\mathrm{d}V' },
    { id: 'oint', zh: '环路积分', en: 'Contour integral', group: 'large', tex: '\\oint_{C} \u00a7 \\, \\mathrm{d}s' },
    { id: 'lim', zh: '极限', en: 'Limit', group: 'calc', tex: '\\lim_{x \\to 0} \u00a7' },
    { id: 'dv', zh: '导数', en: 'Derivative', group: 'calc', tex: '\\frac{\\mathrm{d} \u00a7}{\\mathrm{d} x}' },
    { id: 'dv2', zh: '二阶导数', en: 'Second derivative', group: 'calc', tex: '\\frac{\\mathrm{d}^{2} y}{\\mathrm{d} x^{2}}' },
    { id: 'pdv', zh: '偏导数', en: 'Partial derivative', group: 'calc', tex: '\\frac{\\partial \u00a7}{\\partial x}' },
    { id: 'pdv2', zh: '二阶偏导', en: 'Second partial derivative', group: 'calc', tex: '\\frac{\\partial^{2} \u00a7}{\\partial x \\partial y}' },
    { id: 'grad', zh: '梯度', en: 'Gradient', group: 'calc', tex: '\\nabla \u00a7' },
    { id: 'matrix', zh: '无括号矩阵', en: 'Plain matrix', group: 'matrix', tex: '\\begin{matrix} \u00a7 & \\\\ & \\end{matrix}' },
    { id: 'pmatrix', zh: '圆括号矩阵', en: 'Parenthesized matrix', group: 'matrix', tex: '\\begin{pmatrix} \u00a7 & \\\\ & \\end{pmatrix}' },
    { id: 'bmatrix', zh: '方括号矩阵', en: 'Bracketed matrix', group: 'matrix', tex: '\\begin{bmatrix} \u00a7 & \\\\ & \\end{bmatrix}' },
    { id: 'vmatrix', zh: '行列式矩阵', en: 'Determinant matrix', group: 'matrix', tex: '\\begin{vmatrix} \u00a7 & \\\\ & \\end{vmatrix}' },
    { id: 'determinant', zh: '行列式', en: 'Determinant', group: 'matrix', tex: '\\det \\begin{vmatrix} \u00a7 & \\\\ & \\end{vmatrix}' },
    { id: 'cases', zh: '分段函数', en: 'Cases', group: 'case', tex: '\\begin{cases} \u00a7 & x > 0 \\\\ & \\text{otherwise} \\end{cases}' },
    { id: 'aligned', zh: '对齐环境', en: 'Aligned environment', group: 'case', tex: '\\begin{aligned} \u00a7 &= \\\\ &= \\end{aligned}' },
    { id: 'array', zh: '数组', en: 'Array', group: 'case', tex: '\\begin{array}{cc} \u00a7 & \\\\ & \\end{array}' },
    { id: 'overbrace', zh: '上花括号', en: 'Overbrace', group: 'accent', tex: '\\overbrace{\u00a7}^{}' },
    { id: 'underbrace', zh: '下花括号', en: 'Underbrace', group: 'accent', tex: '\\underbrace{\u00a7}_{}' },
    { id: 'vec', zh: '向量', en: 'Vector', group: 'accent', tex: '\\vec{\u00a7}' },
    { id: 'dot', zh: '一阶导点', en: 'Dot accent', group: 'accent', tex: '\\dot{\u00a7}' },
    { id: 'hat', zh: '帽子符号', en: 'Hat', group: 'accent', tex: '\\hat{\u00a7}' },
    { id: 'bar', zh: '平均值横线', en: 'Bar', group: 'accent', tex: '\\bar{\u00a7}' },
    { id: 'tilde', zh: '波浪号', en: 'Tilde', group: 'accent', tex: '\\tilde{\u00a7}' },
    { id: 'abs', zh: '绝对值', en: 'Absolute value', group: 'delim', tex: '\\left| \u00a7 \\right|' },
    { id: 'ceil', zh: '向上取整', en: 'Ceiling', group: 'delim', tex: '\\left\\lceil \u00a7 \\right\\rceil' },
    { id: 'floor', zh: '向下取整', en: 'Floor', group: 'delim', tex: '\\left\\lfloor \u00a7 \\right\\rfloor' },
    { id: 'norm', zh: '范数', en: 'Norm', group: 'delim', tex: '\\left\\lVert \u00a7 \\right\\rVert' },
    { id: 'angle', zh: '角括号', en: 'Angle brackets', group: 'delim', tex: '\\left\\langle \u00a7 \\right\\rangle' },
    { id: 'paren', zh: '自动括号', en: 'Auto-sized parentheses', group: 'delim', tex: '\\left( \u00a7 \\right)' },
    { id: 'log', zh: '对数', en: 'Logarithm', group: 'func', tex: '\\log_{\u00a7} x' },
    { id: 'sin', zh: '正弦', en: 'Sine', group: 'func', tex: '\\sin\\left(\u00a7\\right)' },
    { id: 'tanh', zh: '双曲正切', en: 'Hyperbolic tangent', group: 'func', tex: '\\tanh\\left(\u00a7\\right)' },
    { id: 'degree', zh: '角度符号', en: 'Degree', group: 'func', tex: '\u00a7^{\\circ}' },
    { id: 'subsup', zh: '上下标组合', en: 'Subscript & superscript', group: 'func', tex: 'x_{\u00a7}^{}' },
    { id: 'text', zh: '文本框', en: 'Text box', group: 'misc', tex: '\\text{\u00a7}' },
    { id: 'color', zh: '彩色框', en: 'Color box', group: 'misc', tex: '\\colorbox{yellow}{\u00a7}' },
    { id: 'cancel', zh: '删除线', en: 'Cancel', group: 'misc', tex: '\\cancel{\u00a7}' },
    { id: 'bbox', zh: '边框盒', en: 'Boxed formula', group: 'misc', tex: '\\bbox[5px, border: 1px solid red]{\u00a7}' },
  ]

  const TEMPLATES = RAW_TEMPLATES.map(function (template) {
    const raw = toSource(template.tex)
    const marker = raw.indexOf(CARET_MARKER)
    const tex = marker < 0 ? raw : raw.split(CARET_MARKER).join('')
    const caret = marker < 0 ? tex.length : Math.min(marker, tex.length)
    return { id: template.id, zh: template.zh, en: template.en, group: template.group, tex: tex, caret: caret }
  })

  /* ====================================================================== */
  /* dictionaries                                                           */
  /* ====================================================================== */

  const zhDict = {}
  const enDict = {}
  for (let i = 0; i < PALETTE.length; i += 1) {
    const category = PALETTE[i]
    zhDict['pal.' + category.id] = category.zh
    enDict['pal.' + category.id] = category.en
    for (let j = 0; j < category.groups.length; j += 1) {
      const group = category.groups[j]
      zhDict['pal.g.' + group.id] = group.zh
      enDict['pal.g.' + group.id] = group.en
    }
  }
  for (let i = 0; i < TEMPLATE_GROUPS.length; i += 1) {
    const group = TEMPLATE_GROUPS[i]
    zhDict['pal.tpl.' + group.id] = group.zh
    enDict['pal.tpl.' + group.id] = group.en
  }
  if (typeof LX.addDict === 'function') {
    LX.addDict('zh', zhDict)
    LX.addDict('en', enDict)
  }

  /* ====================================================================== */
  /* command labels (outline captions)                                      */
  /* ====================================================================== */

  /** First command of a snippet: `\frac{}{} `→ `\frac`, `\begin{pmatrix}…` → `\begin{pmatrix}`. */
  function primaryCommand(tex) {
    if (typeof tex !== 'string' || tex.charAt(0) !== '\\') return ''
    const env = /^\\begin\s*\{([A-Za-z*][A-Za-z*0-9]{0,40})\}/.exec(tex)
    if (env) return '\\begin{' + env[1] + '}'
    const named = /^\\([A-Za-z]+)/.exec(tex)
    if (named) return '\\' + named[1]
    const symbol = /^\\([\s\S])/.exec(tex)
    return symbol ? '\\' + symbol[1] : ''
  }

  const COMMAND_NAMES = Object.create(null)

  function rememberCommand(name, zh, en) {
    if (typeof name !== 'string' || name === '') return
    if (COMMAND_NAMES[name] === undefined) COMMAND_NAMES[name] = { zh: zh, en: en }
  }

  for (let i = 0; i < PALETTE.length; i += 1) {
    const category = PALETTE[i]
    for (let j = 0; j < category.groups.length; j += 1) {
      const items = category.groups[j].items
      for (let k = 0; k < items.length; k += 1) {
        const command = primaryCommand(items[k].tex)
        if (/^\\[A-Za-z]+$/.test(command)) rememberCommand(command.slice(1), items[k].zh, items[k].en)
      }
    }
  }

  const MANUAL_COMMAND_LABELS = {
    frac: { zh: '分数', en: 'Fraction' },
    dfrac: { zh: '大分数', en: 'Display fraction' },
    tfrac: { zh: '小分数', en: 'Text fraction' },
    cfrac: { zh: '连分数', en: 'Continued fraction' },
    binom: { zh: '二项式系数', en: 'Binomial coefficient' },
    dbinom: { zh: '二项式系数（显示）', en: 'Binomial coefficient (display)' },
    tbinom: { zh: '二项式系数（文本）', en: 'Binomial coefficient (text)' },
    genfrac: { zh: '广义分式', en: 'Generalized fraction' },
    sqrt: { zh: '根号', en: 'Square root' },
    root: { zh: 'n 次根号', en: 'Nth root' },
    left: { zh: '左定界符', en: 'Left delimiter' },
    right: { zh: '右定界符', en: 'Right delimiter' },
    begin: { zh: '环境开始', en: 'Environment begin' },
    end: { zh: '环境结束', en: 'Environment end' },
    '\\\\': { zh: '换行', en: 'Line break' },
    overline: { zh: '上划线', en: 'Overline' },
    underline: { zh: '下划线', en: 'Underline' },
    bbox: { zh: '边框盒', en: 'Boxed formula' },
    substack: { zh: '堆叠子公式', en: 'Substack' },
    operatorname: { zh: '算子名称', en: 'Operator name' },
    ' ': { zh: '控制空格', en: 'Control space' },
  }

  for (const name in MANUAL_COMMAND_LABELS) {
    if (hasOwn(MANUAL_COMMAND_LABELS, name)) COMMAND_NAMES[name] = MANUAL_COMMAND_LABELS[name]
  }

  const FALLBACK_LABEL = { zh: '命令', en: 'Command' }

  function commandLabel(name) {
    if (typeof name !== 'string' || name === '') return { zh: FALLBACK_LABEL.zh, en: FALLBACK_LABEL.en }
    const known = COMMAND_NAMES[name]
    if (known) return { zh: known.zh, en: known.en }
    return { zh: '\\' + name, en: '\\' + name }
  }

  /* ====================================================================== */
  /* parser                                                                 */
  /* ====================================================================== */

  const CODE_BACKSLASH = 92
  const CODE_OPEN_BRACE = 123
  const CODE_CLOSE_BRACE = 125
  const CODE_OPEN_BRACKET = 91
  const CODE_CLOSE_BRACKET = 93
  const CODE_CARET = 94
  const CODE_UNDERSCORE = 95
  const CODE_DOLLAR = 36
  const CODE_AMPERSAND = 38
  const CODE_PERCENT = 37
  const CODE_TILDE = 126

  const MAX_PARSE_DEPTH = 150
  const NODE_BUDGET = 40000

  function isLetterCode(code) {
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
  }

  function isDigitCode(code) {
    return code >= 48 && code <= 57
  }

  function isSpaceCode(code) {
    return code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11
  }

  function isStructuralCode(code) {
    if (isSpaceCode(code)) return true
    return (
      code === CODE_BACKSLASH ||
      code === CODE_OPEN_BRACE ||
      code === CODE_CLOSE_BRACE ||
      code === CODE_OPEN_BRACKET ||
      code === CODE_CLOSE_BRACKET ||
      code === CODE_CARET ||
      code === CODE_UNDERSCORE ||
      code === CODE_DOLLAR ||
      code === CODE_AMPERSAND ||
      code === CODE_PERCENT ||
      code === CODE_TILDE
    )
  }

  const CMD_ARITY = Object.create(null)
  const CMD_OPTIONAL = Object.create(null)
  const TEXT_COMMANDS = Object.create(null)

  function arity(names, count) {
    const list = names.split(' ')
    for (let i = 0; i < list.length; i += 1) {
      if (list[i]) CMD_ARITY[list[i]] = count
    }
  }

  arity(
    'text textrm textbf textit textsf texttt textnormal textup textsc emph mbox hbox operatorname ' +
      'mathrm mathbf mathit mathbb mathcal mathfrak mathsf mathtt mathscr mathnormal ' +
      'hat check breve acute grave tilde bar vec dot ddot dddot ddddot mathring widehat widetilde ' +
      'overline underline underbar overbrace underbrace overleftarrow overrightarrow overleftrightarrow ' +
      'underleftarrow underrightarrow underleftrightarrow ' +
      'sqrt boxed cancel bcancel xcancel bbox tag label ref eqref hspace vspace ' +
      'substack mathop mathrel mathbin mathord mathopen mathclose mathpunct mathinner ' +
      'smash phantom hphantom vphantom color',
    1,
  )
  arity('frac dfrac tfrac cfrac binom dbinom tbinom overset underset stackrel textcolor colorbox raisebox', 2)
  arity('genfrac', 6)
  arity('begin', 1)
  arity('end', 1)

  CMD_OPTIONAL.sqrt = 1
  CMD_OPTIONAL.xrightarrow = 1
  CMD_OPTIONAL.xleftarrow = 1
  CMD_OPTIONAL.item = 1

  const textCommandList = 'text textrm textbf textit textsf texttt textnormal textup textsc emph mbox hbox operatorname'
  const textCommandNames = textCommandList.split(' ')
  for (let i = 0; i < textCommandNames.length; i += 1) TEXT_COMMANDS[textCommandNames[i]] = true

  /**
   * Parse `source` into a tolerant AST.
   *
   * Node kinds: root, group, optional, command, env, sup, sub, char, text, space.
   * All nodes carry `start`/`end` offsets into the source. Never throws and always
   * terminates: the cursor strictly advances in every branch, and both nesting
   * depth and total node count are bounded.
   */
  function parseSource(input) {
    const src = toSource(input)
    const length = src.length
    let pos = 0
    let budget = NODE_BUDGET

    function charge() {
      budget -= 1
    }

    function charNode(start, end) {
      charge()
      return { type: 'char', start: start, end: end, value: src.slice(start, end) }
    }

    function spaceNode(start, end) {
      charge()
      return { type: 'space', start: start, end: end, value: src.slice(start, end) }
    }

    function textNode(start, end) {
      charge()
      return { type: 'text', start: start, end: end, value: src.slice(start, end) }
    }

    function skipSpaces() {
      const start = pos
      while (pos < length && isSpaceCode(src.charCodeAt(pos))) pos += 1
      return pos - start
    }

    /** `\end{name}` starting exactly at `at`, or null. */
    function matchEnvEnd(at) {
      if (src.charCodeAt(at + 1) !== 101) return null
      const sliceEnd = Math.min(length, at + 220)
      const match = /^\\end\s*\{([^{}\\]{0,120})\}/.exec(src.slice(at, sliceEnd))
      if (!match) return null
      return { name: match[1].trim(), end: at + match[0].length }
    }

    function textRun() {
      const start = pos
      while (pos < length && !isStructuralCode(src.charCodeAt(pos))) pos += 1
      if (pos === start) pos += 1
      return textNode(start, pos)
    }

    function commentRun() {
      const start = pos
      while (pos < length) {
        const code = src.charCodeAt(pos)
        if (code === 10 || code === 13) break
        pos += 1
      }
      const node = spaceNode(start, pos)
      node.comment = true
      return node
    }

    function spaceRun() {
      const start = pos
      while (pos < length && isSpaceCode(src.charCodeAt(pos))) pos += 1
      return spaceNode(start, pos)
    }

    function parseGroup(level) {
      const start = pos
      pos += 1
      const children = []
      if (level >= MAX_PARSE_DEPTH) {
        const innerStart = pos
        let depth = 1
        while (pos < length && depth > 0) {
          const code = src.charCodeAt(pos)
          if (code === CODE_OPEN_BRACE) depth += 1
          else if (code === CODE_CLOSE_BRACE) depth -= 1
          pos += 1
        }
        const innerEnd = depth === 0 ? pos - 1 : length
        if (innerEnd > innerStart) children.push(textNode(innerStart, innerEnd))
        else charge()
      } else {
        const sequence = parseSequence(true, null, level + 1, false)
        for (let i = 0; i < sequence.children.length; i += 1) children.push(sequence.children[i])
      }
      charge()
      return { type: 'group', start: start, end: pos, children: children }
    }

    function parseOptional(level) {
      const start = pos
      pos += 1
      const children = []
      if (level >= MAX_PARSE_DEPTH) {
        const innerStart = pos
        while (pos < length && src.charCodeAt(pos) !== CODE_CLOSE_BRACKET) pos += 1
        if (pos > innerStart) children.push(textNode(innerStart, pos))
        if (pos < length) pos += 1
      } else {
        const sequence = parseSequence(false, null, level + 1, true)
        for (let i = 0; i < sequence.children.length; i += 1) children.push(sequence.children[i])
      }
      charge()
      return { type: 'optional', start: start, end: pos, children: children }
    }

    /** One LaTeX argument: a braced group, a command, or a single token. */
    function parseArgument(level) {
      const save = pos
      skipSpaces()
      if (pos >= length) {
        pos = save
        return null
      }
      const code = src.charCodeAt(pos)
      if (code === CODE_CLOSE_BRACE) {
        pos = save
        return null
      }
      if (code === CODE_OPEN_BRACE) return parseGroup(level)
      if (code === CODE_BACKSLASH) return parseCommand(level)
      const start = pos
      pos += 1
      return charNode(start, pos)
    }

    /** Argument of a text-mode command: the group body stays literal. */
    function parseLiteralArgument(level) {
      const save = pos
      skipSpaces()
      if (pos >= length || src.charCodeAt(pos) !== CODE_OPEN_BRACE) {
        pos = save
        return parseArgument(level)
      }
      const start = pos
      let depth = 1
      let index = pos + 1
      while (index < length) {
        const code = src.charCodeAt(index)
        if (code === CODE_BACKSLASH) {
          index += 2
          continue
        }
        if (code === CODE_OPEN_BRACE) depth += 1
        else if (code === CODE_CLOSE_BRACE) {
          depth -= 1
          if (depth === 0) {
            index += 1
            break
          }
        }
        index += 1
      }
      pos = Math.min(length, index)
      const innerStart = start + 1
      const innerEnd = depth === 0 ? pos - 1 : length
      const children = []
      if (innerEnd > innerStart) children.push(textNode(innerStart, Math.min(innerEnd, length)))
      charge()
      return { type: 'group', start: start, end: pos, children: children, textMode: true }
    }

    function parseCommand(level) {
      const start = pos
      pos += 1
      if (pos >= length) return charNode(start, pos)
      const code = src.charCodeAt(pos)
      let name
      if (isLetterCode(code)) {
        const nameStart = pos
        while (pos < length && isLetterCode(src.charCodeAt(pos))) pos += 1
        name = src.slice(nameStart, pos)
      } else if (code === CODE_BACKSLASH) {
        pos += 1
        name = '\\\\'
      } else {
        pos += 1
        name = src.charAt(pos - 1)
      }
      if (name === 'begin' && level < MAX_PARSE_DEPTH) {
        const environment = tryEnvironment(start, level)
        if (environment !== null) return environment
      }
      return commandNode(start, name, level)
    }

    function commandNode(start, name, level) {
      const args = []
      const optional = []
      const optionalCount = CMD_OPTIONAL[name] || 0
      for (let k = 0; k < optionalCount; k += 1) {
        const save = pos
        skipSpaces()
        if (pos < length && src.charCodeAt(pos) === CODE_OPEN_BRACKET) {
          optional.push(parseOptional(level + 1))
        } else {
          pos = save
          break
        }
      }
      const count = name in CMD_ARITY ? CMD_ARITY[name] : -1
      if (count > 0 && level < MAX_PARSE_DEPTH) {
        for (let k = 0; k < count; k += 1) {
          const argument = k === 0 && TEXT_COMMANDS[name] ? parseLiteralArgument(level + 1) : parseArgument(level + 1)
          if (argument === null) break
          args.push(argument)
        }
      } else if (count < 0 && level < MAX_PARSE_DEPTH && /^[A-Za-z]+$/.test(name)) {
        // Unknown macro: swallow one braced group so user macros nest sensibly.
        const save = pos
        skipSpaces()
        if (pos < length && src.charCodeAt(pos) === CODE_OPEN_BRACE) {
          args.push(parseGroup(level + 1))
        } else {
          pos = save
        }
      }
      charge()
      return { type: 'command', start: start, end: pos, name: name, args: args, optional: optional }
    }

    function tryEnvironment(start, level) {
      const save = pos
      skipSpaces()
      if (pos >= length || src.charCodeAt(pos) !== CODE_OPEN_BRACE) {
        pos = save
        return null
      }
      const nameGroup = parseLiteralArgument(level + 1)
      const innerStart = nameGroup.start + 1
      const innerEnd = Math.max(innerStart, nameGroup.end - 1)
      const name = src.slice(innerStart, innerEnd).trim()
      if (!/^[A-Za-z][A-Za-z*0-9]{0,40}$/.test(name)) {
        charge()
        return { type: 'command', start: start, end: pos, name: 'begin', args: [nameGroup], optional: [] }
      }
      const bodyStart = pos
      const children = []
      let bodyEnd = pos
      if (level < MAX_PARSE_DEPTH) {
        const sequence = parseSequence(false, name, level + 1, false)
        for (let i = 0; i < sequence.children.length; i += 1) children.push(sequence.children[i])
        bodyEnd = sequence.end
      }
      charge()
      const body = { type: 'root', start: bodyStart, end: bodyEnd, children: children, envBody: true }
      charge()
      return { type: 'env', start: start, end: bodyEnd, name: name, body: body }
    }

    function parseScript(children, level) {
      const markerStart = pos
      const markerCode = src.charCodeAt(pos)
      pos += 1
      // Spaces between the base and the marker belong to the script span when a
      // base is absorbed below; without a base they stay as ordinary siblings.
      const tail = []
      while (children.length > 0 && children[children.length - 1].type === 'space') tail.unshift(children.pop())
      let base = children.length > 0 ? children.pop() : null
      if (base !== null && base.type === 'text' && typeof base.value === 'string' && base.value.length > 1) {
        const splitAt = base.end - 1
        children.push(textNode(base.start, splitAt))
        base = textNode(splitAt, base.end)
      }
      if (base === null) {
        for (let i = 0; i < tail.length; i += 1) children.push(tail[i])
      }
      let argument = null
      if (level < MAX_PARSE_DEPTH) argument = parseArgument(level + 1)
      const end = argument !== null ? argument.end : pos
      const nodeStart = base !== null ? Math.min(base.start, markerStart) : markerStart
      charge()
      children.push({
        type: markerCode === CODE_CARET ? 'sup' : 'sub',
        start: nodeStart,
        end: end,
        base: base,
        arg: argument,
      })
    }

    function parseSequence(stopBrace, envName, level, stopBracket) {
      const children = []
      const start = pos
      let closed = false
      while (pos < length) {
        if (budget <= 0) {
          if (pos < length) children.push(textNode(pos, length))
          pos = length
          break
        }
        const code = src.charCodeAt(pos)
        if (envName !== null && code === CODE_BACKSLASH) {
          const info = matchEnvEnd(pos)
          if (info !== null && info.name === envName) {
            pos = info.end
            closed = true
            break
          }
        }
        if (code === CODE_CLOSE_BRACE) {
          if (stopBrace) {
            pos += 1
            closed = true
            break
          }
          children.push(charNode(pos, pos + 1))
          pos += 1
          continue
        }
        if (code === CODE_CLOSE_BRACKET && stopBracket) {
          pos += 1
          closed = true
          break
        }
        if (code === CODE_BACKSLASH) {
          children.push(parseCommand(level))
          continue
        }
        if (code === CODE_OPEN_BRACE) {
          if (level >= MAX_PARSE_DEPTH) {
            children.push(charNode(pos, pos + 1))
            pos += 1
            continue
          }
          children.push(parseGroup(level))
          continue
        }
        if (code === CODE_OPEN_BRACKET || code === CODE_CLOSE_BRACKET) {
          children.push(charNode(pos, pos + 1))
          pos += 1
          continue
        }
        if (code === CODE_CARET || code === CODE_UNDERSCORE) {
          parseScript(children, level)
          continue
        }
        if (code === CODE_DOLLAR || code === CODE_AMPERSAND) {
          children.push(charNode(pos, pos + 1))
          pos += 1
          continue
        }
        if (code === CODE_PERCENT) {
          children.push(commentRun())
          continue
        }
        if (code === CODE_TILDE) {
          children.push(spaceNode(pos, pos + 1))
          pos += 1
          continue
        }
        if (isSpaceCode(code)) {
          children.push(spaceRun())
          continue
        }
        children.push(textRun())
      }
      return { children: children, start: start, end: pos, closed: closed }
    }

    const sequence = parseSequence(false, null, 0, false)
    return { type: 'root', start: 0, end: length, children: sequence.children }
  }

  /** Total wrapper: any unexpected failure degrades to an empty root. */
  function parse(source) {
    try {
      return parseSource(source)
    } catch (error) {
      return { type: 'root', start: 0, end: toSource(source).length, children: [] }
    }
  }

  /* ====================================================================== */
  /* outline                                                                */
  /* ====================================================================== */

  const GROUP_LABEL = { zh: '分组', en: 'Group' }
  const TEXT_LABEL = { zh: '文本', en: 'Text' }
  const SUP_LABEL = { zh: '上标', en: 'Superscript' }
  const SUB_LABEL = { zh: '下标', en: 'Subscript' }
  const OUTLINE_LIMIT = 400

  function outlineLabel(node) {
    switch (node.type) {
      case 'group':
        return GROUP_LABEL
      case 'sup':
        return SUP_LABEL
      case 'sub':
        return SUB_LABEL
      case 'command':
        return commandLabel(node.name)
      case 'env':
        return { zh: '环境 ' + node.name, en: node.name + ' environment' }
      case 'text': {
        const value = String(node.value || '').replace(/\s+/g, ' ').trim()
        if (value === '') return TEXT_LABEL
        const short = value.length > 32 ? value.slice(0, 32) + '…' : value
        return { zh: short, en: short }
      }
      default:
        return GROUP_LABEL
    }
  }

  function outline(source) {
    const src = toSource(source)
    let ast
    try {
      ast = parseSource(src)
    } catch (error) {
      return []
    }
    const entries = []

    function visit(node, depth) {
      if (entries.length >= OUTLINE_LIMIT || node === null || node === undefined) return
      const type = node.type
      if (type === 'root') {
        const kids = node.children || []
        for (let i = 0; i < kids.length && entries.length < OUTLINE_LIMIT; i += 1) visit(kids[i], depth)
        return
      }
      if (type === 'char' || type === 'space') return
      if (type === 'optional') {
        const kids = node.children || []
        for (let i = 0; i < kids.length && entries.length < OUTLINE_LIMIT; i += 1) visit(kids[i], depth + 1)
        return
      }
      const entry = {
        depth: depth,
        kind: type,
        label: outlineLabel(node),
        start: node.start,
        end: node.end,
        tex: src.slice(node.start, node.end),
      }
      if (type === 'command' || type === 'env') entry.name = node.name
      entries.push(entry)
      if (type === 'command') {
        const optionals = node.optional || []
        for (let i = 0; i < optionals.length && entries.length < OUTLINE_LIMIT; i += 1) visit(optionals[i], depth + 1)
        const args = node.args || []
        for (let i = 0; i < args.length && entries.length < OUTLINE_LIMIT; i += 1) visit(args[i], depth + 1)
        return
      }
      if (type === 'env') {
        const body = node.body
        if (body && body.children) {
          for (let i = 0; i < body.children.length && entries.length < OUTLINE_LIMIT; i += 1) visit(body.children[i], depth + 1)
        }
        return
      }
      if (type === 'sup' || type === 'sub') {
        visit(node.base, depth + 1)
        visit(node.arg, depth + 1)
        return
      }
      const kids = node.children || []
      for (let i = 0; i < kids.length && entries.length < OUTLINE_LIMIT; i += 1) visit(kids[i], depth + 1)
    }

    visit(ast, 0)
    return entries
  }

  /* ====================================================================== */
  /* tokenizer                                                              */
  /* ====================================================================== */

  function matchEnvToken(src, at, length) {
    const sliceEnd = Math.min(length, at + 220)
    const match = /^\\(end|begin)\s*\{([A-Za-z*][A-Za-z*0-9]{0,40})\}/.exec(src.slice(at, sliceEnd))
    if (!match) return -1
    return at + match[0].length
  }

  /**
   * Syntax-highlight ranges: `{ from, to, cls }`, non-overlapping and sorted.
   * `cls` ∈ command | brace | math | number | text | comment | env.
   */
  function tokenize(source) {
    const src = toSource(source)
    const length = src.length
    const tokens = []

    function push(from, to, cls) {
      if (to > from) tokens.push({ from: from, to: to, cls: cls })
    }

    let index = 0
    while (index < length) {
      const code = src.charCodeAt(index)
      if (code === CODE_PERCENT) {
        let end = index + 1
        while (end < length) {
          const inner = src.charCodeAt(end)
          if (inner === 10 || inner === 13) break
          end += 1
        }
        push(index, end, 'comment')
        index = end
        continue
      }
      if (code === CODE_DOLLAR) {
        const double = index + 1 < length && src.charCodeAt(index + 1) === CODE_DOLLAR
        push(index, index + (double ? 2 : 1), 'math')
        index += double ? 2 : 1
        continue
      }
      if (code === CODE_BACKSLASH) {
        const next = index + 1 < length ? src.charCodeAt(index + 1) : -1
        if (next === 91 || next === 93 || next === 40 || next === 41) {
          push(index, index + 2, 'math')
          index += 2
          continue
        }
        if (next === CODE_BACKSLASH) {
          push(index, index + 2, 'command')
          index += 2
          continue
        }
        if (isLetterCode(next)) {
          const envEnd = matchEnvToken(src, index, length)
          if (envEnd > index) {
            push(index, envEnd, 'env')
            index = envEnd
            continue
          }
          let end = index + 2
          while (end < length && isLetterCode(src.charCodeAt(end))) end += 1
          push(index, end, 'command')
          index = end
          continue
        }
        push(index, Math.min(index + 2, length), 'command')
        index = Math.min(index + 2, length)
        continue
      }
      if (
        code === CODE_OPEN_BRACE ||
        code === CODE_CLOSE_BRACE ||
        code === CODE_OPEN_BRACKET ||
        code === CODE_CLOSE_BRACKET
      ) {
        push(index, index + 1, 'brace')
        index += 1
        continue
      }
      if (code === CODE_CARET || code === CODE_UNDERSCORE || code === CODE_AMPERSAND) {
        push(index, index + 1, 'math')
        index += 1
        continue
      }
      if (isDigitCode(code)) {
        let end = index + 1
        while (end < length && isDigitCode(src.charCodeAt(end))) end += 1
        if (end + 1 < length && src.charAt(end) === '.' && isDigitCode(src.charCodeAt(end + 1))) {
          end += 1
          while (end < length && isDigitCode(src.charCodeAt(end))) end += 1
        }
        push(index, end, 'number')
        index = end
        continue
      }
      if (isSpaceCode(code)) {
        index += 1
        continue
      }
      let end = index + 1
      while (end < length) {
        const inner = src.charCodeAt(end)
        if (isStructuralCode(inner) || isDigitCode(inner)) break
        end += 1
      }
      push(index, end, 'text')
      index = end
    }
    return tokens
  }

  /* ====================================================================== */
  /* normalize                                                              */
  /* ====================================================================== */

  /* Only pure display wrappers are unwrapped by normalize(): an alignment
     environment (align/gather/eqnarray/…) must keep its \begin…\end or the
     exported/rendered TeX loses the alignment tabs and fails with
     "Misplaced &". */
  const TOP_LEVEL_WRAPPERS = {
    equation: true,
    'equation*': true,
    displaymath: true,
    math: true,
  }

  function hasUnescaped(text, marker) {
    let index = 0
    while (index < text.length) {
      const char = text.charAt(index)
      if (char === '\\') {
        index += 2
        continue
      }
      if (char === marker) return true
      index += 1
    }
    return false
  }

  function matchOuterEnvironment(text) {
    const open = /^\\begin\s*\{([A-Za-z*][A-Za-z*0-9]{0,40})\}/.exec(text)
    if (!open) return null
    const name = open[1]
    if (TOP_LEVEL_WRAPPERS[name] !== true) return null
    const trimmed = text.replace(/\s+$/, '')
    const endToken = '\\end{' + name + '}'
    if (trimmed.length <= endToken.length) return null
    if (trimmed.slice(-endToken.length) !== endToken) return null
    const bodyStart = open[0].length
    const bodyEnd = trimmed.length - endToken.length
    if (bodyEnd <= bodyStart) return null
    const firstEnd = trimmed.indexOf(endToken, bodyStart)
    if (firstEnd !== bodyEnd) return null
    return { name: name, bodyStart: bodyStart, bodyEnd: bodyEnd }
  }

  function normalize(source) {
    let text = toSource(source).trim()
    for (let pass = 0; pass < 8; pass += 1) {
      let changed = false
      if (text.length >= 4 && text.slice(0, 2) === '$$' && text.slice(-2) === '$$') {
        const inner = text.slice(2, -2)
        if (!hasUnescaped(inner, '$')) {
          text = inner.trim()
          changed = true
        }
      }
      if (
        !changed &&
        text.length >= 2 &&
        text.charAt(0) === '$' &&
        text.charAt(text.length - 1) === '$' &&
        text.charAt(1) !== '$' &&
        text.charAt(text.length - 2) !== '$'
      ) {
        const inner = text.slice(1, -1)
        if (!hasUnescaped(inner, '$')) {
          text = inner.trim()
          changed = true
        }
      }
      if (!changed && text.length >= 4 && text.slice(0, 2) === '\\[' && text.slice(-2) === '\\]') {
        const inner = text.slice(2, -2)
        if (inner.indexOf('\\]') < 0) {
          text = inner.trim()
          changed = true
        }
      }
      if (!changed && text.length >= 4 && text.slice(0, 2) === '\\(' && text.slice(-2) === '\\)') {
        const inner = text.slice(2, -2)
        if (inner.indexOf('\\)') < 0) {
          text = inner.trim()
          changed = true
        }
      }
      if (!changed) {
        const wrapper = matchOuterEnvironment(text)
        if (wrapper !== null) {
          text = text.slice(wrapper.bodyStart, wrapper.bodyEnd).trim()
          changed = true
        }
      }
      if (!changed) break
    }
    return text
  }

  /* ====================================================================== */
  /* stats                                                                  */
  /* ====================================================================== */

  /** Nesting depth of containers (groups / environments); root level is 0. */
  function measureDepth(root) {
    let best = 0
    if (!root) return 0
    const stack = [{ node: root, depth: 0 }]
    while (stack.length > 0) {
      const frame = stack.pop()
      const node = frame.node
      if (node === null || node === undefined || typeof node !== 'object') continue
      let depth = frame.depth
      if (depth > best) best = depth
      const type = node.type
      if (type === 'group' || type === 'optional') {
        depth += 1
        if (depth > best) best = depth
        const kids = node.children || []
        for (let i = 0; i < kids.length; i += 1) stack.push({ node: kids[i], depth: depth })
        continue
      }
      if (type === 'env') {
        depth += 1
        if (depth > best) best = depth
        const body = node.body
        if (body && body.children) {
          for (let i = 0; i < body.children.length; i += 1) stack.push({ node: body.children[i], depth: depth })
        }
        continue
      }
      if (type === 'command') {
        const args = node.args || []
        for (let i = 0; i < args.length; i += 1) stack.push({ node: args[i], depth: depth })
        const optionals = node.optional || []
        for (let i = 0; i < optionals.length; i += 1) stack.push({ node: optionals[i], depth: depth })
        continue
      }
      if (type === 'sup' || type === 'sub') {
        stack.push({ node: node.base, depth: depth })
        stack.push({ node: node.arg, depth: depth })
        continue
      }
      if (type === 'root') {
        const kids = node.children || []
        for (let i = 0; i < kids.length; i += 1) stack.push({ node: kids[i], depth: depth })
      }
    }
    return best
  }

  function stats(source) {
    const src = toSource(source)
    const normalized = normalize(src)
    let commands = 0
    try {
      const tokens = tokenize(src)
      for (let i = 0; i < tokens.length; i += 1) {
        const cls = tokens[i].cls
        if (cls === 'command' || cls === 'env') commands += 1
      }
    } catch (error) {
      commands = 0
    }
    let depth = 0
    try {
      depth = measureDepth(parseSource(src))
    } catch (error) {
      depth = 0
    }
    return { chars: normalized.length, commands: commands, depth: depth }
  }

  /* ====================================================================== */
  /* completions                                                            */
  /* ====================================================================== */

  let completionCache = null

  function buildCompletions() {
    const seen = Object.create(null)
    const out = []
    function add(cmd, zh, en) {
      if (!cmd || seen[cmd] === true) return
      seen[cmd] = true
      out.push({ cmd: cmd, zh: zh, en: en })
    }
    for (let i = 0; i < PALETTE.length; i += 1) {
      const groups = PALETTE[i].groups
      for (let j = 0; j < groups.length; j += 1) {
        const items = groups[j].items
        for (let k = 0; k < items.length; k += 1) {
          add(primaryCommand(items[k].tex), items[k].zh, items[k].en)
        }
      }
    }
    for (let i = 0; i < TEMPLATES.length; i += 1) {
      const template = TEMPLATES[i]
      add(primaryCommand(template.tex), template.zh, template.en)
    }
    return out
  }

  function completions() {
    if (completionCache === null) completionCache = buildCompletions()
    const copy = []
    for (let i = 0; i < completionCache.length; i += 1) {
      const entry = completionCache[i]
      copy.push({ cmd: entry.cmd, zh: entry.zh, en: entry.en })
    }
    return copy
  }

  /* ====================================================================== */
  /* editor insertion helpers                                               */
  /* ====================================================================== */

  function clampIndex(value, length) {
    const index = toInt(value, 0)
    if (index < 0) return 0
    if (index > length) return length
    return index
  }

  function selectionOf(text, selStart, selEnd) {
    const length = text.length
    let from = clampIndex(selStart, length)
    let to = clampIndex(selEnd === undefined || selEnd === null ? from : selEnd, length)
    if (to < from) {
      const swap = from
      from = to
      to = swap
    }
    return { from: from, to: to }
  }

  /**
   * Replace `[selStart, selEnd)` with `snippet`.
   *
   * `§` in `snippet` marks the caret; all markers are removed. When `caret` is a
   * number it wins and is interpreted against the marker-free snippet.
   * Returns `{ text, selStart, selEnd }` with an empty selection at the caret.
   */
  function insertAt(text, selStart, selEnd, snippet, caret) {
    const src = toSource(text)
    const selection = selectionOf(src, selStart, selEnd)
    const raw = toSource(snippet)
    const marker = raw.indexOf(CARET_MARKER)
    const inserted = marker < 0 ? raw : raw.split(CARET_MARKER).join('')
    let offset
    if (caret !== undefined && caret !== null && caret !== '') {
      const numeric = typeof caret === 'number' ? caret : parseInt(caret, 10)
      offset = Number.isFinite(numeric) ? Math.round(numeric) : inserted.length
    } else if (marker >= 0) {
      offset = marker
    } else {
      offset = inserted.length
    }
    if (offset < 0) offset = 0
    if (offset > inserted.length) offset = inserted.length
    const nextText = src.slice(0, selection.from) + inserted + src.slice(selection.to)
    const at = selection.from + offset
    return { text: nextText, selStart: at, selEnd: at }
  }

  /**
   * Wrap `[selStart, selEnd)` with `before`/`after`.
   * Empty selection → caret sits between `before` and `after`.
   * Non-empty selection → the original content stays selected inside the wrapper.
   */
  function wrapSelection(text, selStart, selEnd, before, after) {
    const src = toSource(text)
    const selection = selectionOf(src, selStart, selEnd)
    const head = toSource(before)
    const tail = toSource(after)
    const inner = src.slice(selection.from, selection.to)
    const nextText = src.slice(0, selection.from) + head + inner + tail + src.slice(selection.to)
    if (selection.to > selection.from) {
      return {
        text: nextText,
        selStart: selection.from + head.length,
        selEnd: selection.from + head.length + inner.length,
      }
    }
    const at = selection.from + head.length
    return { text: nextText, selStart: at, selEnd: at }
  }

  /** Preview-friendly variant of a palette `tex`: markers become `x`. */
  function previewTex(source) {
    const raw = toSource(source)
    if (raw.indexOf(CARET_MARKER) < 0) return raw
    return raw.split(CARET_MARKER).join('x')
  }

  /* ====================================================================== */
  /* public API                                                             */
  /* ====================================================================== */

  LX.latex = {
    palette: PALETTE,
    templates: TEMPLATES,
    templateGroups: TEMPLATE_GROUPS,
    insertAt: insertAt,
    wrapSelection: wrapSelection,
    parse: parse,
    outline: outline,
    tokenize: tokenize,
    normalize: normalize,
    stats: stats,
    completions: completions,
    commandLabel: commandLabel,
    previewTex: previewTex,
  }
})()
