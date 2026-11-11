/**
 * @local/dsh-latex-editor — lib/90-skin.js
 *
 * The Corporate Clean skin layer. Loaded last, so it restates the shared
 * primitives (buttons, inputs, cards, tabs, modals, palettes, recognition
 * surfaces) in one auditable place instead of spreading style edits across the
 * feature modules.
 *
 * Rules this layer enforces (from the Corporate Clean style reference):
 *   · blue-600/700 is the only accent for primary actions and focus rings
 *   · every surface uses rounded-lg (8px) or rounded-xl (12px) — never square
 *   · flat fills only: no gradients on controls
 *   · shadow-sm at rest, shadow on hover lift (−1/−2px), shadow-md for cards
 *   · buttons press with scale(.98) + translateY(0); transitions ≤ 200ms ease-out
 *   · focus is a 2px ring inset by a 2px offset ring (WCAG 2.1 AA indicator)
 *   · page is a light slate tint, cards are white, borders are gray-200-like
 *   · motion respects prefers-reduced-motion
 * Surfaces derive from the harness tokens, so light and dark stay coherent;
 * only the accent is a fixed corporate blue.
 */
;(function () {
  'use strict'
  const LX = window.__LX
  if (!LX || typeof LX.addCss !== 'function') return

  LX.addCss(`
/* ============================================================ design tokens */
.lx-root{
  --lx-accent:#2563eb;
  --lx-accent-hover:#1d4ed8;
  --lx-accent-soft:color-mix(in srgb, #2563eb 9%, transparent);
  --lx-accent-soft-2:color-mix(in srgb, #2563eb 16%, transparent);
  --lx-accent-ink:#1d4ed8;
  --lx-focus:#3b82f6;
  --lx-ring-offset:var(--dsw-alias-bg-base);
  --lx-page:color-mix(in srgb, var(--dsw-alias-label-primary) 3.4%, var(--dsw-alias-bg-base));
  --lx-card:var(--dsw-alias-bg-layer-1);
  --lx-well:color-mix(in srgb, var(--dsw-alias-label-primary) 2.6%, var(--dsw-alias-bg-base));
  --lx-border:color-mix(in srgb, var(--dsw-alias-label-primary) 11%, transparent);
  --lx-border-strong:color-mix(in srgb, var(--dsw-alias-label-primary) 19%, transparent);
  --lx-ink:var(--dsw-alias-label-primary);
  --lx-ink-2:var(--dsw-alias-label-secondary);
  --lx-ink-3:color-mix(in srgb, var(--dsw-alias-label-secondary) 72%, transparent);
  --lx-caret:var(--lx-ink);
  --lx-shadow-sm:0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.05);
  --lx-shadow:0 1px 3px rgba(16,24,40,.10), 0 2px 6px rgba(16,24,40,.05);
  --lx-shadow-md:0 6px 16px -6px rgba(16,24,40,.16), 0 2px 6px -2px rgba(16,24,40,.08);
  --lx-r-lg:8px;
  --lx-r-xl:12px;
  --lx-ease:cubic-bezier(.2,.8,.4,1);
  background:var(--lx-page);
  color:var(--lx-ink);
}

/* ================================================================= buttons */
.lx-btn{
  height:32px;padding:0 14px;border-radius:var(--lx-r-lg);
  border:1px solid var(--lx-border);background:var(--lx-card);color:var(--lx-ink);
  font-size:13px;font-weight:500;box-shadow:var(--lx-shadow-sm);
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease),
    background-color .15s var(--lx-ease), border-color .15s var(--lx-ease), color .15s var(--lx-ease);
}
.lx-btn:hover:not(:disabled){background:var(--lx-card);border-color:var(--lx-border-strong);box-shadow:var(--lx-shadow);transform:translateY(-1px);}
.lx-btn:active:not(:disabled){transform:translateY(0) scale(.98);box-shadow:var(--lx-shadow-sm);}
.lx-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-btn--primary{background:var(--lx-accent);border-color:transparent;color:#fff;box-shadow:var(--lx-shadow-sm);}
.lx-btn--primary:hover:not(:disabled){background:var(--lx-accent-hover);border-color:transparent;box-shadow:var(--lx-shadow);}
.lx-btn--ghost{background:transparent;border-color:transparent;box-shadow:none;color:var(--lx-ink-2);}
.lx-btn--ghost:hover:not(:disabled){background:var(--lx-card);border-color:var(--lx-border);color:var(--lx-ink);box-shadow:var(--lx-shadow-sm);}
.lx-btn--danger{color:var(--dsw-alias-state-error-primary);}
.lx-btn--danger:hover:not(:disabled){border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 38%, transparent);}
.lx-btn--sm{height:28px;padding:0 10px;font-size:12px;border-radius:var(--lx-r-lg);}

.lx-iconbtn{
  border-radius:var(--lx-r-lg);color:var(--lx-ink-2);
  transition:transform .15s var(--lx-ease), background-color .15s var(--lx-ease), color .15s var(--lx-ease), box-shadow .15s var(--lx-ease);
}
.lx-iconbtn:hover{background:var(--lx-accent-soft);color:var(--lx-accent);box-shadow:none;}
.lx-iconbtn:active{transform:scale(.94);}
.lx-iconbtn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}

/* ================================================================== inputs */
.lx-input,.lx-textarea,.lx-select{
  border:1px solid var(--lx-border);border-radius:var(--lx-r-lg);
  background:var(--lx-card);color:var(--lx-ink);font-size:13px;
  transition:border-color .15s var(--lx-ease), box-shadow .15s var(--lx-ease);
}
.lx-input:hover,.lx-textarea:hover,.lx-select:hover{border-color:var(--lx-border-strong);}
.lx-input:focus,.lx-textarea:focus,.lx-select:focus{
  border-color:var(--lx-focus);
  box-shadow:0 0 0 3px var(--lx-accent-soft-2);
}
.lx-input:focus-visible,.lx-textarea:focus-visible,.lx-select:focus-visible{
  outline:none;
  box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);
}
.lx-input::placeholder,.lx-textarea::placeholder{color:var(--lx-ink-3);}

/* ================================================================= switch */
.lx-switch{width:36px;height:20px;border-radius:999px;background:var(--lx-border-strong);border-color:transparent;}
.lx-switch__knob{width:16px;height:16px;top:2px;left:2px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.25);}
.lx-switch--on{background:var(--lx-accent);}
.lx-switch--on .lx-switch__knob{transform:translateX(16px);background:#fff;}
.lx-switch:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}

/* ============================================================ segmented   */
.lx-seg{background:var(--lx-page);border-color:var(--lx-border);border-radius:var(--lx-r-lg);padding:3px;}
.lx-seg__item{border-radius:7px;font-weight:500;color:var(--lx-ink-2);transition:background-color .15s var(--lx-ease), color .15s var(--lx-ease), box-shadow .15s var(--lx-ease);}
.lx-seg__item:hover{color:var(--lx-ink);background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);}
.lx-seg__item--on{background:var(--lx-card);color:var(--lx-ink);box-shadow:var(--lx-shadow-sm);}
.lx-seg__item--on:hover{background:var(--lx-card);}
.lx-seg__item:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}

/* =================================================================== tabs */
.lx-tabs{gap:4px;}
.lx-tab{height:40px;padding:0 14px;border-bottom-width:2px;font-size:13.5px;font-weight:500;color:var(--lx-ink-2);}
.lx-tab:hover{color:var(--lx-ink);background:transparent;}
.lx-tab--on{color:var(--lx-accent-ink);border-bottom-color:var(--lx-accent);font-weight:600;}
.lx-tab:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);border-radius:var(--lx-r-lg);}

/* ================================================================= badges */
.lx-badge{height:20px;border-radius:6px;font-weight:500;padding:0 8px;}
.lx-badge--brand{background:var(--lx-accent-soft);color:var(--lx-accent-ink);}
.lx-badge--success{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 72%, var(--lx-ink));}
.lx-badge--warn{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent);color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 62%, var(--lx-ink));}
.lx-badge--error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 13%, transparent);color:var(--dsw-alias-state-error-primary);}

.lx-progress{height:6px;border-radius:999px;background:var(--lx-page);}
.lx-progress__fill{background:var(--lx-accent);border-radius:999px;}

/* ================================================================== cards */
.lx-card{background:var(--lx-card);border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);box-shadow:var(--lx-shadow-sm);}

/* ================================================================== modal */
.lx-modal__backdrop{background:rgba(15,23,42,.40);backdrop-filter:none;}
.lx-modal{border-radius:var(--lx-r-xl);border:1px solid var(--lx-border);box-shadow:var(--lx-shadow-md);background:var(--lx-card);}
.lx-modal__head{padding:16px 20px;border-bottom:1px solid var(--lx-border);}
.lx-modal__title{font-size:15px;font-weight:600;letter-spacing:-.01em;}
.lx-modal__body{padding:20px;}
.lx-modal__foot{padding:14px 20px;border-top:1px solid var(--lx-border);background:var(--lx-page);gap:10px;}

.lx-toast{border-radius:var(--lx-r-lg);border:1px solid var(--lx-border);box-shadow:var(--lx-shadow-md);background:var(--lx-card);}
.lx-empty__icon{border-radius:var(--lx-r-xl);background:var(--lx-page);border:1px solid var(--lx-border);color:var(--lx-ink-2);}
.lx-empty__title{font-size:14.5px;font-weight:600;letter-spacing:-.01em;}

/* ============================================================ app chrome */
.lx-app{background:var(--lx-page);}
.lx-app-head{
  background:var(--lx-card);border-bottom:1px solid var(--lx-border);
  padding:12px 20px;min-height:64px;gap:14px;
}
.lx-app-titles{min-width:0;max-width:300px;}
.lx-app-tabs{gap:2px;}
.lx-app-mark{
  width:34px;height:34px;border-radius:var(--lx-r-lg);
  background:var(--lx-accent);color:#fff;box-shadow:var(--lx-shadow-sm);
  background-image:none;
}
.lx-app-title{font-size:15px;font-weight:600;letter-spacing:-.01em;}
.lx-app-sub{font-size:12px;color:var(--lx-ink-2);max-width:360px;margin-top:2px;}
.lx-app-actions{gap:8px;align-items:center;}
/* export menus row */
.lx-exp2{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--lx-border);}
.lx-exp2-cell{position:relative;display:inline-flex;}
.lx-exp2-cell .lx-fmt-cell{min-width:78px;}
.lx-fmt-cell--on{border-color:var(--lx-accent);background:var(--lx-accent-soft);color:var(--lx-accent-ink);}
.lx-exp2-pop{
  position:absolute;left:0;top:calc(100% + 4px);z-index:30;min-width:190px;padding:6px;
  border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);background:var(--lx-card);
  box-shadow:var(--lx-shadow-md);max-height:320px;overflow:auto;animation:lx-pop .14s ease-out;
}
.lx-exp2-pop .lx-texmenu-row{justify-content:flex-start;}
/* the export row must never push the download button out of the pane */
.lx-exp{flex-wrap:wrap;row-gap:8px;}
.lx-exp .lx-selectwrap{min-width:0;}
.lx-exp .lx-select{max-width:150px;}
/* language menu */
.lx-langmenu{position:relative;display:inline-flex;}
.lx-langmenu-pop{
  position:absolute;right:0;top:calc(100% + 6px);z-index:40;min-width:170px;padding:6px;
  border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);background:var(--lx-card);
  box-shadow:var(--lx-shadow-md);animation:lx-pop .14s ease-out;
}
.lx-langmenu-row{
  display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;
  padding:7px 9px;border:0;border-radius:var(--lx-r-lg);background:transparent;cursor:pointer;
  color:var(--lx-ink);font-size:13px;font-weight:500;text-align:left;
  transition:background-color .12s var(--lx-ease);
}
.lx-langmenu-row:hover{background:var(--lx-accent-soft);}
.lx-langmenu-row--on{color:var(--lx-accent-ink);font-weight:600;}
.lx-langmenu-row:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
/* sun / moon theme switch */
.lx-theme-switch{
  position:relative;flex:none;width:50px;height:30px;padding:0;border:1px solid var(--lx-border);
  border-radius:999px;background:var(--lx-well);cursor:pointer;box-shadow:var(--lx-shadow-sm);
  transition:background-color .2s var(--lx-ease), border-color .2s var(--lx-ease);
}
.lx-theme-switch:hover{border-color:var(--lx-accent);}
.lx-theme-switch:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-theme-track{position:absolute;inset:0;border-radius:999px;}
.lx-theme-switch--on{background:color-mix(in srgb, #2563eb 18%, var(--lx-well));border-color:color-mix(in srgb, #2563eb 45%, var(--lx-border));}
.lx-theme-knob{
  position:absolute;top:2px;left:2px;width:24px;height:24px;border-radius:50%;
  display:grid;place-items:center;background:var(--lx-card);color:var(--lx-ink);
  box-shadow:var(--lx-shadow);transition:transform .2s var(--lx-ease), background-color .2s var(--lx-ease), color .2s var(--lx-ease);
}
.lx-theme-switch--on .lx-theme-knob{transform:translateX(18px);background:#1e293b;color:#facc15;}
.lx-app-body{padding:16px 24px 24px;background:var(--lx-page);}

/* ========================================================= editor + preview */
.lx-ed-split{gap:16px;}
.lx-ed-gutter--off{display:none;}
.lx-ed-pane,.lx-pv-pane{
  background:var(--lx-card);border:1px solid var(--lx-border);
  border-radius:var(--lx-r-xl);box-shadow:var(--lx-shadow-sm);overflow:hidden;
}
.lx-ed-pane{border-right:1px solid var(--lx-border);}
.lx-ed-tools{padding:10px 12px;border-bottom:1px solid var(--lx-border);gap:8px;background:var(--lx-card);flex-wrap:nowrap;min-width:0;}
.lx-ed-tools .lx-seg{flex:0 1 auto;min-width:0;}
.lx-ed-tools .lx-seg__item{padding:0 10px;font-size:12.5px;}
.lx-ed-surface{
  margin:12px;border:1px solid var(--lx-border);border-radius:var(--lx-r-lg);
  background:var(--lx-well);overflow:hidden;
  transition:border-color .16s var(--lx-ease), box-shadow .16s var(--lx-ease);
}
.lx-ed-surface:focus-within{border-color:var(--lx-focus);box-shadow:0 0 0 3px var(--lx-accent-soft);}
/* the editor paints its own 2px caret (see .lx-ed-caret), so hide the native one */
.lx-ed-input{caret-color:transparent;}
.lx-ed-gutter{width:46px;background:var(--lx-page);border-right:1px solid var(--lx-border);}
.lx-ed-lineno{color:var(--lx-ink-3);}
.lx-ed-status{padding:7px 12px;border-bottom:1px solid var(--lx-border);background:var(--lx-card);color:var(--lx-ink-2);gap:16px;}
.lx-ed-hint{color:var(--lx-ink-3);}
.lx-ed-suggest{border-radius:var(--lx-r-lg);border:1px solid var(--lx-border);box-shadow:var(--lx-shadow-md);padding:5px;}
.lx-ed-suggest-row{border-radius:6px;height:28px;}
.lx-ed-suggest-row--on,.lx-ed-suggest-row:hover{background:var(--lx-accent-soft);}
.lx-drawer{border-bottom:1px solid var(--lx-border);background:var(--lx-card);height:auto;overflow:visible;}
.lx-pv-head{display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px 8px;padding:10px 12px;border-bottom:1px solid var(--lx-border);background:var(--lx-card);}
.lx-pv-head > *{flex:0 0 auto;display:flex;align-items:center;height:34px;min-height:0;}
.lx-pv-head .lx-seg{padding:2px;}
.lx-pv-head .lx-seg__item{height:26px;padding:0 9px;font-size:12px;}
.lx-pv-stage svg{overflow:visible;}
.lx-pv-canvas{margin:12px;border:0;border-radius:var(--lx-r-lg);background-color:var(--lx-well);padding:24px;}
/* the surface switch must win over the base canvas fill (same specificity, later file) */
.lx-pv-canvas.lx-pv-canvas--white{background-color:#ffffff;}
.lx-pv-canvas.lx-pv-canvas--dark{background-color:#16181d;}
.lx-pv-canvas.lx-pv-canvas--transparent{background-color:var(--lx-well);}
/* the formula keeps currentColor, so the ink must follow the chosen surface
   rather than the app theme (white canvas in dark mode would go invisible) */
.lx-pv-canvas.lx-pv-canvas--white .lx-pv-stage,
.lx-pv-canvas.lx-pv-canvas--white .lx-pv-math{color:#0f1115;}
.lx-pv-canvas.lx-pv-canvas--white .lx-pv-placeholder{color:#61666b;}
.lx-pv-canvas.lx-pv-canvas--dark .lx-pv-stage,
.lx-pv-canvas.lx-pv-canvas--dark .lx-pv-math{color:#f4f5f7;}
.lx-pv-canvas.lx-pv-canvas--transparent .lx-pv-stage,
.lx-pv-canvas.lx-pv-canvas--transparent .lx-pv-math{color:var(--lx-ink);}
.lx-pv-foot{padding:7px 12px;border-top:1px solid var(--lx-border);background:var(--lx-card);color:var(--lx-ink-2);}
.lx-pv-errors{border-radius:var(--lx-r-lg);}
.lx-exp{padding:10px 12px;border-top:1px solid var(--lx-border);background:var(--lx-card);gap:10px;flex-wrap:nowrap;}
.lx-exp-label{gap:6px;}
.lx-exp-copy{margin-left:auto;gap:4px;}
.lx-exp-sep{background:var(--lx-border);}
.lx-exp-label{color:var(--lx-ink-2);font-weight:500;}
.lx-exp-chip{
  height:28px;min-width:44px;padding:0 10px;border-radius:var(--lx-r-lg);
  border:1px solid var(--lx-border);background:var(--lx-card);color:var(--lx-ink);
  font-size:12px;font-weight:500;box-shadow:var(--lx-shadow-sm);
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), background-color .15s var(--lx-ease), border-color .15s var(--lx-ease);
}
.lx-exp-chip:hover:not(:disabled){border-color:var(--lx-border-strong);box-shadow:var(--lx-shadow);transform:translateY(-1px);}
.lx-exp-chip:active:not(:disabled){transform:translateY(0) scale(.98);box-shadow:var(--lx-shadow-sm);}
.lx-exp-chip:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-exp-chip--copy{background:transparent;border-color:transparent;box-shadow:none;color:var(--lx-ink-2);}
.lx-exp-copy .lx-iconbtn{width:28px;height:28px;}
.lx-exp-chip--copy:hover:not(:disabled){background:var(--lx-card);border-color:var(--lx-border);color:var(--lx-ink);}
.lx-exp-sep{background:var(--lx-border);}

/* ============================================================ symbol panel */
.lx-pal-toolbar{
  padding:8px 12px;border-bottom:1px solid var(--lx-border);background:var(--lx-card);
  display:flex;flex-direction:column;gap:6px;align-items:stretch;
}
.lx-pal-cats{display:none;}
.lx-pal-search{width:100%;}
/* colour / font / size: its own row under the search field */
.lx-fmt{
  display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:nowrap;justify-content:flex-start;
}
/* seven equal controls: 62px wide, they wrap instead of squeezing the labels */
.lx-fmt{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;justify-content:flex-start;margin:10px -12px 0;padding:10px 12px;border-top:1px solid var(--lx-border);}
/* theme override: the host supplies the palette, these cover the forced modes */
.lx-root[data-theme='dark']{
  color-scheme: dark;
  --dsw-alias-bg-base:#15171c;
  --dsw-alias-bg-layer-1:#1b1e24;
  --dsw-alias-label-primary:#e9ecf2;
  --dsw-alias-label-secondary:#a8b0bf;
}
.lx-root[data-theme='light']{
  color-scheme: light;
  --dsw-alias-bg-base:#ffffff;
  --dsw-alias-bg-layer-1:#f6f7f9;
  --dsw-alias-label-primary:#0f1115;
  --dsw-alias-label-secondary:#5b6472;
}
.lx-fmt-cell{
  flex:0 0 auto;width:auto;min-width:62px;max-width:104px;height:30px;
  display:inline-flex;align-items:center;justify-content:center;gap:2px;
  padding:0 6px;border-radius:var(--lx-r-lg);
  border:1px solid var(--lx-border);background:var(--lx-card);color:var(--lx-ink-2);
  font-size:11.5px;font-weight:600;cursor:pointer;box-shadow:var(--lx-shadow-sm);
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), color .15s var(--lx-ease), border-color .15s var(--lx-ease);
}
.lx-fmt-cell:hover{color:var(--lx-ink);border-color:var(--lx-accent);box-shadow:var(--lx-shadow);transform:translateY(-1px);}
.lx-fmt-cell:active{transform:translateY(0) scale(.98);}
.lx-fmt-cell:focus-visible,.lx-fmt-cell:focus-within{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-fmt-label{white-space:nowrap;font-size:11px;overflow:hidden;text-overflow:ellipsis;}
.lx-fmt-btn{font-family:inherit;}
.lx-fmt-btn--danger:hover{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);}
.lx-fmt-color{position:relative;cursor:pointer;color:var(--lx-ink-2);}
.lx-fmt-color svg{color:currentColor;}
.lx-fmt-color input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0;}
.lx-fmt .lx-texmenu{flex:0 0 auto;width:auto;min-width:62px;max-width:104px;}
.lx-fmt .lx-texmenu-btn{width:100%;height:30px;padding:0 6px;font-size:11px;gap:2px;justify-content:center;}
.lx-fmt .lx-texmenu-main{display:inline-flex;align-items:center;gap:4px;min-width:0;}
.lx-fmt .lx-selectwrap{min-width:0;}
.lx-pal-search .lx-input{height:28px;font-size:12px;}

/* wrapping category chips */
.lx-catchips{display:flex;flex-wrap:wrap;gap:5px;}
.lx-catchip{
  height:24px;padding:0 9px;border-radius:6px;
  border:1px solid var(--lx-border);background:var(--lx-card);color:var(--lx-ink-2);
  font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), background-color .15s var(--lx-ease), border-color .15s var(--lx-ease), color .15s var(--lx-ease);
}
.lx-catchip:hover{color:var(--lx-ink);border-color:var(--lx-border-strong);box-shadow:var(--lx-shadow-sm);transform:translateY(-1px);}
.lx-catchip:active{transform:translateY(0) scale(.98);}
.lx-catchip--on{background:var(--lx-accent-soft);border-color:var(--lx-accent);color:var(--lx-accent-ink);box-shadow:none;}
.lx-catchip:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}

@media (max-width:1360px){
  .lx-app-brand > .lx-badge{display:none;}
}
@media (max-width:1180px){
  .lx-app-titles{max-width:200px;}
}
.lx-pal-body{padding:10px 12px 16px;}
.lx-pal-groupname{font-size:12px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--lx-ink-2);margin:2px 0 8px;}
.lx-pal-item{
  min-width:40px;height:36px;border-radius:var(--lx-r-lg);
  background:var(--lx-card);border:1px solid var(--lx-border);
  box-shadow:var(--lx-shadow-sm);
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), border-color .15s var(--lx-ease), background-color .15s var(--lx-ease);
}
.lx-pal-item:hover{background:var(--lx-card);border-color:var(--lx-accent);box-shadow:var(--lx-shadow);transform:translateY(-1px);}
.lx-pal-item:active{transform:translateY(0) scale(.98);box-shadow:var(--lx-shadow-sm);}
.lx-pal-item:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}

.lx-tpl-grid{gap:10px;}
.lx-tpl-item{
  padding:10px;border-radius:var(--lx-r-xl);border:1px solid var(--lx-border);
  background:var(--lx-card);box-shadow:var(--lx-shadow-sm);
  transition:transform .2s var(--lx-ease), box-shadow .2s var(--lx-ease), border-color .2s var(--lx-ease);
}
.lx-tpl-item:hover{border-color:var(--lx-accent);box-shadow:var(--lx-shadow-md);transform:translateY(-2px);}
.lx-tpl-item:active{transform:translateY(0) scale(.98);box-shadow:var(--lx-shadow-sm);}
.lx-tpl-item:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-tpl-name{font-size:11.5px;color:var(--lx-ink-2);}

/* ========================================================== structure tree */
.lx-tree-head{padding:9px 12px;border-bottom:1px solid var(--lx-border);background:var(--lx-card);}
.lx-tree-body{padding:6px 8px;}
.lx-tree-row{height:28px;border-radius:var(--lx-r-lg);color:var(--lx-ink-2);}
.lx-tree-row:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);color:var(--lx-ink);}
.lx-tree-row--near{background:var(--lx-accent-soft);color:var(--lx-ink);}
.lx-tree-row--on{background:var(--lx-accent-soft-2);color:var(--lx-accent-ink);font-weight:500;}
.lx-tree-ops{padding:9px 12px;border-top:1px solid var(--lx-border);background:var(--lx-page);gap:6px;}
.lx-tree-op{
  height:26px;padding:0 10px;border-radius:var(--lx-r-lg);
  border:1px solid var(--lx-border);background:var(--lx-card);color:var(--lx-ink);
  font-size:12px;font-weight:500;box-shadow:var(--lx-shadow-sm);
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), border-color .15s var(--lx-ease), background-color .15s var(--lx-ease);
}
.lx-tree-op:hover{border-color:var(--lx-accent);box-shadow:var(--lx-shadow);transform:translateY(-1px);}
.lx-tree-op:active{transform:translateY(0) scale(.98);box-shadow:var(--lx-shadow-sm);}
.lx-tree-op:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}

/* ======================================================== recognition panes */
.lx-ocr-page,.lx-doc-tab{padding:24px;}
.lx-ocr-drop,.lx-doc-drop{
  border:2px dashed var(--lx-border-strong);border-radius:var(--lx-r-xl);
  background:var(--lx-page);color:var(--lx-ink-2);
  transition:border-color .15s var(--lx-ease), background-color .15s var(--lx-ease);
}
.lx-ocr-drop:hover,.lx-doc-drop:hover{border-color:var(--lx-accent);background:var(--lx-accent-soft);}
.lx-ocr-drop--active,.lx-doc-drop--active{border-color:var(--lx-accent);background:var(--lx-accent-soft-2);}
.lx-ocr-preview,.lx-ocr-result,.lx-doc-result,.lx-doc-section{
  border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);
  background:var(--lx-card);box-shadow:var(--lx-shadow-sm);
}
.lx-ocr-status{
  border:1px solid var(--lx-border);border-radius:var(--lx-r-lg);
  background:var(--lx-card);box-shadow:var(--lx-shadow-sm);
}
.lx-ocr-hintcard{border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);background:var(--lx-accent-soft);}
.lx-ocr-tex{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
.lx-doc-page{
  border:1px solid var(--lx-border);border-radius:var(--lx-r-lg);
  background:var(--lx-card);box-shadow:var(--lx-shadow-sm);overflow:hidden;
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), border-color .15s var(--lx-ease);
}
.lx-doc-page:hover{box-shadow:var(--lx-shadow);transform:translateY(-1px);}
.lx-doc-page--on{border-color:var(--lx-accent);box-shadow:0 0 0 1px var(--lx-accent), var(--lx-shadow-sm);}
.lx-doc-toolbar,.lx-doc-footer{border-color:var(--lx-border);}
.lx-doc-tips{color:var(--lx-ink-2);}

/* ======================================================== settings + help */
.lx-set-status{border:0;border-radius:var(--lx-r-lg);background:var(--lx-page);}
.lx-set-group-title{text-transform:none;letter-spacing:0;font-size:13px;font-weight:600;color:var(--lx-ink);}
.lx-set-group-title svg{color:var(--lx-accent);}
.lx-set-chip{border-radius:var(--lx-r-lg);border:1px solid var(--lx-border);background:var(--lx-card);box-shadow:var(--lx-shadow-sm);transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), background-color .15s var(--lx-ease), border-color .15s var(--lx-ease);}
.lx-set-chip:hover{border-color:var(--lx-border-strong);box-shadow:var(--lx-shadow);transform:translateY(-1px);}
.lx-set-chip--on{background:var(--lx-accent-soft);border-color:var(--lx-accent);color:var(--lx-accent-ink);box-shadow:none;}
.lx-set-chip:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}

.lx-help{padding:24px 32px 64px;}
.lx-help-lead{font-size:13.5px;line-height:1.75;max-width:68ch;color:var(--lx-ink-2);}
.lx-help-h2{font-size:19px;font-weight:600;letter-spacing:-.01em;}
.lx-help-section{border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);background:var(--lx-card);box-shadow:var(--lx-shadow-sm);padding:20px;}
.lx-help-title{font-size:13.5px;font-weight:600;letter-spacing:-.005em;}
.lx-help-icon{
  width:24px;height:24px;border-radius:7px;
  background:var(--lx-accent-soft);color:var(--lx-accent);
  transition:transform .15s var(--lx-ease), background-color .15s var(--lx-ease), color .15s var(--lx-ease);
}
.lx-help-list li:hover .lx-help-icon{background:var(--lx-accent);color:#fff;transform:scale(1.1);}
.lx-help-table td{padding:7px 10px;border-bottom:1px solid var(--lx-border);}
.lx-help-table tr:hover td{background:var(--lx-page);}
.lx-help-code{background:var(--lx-page);border:1px solid var(--lx-border);border-radius:var(--lx-r-lg);}
.lx-help-chip{background:var(--lx-page);border:1px solid var(--lx-border);border-radius:6px;}

/* ============================================================== samples   */
.lx-sample,.lx-history-row{
  border-radius:var(--lx-r-lg);border:1px solid var(--lx-border);
  background:var(--lx-card);box-shadow:var(--lx-shadow-sm);
  transition:transform .15s var(--lx-ease), box-shadow .15s var(--lx-ease), border-color .15s var(--lx-ease);
}
.lx-sample:hover,.lx-history-row:hover{border-color:var(--lx-accent);box-shadow:var(--lx-shadow);transform:translateY(-1px);}
.lx-sample:active,.lx-history-row:active{transform:translateY(0) scale(.99);}
.lx-sample:focus-visible,.lx-history-row:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}


/* recognition: the tab roots carry their own important padding */
.lx-ocr-page,.lx-doc-tab{padding:24px !important;gap:16px;}
.lx-ocr-drop,.lx-doc-drop{padding:32px 24px;min-height:200px;gap:10px;margin-block:auto;}
.lx-ocr-drop h3,.lx-doc-drop h3{font-size:15px;font-weight:600;letter-spacing:-.01em;}
.lx-ocr-idlehint{
  padding:14px 16px;border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);
  background:var(--lx-card);box-shadow:var(--lx-shadow-sm);
}
.lx-ocr-preview{
  padding:8px;border:1px solid var(--lx-border);border-radius:var(--lx-r-lg);
  background:var(--lx-page);box-shadow:var(--lx-shadow-sm);
}
.lx-ocr-result{
  padding:14px 16px;border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);
  background:var(--lx-card);box-shadow:var(--lx-shadow-sm);gap:12px;
}
.lx-ocr-status{
  padding:10px 14px;border:1px solid var(--lx-border);border-radius:var(--lx-r-lg);
  background:var(--lx-card);box-shadow:var(--lx-shadow-sm);
}
.lx-ocr-status__dot{width:8px;height:8px;}
.lx-doc-strip{
  border:1px solid var(--lx-border);border-radius:var(--lx-r-lg);
  background:var(--lx-card);box-shadow:var(--lx-shadow-sm);
}
.lx-doc-strip:hover{border-color:var(--lx-accent);}
.lx-doc-results{gap:12px;}
.lx-doc-result{padding:12px 14px;border-radius:var(--lx-r-xl);box-shadow:var(--lx-shadow-sm);}
.lx-doc-result--error{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);}
.lx-doc-section{padding:16px;border-radius:var(--lx-r-xl);}
.lx-doc-tips{padding:12px 14px;border:1px solid var(--lx-border);border-radius:var(--lx-r-lg);background:var(--lx-page);}
.lx-doc-progress{height:6px;border-radius:999px;background:var(--lx-page);}
.lx-doc-footer{gap:10px;}


/* ========================================================== type scale   */
/* Every size below was raised roughly one step (labels 10.5–12 → 12.5–13.5,
   body 13 → 14.5, titles 14–15 → 16–17) and interactive labels were made
   semibold so they read as controls instead of body text. */

.lx-btn{height:36px;font-size:14.5px;font-weight:600;padding:0 16px;}
.lx-btn--sm{height:32px;font-size:13.5px;padding:0 12px;}
.lx-btn--ghost{font-size:14.5px;font-weight:600;}
.lx-input,.lx-textarea,.lx-select{font-size:14.5px;}
.lx-input,.lx-select{height:34px;}
.lx-textarea{line-height:1.65;}
.lx-field__label{font-size:14.5px;font-weight:600;}
.lx-field__hint{font-size:13.5px;line-height:1.6;}
.lx-seg{padding:3px;}
.lx-seg__item{height:30px;font-size:13.5px;font-weight:500;padding:0 12px;}
.lx-seg__item--on{font-weight:600;}
.lx-tab{height:46px;font-size:15.5px;font-weight:500;padding:0 16px;}
.lx-tab--on{font-weight:700;}
.lx-badge{height:22px;font-size:12.5px;font-weight:600;padding:0 9px;}
.lx-tab__badge{min-width:18px;height:18px;font-size:12px;font-weight:600;}
.lx-kbd{font-size:12.5px;line-height:18px;padding:2px 6px;}
.lx-modal__title{font-size:17px;}
.lx-modal__body{font-size:14.5px;}
.lx-toast{font-size:13.5px;font-weight:500;}
.lx-empty__title{font-size:16px;}
.lx-empty__hint{font-size:14px;}
.lx-progress{height:7px;}

/* ------------------------------------------------------------- app chrome */
.lx-app-head{min-height:68px;padding:12px 22px;}
.lx-app-mark{width:36px;height:36px;border-radius:10px;}
.lx-app-title{font-size:17px;}
.lx-app-sub{font-size:13px;}
.lx-ed-lineno{font-size:12px;height:26px;line-height:26px;}
/* The UA stylesheet forces 13.33px on <textarea>; inheritance from the stack
   (which carries the user's source font size) has to be explicit, otherwise the
   typed text and the highlight overlay disagree. */
.lx-ed-overlay,.lx-ed-input{font-size:inherit;line-height:26px;}
.lx-ed-gutter-inner{padding:10px 0;}
.lx-ed-status{font-size:13px;gap:14px;}
.lx-ed-status > span{white-space:nowrap;}
.lx-ed-status-hint{flex:1 1 auto;min-width:0;text-align:right;}
.lx-ed-suggest-row{height:32px;font-size:13.5px;}
.lx-ed-suggest-row code{font-size:13.5px;}
.lx-pv-scale{font-size:13px;min-width:48px;}
.lx-pv-toggle{font-size:13.5px;}
.lx-pv-placeholder{font-size:14.5px;}
.lx-pv-error{font-size:13px;}
.lx-pv-foot{font-size:13px;gap:8px;}
.lx-pv-foot .lx-btn{height:28px;font-size:13px;padding:0 10px;}
.lx-pv-meta{font-size:13px;}
.lx-exp-label{font-size:13.5px;font-weight:600;}
.lx-exp-chip{height:32px;font-size:13.5px;font-weight:600;min-width:48px;padding:0 12px;}
.lx-sample-name{font-size:14.5px;}
.lx-sample-tex{font-size:12.5px;}
.lx-history-row code{font-size:13.5px;}
.lx-history-time{font-size:12px;}

/* ------------------------------------------------------------ symbol panel */
.lx-pal-item{min-width:44px;height:40px;padding:0 7px;}
.lx-pal-glyph{font-size:21px;}
.lx-pal-tex{
  font-size:11px;line-height:1.1;max-width:100%;max-height:100%;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.lx-pal-face{max-width:78px;max-height:34px;}
.lx-pal-face svg{max-width:78px;max-height:34px;}
.lx-pal-groupname{font-size:13.5px;}
.lx-pal-empty{font-size:13.5px;}
.lx-catchip{height:30px;font-size:13px;font-weight:600;padding:0 10px;}
.lx-tpl-name{font-size:13.5px;}
.lx-tpl-preview{min-height:36px;}
.lx-tpl-preview svg{max-height:40px;}
.lx-tree-head{font-size:13px;}
.lx-tree-row{height:32px;}
.lx-tree-label{font-size:14px;}
.lx-tree-tex{font-size:12.5px;}
.lx-tree-op{height:30px;font-size:13px;font-weight:600;padding:0 9px;}
.lx-tree-ops{gap:5px;padding:8px 10px;}

/* -------------------------------------------------------------- recognition */
.lx-ocr-page,.lx-doc-tab{font-size:14.5px;}
.lx-ocr-drop__title,.lx-doc-drop__title{font-size:18px;font-weight:600;letter-spacing:-.01em;}
.lx-ocr-drop__sub,.lx-doc-drop__sub{font-size:14px;line-height:1.6;}
.lx-ocr-drop__paste{font-size:13px;}
.lx-ocr-status{font-size:13.5px;}
.lx-ocr-status__label{font-size:14px;}
.lx-ocr-idlehint,.lx-ocr-note{font-size:13.5px;line-height:1.65;}
.lx-ocr-hintcard__title{font-size:14.5px;}
.lx-ocr-hintcard__text{font-size:13.5px;}
.lx-ocr-preview__name{font-size:14px;}
.lx-ocr-result__title{font-size:14.5px;}
.lx-ocr-tex{font-size:14px;}
.lx-ocr-page textarea,.lx-doc-tab textarea{font-size:14px;line-height:1.7;}
.lx-ocr-error__title{font-size:14px;}
.lx-ocr-error__detail{font-size:13px;}
.lx-doc-head__title{font-size:15.5px;font-weight:600;}
.lx-doc-hint{font-size:13px;}
.lx-doc-toolbar__count{font-size:13px;}
.lx-doc-tips{font-size:13.5px;line-height:1.75;}
.lx-doc-page__num{font-size:12.5px;}
.lx-doc-page__status{font-size:12.5px;}
.lx-doc-progress__row{font-size:13px;}
.lx-doc-section__title{font-size:14.5px;font-weight:600;}
.lx-doc-result__meta{font-size:13px;}
.lx-doc-result__tex{font-size:14px;}
.lx-doc-result__error{font-size:13px;}
.lx-doc-result__errtitle{font-size:13.5px;}
.lx-doc-results__hint{font-size:13.5px;}

/* ---------------------------------------------------------- settings + help */
.lx-set-status{font-size:13.5px;}
.lx-set-status-label{font-size:14px;}
.lx-set-group-title{font-size:14px;}
.lx-set-chip{height:30px;font-size:13px;font-weight:600;padding:0 11px;}
.lx-set-range-value{font-size:13.5px;}
.lx-set-model{font-size:12.5px;}
.lx-set-note{font-size:13px;line-height:1.7;}
.lx-help-h2{font-size:21px;}
.lx-help-lead{font-size:15px;line-height:1.8;}
.lx-help-title{font-size:15px;}
.lx-help-p,.lx-help-ol{font-size:14px;line-height:1.8;}
.lx-help-list li{font-size:14px;line-height:1.65;}
.lx-help-table{font-size:14px;}
.lx-help-table td{padding:9px 10px;}
.lx-help-code{font-size:13px;line-height:1.75;}
.lx-help-chip{font-size:12.5px;padding:3px 9px;}

/* keep the denser rows usable when the type is larger */
@media (max-width:1080px){
  .lx-ed-status-hint{display:none;}
  .lx-exp-label span{display:none;}
  /* Stacked panes: let each card keep its natural height and let the split
     scroll, otherwise the fixed toolbar+status+drawer squeeze the editor to 0. */
  .lx-ed-split{flex-direction:column;overflow:auto;}
  .lx-ed-pane,.lx-pv-pane{flex:0 0 auto;min-height:0;}
  .lx-ed-surface{min-height:240px;}
  .lx-pv-canvas{min-height:240px;}
  .lx-ed-pane{border-right:1px solid var(--lx-border);border-bottom:1px solid var(--lx-border);}
}


/* ------------------------------------------------------ quick tool tiles */
.lx-ed-pane{position:relative;}
.lx-quick-row{
  display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:2px 1px 4px;
  scrollbar-width:none;flex:none;scroll-behavior:smooth;
}
.lx-quick-row::-webkit-scrollbar{display:none;}
.lx-quick{
  position:relative;flex:0 0 auto;width:86px;height:68px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  padding:6px 4px 12px;border-radius:var(--lx-r-xl);
  border:1px solid var(--lx-border);background:var(--lx-card);box-shadow:var(--lx-shadow-sm);
  cursor:pointer;color:var(--lx-ink);
  transition:transform .18s var(--lx-ease), box-shadow .18s var(--lx-ease),
    border-color .18s var(--lx-ease), background-color .18s var(--lx-ease);
}
.lx-quick:hover{border-color:var(--lx-accent);box-shadow:var(--lx-shadow-md);transform:translateY(-2px);}
.lx-quick:active{transform:translateY(0) scale(.98);box-shadow:var(--lx-shadow-sm);}
.lx-quick:focus-visible{outline:none;box-shadow:0 0 0 2px var(--lx-ring-offset), 0 0 0 4px var(--lx-focus);}
.lx-quick--on{border-color:var(--lx-accent);background:var(--lx-accent-soft);}
.lx-quick-icon{display:flex;align-items:center;justify-content:center;height:28px;max-width:80px;overflow:hidden;}
.lx-quick-math{display:inline-flex;align-items:center;justify-content:center;}
.lx-quick-math svg{max-height:28px;max-width:80px;height:auto;width:auto;}
.lx-quick-fallback{font-size:14px;color:var(--lx-ink-3);}
.lx-quick-label{
  max-width:100%;font-size:11.5px;font-weight:600;color:var(--lx-ink-2);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.lx-quick--on .lx-quick-label{color:var(--lx-accent-ink);}
.lx-quick-caret{
  position:absolute;left:50%;bottom:1px;transform:translateX(-50%);
  font-size:14px;line-height:1;color:var(--lx-ink-3);
  transition:color .15s var(--lx-ease), transform .15s var(--lx-ease);
}
.lx-quick:hover .lx-quick-caret{color:var(--lx-accent);transform:translateX(-50%) translateY(-1px);}

/* the hover panel: expands under the tile row, collapses when the pointer leaves */
.lx-pal{position:static;}
.lx-quick-pop{
  position:absolute;left:12px;right:12px;bottom:12px;z-index:9;
  max-height:var(--lx-pop-max, 300px);
  display:flex;flex-direction:column;min-height:0;
  padding:10px;border:1px solid var(--lx-border);border-radius:var(--lx-r-xl);
  background:var(--lx-card);box-shadow:var(--lx-shadow-md);
  animation:lx-pop .14s ease-out;
}
.lx-quick-pop-head{
  display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  padding:0 2px 8px;border-bottom:1px solid var(--lx-border);margin-bottom:8px;
}
.lx-quick-pop-title{font-size:13.5px;font-weight:600;}
.lx-quick-pop-count{font-size:12px;color:var(--lx-ink-3);font-variant-numeric:tabular-nums;}
.lx-quick-pop-body{flex:1 1 auto;min-height:0;overflow:auto;}
.lx-quick-pop-group{margin:0 0 10px;}
/* the docked panel is short, so its cells are denser than the standalone grid */
.lx-quick-pop .lx-pal-grid{gap:4px;}
.lx-quick-pop .lx-pal-item{min-width:34px;height:32px;padding:0 5px;}
.lx-quick-pop .lx-pal-face{max-width:64px;max-height:26px;}
.lx-quick-pop .lx-pal-face svg{max-width:64px;max-height:26px;}
.lx-quick-pop-group:last-child{margin-bottom:0;}
.lx-quick-pop-groupname{
  margin:0 0 6px;font-size:12.5px;font-weight:600;color:var(--lx-ink-2);
}
.lx-quick--on .lx-quick-caret{color:var(--lx-accent);}


/* ============================================================ zoom shell   */
/* The shell is laid out at panelWidth / uiScale and then zoomed, so the whole
   workbench scales like a browser zoom while still filling the panel. */
.lx-shell{
  /* zoom already divides the percentage resolution, so plain 100% fills the
     panel; calc(100% / scale) would divide twice. */
  position:relative;
  width:100%;
  height:100%;
  zoom:var(--lx-ui-scale, 1);
  display:flex;flex-direction:column;min-height:0;min-width:0;
}
/* inside the zoomed shell a fixed overlay would be measured in zoomed units and
   overflow the panel; anchor the scrim and the toasts to the shell instead */
.lx-shell .lx-modal__backdrop{position:absolute;inset:0;padding:16px;}
.lx-shell .lx-modal{max-width:var(--lx-modal-max, 96vw);max-height:var(--lx-modal-maxh, 84vh);}
.lx-shell .lx-toasts{position:absolute;}
.lx-root{overflow:hidden;}
.lx-shell > .lx-app{flex:1 1 0%;min-height:0;}

/* compact levels measured from the shell's own width */
.lx-shell[data-compact="1"] .lx-app-sub,
.lx-shell[data-compact="1"] .lx-app-brand > .lx-badge,
.lx-shell[data-compact="2"] .lx-app-sub,
.lx-shell[data-compact="2"] .lx-app-brand > .lx-badge{display:none;}
/* 150% leaves ~650 layout px: the tab row needs its own line there too */
.lx-shell[data-compact="1"] .lx-app-head{flex-wrap:wrap;row-gap:4px;column-gap:12px;min-height:0;padding:10px 16px;}
.lx-shell[data-compact="1"] .lx-app-tabs{order:3;flex-basis:100%;justify-content:flex-start;}
.lx-shell[data-compact="1"] .lx-app-actions{margin-left:auto;}
.lx-shell[data-compact="1"] .lx-tab{height:42px;padding:0 12px;}

.lx-shell[data-compact="1"] .lx-app-actions .lx-btn--ghost .lx-btn__label{display:none;}
.lx-shell[data-compact="1"] .lx-app-actions .lx-btn--ghost{padding:0 8px;}

.lx-shell[data-compact="2"] .lx-app-head{
  flex-wrap:wrap;row-gap:6px;column-gap:10px;padding:10px 12px;min-height:0;
}
.lx-shell[data-compact="2"] .lx-app-title{font-size:16px;max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lx-shell[data-compact="2"] .lx-app-mark{width:32px;height:32px;}
.lx-shell[data-compact="2"] .lx-app-actions{margin-left:auto;gap:4px;}
.lx-shell[data-compact="2"] .lx-app-actions .lx-btn--ghost{padding:0 8px;}
.lx-shell[data-compact="2"] .lx-app-actions .lx-btn--ghost .lx-btn__label{display:none;}
.lx-shell[data-compact="2"] .lx-app-tabs{order:3;flex-basis:100%;justify-content:flex-start;}
.lx-shell[data-compact="2"] .lx-tab{height:42px;padding:0 12px;font-size:14.5px;}
.lx-shell[data-compact="2"] .lx-app-body{padding:10px;}

.lx-shell[data-compact="2"] .lx-ed-split{flex-direction:column;overflow:auto;}
.lx-shell[data-compact="2"] .lx-ed-pane,
.lx-shell[data-compact="2"] .lx-pv-pane{flex:0 0 auto;min-height:0;}
.lx-shell[data-compact="2"] .lx-ed-surface{min-height:200px;}
.lx-shell[data-compact="2"] .lx-pv-canvas{min-height:200px;}
.lx-shell[data-compact="2"] .lx-ed-status-hint,
.lx-shell[data-compact="2"] .lx-exp-label span{display:none;}
.lx-shell[data-compact="2"] .lx-pal-item{min-width:38px;height:36px;}
.lx-shell[data-compact="2"] .lx-quick{width:76px;}

/* =========================================================== accessibility */
@media (prefers-reduced-motion: reduce){
  .lx-root *:not(.lx-spinner):not(.lx-progress__fill){
    transition:none !important;
    animation:none !important;
  }
  .lx-root .lx-btn:hover:not(:disabled),
  .lx-root .lx-exp-chip:hover:not(:disabled),
  .lx-root .lx-pal-item:hover,
  .lx-root .lx-tpl-item:hover,
  .lx-root .lx-tree-op:hover,
  .lx-root .lx-sample:hover,
  .lx-root .lx-history-row:hover,
  .lx-root .lx-doc-page:hover{transform:none !important;}
}
`)
})()
