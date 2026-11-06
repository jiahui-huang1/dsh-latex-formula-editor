/**
 * @local/dsh-latex-editor — lib/35-tiles.js
 *
 * The LaTeX Live style workbench: two tile rows (快捷工具 / 公式模板), a docked
 * hover panel per tile, rendered font/size menus, favourites and the format row.
 *
 * TeX is written with `@` standing for a backslash and `§` for the caret marker,
 * so this file contains no escape sequences at all; `tex()` converts at load.
 *   '@frac{§}{}'  ->  '\frac{§}{}'
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

  /* ------------------------------------------------------------- helpers */

  const tex = function (value) {
    return String(value).split('@').join(String.fromCharCode(92))
  }

  function item(entry) {
    return { tex: tex(entry[0]), zh: entry[1], en: entry[2] || entry[1] }
  }

  const svgCache = new Map()
  const pendingRender = new Set()

  /** Progressive MathJax upgrade for any list of `{tex}` items. */
  function useUpgrades(items, versionSink) {
    const key = items
      .map(function (entry) {
        return entry.tex
      })
      .join('\u0000')
    const [tick, setTick] = useState(0)
    useEffect(
      function () {
        const render = LX.render
        if (!render || typeof render.tex2svg !== 'function') return undefined
        let alive = true
        const queue = []
        for (const entry of items) {
          if (svgCache.has(entry.tex) || pendingRender.has(entry.tex)) continue
          pendingRender.add(entry.tex)
          queue.push(entry.tex)
        }
        if (queue.length === 0) return undefined
        async function run() {
          let index = 0
          while (alive && index < queue.length) {
            const batch = queue.slice(index, index + 4)
            index += batch.length
            await Promise.all(
              batch.map(async function (one) {
                try {
                  const out = await render.tex2svg(one, { display: false, scale: 1.25 })
                  const svg = out && out.svg
                  const failed = Boolean(out && out.errors && out.errors.length) || /merror|data-mjx-error/.test(svg || '')
                  const draws = Boolean(svg) && /<(use|path|rect|line|polygon|circle|ellipse|text)\b/.test(svg)
                  svgCache.set(one, failed || !draws ? null : svg)
                } catch {
                  svgCache.set(one, null)
                } finally {
                  pendingRender.delete(one)
                }
              }),
            )
            if (alive) setTick(function (n) {
              return n + 1
            })
          }
        }
        run()
        return function () {
          alive = false
        }
      },
      [key],
    )
    return tick
  }

  function TexFace(props) {
    const markup = svgCache.get(props.tex)
    if (markup) {
      return h('span', { className: 'lx-tf-face', dangerouslySetInnerHTML: { __html: markup } })
    }
    return h('span', { className: 'lx-tf-text', title: props.tex }, props.tex)
  }

  /* ---------------------------------------------------- 快捷工具 tile data */

  const QUICK = [
    {
      id: 'basic',
      zh: '常用符号',
      en: 'Common symbols',
      icon: '@times@;@cap@;@infty',
      groups: [
        {
          id: 'rel',
          zh: '关系符号',
          en: 'Relations',
          items: [
            ['=', '等于', 'Equals'],
            ['@ne', '不等于', 'Not equal'],
            ['@approx', '约等于', 'Approximately'],
            ['@equiv', '恒等于', 'Identical'],
            ['<', '小于', 'Less than'],
            ['>', '大于', 'Greater than'],
            ['@le', '小于等于', 'Less or equal'],
            ['@ge', '大于等于', 'Greater or equal'],
            ['@propto', '正比于', 'Proportional'],
            ['@sim', '相似', 'Similar'],
          ],
        },
        {
          id: 'op',
          zh: '运算符号',
          en: 'Operators',
          items: [
            ['+', '加', 'Plus'],
            ['-', '减', 'Minus'],
            ['@pm', '正负', 'Plus-minus'],
            ['@mp', '负正', 'Minus-plus'],
            ['@times', '乘', 'Times'],
            ['@div', '除', 'Divide'],
            ['@cdot', '点乘', 'Dot'],
            ['@ast', '星乘', 'Asterisk'],
            ['@infty', '无穷', 'Infinity'],
            ['@partial', '偏导', 'Partial'],
            ['@nabla', '梯度算子', 'Nabla'],
            ['@ell', '手写 l', 'Script l'],
          ],
        },
        {
          id: 'set',
          zh: '集合与逻辑',
          en: 'Sets and logic',
          items: [
            ['@cap', '交集', 'Intersection'],
            ['@cup', '并集', 'Union'],
            ['@subset', '真子集', 'Subset'],
            ['@subseteq', '子集', 'Subset or equal'],
            ['@supset', '真包含', 'Superset'],
            ['@in', '属于', 'Element of'],
            ['@notin', '不属于', 'Not element of'],
            ['@forall', '任意', 'For all'],
            ['@exists', '存在', 'Exists'],
            ['@emptyset', '空集', 'Empty set'],
            ['@neg', '非', 'Not'],
            ['@land', '且', 'And'],
            ['@lor', '或', 'Or'],
            ['@therefore', '所以', 'Therefore'],
          ],
        },
      ],
    },
    {
      id: 'greek',
      zh: '希腊字母',
      en: 'Greek',
      icon: '@alpha@beta@gamma@delta',
      groups: [
        {
          id: 'lower',
          zh: '小写字母',
          en: 'Lower case',
          items: [
            ['@alpha', '阿尔法', 'alpha'],
            ['@beta', '贝塔', 'beta'],
            ['@gamma', '伽马', 'gamma'],
            ['@delta', '德尔塔', 'delta'],
            ['@epsilon', '艾普西龙', 'epsilon'],
            ['@varepsilon', '变体艾普西龙', 'varepsilon'],
            ['@zeta', '泽塔', 'zeta'],
            ['@eta', '伊塔', 'eta'],
            ['@theta', '西塔', 'theta'],
            ['@vartheta', '变体西塔', 'vartheta'],
            ['@iota', '约塔', 'iota'],
            ['@kappa', '卡帕', 'kappa'],
            ['@lambda', '兰布达', 'lambda'],
            ['@mu', '缪', 'mu'],
            ['@nu', '纽', 'nu'],
            ['@xi', '克西', 'xi'],
            ['@pi', '派', 'pi'],
            ['@rho', '柔', 'rho'],
            ['@sigma', '西格玛', 'sigma'],
            ['@tau', '陶', 'tau'],
            ['@upsilon', '宇普西龙', 'upsilon'],
            ['@phi', '斐', 'phi'],
            ['@varphi', '变体斐', 'varphi'],
            ['@chi', '希', 'chi'],
            ['@psi', '普西', 'psi'],
            ['@omega', '欧米伽', 'omega'],
          ],
        },
        {
          id: 'upper',
          zh: '大写字母',
          en: 'Upper case',
          items: [
            ['@Gamma', '大写伽马', 'Gamma'],
            ['@Delta', '大写德尔塔', 'Delta'],
            ['@Theta', '大写西塔', 'Theta'],
            ['@Lambda', '大写兰布达', 'Lambda'],
            ['@Xi', '大写克西', 'Xi'],
            ['@Pi', '大写派', 'Pi'],
            ['@Sigma', '大写西格玛', 'Sigma'],
            ['@Upsilon', '大写宇普西龙', 'Upsilon'],
            ['@Phi', '大写斐', 'Phi'],
            ['@Psi', '大写普西', 'Psi'],
            ['@Omega', '大写欧米伽', 'Omega'],
          ],
        },
      ],
    },
    {
      id: 'frac',
      zh: '分数微分',
      en: 'Fractions & calculus',
      icon: '@frac{a}{y}',
      groups: [
        {
          id: 'frac',
          zh: '分数',
          en: 'Fractions',
          items: [
            ['@frac{§}{}', '分数', 'Fraction'],
            ['@dfrac{§}{}', '大号分数', 'Display fraction'],
            ['@tfrac{§}{}', '小号分数', 'Text fraction'],
            ['@cfrac{§}{}', '连分数', 'Continued fraction'],
            ['@frac{1}{§}', '倒数', 'Reciprocal'],
            ['@frac{@partial §}{@partial x}', '偏导', 'Partial derivative'],
            ['@frac{@mathrm{d}§}{@mathrm{d}x}', '导数', 'Derivative'],
            ['@frac{@mathrm{d}^{2}§}{@mathrm{d}x^{2}}', '二阶导数', 'Second derivative'],
            ['@binom{§}{}', '二项式系数', 'Binomial'],
          ],
        },
        {
          id: 'deriv',
          zh: '微分与算子',
          en: 'Differential operators',
          items: [
            ['@partial', '偏导符号', 'Partial'],
            ['@nabla', '梯度算子', 'Nabla'],
            ['@nabla^{2}', '拉普拉斯算子', 'Laplacian'],
            ['@dot{§}', '一阶点', 'Dot'],
            ['@ddot{§}', '二阶点', 'Double dot'],
            ["§'", '一撇导数', 'Prime'],
            ["§''", '两撇导数', 'Double prime'],
            ['@mathrm{d}§', '微分', 'Differential'],
          ],
        },
      ],
    },
    {
      id: 'root',
      zh: '根式角标',
      en: 'Roots & scripts',
      icon: '@sqrt{e^{x}}',
      groups: [
        {
          id: 'root',
          zh: '根式',
          en: 'Roots',
          items: [
            ['@sqrt{§}', '平方根', 'Square root'],
            ['@sqrt[3]{§}', '立方根', 'Cube root'],
            ['@sqrt[n]{§}', 'n 次根', 'nth root'],
            ['@frac{1}{@sqrt{§}}', '根式倒数', 'Reciprocal root'],
          ],
        },
        {
          id: 'script',
          zh: '上下标',
          en: 'Scripts',
          items: [
            ['x^{§}', '上标', 'Superscript'],
            ['x_{§}', '下标', 'Subscript'],
            ['x_{§}^{§}', '同时上下标', 'Sub and superscript'],
            ['{}^{§}x', '前置上标', 'Prescript'],
            ['§^{@circ}', '角度', 'Degree'],
            ["§'", '一撇', 'Prime'],
            ['@overline{§}', '上划线', 'Overline'],
            ['@underline{§}', '下划线', 'Underline'],
          ],
        },
      ],
    },
    {
      id: 'limit',
      zh: '极限对数',
      en: 'Limits & logs',
      icon: '@lim_{n@to@infty}',
      groups: [
        {
          id: 'limit',
          zh: '极限',
          en: 'Limits',
          items: [
            ['@lim_{§}', '极限', 'Limit'],
            ['@lim_{x @to §}', '趋于某点', 'Tends to'],
            ['@lim_{x @to 0^{+}}§', '右极限', 'Right limit'],
            ['@limsup_{§}', '上极限', 'Limit superior'],
            ['@liminf_{§}', '下极限', 'Limit inferior'],
            ['@to', '趋于', 'Tends to arrow'],
            ['@infty', '无穷', 'Infinity'],
          ],
        },
        {
          id: 'log',
          zh: '对数与指数',
          en: 'Logarithms and powers',
          items: [
            ['@log_{§}{}', '对数', 'Logarithm'],
            ['@ln{§}', '自然对数', 'Natural log'],
            ['@lg{§}', '常用对数', 'Log base 10'],
            ['e^{§}', '自然指数', 'Exponential'],
            ['a^{§}', '幂', 'Power'],
            ['@exp{§}', '指数函数', 'Exp'],
            ['@log_{2}{§}', '二进制对数', 'Log base 2'],
          ],
        },
      ],
    },
    {
      id: 'trig',
      zh: '三角函数',
      en: 'Trigonometry',
      icon: '@sin@alpha',
      groups: [
        {
          id: 'trig',
          zh: '三角函数',
          en: 'Trig functions',
          items: [
            ['@sin{§}', '正弦', 'Sine'],
            ['@cos{§}', '余弦', 'Cosine'],
            ['@tan{§}', '正切', 'Tangent'],
            ['@cot{§}', '余切', 'Cotangent'],
            ['@sec{§}', '正割', 'Secant'],
            ['@csc{§}', '余割', 'Cosecant'],
          ],
        },
        {
          id: 'atrig',
          zh: '反三角与双曲',
          en: 'Inverse and hyperbolic',
          items: [
            ['@arcsin{§}', '反正弦', 'Arcsine'],
            ['@arccos{§}', '反余弦', 'Arccosine'],
            ['@arctan{§}', '反正切', 'Arctangent'],
            ['@sinh{§}', '双曲正弦', 'Sinh'],
            ['@cosh{§}', '双曲余弦', 'Cosh'],
            ['@tanh{§}', '双曲正切', 'Tanh'],
            ['@theta', '角度', 'Theta'],
            ['@alpha', '角度', 'Alpha'],
          ],
        },
      ],
    },
    {
      id: 'integral',
      zh: '积分运算',
      en: 'Integrals',
      icon: '@int_{a}^{b}',
      groups: [
        {
          id: 'int',
          zh: '积分',
          en: 'Integrals',
          items: [
            ['@int{§}', '不定积分', 'Indefinite integral'],
            ['@int_{§}^{}', '带下限积分', 'Integral with lower limit'],
            ['@int_{a}^{b}{§}@,@mathrm{d}x', '定积分', 'Definite integral'],
            ['@iint_{§}', '二重积分', 'Double integral'],
            ['@iiint_{§}', '三重积分', 'Triple integral'],
            ['@oint_{§}', '环路积分', 'Contour integral'],
            ['@int_{0}^{§}', '从零积分', 'Integral from zero'],
          ],
        },
      ],
    },
    {
      id: 'large',
      zh: '大型运算',
      en: 'Large operators',
      icon: '@sum_{i=0}^{n}',
      groups: [
        {
          id: 'sum',
          zh: '求和与连乘',
          en: 'Sums and products',
          items: [
            ['@sum_{§}^{}', '求和', 'Summation'],
            ['@prod_{§}^{}', '连乘', 'Product'],
            ['@coprod_{§}^{}', '连余积', 'Coproduct'],
            ['@sum_{i=1}^{n}§', '带上下限求和', 'Sum with limits'],
            ['@prod_{i=1}^{n}§', '带上下限连乘', 'Product with limits'],
            ['@sum_{k=0}^{@infty}§', '无穷级数', 'Infinite series'],
          ],
        },
        {
          id: 'bigop',
          zh: '大型运算符',
          en: 'Big operators',
          items: [
            ['@bigcup_{§}^{}', '并集运算符', 'Big union'],
            ['@bigcap_{§}^{}', '交集运算符', 'Big intersection'],
            ['@bigoplus_{§}', '直和', 'Direct sum'],
            ['@bigotimes_{§}', '张量积', 'Tensor product'],
            ['@bigodot_{§}', '环形积', 'Big odot'],
            ['@bigvee_{§}', '大或', 'Big or'],
            ['@bigwedge_{§}', '大且', 'Big and'],
            ['@biguplus_{§}', '大并加', 'Big uplus'],
          ],
        },
      ],
    },
    {
      id: 'bracket',
      zh: '括号取整',
      en: 'Brackets',
      icon: '@{[@,(@,)@,]}',
      groups: [
        {
          id: 'delim',
          zh: '括号',
          en: 'Brackets',
          items: [
            ['(', '左圆括号', 'Left paren'],
            [')', '右圆括号', 'Right paren'],
            ['[', '左方括号', 'Left bracket'],
            [']', '右方括号', 'Right bracket'],
            ['@{', '左花括号', 'Left brace'],
            ['@}', '右花括号', 'Right brace'],
            ['@langle', '左尖括号', 'Left angle'],
            ['@rangle', '右尖括号', 'Right angle'],
            ['@lvert', '左竖线', 'Left vertical'],
            ['@lVert', '左双竖线', 'Left double vertical'],
          ],
        },
        {
          id: 'floor',
          zh: '取整与绝对值',
          en: 'Floors and absolute values',
          items: [
            ['@lfloor § @rfloor', '向下取整', 'Floor'],
            ['@lceil § @rceil', '向上取整', 'Ceiling'],
            ['|§|', '绝对值', 'Absolute value'],
            ['@|§@|', '范数', 'Norm'],
            ['@left(§@right)', '自适应圆括号', 'Auto parens'],
            ['@left[§@right]', '自适应方括号', 'Auto brackets'],
            ['@left@{§@right@}', '自适应花括号', 'Auto braces'],
            ['@left@langle § @right@rangle', '自适应尖括号', 'Auto angles'],
          ],
        },
      ],
    },
    {
      id: 'matrix',
      zh: '数组矩阵',
      en: 'Matrices',
      icon: '@begin{bmatrix}0&1@@1&0@end{bmatrix}',
      groups: [
        {
          id: 'matrix',
          zh: '矩阵',
          en: 'Matrices',
          items: [
            ['@begin{matrix}§&@@&@end{matrix}', '无括号矩阵', 'Matrix'],
            ['@begin{pmatrix}§&@@&@end{pmatrix}', '圆括号矩阵', 'Pmatrix'],
            ['@begin{bmatrix}§&@@&@end{bmatrix}', '方括号矩阵', 'Bmatrix'],
            ['@begin{Bmatrix}§&@@&@end{Bmatrix}', '花括号矩阵', 'Bmatrix braces'],
            ['@begin{vmatrix}§&@@&@end{vmatrix}', '行列式', 'Determinant'],
            ['@begin{Vmatrix}§&@@&@end{Vmatrix}', '双竖线行列式', 'Vmatrix'],
            ['@begin{smallmatrix}§&@@&@end{smallmatrix}', '小矩阵', 'Small matrix'],
          ],
        },
        {
          id: 'env',
          zh: '分段与对齐',
          en: 'Cases and alignment',
          items: [
            ['@begin{cases}§ & x>0 @@ & @text{其他}@end{cases}', '分段函数', 'Cases'],
            ['@begin{aligned}§ &= @@ &= @end{aligned}', '对齐', 'Aligned'],
            ['@begin{gathered}§ @@ @end{gathered}', '居中堆叠', 'Gathered'],
            ['@begin{array}{cc}§ & @@ & @end{array}', '数组', 'Array'],
          ],
        },
      ],
    },
  ]

  /* ---------------------------------------------------- 公式模板 tile data */

  const TPL = [
    {
      id: 'algebra',
      zh: '代数',
      en: 'Algebra',
      icon: 'f(x)=ax^{2}+bx+c',
      items: [
        ['x=@frac{-b@pm @sqrt{b^{2}-4ac}}{2a}', '一元二次求根', 'Quadratic roots'],
        ['(a+b)^{2}=a^{2}+2ab+b^{2}', '完全平方', 'Perfect square'],
        ['a^{2}-b^{2}=(a-b)(a+b)', '平方差', 'Difference of squares'],
        ['@frac{§}{§}@cdot@frac{§}{§}', '分式乘法', 'Fraction product'],
        ['(a+b)^{n}=@sum_{k=0}^{n}@binom{n}{k}a^{k}b^{n-k}', '二项式定理', 'Binomial theorem'],
        ['@log_{a}b=@frac{@ln b}{@ln a}', '对数换底', 'Change of base'],
        ['@sqrt[n]{a^{m}}=a^{m/n}', '分数指数', 'Rational exponent'],
        ['f(x)=@begin{cases}§ & x>0 @@ & x@le 0@end{cases}', '分段函数', 'Piecewise'],
      ],
    },
    {
      id: 'geometry',
      zh: '几何',
      en: 'Geometry',
      icon: 'S=@frac{1}{2}ah',
      items: [
        ['S=@frac{1}{2}ah', '三角形面积', 'Triangle area'],
        ['S=@sqrt{p(p-a)(p-b)(p-c)}', '海伦公式', 'Heron formula'],
        ['a^{2}+b^{2}=c^{2}', '勾股定理', 'Pythagorean theorem'],
        ['S=@pi r^{2}', '圆面积', 'Circle area'],
        ['V=@frac{4}{3}@pi r^{3}', '球体积', 'Sphere volume'],
        ['l=r@theta', '弧长', 'Arc length'],
        ['@frac{a}{@sin A}=@frac{b}{@sin B}=@frac{c}{@sin C}', '正弦定理', 'Law of sines'],
        ['c^{2}=a^{2}+b^{2}-2ab@cos C', '余弦定理', 'Law of cosines'],
        ['@vec{a}@cdot@vec{b}=|@vec{a}||@vec{b}|@cos@theta', '向量点积', 'Dot product'],
        ['d=@sqrt{(x_{2}-x_{1})^{2}+(y_{2}-y_{1})^{2}}', '两点距离', 'Distance'],
      ],
    },
    {
      id: 'inequality',
      zh: '不等式',
      en: 'Inequalities',
      icon: 'a^{2}+b^{2}@ge 2ab',
      items: [
        ['a<b', '小于', 'Less than'],
        ['a@le b', '小于等于', 'Less or equal'],
        ['a@ge b', '大于等于', 'Greater or equal'],
        ['a@ne b', '不等于', 'Not equal'],
        ['x@in(a,b)', '开区间', 'Open interval'],
        ['x@in[a,b]', '闭区间', 'Closed interval'],
        ['|x|<§', '绝对值不等式', 'Absolute inequality'],
        ['@frac{a+b}{2}@ge @sqrt{ab}', '均值不等式', 'AM-GM'],
        ['|a+b|@le |a|+|b|', '三角不等式', 'Triangle inequality'],
        ['ax^{2}+bx+c>0', '二次不等式', 'Quadratic inequality'],
      ],
    },
    {
      id: 'integral',
      zh: '积分',
      en: 'Integral',
      icon: '@int_{a}^{b}f(x)@,@mathrm{d}x',
      items: [
        ['@int f(x)@,@mathrm{d}x=F(x)+C', '不定积分', 'Indefinite integral'],
        ['@int_{a}^{b}f(x)@,@mathrm{d}x=F(b)-F(a)', '牛顿-莱布尼茨', 'Fundamental theorem'],
        ['@iint_{D} f(x,y)@,@mathrm{d}x@,@mathrm{d}y', '二重积分', 'Double integral'],
        ['@iiint_{@Omega} f@,@mathrm{d}V', '三重积分', 'Triple integral'],
        ['@oint_{L}@vec{F}@cdot@mathrm{d}@vec{r}', '环路积分', 'Contour integral'],
        ['@int_{L} f@,@mathrm{d}s', '曲线积分', 'Line integral'],
        ['@int u@,@mathrm{d}v=uv-@int v@,@mathrm{d}u', '分部积分', 'Integration by parts'],
        ['A=@int_{a}^{b}|f(x)|@,@mathrm{d}x', '面积', 'Area'],
      ],
    },
    {
      id: 'matrix',
      zh: '矩阵',
      en: 'Matrix',
      icon: '@begin{pmatrix}a&b@@c&d@end{pmatrix}',
      items: [
        ['@begin{matrix}§&@@&@end{matrix}', '无括号矩阵', 'Matrix'],
        ['@begin{pmatrix}§&@@&@end{pmatrix}', '圆括号矩阵', 'Pmatrix'],
        ['@begin{bmatrix}§&@@&@end{bmatrix}', '方括号矩阵', 'Bmatrix'],
        ['@begin{vmatrix}§&@@&@end{vmatrix}', '行列式', 'Determinant'],
        ['A^{@mathsf{T}}', '转置', 'Transpose'],
        ['A^{-1}', '逆矩阵', 'Inverse'],
        ['E=@begin{pmatrix}1&0@@0&1@end{pmatrix}', '单位矩阵', 'Identity'],
        ['A^{*}', '伴随矩阵', 'Adjugate'],
      ],
    },
    {
      id: 'trig',
      zh: '三角',
      en: 'Trigonometry',
      icon: '@sin^{2}@theta+@cos^{2}@theta=1',
      items: [
        ['@sin^{2}@theta+@cos^{2}@theta=1', '平方关系', 'Pythagorean identity'],
        ['@sin(@alpha@pm@beta)=@sin@alpha@cos@beta@pm@cos@alpha@sin@beta', '两角和', 'Angle sum'],
        ['@sin 2@theta=2@sin@theta@cos@theta', '二倍角', 'Double angle'],
        ['@sin^{2}@theta=@frac{1-@cos 2@theta}{2}', '半角', 'Half angle'],
        ['@tan@theta=@frac{@sin@theta}{@cos@theta}', '商数关系', 'Tangent ratio'],
        ['@arcsin x+@arccos x=@frac{@pi}{2}', '反三角恒等式', 'Inverse identity'],
        ['a@sin x+b@cos x=@sqrt{a^{2}+b^{2}}@sin(x+@varphi)', '辅助角公式', 'Auxiliary angle'],
      ],
    },
    {
      id: 'statistics',
      zh: '统计',
      en: 'Statistics',
      icon: '@bar{x}=@frac{1}{n}@sum x_{i}',
      items: [
        ['@bar{x}=@frac{1}{n}@sum_{i=1}^{n}x_{i}', '样本均值', 'Mean'],
        ['s^{2}=@frac{1}{n}@sum_{i=1}^{n}(x_{i}-@bar{x})^{2}', '方差', 'Variance'],
        ['s=@sqrt{@frac{1}{n}@sum_{i=1}^{n}(x_{i}-@bar{x})^{2}}', '标准差', 'Standard deviation'],
        ['E(X)=@sum_{i} x_{i}p_{i}', '数学期望', 'Expectation'],
        ['P(A)=@frac{m}{n}', '古典概率', 'Probability'],
        ['@binom{n}{k}=@frac{n!}{k!(n-k)!}', '组合数', 'Combination'],
        ['A_{n}^{k}=@frac{n!}{(n-k)!}', '排列数', 'Permutation'],
        ['@rho_{XY}=@frac{@mathrm{Cov}(X,Y)}{@sigma_{X}@sigma_{Y}}', '相关系数', 'Correlation'],
        ['X@sim N(@mu,@sigma^{2})', '正态分布', 'Normal distribution'],
      ],
    },
    {
      id: 'sequence',
      zh: '数列',
      en: 'Sequence',
      icon: 'a_{n}=a_{1}+(n-1)d',
      items: [
        ['a_{n}=a_{1}+(n-1)d', '等差数列通项', 'Arithmetic term'],
        ['S_{n}=@frac{n(a_{1}+a_{n})}{2}', '等差数列前 n 项和', 'Arithmetic sum'],
        ['a_{n}=a_{1}q^{n-1}', '等比数列通项', 'Geometric term'],
        ['S_{n}=@frac{a_{1}(1-q^{n})}{1-q}', '等比数列前 n 项和', 'Geometric sum'],
        ['a_{n+1}=a_{n}+d', '递推公式', 'Recurrence'],
        ['@lim_{n@to@infty}a_{n}=A', '数列极限', 'Sequence limit'],
        ['@sum_{n=1}^{@infty}@frac{1}{n^{2}}=@frac{@pi^{2}}{6}', '无穷级数', 'Infinite series'],
      ],
    },
    {
      id: 'physics',
      zh: '物理',
      en: 'Physics',
      icon: 'F=ma',
      items: [
        ['F=ma', '牛顿第二定律', 'Newton second law'],
        ['v=@frac{@mathrm{d}s}{@mathrm{d}t}', '速度', 'Velocity'],
        ['a=@frac{@mathrm{d}v}{@mathrm{d}t}', '加速度', 'Acceleration'],
        ['E_{k}=@frac{1}{2}mv^{2}', '动能', 'Kinetic energy'],
        ['E_{p}=mgh', '重力势能', 'Potential energy'],
        ['F=G@frac{m_{1}m_{2}}{r^{2}}', '万有引力', 'Gravity'],
        ['F=qE+qv@times B', '洛伦兹力', 'Lorentz force'],
        ['i@hbar@frac{@partial@psi}{@partial t}=@hat{H}@psi', '薛定谔方程', 'Schrodinger'],
      ],
    },
    {
      id: 'chemistry',
      zh: '化学',
      en: 'Chemistry',
      icon: '@ce{2H2 + O2 -> 2H2O}',
      items: [
        ['@ce{H2O}', '水', 'Water'],
        ['@ce{CO2}', '二氧化碳', 'Carbon dioxide'],
        ['@ce{2H2 + O2 -> 2H2O}', '氢气燃烧', 'Hydrogen combustion'],
        ['@ce{CaCO3 ->[ @Delta ] CaO + CO2 ^}', '分解反应', 'Decomposition'],
        ['@ce{H+ + OH- -> H2O}', '中和反应', 'Neutralisation'],
        ['@ce{CH3COOH <=> CH3COO- + H+}', '电离平衡', 'Equilibrium'],
        ['@ce{^{14}_{6}C}', '同位素', 'Isotope'],
        ['@ce{Fe^{3+}}', '铁离子', 'Iron ion'],
      ],
    },
  ]

  /* ----------------------------------------------------------- favourites */

  const FAV_KEY = 'favorites.v2'
  const LEGACY_FAV_KEY = 'favorites.v1'

  function favLimit() {
    const value = Number(LX.settings.get('favoritesLimit'))
    return Math.max(1, Math.min(50, Number.isFinite(value) && value > 0 ? Math.round(value) : 10))
  }

  function autoTitle(texValue) {
    const flat = String(texValue || '').replace(/\s+/g, ' ').trim()
    return flat ? LX.t('fav.untitled') : LX.t('fav.untitled')
  }

  function normalizeFav(entry, index) {
    if (!entry || typeof entry.tex !== 'string' || !entry.tex) return null
    return {
      id: entry.id || 'f' + (Number(entry.createdAt) || Date.now()) + '-' + index,
      tex: entry.tex,
      title: entry.title || entry.zh || autoTitle(entry.tex),
      createdAt: Number(entry.createdAt) || Date.now(),
    }
  }

  function readFavorites() {
    let stored = LX.storage.get(FAV_KEY, null)
    if (!Array.isArray(stored)) {
      // migrate the flat v1 entries written by the earlier panel
      const legacy = LX.storage.get(LEGACY_FAV_KEY, [])
      stored = Array.isArray(legacy) ? legacy : []
      if (stored.length) LX.storage.set(FAV_KEY, stored.map(normalizeFav).filter(Boolean))
    }
    return stored
      .map(normalizeFav)
      .filter(Boolean)
      .slice(0, favLimit())
  }

  function writeFavorites(list) {
    const trimmed = list.slice(0, favLimit())
    LX.storage.set(FAV_KEY, trimmed)
    if (typeof LX.favoritesChanged === 'function') LX.favoritesChanged(trimmed)
    return trimmed
  }

  const favorites = {
    list: readFavorites(),
    limit: favLimit,
    has: function (texValue) {
      return this.list.some(function (one) {
        return one.tex === texValue
      })
    },
    add: function (texValue, title) {
      const text = String(texValue || '').trim()
      if (!text) return { ok: false, reason: 'empty' }
      const existing = this.list.findIndex(function (one) {
        return one.tex === text
      })
      if (existing >= 0) return { ok: false, reason: 'duplicate' }
      const cap = favLimit()
      const dropped = this.list.length >= cap
      const next = [
        { id: 'f' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), tex: text, title: title || autoTitle(text), createdAt: Date.now() },
      ].concat(this.list)
      this.list = writeFavorites(next)
      return { ok: true, dropped: dropped }
    },
    toggle: function (entry) {
      const text = typeof entry === 'string' ? entry : entry.tex
      const index = this.list.findIndex(function (one) {
        return one.tex === text
      })
      if (index >= 0) {
        this.list = writeFavorites(this.list.filter(function (one) {
          return one.tex !== text
        }))
        return false
      }
      const added = this.add(text, typeof entry === 'string' ? null : entry.title)
      return added.ok
    },
    remove: function (id) {
      this.list = writeFavorites(
        this.list.filter(function (one) {
          return one.id !== id
        }),
      )
    },
    rename: function (id, title) {
      this.list = writeFavorites(
        this.list.map(function (one) {
          return one.id === id ? { ...one, title: String(title || '').trim() || autoTitle(one.tex) } : one
        }),
      )
    },
    refresh: function () {
      this.list = readFavorites()
      return this.list
    },
  }
  LX.favorites = favorites

  /* -------------------------------------------------------------- UI parts */

  const BUTTON_CLEAR = { zh: '清空', en: 'Clear' }

  function TileStrip(props) {
    const rowRef = useRef(null)
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
    const icons = props.tiles.map(function (tile) {
      return { tex: tex(tile.icon) }
    })
    useUpgrades(icons)
    return h(
      'div',
      { className: 'lx-tile-strip lx-scroll', ref: rowRef, role: 'tablist', 'aria-label': props.label },
      props.tiles.map(function (tile) {
        const on = tile.id === props.activeId
        return h(
          'button',
          {
            key: tile.id,
            type: 'button',
            role: 'tab',
            'aria-selected': on,
            'aria-label': pick(tile),
            className: LX.cx('lx-tile', on && 'lx-tile--on'),
            onMouseDown: function (event) {
              event.preventDefault()
            },
            onMouseEnter: function (event) {
              props.onHover(tile, event.currentTarget)
            },
            onMouseLeave: props.onLeave,
            onFocus: function (event) {
              props.onHover(tile, event.currentTarget)
            },
            onBlur: props.onLeave,
            onClick: function () {
              props.onPick(tile)
            },
          },
          h('span', { className: 'lx-tile-icon' }, h(TexFace, { tex: tex(tile.icon) })),
          h('span', { className: 'lx-tile-label' }, pick(tile)),
          h('span', { className: 'lx-tile-caret', 'aria-hidden': true }, '▾'),
        )
      }),
    )
  }

  function ItemGrid(props) {
    const items = props.items || []
    useUpgrades(items)
    return h(
      'div',
      { className: 'lx-tile-grid' },
      items.map(function (entry, index) {
        const fav = favorites.has(entry)
        return h(
          'div',
          { key: entry.tex + ':' + index, className: 'lx-tile-cellwrap' },
          h(
            'button',
            {
              type: 'button',
              className: 'lx-tile-cell',
              title: pick(entry) + '  ' + entry.tex,
              'aria-label': pick(entry),
              onMouseDown: function (event) {
                event.preventDefault()
              },
              onClick: function () {
                props.onInsert(entry.tex)
              },
            },
            h(TexFace, { tex: entry.tex }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: LX.cx('lx-fav-star', fav && 'lx-fav-star--on'),
              title: t('fav.toggle'),
              'aria-label': t('fav.toggle'),
              'aria-pressed': fav,
              onClick: function (event) {
                event.preventDefault()
                event.stopPropagation()
                const added = favorites.toggle(entry)
                LX.toast(added ? t('fav.added') : t('fav.removed'), 'success')
                props.onFavChange()
              },
            },
            fav ? '★' : '☆',
          ),
        )
      }),
    )
  }

  /** Docked hover / search panel, grouped exactly like the tile data. */
  function DockPanel(props) {
    const groups = props.groups || []
    const flat = props.items || []
    return h(
      'div',
      {
        className: 'lx-dock',
        style: {
          top: typeof props.top === 'number' && props.top > 0 ? props.top + 'px' : undefined,
          maxHeight: props.maxHeight ? props.maxHeight + 'px' : undefined,
        },
        onMouseEnter: props.onKeep,
        onMouseLeave: props.onLeave,
        role: 'region',
        'aria-label': props.title,
      },
      h(
        'div',
        { className: 'lx-dock-head' },
        h('span', { className: 'lx-dock-title' }, props.title),
        h('span', { className: 'lx-dock-count' }, t('vis.quick.count', { n: props.count || 0 })),
      ),
      h(
        'div',
        { className: 'lx-dock-body lx-scroll' },
        groups.length > 0
          ? groups.map(function (group) {
              return h(
                'section',
                { key: group.id, className: 'lx-dock-group' },
                groups.length > 1 ? h('h5', { className: 'lx-dock-groupname' }, pick(group)) : null,
                h(ItemGrid, { items: group.items, onInsert: props.onInsert, onFavChange: props.onFavChange }),
              )
            })
          : flat.length === 0
            ? h('p', { className: 'lx-dock-empty' }, t('vis.pal.noMatch'))
            : h(ItemGrid, { items: flat, onInsert: props.onInsert, onFavChange: props.onFavChange }),
      ),
    )
  }

  /* ------------------------------------------------- rendered font menus */

  const FAMILIES = [
    { value: 'mathrm', zh: '常规', en: 'Roman', sample: '@mathrm{ABC}' },
    { value: 'mathbf', zh: '加粗', en: 'Boldface', sample: '@mathbf{ABC}' },
    { value: 'mathit', zh: '斜体', en: 'Italics', sample: '@mathit{ABC}' },
    { value: 'underline', zh: '下划线', en: 'Underline', sample: '@underline{ABC}' },
    { value: 'mathsf', zh: '无衬线体', en: 'Sans-serif', sample: '@mathsf{ABC}' },
    { value: 'mathbb', zh: '黑板粗体', en: 'Blackboard', sample: '@mathbb{ABC}' },
    { value: 'mathcal', zh: '手写体', en: 'Calligraphy', sample: '@mathcal{ABC}' },
    { value: 'mathfrak', zh: '德文尖角体', en: 'Fraktur', sample: '@mathfrak{ABC}' },
  ]

  const ENVIRONMENTS = [
    { value: 'none', zh: '无环境', en: 'none', plain: '' },
    { value: 'eqnarray', zh: 'eqnarray 环境', en: 'eqnarray', plain: '@begin{eqnarray}' },
    { value: 'align', zh: 'align 环境', en: 'align', plain: '@begin{align}' },
    { value: 'aligned', zh: 'aligned 环境', en: 'aligned', plain: '@begin{aligned}' },
    { value: 'gathered', zh: 'gathered 环境', en: 'gathered', plain: '@begin{gathered}' },
    { value: 'cases', zh: 'cases 环境', en: 'cases', plain: '@begin{cases}' },
    { value: 'split', zh: 'split 环境', en: 'split', plain: '@begin{split}' },
    { value: 'array', zh: 'array 环境', en: 'array', plain: '@begin{array}{cc}' },
  ]

  const SIZES = [
    { value: 'tiny', zh: '极小', en: 'tiny', sample: '@tiny abc' },
    { value: 'scriptsize', zh: '很小', en: 'scriptsize', sample: '@scriptsize abc' },
    { value: 'small', zh: '小', en: 'small', sample: '@small abc' },
    { value: 'normal', zh: '正常', en: 'normal', sample: 'abc' },
    { value: 'large', zh: '大', en: 'large', sample: '@large abc' },
    { value: 'Large', zh: '超大', en: 'Large', sample: '@Large abc' },
    { value: 'LARGE', zh: '特大', en: 'LARGE', sample: '@LARGE abc' },
    { value: 'huge', zh: '巨大', en: 'huge', sample: '@huge abc' },
    { value: 'Huge', zh: '巨无霸', en: 'Huge', sample: '@Huge abc' },
  ]

  function TexMenu(props) {
    const [open, setOpen] = useState(false)
    const [up, setUp] = useState(false)
    const [limit, setLimit] = useState(0)
    const wrapRef = useRef(null)
    const samples = props.options
      .filter(function (option) {
        return option.sample
      })
      .map(function (option) {
        return { tex: tex(option.sample) }
      })
    useUpgrades(samples)
    LX.ui.useOutsideClick(wrapRef, function () {
      setOpen(false)
    }, open)
    return h(
      'div',
      { className: 'lx-texmenu', ref: wrapRef },
      h(
        'button',
        {
          type: 'button',
          className: LX.cx('lx-texmenu-btn', open && 'lx-texmenu-btn--open'),
          'aria-haspopup': 'listbox',
          'aria-expanded': open,
          onClick: function () {
            if (!open) {
              const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : null
              if (rect) {
                const shell = document.querySelector('.lx-shell')
                const zoom = shell ? parseFloat(getComputedStyle(shell).zoom) || 1 : 1
                const pane = wrapRef.current.closest('.lx-ed-pane')
                const box = pane ? pane.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
                const above = (rect.top - box.top) / zoom - 12
                const below = (box.bottom - rect.bottom) / zoom - 12
                const want = 320
                const flip = below < want && above > below
                setUp(flip)
                setLimit(Math.max(150, Math.min(want, Math.floor(flip ? above : below))))
              }
            }
            setOpen(!open)
          },
        },
        h('span', { className: 'lx-texmenu-main' },
          props.icon ? h(props.icon, { size: 13 }) : null,
          h('span', { className: 'lx-fmt-label' }, props.label),
        ),
        h('span', { className: 'lx-texmenu-caret', 'aria-hidden': true }, '▾'),
      ),
      open
        ? h(
            'div',
            {
              className: LX.cx('lx-texmenu-pop', up && 'lx-texmenu-pop--up'),
              style: limit ? { maxHeight: limit + 'px' } : undefined,
              role: 'listbox',
            },
            props.options.map(function (option) {
              const sample = option.sample ? svgCache.get(tex(option.sample)) : null
              return h(
                'button',
                {
                  key: option.value,
                  type: 'button',
                  role: 'option',
                  'aria-selected': false,
                  className: 'lx-texmenu-row',
                  onMouseDown: function (event) {
                    event.preventDefault()
                  },
                  onClick: function () {
                    setOpen(false)
                    props.onPick(option)
                  },
                },
                h(
                  'span',
                  { className: 'lx-texmenu-face' },
                  option.plain && !option.sample
                    ? h('span', { className: 'lx-texmenu-code' }, tex(option.plain) || option.zh)
                    : sample
                      ? h('span', { dangerouslySetInnerHTML: { __html: sample } })
                      : h('span', { className: 'lx-tf-text' }, option.zh),
                ),
                h('span', { className: 'lx-texmenu-name' }, option.plain === '' ? '' : pick(option)),
              )
            }),
          )
        : null,
    )
  }

  /* ---------------------------------------------------------------- panel */

  function Panel(props) {
    const mode = props.mode === 'template' ? 'template' : 'quick'
    const tiles = mode === 'template' ? TPL : QUICK
    const [hoverId, setHoverId] = useState(null)
    const [activeId, setActiveId] = useState(tiles[0] && tiles[0].id)
    const [tick, setTick] = useState(0)
    const [color, setColor] = useState('#dc2626')
    const [popMax, setPopMax] = useState(0)
    const [popTop, setPopTop] = useState(0)
    const closeTimer = useRef(0)
    const rootRef = useRef(null)
    const stripRef = useRef(null)

    /* the panel hangs directly under the tile row (it must hug the tiles), so its
       offset and its height budget are measured from the strip's own box */
    const syncBudget = useCallback(function () {
      const node = rootRef.current
      const strip = stripRef.current
      const pane = node && node.closest('.lx-ed-pane')
      if (!node || !strip || !pane) return
      const top = strip.offsetTop + strip.offsetHeight + 4
      setPopTop(top)
      setPopMax(Math.max(140, pane.clientHeight - top - 16))
    }, [])

    useEffect(
      function () {
        setHoverId(null)
        setActiveId(tiles[0] && tiles[0].id)
        syncBudget()
      },
      [mode, syncBudget],
    )

    useEffect(
      function () {
        return function () {
          clearTimeout(closeTimer.current)
        }
      },
      [],
    )

    const hovered = tiles.find(function (tile) {
      return tile.id === hoverId
    }) || null


    const openHover = useCallback(function (tile, element) {
      clearTimeout(closeTimer.current)
      setHoverId(tile.id)
      syncBudget()
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    }, [syncBudget])
    const scheduleClose = useCallback(function () {
      clearTimeout(closeTimer.current)
      closeTimer.current = setTimeout(function () {
        setHoverId(null)
      }, 180)
    }, [])
    const keep = useCallback(function () {
      clearTimeout(closeTimer.current)
    }, [])

    const activeTile = tiles.find(function (tile) {
      return tile.id === activeId
    }) || tiles[0]

    const panelGroups = useMemo(
      function () {
        if (!hovered) return []
        if (hovered.groups) return hovered.groups.map(function (group) { return { id: group.id, zh: group.zh, en: group.en, items: group.items.map(item) } })
        return [{ id: hovered.id + '-all', zh: hovered.zh, en: hovered.en, items: (hovered.items || []).map(item) }]
      },
      [hovered],
    )
    const panelCount = panelGroups.reduce(function (n, group) {
      return n + group.items.length
    }, 0)

    const wrap = function (before, after) {
      if (typeof props.onWrap === 'function') props.onWrap(before, after)
    }

    return h(
      'div',
      { className: 'lx-panel2', ref: rootRef },
      h(
        'div',
        { className: 'lx-panel2-top', ref: stripRef },
        h(TileStrip, {
          tiles: tiles,
          activeId: activeId,
          label: t('vis.tiles.label'),
          onHover: openHover,
          onLeave: scheduleClose,
          onPick: function (tile) {
            setActiveId(tile.id)
            openHover(tile, null)
          },
        }),
      ),
      h(
        'div',
        { className: 'lx-fmt' },
        h(
          'label',
          { className: 'lx-fmt-cell lx-fmt-color', title: t('vis.fmt.color'), style: { color: color } },
          h(LX.icons.Palette, { size: 13 }),
          h('span', { className: 'lx-fmt-label' }, t('vis.fmt.color')),
          h('input', {
            type: 'color',
            value: color,
            'aria-label': t('vis.fmt.color'),
            onChange: function (event) {
              setColor(event.target.value)
              wrap(tex('@textcolor{' + event.target.value + '}{'), '}')
            },
          }),
        ),
        h(TexMenu, {
          label: t('vis.fmt.family'),
          icon: LX.icons.FontA,
          options: FAMILIES,
          onPick: function (option) {
            if (option.value === 'underline') wrap(tex('@underline{'), '}')
            else wrap(tex('@' + option.value + '{'), '}')
          },
        }),
        h(TexMenu, {
          label: t('vis.fmt.size'),
          icon: LX.icons.TextSize,
          options: SIZES,
          onPick: function (option) {
            if (option.value === 'normal') return
            wrap(tex('{@' + option.value + ' '), '}')
          },
        }),
        h(TexMenu, {
          label: t('vis.fmt.env'),
          icon: LX.icons.EnvGrid,
          options: ENVIRONMENTS,
          onPick: function (option) {
            if (option.value === 'none') {
              wrap(String.fromCharCode(1) + 'strip-env', '')
              return
            }
            const name = option.value
            const nl = String.fromCharCode(10)
            const open = name === 'array' ? '@begin{array}{cc}' : '@begin{' + name + '}'
            wrap(tex(open) + nl, nl + tex('@end{' + name + '}'))
          },
        }),
        h(
          'button',
          {
            type: 'button',
            className: 'lx-fmt-cell lx-fmt-btn',
            title: t('vis.fmt.clear'),
            onClick: function () {
              if (typeof props.onClear === 'function') props.onClear()
            },
          },
          h(LX.icons.Trash, { size: 13 }),
          h('span', { className: 'lx-fmt-label' }, t('vis.fmt.clear')),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'lx-fmt-cell lx-fmt-btn',
            title: t('vis.fmt.undo'),
            onClick: function () {
              if (typeof props.onUndo === 'function') props.onUndo()
            },
          },
          h(LX.icons.Undo, { size: 13 }),
          h('span', { className: 'lx-fmt-label' }, t('vis.fmt.undo')),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'lx-fmt-cell lx-fmt-btn',
            title: t('vis.fmt.import'),
            onClick: function () {
              if (typeof props.onImport === 'function') props.onImport()
            },
          },
          h(LX.icons.Upload, { size: 13 }),
          h('span', { className: 'lx-fmt-label' }, t('vis.fmt.import')),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'lx-fmt-cell lx-fmt-btn',
            title: t('vis.fmt.favorite'),
            onClick: function () {
              if (typeof props.onFavorite === 'function') props.onFavorite()
            },
          },
          h(LX.icons.Star, { size: 13 }),
          h('span', { className: 'lx-fmt-label' }, t('vis.fmt.favorite')),
        ),
      ),
      hovered
        ? h(DockPanel, {
              title: pick(hovered),
              top: popTop,
              maxHeight: popMax,
              groups: panelGroups,
              count: panelCount,
              onInsert: props.onInsert,
              onKeep: keep,
              onLeave: scheduleClose,
              onFavChange: function () {
                setTick(tick + 1)
              },
            })
          : null,
    )
  }

  /* ------------------------------------------------------------ favourites */

  function FavoritesPage(props) {
    const [list, setList] = useState(favorites.refresh())
    const [query, setQuery] = useState('')
    const [editing, setEditing] = useState(null)
    const [draft, setDraft] = useState('')
    const [tick, setTick] = useState(0)

    useEffect(
      function () {
        LX.favoritesChanged = function (next) {
          setList(next.slice())
        }
        return function () {
          LX.favoritesChanged = null
        }
      },
      [],
    )

    const cap = favLimit()
    const needle = query.trim().toLowerCase()
    const shown = needless(list)
    function needless(all) {
      if (!needle) return all
      return all.filter(function (one) {
        return (one.title || '').toLowerCase().indexOf(needle) >= 0 || one.tex.toLowerCase().indexOf(needle) >= 0
      })
    }

    const items = useMemo(
      function () {
        return shown.map(function (one) {
          return { tex: one.tex }
        })
      },
      [shown, tick],
    )
    useUpgrades(items)

    const stamp = function (ms) {
      try {
        return new Date(ms).toLocaleString(pick({ zh: 'zh-CN', en: 'en-US' }), {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch (e) {
        return ''
      }
    }

    const commitRename = function () {
      if (!editing) return
      favorites.rename(editing, draft)
      setEditing(null)
      setList(favorites.refresh())
      setTick(tick + 1)
      LX.toast(t('fav.renamed'), 'success')
    }

    return h(
      'div',
      { className: 'lx-favpage lx-scroll' },
      h(
        'header',
        { className: 'lx-favhead' },
        h('h2', { className: 'lx-favtitle' }, t('fav.title')),
        h('p', { className: 'lx-favlead' }, t('fav.lead')),
        h('span', { className: 'lx-badge lx-badge--brand' }, t('fav.count', { n: list.length, cap: cap })),
        h(
          'div',
          { className: 'lx-favsearch' },
          h(LX.ui.Input, {
            value: query,
            placeholder: t('fav.search'),
            'aria-label': t('fav.search'),
            onChange: function (event) {
              setQuery(event.target.value)
            },
          }),
        ),
      ),
      list.length === 0
        ? h(LX.ui.Empty, {
            icon: LX.icons.Star,
            zh: '还没有收藏',
            en: 'No favourites yet',
            hintZh: '在编辑器工具栏点「收藏」，或在快捷工具的浮出面板里点 ☆',
            hintEn: 'Use the 收藏 button, or the ☆ inside a tile panel',
          })
        : shown.length === 0
          ? h('p', { className: 'lx-favempty' }, t('fav.noMatch'))
          : h(
              'div',
              { className: 'lx-favgrid' },
              shown.map(function (one) {
                return h(
                  'article',
                  { key: one.id, className: 'lx-favcard' },
                  h(
                    'div',
                    { className: 'lx-favcard-top' },
                    editing === one.id
                      ? h('input', {
                          className: 'lx-fav-title-input',
                          value: draft,
                          autoFocus: true,
                          onChange: function (event) {
                            setDraft(event.target.value)
                          },
                          onBlur: commitRename,
                          onKeyDown: function (event) {
                            if (event.key === 'Enter') commitRename()
                            if (event.key === 'Escape') setEditing(null)
                          },
                        })
                      : h(
                          'button',
                          {
                            type: 'button',
                            className: 'lx-fav-title',
                            title: t('fav.renameHint'),
                            onClick: function () {
                              setEditing(one.id)
                              setDraft(one.title)
                            },
                          },
                          one.title,
                        ),
                    h('time', { className: 'lx-fav-time' }, stamp(one.createdAt)),
                  ),
                  h('div', { className: 'lx-fav-preview' }, h(TexFace, { tex: one.tex })),
                  h(
                    'code',
                    {
                      className: 'lx-fav-src lx-scroll',
                      title: one.tex,
                      onClick: function () {
                        LX.util.copyText(one.tex)
                        LX.toast(t('app.copied'), 'success')
                      },
                    },
                    one.tex,
                  ),
                  h(
                    'div',
                    { className: 'lx-fav-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lx-fav-btn',
                        onClick: function () {
                          if (typeof props.onInsert === 'function') props.onInsert(one.tex)
                          LX.toast(t('app.sentToEditor'), 'success')
                        },
                      },
                      h(LX.icons.Plus, { size: 12 }),
                      h('span', null, t('fav.insert')),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lx-fav-btn',
                        onClick: function () {
                          LX.util.copyText(one.tex)
                          LX.toast(t('app.copied'), 'success')
                        },
                      },
                      h(LX.icons.Copy, { size: 12 }),
                      h('span', null, t('fav.copy')),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'lx-fav-btn lx-fav-btn--danger',
                        onClick: function () {
                          favorites.remove(one.id)
                          setList(favorites.refresh())
                          setTick(tick + 1)
                          LX.toast(t('fav.removed'), 'success')
                        },
                      },
                      h(LX.icons.Trash, { size: 12 }),
                      h('span', null, t('fav.delete')),
                    ),
                  ),
                )
              }),
            ),
    )
  }

  /* ------------------------------------------------------------ dictionary */

  LX.addDict('zh', {
    'vis.tiles.label': '磁贴分类',
    'vis.fmt.clear': '清空',
    'vis.fmt.env': '环境',
    'vis.fmt.undo': '撤销',
    'vis.fmt.import': '导入',
    'vis.fmt.favorite': '收藏',
    'fav.search': '搜索标题或 LaTeX 源码',
    'fav.insert': '插入',
    'fav.copy': '复制',
    'fav.delete': '删除',
    'fav.renamed': '标题已更新',
    'fav.noMatch': '没有匹配的收藏',
    'fav.renameHint': '点击重命名',
    'fav.untitled': '未命名公式',
    'fav.empty': '编辑器里还没有公式',
    'fav.duplicate': '这条公式已经在收藏夹里了',
    'fav.addedDropped': '已收藏（超出上限，最旧的一条已移除）',
    'fav.added': '已加入收藏夹',
    'fav.title': '收藏夹',
    'fav.lead': '收藏的符号与模板保存在本机；点击即可插入到编辑器光标处。',
    'fav.count': '{n} / {cap} 项',
    'fav.toggle': '收藏 / 取消收藏',
    'fav.add': '收藏',
    'fav.remove': '移除收藏',
    'fav.added': '已加入收藏夹',
    'fav.removed': '已从收藏夹移除',
  })
  LX.addDict('en', {
    'vis.tiles.label': 'Tile categories',
    'vis.fmt.clear': 'Clear',
    'vis.fmt.color': 'Colour',
    'vis.fmt.family': 'Font',
    'vis.fmt.size': 'Size',
    'vis.fmt.env': 'Env.',
    'vis.fmt.undo': 'Undo',
    'vis.fmt.import': 'Import',
    'vis.fmt.favorite': 'Save',
    'fav.search': 'Search title or LaTeX source',
    'fav.insert': 'Insert',
    'fav.copy': 'Copy',
    'fav.delete': 'Delete',
    'fav.renamed': 'Title updated',
    'fav.noMatch': 'No matching favourites',
    'fav.renameHint': 'Click to rename',
    'fav.untitled': 'Untitled formula',
    'fav.empty': 'The editor is empty',
    'fav.duplicate': 'Already in your favourites',
    'fav.addedDropped': 'Saved (oldest dropped to stay within the limit)',
    'fav.added': 'Saved to favourites',
    'fav.title': 'Favourites',
    'fav.lead': 'Saved symbols and templates live on this machine; click one to insert it at the caret.',
    'fav.count': '{n} / {cap}',
    'fav.toggle': 'Favourite or unfavourite',
    'fav.add': 'Favourite',
    'fav.remove': 'Remove',
    'fav.added': 'Added to favourites',
    'fav.removed': 'Removed from favourites',
  })

  LX.addCss(`
.lx-panel2{display:flex;flex-direction:column;min-height:0;position:static;width:100%;padding:10px 12px 10px;}
.lx-panel2-top{flex:none;min-width:0;}
.lx-tile-strip{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:6px 4px 8px;scrollbar-width:none;flex:none;}
.lx-tile-strip::-webkit-scrollbar{display:none;}
.lx-tile{
  position:relative;flex:0 0 auto;width:88px;height:72px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  padding:8px 4px 13px;border-radius:var(--lx-r-xl);
  border:1px solid var(--lx-border);background:var(--lx-card);box-shadow:var(--lx-shadow-sm);
  cursor:pointer;color:var(--lx-ink);
  transition:transform .18s var(--lx-ease), box-shadow .18s var(--lx-ease), border-color .18s var(--lx-ease), background-color .18s var(--lx-ease);
}
.lx-tile:hover{border-color:var(--lx-accent);box-shadow:var(--lx-shadow-md);transform:translateY(-2px);}
.lx-tile:active{transform:translateY(0) scale(.98);}
.lx-tile:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-tile--on{border-color:var(--lx-accent);background:var(--lx-accent-soft);}
.lx-tile-icon{display:flex;align-items:center;justify-content:center;height:30px;max-width:80px;overflow:hidden;color:var(--lx-ink);}
.lx-tile-icon svg,.lx-tf-face svg{max-height:30px;max-width:80px;height:auto;width:auto;display:block;}
.lx-tf-text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;color:var(--lx-ink-2);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lx-tile-label{max-width:100%;font-size:11.5px;font-weight:600;color:var(--lx-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lx-tile--on .lx-tile-label{color:var(--lx-accent-ink);}
.lx-tile-caret{position:absolute;left:50%;bottom:1px;transform:translateX(-50%);font-size:14px;line-height:1;color:var(--lx-ink-3);transition:color .15s var(--lx-ease);}
.lx-tile:hover .lx-tile-caret{color:var(--lx-accent);}


.lx-dock{
  position:absolute;left:12px;right:12px;bottom:auto;z-index:9;
  display:flex;flex-direction:column;min-height:0;
  padding:10px;border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);
  background:var(--lx-card);box-shadow:var(--lx-shadow-md);
  animation:lx-pop .14s ease-out;
}
.lx-dock-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:0 2px 8px;border-bottom:1px solid var(--lx-border);margin-bottom:8px;}
.lx-dock-title{font-size:13.5px;font-weight:600;}
.lx-dock-count{font-size:12px;color:var(--lx-ink-3);font-variant-numeric:tabular-nums;}
.lx-dock-body{flex:1 1 auto;min-height:0;overflow:auto;}
.lx-dock-group{margin:0 0 10px;}
.lx-dock-group:last-child{margin-bottom:0;}
.lx-dock-groupname{margin:0 0 6px;font-size:12.5px;font-weight:600;color:var(--lx-ink-2);}
.lx-dock-empty{margin:6px 2px;font-size:13px;color:var(--lx-ink-2);}
.lx-tile-grid{display:flex;flex-wrap:wrap;gap:5px;}
.lx-tile-cellwrap{position:relative;display:inline-flex;}
.lx-tile-cell{
  min-width:38px;height:36px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;
  border-radius:var(--lx-r-lg);border:1px solid var(--lx-border);background:var(--lx-card);
  box-shadow:var(--lx-shadow-sm);cursor:pointer;color:var(--lx-ink);
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), border-color .15s var(--lx-ease);
}
.lx-tile-cell:hover{border-color:var(--lx-accent);box-shadow:var(--lx-shadow);transform:translateY(-1px);}
.lx-tile-cell:active{transform:translateY(0) scale(.98);}
.lx-tile-cell:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-tile-cell svg{max-height:26px;max-width:70px;height:auto;width:auto;display:block;}
.lx-fav-star{
  position:absolute;top:-5px;right:-5px;width:17px;height:17px;padding:0;border:0;border-radius:50%;
  background:var(--lx-card);color:var(--lx-ink-3);font-size:11px;line-height:1;cursor:pointer;
  box-shadow:var(--lx-shadow-sm);opacity:0;transition:opacity .12s var(--lx-ease), color .12s var(--lx-ease), transform .12s var(--lx-ease);
}
.lx-tile-cellwrap:hover .lx-fav-star{opacity:1;}
.lx-fav-star:hover{color:var(--lx-accent);transform:scale(1.1);}
.lx-fav-star--on{opacity:1;color:var(--lx-accent);}
.lx-favname{display:none;}

.lx-texmenu{position:relative;flex:1 1 auto;min-width:0;}
.lx-texmenu-btn{
  width:100%;height:30px;padding:0 8px;display:flex;align-items:center;justify-content:space-between;gap:4px;
  border-radius:var(--lx-r-lg);border:1px solid var(--lx-border);background:var(--lx-card);color:var(--lx-ink);
  font-size:12px;font-weight:500;cursor:pointer;box-shadow:var(--lx-shadow-sm);
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), border-color .15s var(--lx-ease);
}
.lx-texmenu-btn:hover{border-color:var(--lx-accent);box-shadow:var(--lx-shadow);}
.lx-texmenu-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-texmenu-caret{font-size:11px;color:var(--lx-ink-3);}
.lx-texmenu-pop{
  position:absolute;left:0;top:calc(100% + 4px);z-index:20;min-width:210px;
  padding:6px;border-radius:var(--lx-r-xl);border:1px solid var(--lx-border);
  background:var(--lx-card);box-shadow:var(--lx-shadow-md);max-height:320px;overflow:auto;
}
.lx-texmenu-pop--up{top:auto;bottom:calc(100% + 4px);}
.lx-texmenu-row{
  display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border:0;border-radius:var(--lx-r-lg);
  background:transparent;cursor:pointer;color:var(--lx-ink);text-align:left;
  transition:background-color .12s var(--lx-ease);
}
.lx-texmenu-row:hover{background:var(--lx-accent-soft);}
.lx-texmenu-row:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-texmenu-face{display:inline-flex;align-items:center;min-width:64px;color:var(--lx-ink);}
.lx-texmenu-face svg{max-height:26px;max-width:110px;height:auto;width:auto;display:block;}
.lx-texmenu-name{font-size:12px;color:var(--lx-ink-2);white-space:nowrap;}
.lx-texmenu-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;color:var(--lx-ink);white-space:nowrap;}
.lx-fmt-clear{
  flex:1 1 0;height:30px;padding:0 8px;display:inline-flex;align-items:center;gap:4px;
  border-radius:var(--lx-r-lg);border:1px solid var(--lx-border);background:var(--lx-card);color:var(--lx-ink-2);
  font-size:11.5px;font-weight:600;cursor:pointer;box-shadow:var(--lx-shadow-sm);
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), color .15s var(--lx-ease), border-color .15s var(--lx-ease);
}
.lx-fmt-clear:hover{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);box-shadow:var(--lx-shadow);}
.lx-fmt-clear:active{transform:scale(.98);}
.lx-fmt-clear:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}

.lx-favpage{flex:1;min-height:0;padding:24px 28px 56px;}
.lx-favsearch{flex:1 1 260px;max-width:340px;min-width:180px;}
.lx-favgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;}
.lx-favcard{
  display:flex;flex-direction:column;gap:8px;padding:12px;
  border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);
  background:var(--lx-card);box-shadow:var(--lx-shadow-sm);
  transition:box-shadow .16s var(--lx-ease), border-color .16s var(--lx-ease);
}
.lx-favcard:hover{box-shadow:var(--lx-shadow);border-color:var(--lx-border-strong, var(--lx-border));}
.lx-favcard-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;}
.lx-fav-title{
  flex:1 1 auto;min-width:0;padding:0;border:0;background:transparent;cursor:text;
  font-size:13.5px;font-weight:600;color:var(--lx-ink);text-align:left;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.lx-fav-title:hover{color:var(--lx-accent);}
.lx-fav-title-input{
  flex:1 1 auto;min-width:0;height:24px;padding:0 6px;font-size:13px;font-weight:600;
  border:1px solid var(--lx-accent);border-radius:var(--lx-r-md, 6px);background:var(--lx-card);color:var(--lx-ink);
}
.lx-fav-title-input:focus{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-fav-time{font-size:11.5px;color:var(--lx-ink-3);white-space:nowrap;font-variant-numeric:tabular-nums;}
.lx-fav-preview{
  display:flex;align-items:center;justify-content:center;min-height:64px;padding:8px 6px;
  border-radius:var(--lx-r-lg);background:var(--lx-well);overflow:hidden;
}
.lx-fav-preview svg{max-height:88px;max-width:100%;height:auto;width:auto;}
.lx-fav-src{
  display:block;max-height:44px;overflow:auto;padding:6px 8px;border-radius:var(--lx-r-lg);
  background:var(--lx-well);border:1px solid var(--lx-border);
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.45;
  color:var(--lx-ink-2);white-space:pre-wrap;word-break:break-all;cursor:copy;
}
.lx-fav-actions{display:flex;gap:6px;flex-wrap:wrap;}
.lx-fav-btn{
  flex:1 1 0;min-width:64px;height:28px;display:inline-flex;align-items:center;justify-content:center;gap:3px;
  padding:0 8px;border-radius:var(--lx-r-lg);border:1px solid var(--lx-border);background:var(--lx-card);
  color:var(--lx-ink-2);font-size:11.5px;font-weight:600;cursor:pointer;box-shadow:var(--lx-shadow-sm);
  transition:transform .15s var(--lx-ease), color .15s var(--lx-ease), border-color .15s var(--lx-ease), box-shadow .15s var(--lx-ease);
}
.lx-fav-btn:hover{color:var(--lx-ink);border-color:var(--lx-accent);box-shadow:var(--lx-shadow);transform:translateY(-1px);}
.lx-fav-btn:active{transform:translateY(0) scale(.98);}
.lx-fav-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-fav-btn--danger:hover{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);}
.lx-favempty{margin:18px 2px;font-size:13.5px;color:var(--lx-ink-2);}
.lx-favhead{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 0 16px;}
.lx-favtitle{margin:0;font-size:19px;font-weight:600;letter-spacing:-.01em;}
.lx-favlead{margin:0;font-size:13.5px;color:var(--lx-ink-2);max-width:64ch;}
.lx-favgrid{display:flex;flex-wrap:wrap;gap:14px 10px;}
.lx-favcell{padding:10px 12px;border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);background:var(--lx-card);box-shadow:var(--lx-shadow-sm);}
.lx-favcell .lx-tile-cell{border:0;box-shadow:none;background:transparent;height:34px;}
.lx-favcell .lx-favname{display:block;margin-top:2px;font-size:11px;color:var(--lx-ink-2);text-align:center;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
`)

  LX.tiles = { Panel, FavoritesPage, QUICK, TPL, favorites, tex }
})()
