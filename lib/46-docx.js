/* =============================================================================
 * LaTeX 公式编辑器 · 46-docx
 * Word (.docx) export for recognised pages.
 *
 * A .docx is an OPC package (a ZIP with XML parts).  The formulas are written as
 * real Office Math (OMML), so Word shows them as editable equations in Cambria
 * Math instead of a plain-text approximation of the LaTeX source.
 *
 *   LaTeX  --MathJax-->  MathML  --LX.convert.mathmlToOmml-->  OMML
 *
 * The ZIP writer below stores entries uncompressed (method 0), which every Word
 * version accepts and keeps the code dependency-free.
 * ========================================================================== */
;(function () {
  const LX = window.__LX
  if (!LX) return

  /* ----------------------------------------------------------------- CRC32 */
  const CRC_TABLE = (function () {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    return table
  })()

  function crc32(bytes) {
    let c = 0xffffffff
    for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }

  function utf8(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text)
    const escaped = unescape(encodeURIComponent(text))
    const out = new Uint8Array(escaped.length)
    for (let i = 0; i < escaped.length; i += 1) out[i] = escaped.charCodeAt(i)
    return out
  }

  /* ------------------------------------------------------------------- ZIP */
  const DOS_TIME = 0
  const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1

  function zip(files) {
    const chunks = []
    const central = []
    let offset = 0
    files.forEach(function (file) {
      const name = utf8(file.name)
      const data = file.data instanceof Uint8Array ? file.data : utf8(String(file.data == null ? '' : file.data))
      const crc = crc32(data)
      const local = new Uint8Array(30 + name.length)
      const lv = new DataView(local.buffer)
      lv.setUint32(0, 0x04034b50, true)
      lv.setUint16(4, 20, true)
      lv.setUint16(6, 0x0800, true)
      lv.setUint16(8, 0, true)
      lv.setUint16(10, DOS_TIME, true)
      lv.setUint16(12, DOS_DATE, true)
      lv.setUint32(14, crc, true)
      lv.setUint32(18, data.length, true)
      lv.setUint32(22, data.length, true)
      lv.setUint16(26, name.length, true)
      lv.setUint16(28, 0, true)
      local.set(name, 30)
      chunks.push(local, data)

      const entry = new Uint8Array(46 + name.length)
      const ev = new DataView(entry.buffer)
      ev.setUint32(0, 0x02014b50, true)
      ev.setUint16(4, 20, true)
      ev.setUint16(6, 20, true)
      ev.setUint16(8, 0x0800, true)
      ev.setUint16(10, 0, true)
      ev.setUint16(12, DOS_TIME, true)
      ev.setUint16(14, DOS_DATE, true)
      ev.setUint32(16, crc, true)
      ev.setUint32(20, data.length, true)
      ev.setUint32(24, data.length, true)
      ev.setUint16(28, name.length, true)
      ev.setUint16(30, 0, true)
      ev.setUint16(32, 0, true)
      ev.setUint16(34, 0, true)
      ev.setUint16(36, 0, true)
      ev.setUint32(38, 0, true)
      ev.setUint32(42, offset, true)
      entry.set(name, 46)
      central.push(entry)
      offset += local.length + data.length
    })

    let cdSize = 0
    for (let i = 0; i < central.length; i += 1) cdSize += central[i].length
    const end = new Uint8Array(22)
    const ev2 = new DataView(end.buffer)
    ev2.setUint32(0, 0x06054b50, true)
    ev2.setUint16(8, central.length, true)
    ev2.setUint16(10, central.length, true)
    ev2.setUint32(12, cdSize, true)
    ev2.setUint32(16, offset, true)

    return new Blob(chunks.concat(central, [end]), {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
  }

  /* ----------------------------------------------------------------- OOXML */
  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
  const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types'

  /* Word picks Cambria Math for math runs on its own; the explicit rPr also
     covers older/locale builds and makes the intent visible in the XML. */
  const MATH_RPR =
    '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="Cambria Math"/></w:rPr>'

  function withMathFont(omml) {
    return String(omml || '').replace(/<m:r>(<m:rPr>[\s\S]*?<\/m:rPr>)?/g, function (all, mathRPr) {
      return '<m:r>' + (mathRPr || '') + MATH_RPR
    })
  }

  function xmlEscape(text) {
    return String(text == null ? '' : text)
      .split('&')
      .join('&amp;')
      .split('<')
      .join('&lt;')
      .split('>')
      .join('&gt;')
      .split('"')
      .join('&quot;')
  }

  function textRun(text, options) {
    const opts = options || {}
    const rPr = []
    if (opts.bold) rPr.push('<w:b/>')
    if (opts.color) rPr.push('<w:color w:val="' + opts.color + '"/>')
    if (opts.size) rPr.push('<w:sz w:val="' + opts.size + '"/>')
    rPr.push('<w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="Cambria Math"/>')
    return (
      '<w:r><w:rPr>' +
      rPr.join('') +
      '</w:rPr><w:t xml:space="preserve">' +
      xmlEscape(text) +
      '</w:t></w:r>'
    )
  }

  function paragraph(inner, options) {
    const opts = options || {}
    const pPr = []
    if (opts.center) pPr.push('<w:jc w:val="center"/>')
    pPr.push('<w:spacing w:before="0" w:after="' + (opts.after == null ? 120 : opts.after) + '"/>')
    return '<w:p><w:pPr>' + pPr.join('') + '</w:pPr>' + inner + '</w:p>'
  }

  function documentXml(blocks) {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="' + NS_W + '" xmlns:m="' + NS_M + '" xmlns:r="' + NS_R + '">' +
      '<w:body>' +
      blocks.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
      '</w:sectPr>' +
      '</w:body></w:document>'
    )
  }

  const STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="' + NS_W + '">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="Cambria Math"/>' +
    '<w:sz w:val="24"/><w:szCs w:val="24"/>' +
    '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '</w:styles>'

  const CONTENT_TYPES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="' + NS_CT + '">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>'

  const ROOT_RELS_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="' + NS_PKG_REL + '">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>'

  const DOC_RELS_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="' + NS_PKG_REL + '">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>'

  /**
   * Build a .docx Blob.
   * @param {{pages: Array<{n?: number, tex?: string, latex?: string}>, pageLabel?: function, headingColor?: string}} options
   * @returns {Promise<Blob>}
   */
  async function build(options) {
    const opts = options || {}
    const pages = Array.isArray(opts.pages) ? opts.pages : []
    const label = typeof opts.pageLabel === 'function' ? opts.pageLabel : null

    const blocks = []
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index] || {}
      const tex = String(page.tex == null ? page.latex : page.tex).trim()
      const number = page.n == null ? index + 1 : page.n
      if (index > 0) blocks.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
      if (label) {
        blocks.push(
          paragraph(textRun(label(number), { bold: true, color: '5B6472', size: 20 }), { after: 60 }),
        )
      }
      if (!tex) continue
      let omml = ''
      try {
        if (LX.render && typeof LX.render.tex2mathml === 'function' && LX.convert && typeof LX.convert.mathmlToOmml === 'function') {
          const mathml = await LX.render.tex2mathml(tex, { display: true })
          omml = withMathFont(LX.convert.mathmlToOmml(mathml))
        }
      } catch (error) {
        omml = ''
      }
      if (omml) {
        blocks.push('<w:p><w:pPr><w:spacing w:before="60" w:after="120"/></w:pPr>' + omml + '</w:p>')
      } else {
        /* Fall back to the source text so nothing is ever silently dropped. */
        blocks.push(paragraph(textRun(tex, {}), { after: 120 }))
      }
    }
    if (!blocks.length) blocks.push(paragraph(textRun('', {}), {}))

    return zip([
      { name: '[Content_Types].xml', data: CONTENT_TYPES_XML },
      { name: '_rels/.rels', data: ROOT_RELS_XML },
      { name: 'word/document.xml', data: documentXml(blocks) },
      { name: 'word/styles.xml', data: STYLES_XML },
      { name: 'word/_rels/document.xml.rels', data: DOC_RELS_XML },
    ])
  }

  LX.docx = { build: build }
})()
