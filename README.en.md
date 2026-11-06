# dsh-latex-formula-editor

> A LaTeX formula editor for the DSH sidebar: offline rendering, tile-based symbol input, formula templates, favourites, image/document OCR, multi-format export and sharing.

![Plugin UI](docs/img/editor.png)

## Install

```bash
git clone https://github.com/jiahui-huang1/dsh-latex-formula-editor.git
pnpm dsh plugin add ./dsh-latex-formula-editor
```

Enable **LaTeX Formula Editor** in the DSH sidebar (entry id `latex-editor`).

## Features

- **Quick tools** — ten tiles (common symbols, Greek, fractions/calculus, roots, limits & logs, trigonometry, integrals, large operators, brackets, matrices); hover to expand the grouped symbol panel, click to insert.
- **Templates** — algebra, geometry, inequalities, integrals, matrices, trigonometry, statistics, sequences, physics, chemistry.
- **Format row** — colour picker, rendered font menu, rendered size menu, environment wrapper (align/aligned/gathered/cases/split/array/eqnarray/none), clear, undo, import, favourite.
- **Export** — images (SVG/PNG/JPG), code (LaTeX/AsciiMath/Typst/SVG Code/HTML inline & display/MathML variants/OMML), escaping (backslash, `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, JSON) and share links.
- **Favourites** — title, timestamp, render and source per entry; rename, copy, delete, insert; searchable; configurable cap (10 by default).
- **Recognition** — image OCR (drag & paste) and document OCR (page by page, download as Word/LaTeX/Markdown, results kept for 15 days).
- **UI** — 150% default scale, light/dark theme, 简体中文 / 繁體中文 / English.

![Document OCR](docs/img/doc-ocr.png)

## Settings

Settings → OCR service: use the Harness model or an OpenAI-compatible endpoint. Rendering and export are fully offline; only OCR sends an image.

## Requirements

DSH ≥ 1.0 (`dsh.bundle.patch` + `dsh.client`). No build step; MathJax 3 and PDF.js ship with the plugin.

## Licence

MIT
