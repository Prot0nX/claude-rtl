// --- CLAUDE PERSIAN RTL (VAZIRMATN) START ---
// Claude RTL - Persian/Arabic right-to-left support and a custom font for the
// Claude desktop app. Usage and design notes: README.md.
//
// Prepended to Claude desktop preload scripts by Patch-ClaudeRTL.ps1, so it runs
// in every page those preloads serve (claude.ai, title bar, quick window).
//
// Strategy:
//  - CSS sets the font everywhere except code, math and icon fonts, and gives
//    each paragraph its own direction (unicode-bidi: plaintext).
//  - A MutationObserver sets dir where the browser's first-letter rule guesses
//    wrong ("file.js: <Persian sentence>"), on lists and tables (bullet side,
//    column order) and on plain UI text.
//  - Anything claude.ai already directed itself (native dir attributes) is left
//    alone; every dir we set is tagged data-fa-dir so we only undo our own work.
//
// Kept pure ASCII (non-ASCII characters are \u escapes): the patch script runs
// on Windows PowerShell 5.1, which mangles non-ASCII text without a BOM.
;(function () {
    'use strict';
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (window.__claudeFaRtl) return;
    window.__claudeFaRtl = true;

    // Both replaced by the patch script (-Mode / -Font). Defaults apply when the
    // placeholders are left as-is.
    // MODE: 'content' = text direction only; 'full' = also mirror the whole layout.
    var MODE = '__RTL_MODE__';
    if (MODE.indexOf('__') === 0) MODE = 'content';
    var FONT = '__RTL_FONT__';
    if (FONT.indexOf('__') === 0) FONT = 'Vazirmatn';
    var FAM = 'claude-rtl-font';

    // --- settings ---
    // Changed from the panel in the session rail (or Ctrl+Alt+Shift+S anywhere),
    // kept in localStorage (per origin) and applied live. Only values that differ
    // from the defaults are stored, so re-patching with another -Font / -Mode still
    // changes whatever the user never touched.
    var KEY = 'claude-rtl-settings';
    var FONT_NAME = /^[A-Za-z0-9 -]{1,64}$/;
    var DEFAULTS = {
        rtl: true, lineHeight: 1.9, textScale: 100, lists: true, mirror: MODE === 'full',
        font: true, fontName: FONT, codeFont: true,
        // The rail card: folded, hidden from the rail's Show menu, and the ids of
        // the cards that follow it (empty: last).
        collapsed: false, railHidden: false, railAt: ''
    };
    var LIMITS = { lineHeight: [1.2, 2.6], textScale: [80, 140] };

    function cleanSettings(raw) {
        var s = {};
        Object.keys(DEFAULTS).forEach(function (k) {
            var d = DEFAULTS[k], v = raw && raw[k];
            if (typeof v !== typeof d) v = d;
            else if (LIMITS[k]) v = isFinite(v) ? Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v)) : d;
            else if (k === 'fontName' && !FONT_NAME.test(v)) v = d;
            s[k] = v;
        });
        return s;
    }

    function loadSettings() {
        try { return cleanSettings(JSON.parse(localStorage.getItem(KEY) || '{}')); }
        catch (e) { return cleanSettings({}); }
    }

    function saveSettings() {
        var diff = {};
        Object.keys(DEFAULTS).forEach(function (k) { if (S[k] !== DEFAULTS[k]) diff[k] = S[k]; });
        try {
            if (Object.keys(diff).length) localStorage.setItem(KEY, JSON.stringify(diff));
            else localStorage.removeItem(KEY);
        } catch (e) {}
    }

    var S = loadSettings();

    var EDITOR = '[contenteditable="true"], [contenteditable=""], .ProseMirror, textarea, input';
    // Elements that must keep their own font: code, math, and icon fonts
    // (Claude draws title-bar/sidebar icons as Anthropicons glyphs on [data-cds=Icon]).
    // Descendants are listed too: an icon/code/math element's children inherit, and
    // the universal rule below would otherwise hit them directly.
    var FONT_EXCLUDE = ':not(' + [
        'pre', 'pre *', 'code', 'code *', 'kbd', 'samp', '.font-mono', '.font-mono *',
        '[class*="katex"]', '[class*="katex"] *', 'mjx-container', 'mjx-container *',
        '.cm-editor *', '.monaco-editor *', 'svg', 'svg *', 'i',
        '[data-cds="Icon"]', '[data-cds="Icon"] *', '[class*="icon" i]', '[class*="symbol" i]'
    ].join(',') + ')';
    // Icon fonts map glyphs to Private Use Area code points, which text fonts lack,
    // so listing them right after it lets any icon we did not exclude fall through.
    var ICON_FALLBACK = 'var(--font-anthropicons,"Anthropicons-Variable"),"Anthropicons-Variable","Anthropicons"';

    // Blocks whose Persian text gets the line height / size settings.
    var PROSE = 'p,li,dt,dd,td,th,blockquote';

    function fontCss() {
        var font = S.fontName;
        // One face per weight, matched by the installed font's full name
        // ("Vazirmatn Bold") or PostScript name ("Vazirmatn-Bold"), the naming
        // most static font families use. A missing weight is synthesized.
        var faces = [
            ['Thin', 100], ['ExtraLight', 200], ['Light', 300], ['Regular', 400],
            ['Medium', 500], ['SemiBold', 600], ['Bold', 700], ['ExtraBold', 800], ['Black', 900]
        ].map(function (w) {
            var full = w[0] === 'Regular' ? font : font + ' ' + w[0];
            // unicode-range skips the Private Use Area, so icon glyphs never resolve here.
            return '@font-face{font-family:"' + FAM + '";font-weight:' + w[1] +
                ';font-display:swap;src:local("' + full + '"),local("' + font + '-' + w[0] + '")' +
                ';unicode-range:U+0000-DFFF,U+F900-FFFF,U+10000-EFFFF}';
        });
        return faces.concat([
            // The font everywhere except code/math/mono/icons. Missing glyphs fall
            // through to the icon fonts, then the system UI font.
            'html body, html body *' + FONT_EXCLUDE + '{font-family:"' + FAM + '",' + ICON_FALLBACK + ',ui-sans-serif,system-ui,sans-serif!important}',
            // Monospace fonts have no Persian letters; with codeFont they come from our
            // font instead of a random system fallback (Latin still uses the mono font).
            'pre,pre *,code,code *,kbd,samp,.font-mono,.font-mono *{font-family:ui-monospace,"Cascadia Code",Consolas,' +
                (S.codeFont ? '"' + FAM + '",' : '') + 'monospace!important}'
        ]);
    }

    function rtlCss() {
        var rules = [
            // Each paragraph picks its direction from its first strong character.
            'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dt,dd,summary,figcaption,label,caption{unicode-bidi:plaintext;text-align:start}',

            // Input box: same rule per line, inside the editor (pure CSS, no DOM writes,
            // so ProseMirror never fights us).
            '.ProseMirror p,.ProseMirror li,[contenteditable="true"] p,textarea,input[type="text"],input[type="search"],input:not([type]){unicode-bidi:plaintext;text-align:start}',

            // Code and math always stay LTR.
            'pre,.code-block__code,pre *{direction:ltr!important;text-align:left!important;unicode-bidi:isolate!important}',
            'code{direction:ltr;unicode-bidi:isolate}',
            '.katex,.katex-display,mjx-container{direction:ltr!important;unicode-bidi:isolate!important}',

            // Elements we gave a dir: the dir wins over plaintext auto-detection
            // (which would pick LTR for "file.js: <Persian>"), text starts on its side.
            '[data-fa-dir]{unicode-bidi:isolate!important;text-align:start!important}',

            // Lists we turned RTL: bullets on the right, indent moved to the right.
            'ul[data-fa-dir][dir="rtl"],ol[data-fa-dir][dir="rtl"]{padding-right:1.6em!important;padding-left:0!important}',
            // A Persian item inside an English list: keep its bullet inside the box.
            'ul:not([dir="rtl"])>li[dir="rtl"],ol:not([dir="rtl"])>li[dir="rtl"]{list-style-position:inside}',

            // Sidebar/list labels: claude.ai already stamps dir="rtl" on Persian titles
            // and reserves room for the row's icons on the right (padding + fade),
            // but aligns them with text-align:match-parent, i.e. LEFT in an LTR row.
            // Only the alignment is missing; everything else stays native.
            '.dframe-fade-label[dir="rtl"],[dir="rtl"][class*="match-parent"]{text-align:right!important}',

            // Comfortable Persian line height in answers.
            ':is(' + PROSE + ')[dir="rtl"]{line-height:' + S.lineHeight + '}'
        ];
        // Persian text size: only the outermost Persian block is scaled (relative to
        // its parent), so nested blocks inherit it instead of compounding.
        if (S.textScale !== 100) {
            rules.push(':is(' + PROSE + ')[dir="rtl"]:not(:is(' + PROSE + ')[dir="rtl"] *){font-size:' +
                (S.textScale / 100) + 'em!important}');
        }
        return rules;
    }

    // The settings panel. Colors come from the surrounding UI (currentColor and
    // translucent grays), so it fits both the light and the dark theme. The rail
    // card's frame and header use the app's own classes (copied from its cards).
    var PANEL_CSS = [
        '[data-crtl] .crtl-body,[data-crtl="float"]{font-size:13px;line-height:1.5;text-align:right;box-sizing:border-box}',
        '[data-crtl] .crtl-head{display:flex;align-items:center;justify-content:space-between;gap:6px;font-weight:600}',
        '[data-crtl] .crtl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;cursor:pointer}',
        '[data-crtl] .crtl-row[data-off]{opacity:.4;pointer-events:none}',
        '[data-crtl] .crtl-ctl{display:flex;align-items:center;gap:6px;direction:ltr}',
        '[data-crtl] .crtl-sw{-webkit-appearance:none;appearance:none;flex:none;margin:0;width:28px;height:16px;border-radius:8px;' +
            'background:rgba(127,127,127,.45);position:relative;cursor:pointer;transition:background .15s}',
        '[data-crtl] .crtl-sw::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}',
        '[data-crtl] .crtl-sw:checked{background:#2c84db}',
        '[data-crtl] .crtl-sw:checked::after{left:14px}',
        '[data-crtl] .crtl-range{width:80px;margin:0;accent-color:#2c84db;cursor:pointer}',
        '[data-crtl] .crtl-val{min-width:2.8em;opacity:.65;text-align:right;font-variant-numeric:tabular-nums}',
        '[data-crtl] .crtl-text,[data-crtl] .crtl-btn{background:transparent;color:inherit;font:inherit;border:1px solid rgba(127,127,127,.4);border-radius:6px}',
        '[data-crtl] .crtl-text{width:120px;padding:2px 6px;direction:ltr;text-align:left;unicode-bidi:normal}',
        '[data-crtl] .crtl-text[aria-invalid="true"]{border-color:#e5484d}',
        '[data-crtl] .crtl-btn{padding:2px 10px;cursor:pointer}',
        '[data-crtl] .crtl-btn:hover{background:rgba(127,127,127,.15)}',
        '[data-crtl] .crtl-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px}',
        '[data-crtl] .crtl-hint{opacity:.5;font-size:11px;direction:ltr}',
        '[data-crtl] .crtl-x{background:none;border:0;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.6;padding:0 2px}',
        '[data-crtl="float"]{position:fixed;top:56px;right:16px;width:300px;max-width:calc(100vw - 32px);z-index:2147483646;' +
            'padding:14px;border-radius:12px;border:1px solid rgba(127,127,127,.35);box-shadow:0 8px 30px rgba(0,0,0,.35)}'
    ];

    function css() {
        var rules = [];
        if (S.font) rules = rules.concat(fontCss());
        if (S.rtl) rules = rules.concat(rtlCss());
        return rules.concat(PANEL_CSS).join('\n');
    }

    var cssText = null; // cached css(); reset whenever a setting changes

    function injectStyle() {
        if (!document.documentElement) return;
        var el = document.getElementById('claude-fa-rtl-style');
        if (!el) {
            el = document.createElement('style');
            el.id = 'claude-fa-rtl-style';
        }
        if (cssText === null) cssText = css();
        if (el.textContent !== cssText) el.textContent = cssText;
        // Keep it last so it wins ties against late-loaded chunk CSS.
        var root = document.documentElement;
        if (el.parentNode !== root || el.nextSibling) root.appendChild(el);
    }

    // --- direction detection ---

    function isRtlChar(c) {
        return (c >= 0x0590 && c <= 0x08FF) || (c >= 0xFB1D && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF);
    }

    function isLatin(c) {
        return (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A);
    }

    function hasRtl(text) {
        for (var i = 0; i < text.length; i++) if (isRtlChar(text.charCodeAt(i))) return true;
        return false;
    }

    function firstStrong(text) {
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            if (isRtlChar(c)) return 'rtl';
            if (isLatin(c)) return 'ltr';
        }
        return null;
    }

    // Leading file names, paths, URLs and punctuation say nothing about the
    // sentence's language: "Patch-ClaudeRTL.ps1: <Persian>" is a Persian line.
    var LEADING_NOISE = /^[\s\u200c\u200f\u200e]*(?:https?:\/\/\S+|[\w.~-]*[\/\\][\w.\/\\~-]*|[\w-]+(?:\.[\w-]+)*\.[A-Za-z][\w]{0,5}|[`'"()\[\]{}:;,.\-\u2013\u2014\u2022*#>|]+)/;

    function stripLeadingNoise(text) {
        for (var i = 0; i < 8; i++) {
            var next = text.replace(LEADING_NOISE, '');
            if (next === text) break;
            text = next;
        }
        return text;
    }

    // 'rtl' when the text reads as Persian: first meaningful strong char is RTL,
    // or RTL letters outnumber Latin ones ("RTL <Persian words> Claude").
    // Text without any RTL char is 'ltr' (or null when it has no letters at all).
    function smartDir(text) {
        if (!text) return null;
        if (!hasRtl(text)) return firstStrong(text) ? 'ltr' : null;
        if (firstStrong(text) === 'rtl' || firstStrong(stripLeadingNoise(text)) === 'rtl') return 'rtl';
        var r = 0, l = 0;
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            if (isRtlChar(c)) r++; else if (isLatin(c)) l++;
        }
        return r >= l ? 'rtl' : 'ltr';
    }

    // Text of an element without code, so inline code never decides direction.
    function proseText(el) {
        var out = '';
        for (var n = el.firstChild; n && out.length < 400; n = n.nextSibling) {
            if (n.nodeType === 3) out += n.nodeValue;
            else if (n.nodeType === 1 && n.tagName !== 'CODE' && n.tagName !== 'PRE') out += proseText(n);
        }
        return out;
    }

    // --- applying direction ---
    // Every dir we set carries data-fa-dir, so we only ever undo our own work.
    // A native dir (claude.ai stamps first-strong dirs on markdown) is overridden
    // only when our detection disagrees with it.

    var BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dt,dd,summary,figcaption,caption';
    var UI_LEAVES = 'div,span,a,button,label';
    // Clickable rows (sidebar sessions, menu items): a text change inside one
    // re-judges the whole row. Rows themselves are never mirrored; only the title
    // inside turns RTL, so every row keeps the app's own icon layout.
    var ROWS = 'a,button,li,[role="button"],[role="link"],[role="menuitem"],[role="option"],[role="treeitem"],[role="listitem"]';
    var SKIP = EDITOR + ',pre,code,svg,[data-cds="Icon"],[data-crtl]';

    function setDir(el, d) {
        if (el.getAttribute('dir') === d) return;
        el.setAttribute('dir', d);
        el.setAttribute('data-fa-dir', '1');
    }

    function clearDir(el) {
        if (!el.hasAttribute('data-fa-dir')) return;
        el.removeAttribute('dir');
        el.removeAttribute('data-fa-dir');
    }

    function apply(el, d) {
        if (d) setDir(el, d); else clearDir(el);
    }

    // querySelectorAll that includes root itself.
    function qsa(root, sel) {
        var out = Array.prototype.slice.call(root.querySelectorAll(sel));
        if (root.matches && root.matches(sel)) out.unshift(root);
        return out;
    }

    function fixBlocks(root) {
        qsa(root, BLOCKS).forEach(function (el) {
            if (el.closest(SKIP)) return;
            var text = proseText(el);
            // Only Persian-bearing blocks get an explicit dir; pure-Latin ones are
            // already right via unicode-bidi:plaintext.
            apply(el, hasRtl(text) ? smartDir(text) : null);
        });
    }

    function fixLists(root) {
        if (!S.lists) {
            qsa(root, 'ul[data-fa-dir],ol[data-fa-dir],table[data-fa-dir]').forEach(clearDir);
            return;
        }
        qsa(root, 'ul,ol').forEach(function (list) {
            if (list.closest(SKIP)) return;
            var r = 0, l = 0;
            for (var i = 0; i < list.children.length && i < 20; i++) {
                var d = smartDir(proseText(list.children[i]));
                if (d === 'rtl') r++; else if (d === 'ltr') l++;
            }
            apply(list, r > l ? 'rtl' : (l > r && list.hasAttribute('data-fa-dir') ? 'ltr' : null));
        });
        qsa(root, 'table').forEach(function (t) {
            if (t.closest(SKIP)) return;
            var cell = t.querySelector('thead th, tr th, tr td');
            var d = cell ? smartDir(proseText(cell)) : null;
            apply(t, d === 'rtl' ? 'rtl' : null);
        });
    }

    // UI text (sidebar titles, menus, headers). claude.ai already handles a lot
    // natively: it stamps dir on labels and styles them with :dir(rtl) (padding
    // for the row icons, fade direction). So we only touch plain text holders,
    // and stay out of anything the app directed itself:
    //  - never inside, or around, an element with a native dir;
    //  - never on flex/grid containers (dir there would mirror the row layout);
    //  - only on text leaves (text plus simple inline children).
    var NATIVE_DIR = '[dir]:not([data-fa-dir])';
    var INLINE_CHILD = /^(SPAN|A|B|I|STRONG|EM|SMALL|MARK|BDI|BR|SUB|SUP)$/;

    function nativeDirNear(el) {
        var a = el.closest(NATIVE_DIR);
        if (a && a !== document.documentElement && a !== document.body) return true;
        return !!el.querySelector(NATIVE_DIR);
    }

    function isTextLeaf(el) {
        for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
            if (c.firstElementChild || !INLINE_CHILD.test(c.tagName)) return false;
        }
        return true;
    }

    function fixUi(root) {
        qsa(root, UI_LEAVES).forEach(function (el) {
            if (el.closest(SKIP) || el.closest(BLOCKS)) return;
            var text = (el.textContent || '').trim();
            if (text.length < 2 || !hasRtl(text) || !isTextLeaf(el) || nativeDirNear(el)) {
                clearDir(el);
                return;
            }
            if (/flex|grid/.test(getComputedStyle(el).display)) { clearDir(el); return; }
            apply(el, smartDir(text));
        });
    }

    function fix(root) {
        if (!S.rtl || !root || !root.querySelectorAll) return;
        fixBlocks(root);
        fixLists(root);
        fixUi(root);
    }

    // --- applying settings ---

    function applySettings(prev) {
        cssText = null;
        injectStyle();
        if (!document.body) return;
        // Full passes only when direction handling itself changed; sliders just restyle.
        if (!prev || prev.rtl !== S.rtl || prev.lists !== S.lists) {
            if (S.rtl) fix(document.body);
            else qsa(document.body, '[data-fa-dir]').forEach(clearDir);
        }
        if (S.rtl && S.mirror) setDir(document.documentElement, 'rtl');
        else clearDir(document.documentElement);
    }

    function setSettings(patch) {
        var prev = S, next = {};
        Object.keys(S).forEach(function (k) { next[k] = k in patch ? patch[k] : S[k]; });
        S = cleanSettings(next);
        saveSettings();
        applySettings(prev);
        syncPanels();
    }

    function setSetting(key, value) {
        var patch = {};
        patch[key] = value;
        setSettings(patch);
    }

    // Back to the defaults, except where the rail card sits and whether it is
    // shown or folded.
    function resetSettings() {
        var patch = cleanSettings({});
        delete patch.collapsed;
        delete patch.railHidden;
        delete patch.railAt;
        setSettings(patch);
    }

    // --- settings panel ---
    // The same rows live in two places: a card in the Claude Code session rail
    // (next section), and a floating box that Ctrl+Alt+Shift+S opens anywhere.

    var T = {
        title: '\u0631\u0627\u0633\u062a\u200c\u0686\u06cc\u0646 \u0648 \u0641\u0648\u0646\u062a',
        rtl: '\u0631\u0627\u0633\u062a\u200c\u0686\u06cc\u0646 (RTL)',
        lineHeight: '\u0641\u0627\u0635\u0644\u0647\u200c\u06cc \u062e\u0637\u0648\u0637',
        textScale: '\u0627\u0646\u062f\u0627\u0632\u0647\u200c\u06cc \u0645\u062a\u0646 \u0641\u0627\u0631\u0633\u06cc',
        lists: '\u0641\u0647\u0631\u0633\u062a \u0648 \u062c\u062f\u0648\u0644 \u0631\u0627\u0633\u062a\u200c\u0628\u0647\u200c\u0686\u067e',
        mirror: '\u0622\u06cc\u0646\u0647\u200c\u06cc \u06a9\u0644 \u0635\u0641\u062d\u0647 (\u0622\u0632\u0645\u0627\u06cc\u0634\u06cc)',
        font: '\u0641\u0648\u0646\u062a \u0633\u0641\u0627\u0631\u0634\u06cc',
        fontName: '\u0646\u0627\u0645 \u0641\u0648\u0646\u062a',
        codeFont: '\u062d\u0631\u0648\u0641 \u0641\u0627\u0631\u0633\u06cc \u062f\u0627\u062e\u0644 \u06a9\u062f \u0628\u0627 \u0627\u06cc\u0646 \u0641\u0648\u0646\u062a',
        reset: '\u0628\u0627\u0632\u0646\u0634\u0627\u0646\u06cc',
        close: '\u0628\u0633\u062a\u0646',
        move: '\u062c\u0627\u0628\u0647\u200c\u062c\u0627\u06cc\u06cc'
    };
    var FONT_CHOICES = ['Vazirmatn', 'Sahel', 'Shabnam', 'Samim', 'Tanha', 'Estedad', 'Parastoo', 'Tahoma', 'Segoe UI'];

    var railPanel = null, floatPanel = null, dragging = false, nativeGrab = '', menuWanted = 0;

    // DOM helpers only (no innerHTML: claude.ai may enforce Trusted Types).
    function node(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text) e.textContent = text;
        return e;
    }

    // The settings rows. name keeps each panel's font list id unique.
    function buildBody(name) {
        var body = node('div', 'crtl-body'), syncers = [];

        // A row is a <label>, so clicking its text toggles / focuses the control.
        // dep: the switch this row depends on; the row is dimmed while it is off.
        function row(label, control, dep) {
            var r = node('label', 'crtl-row');
            r.appendChild(node('span', '', label));
            r.appendChild(control);
            body.appendChild(r);
            if (dep) syncers.push(function () { r.toggleAttribute('data-off', !S[dep]); });
            return r;
        }

        function toggle(key, dep) {
            var cb = node('input', 'crtl-sw');
            cb.type = 'checkbox';
            cb.addEventListener('change', function () { setSetting(key, cb.checked); });
            syncers.push(function () { cb.checked = S[key]; });
            row(T[key], cb, dep);
        }

        function slider(key, step, format, dep) {
            var wrap = node('span', 'crtl-ctl'), r = node('input', 'crtl-range'), v = node('span', 'crtl-val');
            r.type = 'range';
            r.min = LIMITS[key][0];
            r.max = LIMITS[key][1];
            r.step = step;
            r.addEventListener('input', function () { setSetting(key, Number(r.value)); });
            syncers.push(function () { r.value = S[key]; v.textContent = format(S[key]); });
            wrap.appendChild(r);
            wrap.appendChild(v);
            row(T[key], wrap, dep);
        }

        function fontInput() {
            var input = node('input', 'crtl-text'), list = node('datalist'), timer = null;
            list.id = 'crtl-fonts-' + name;
            FONT_CHOICES.forEach(function (f) { var o = node('option'); o.value = f; list.appendChild(o); });
            input.type = 'text';
            input.spellcheck = false;
            input.setAttribute('list', list.id);
            // Applied after a short pause, so every keystroke does not swap the font.
            input.addEventListener('input', function () {
                var v = input.value.trim(), ok = FONT_NAME.test(v);
                input.setAttribute('aria-invalid', String(!ok));
                clearTimeout(timer);
                if (ok) timer = setTimeout(function () { setSetting('fontName', v); }, 400);
            });
            input.addEventListener('blur', function () {
                input.setAttribute('aria-invalid', 'false');
                input.value = S.fontName;
            });
            syncers.push(function () { if (document.activeElement !== input) input.value = S.fontName; });
            row(T.fontName, input, 'font').appendChild(list);
        }

        toggle('rtl');
        slider('lineHeight', 0.1, function (v) { return v.toFixed(1); }, 'rtl');
        slider('textScale', 5, function (v) { return v + '%'; }, 'rtl');
        toggle('lists', 'rtl');
        toggle('mirror', 'rtl');
        toggle('font');
        fontInput();
        toggle('codeFont', 'font');

        var foot = node('div', 'crtl-foot'), reset = node('button', 'crtl-btn', T.reset);
        reset.type = 'button';
        reset.addEventListener('click', resetSettings);
        foot.appendChild(node('span', 'crtl-hint', 'Ctrl+Alt+Shift+S'));
        foot.appendChild(reset);
        body.appendChild(foot);

        body.crtlSync = function () { syncers.forEach(function (f) { f(); }); };
        body.crtlSync();
        return body;
    }

    function buildFloat() {
        var root = node('div'), head = node('div', 'crtl-head'), x = node('button', 'crtl-x', '\u00d7'), body = buildBody('float');
        root.setAttribute('data-crtl', 'float');
        root.setAttribute('dir', 'rtl');
        x.type = 'button';
        x.title = T.close;
        x.addEventListener('click', function () { root.remove(); });
        head.appendChild(node('span', '', T.title));
        head.appendChild(x);
        root.appendChild(head);
        root.appendChild(body);
        // Keys typed in the panel are ours, not the app's shortcuts.
        root.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') root.remove();
            e.stopPropagation();
        });
        root.crtlSync = body.crtlSync;
        return root;
    }

    function syncPanels() {
        mountRailPanel();
        [railPanel, floatPanel].forEach(function (p) { if (p && p.isConnected) p.crtlSync(); });
    }

    // --- rail card ---
    // claude.ai draws each rail card as div[data-rail-card=<id>] holding a
    // section[data-rail-section] whose header has the title button, caret, grab
    // zone and grip, and sorts the cards with dnd-kit. Ours is a copy of one of
    // them (frame and header, no content, no React state), so it looks and sits
    // like them. Its grip moves it among them (pointer or arrow keys), and
    // S.railAt keeps the ids of the cards that follow it.

    // React ids and open / menu / drag state, which a copy must not carry.
    var STATE_ATTR = /^(id|aria-(controls|labelledby|describedby|expanded|pressed|busy)|data-(rail-card|rail-menu-open|rail-slot-off|panel-open|popup-open|open|closed|highlighted|starting-style|ending-style))$/;

    function copyEl(el, deep) {
        var c = el.cloneNode(deep);
        [c].concat(Array.prototype.slice.call(c.querySelectorAll('*'))).forEach(function (e) {
            Array.prototype.slice.call(e.attributes).forEach(function (a) {
                if (STATE_ATTR.test(a.name)) e.removeAttribute(a.name);
            });
        });
        return c;
    }

    function buildRailCard(src) {
        var srcSection = src.querySelector('[data-rail-section]');
        var card = copyEl(src, false), section = copyEl(srcSection, false), head = copyEl(srcSection.firstElementChild, true);
        var trigger = head.querySelector('button'), caret = trigger.children[1];
        var grab = head.querySelector('[data-rail-grab]'), grip = head.querySelector('[data-rail-grip]');
        var body = buildBody('rail');
        // Keep the title, caret and drag handles; drop the source card's summary and buttons.
        Array.prototype.slice.call(trigger.children).forEach(function (c, i) { if (i > 1 && c !== grab) c.remove(); });
        Array.prototype.slice.call(head.children).forEach(function (c) { if (!c.contains(trigger) && c !== grip) c.remove(); });
        trigger.firstElementChild.textContent = T.title;
        // Each wrapper carries its card's own show rule (Changes: "hidden
        // has-[nav:not(:empty)]:flex"); ours is always drawn.
        card.className = card.className.split(/\s+/).filter(function (c) {
            return c && !/^(hidden|contents|bg-page|has-\[.*\]:flex)$/.test(c);
        }).concat('flex').join(' ');
        card.style.cssText = '';
        card.setAttribute('data-crtl', 'rail');
        card.setAttribute('dir', 'rtl');
        section.setAttribute('aria-label', T.title);
        // Rows start where the title starts.
        body.style.paddingInline = getComputedStyle(srcSection.querySelector('button')).paddingInlineStart;
        section.appendChild(head);
        section.appendChild(body);
        card.appendChild(section);

        trigger.addEventListener('click', function () { setSetting('collapsed', !S.collapsed); });
        if (grab) grab.addEventListener('pointerdown', drag);
        if (grip) {
            grip.setAttribute('aria-label', T.move + ' ' + T.title);
            grip.addEventListener('keydown', function (e) {
                var up = e.key === 'ArrowUp', nb = (up || e.key === 'ArrowDown') && neighbor(card, up);
                if (!nb) return;
                e.preventDefault();
                hop(card, nb, up);
                grip.focus();
                saveRailAt();
            });
        }
        // Keys typed in the card are ours, not the app's shortcuts.
        card.addEventListener('keydown', function (e) { e.stopPropagation(); });

        card.crtlSync = function () {
            body.crtlSync();
            body.hidden = S.collapsed;
            trigger.setAttribute('aria-expanded', String(!S.collapsed));
            // The caret (CaretRight) points down when open and left when folded.
            // Inline, because the app negates icon rotation under dir=rtl and
            // mirrors icons when the whole page is RTL.
            if (caret) {
                caret.style.rotate = S.collapsed ? '180deg' : '90deg';
                caret.style.transform = 'none';
            }
        };
        return card;
    }

    // The nearest native card above / below that is drawn (an empty slot is
    // display:contents, 0 high).
    function neighbor(card, up) {
        for (var c = card; (c = up ? c.previousElementSibling : c.nextElementSibling);) {
            if (c.hasAttribute('data-rail-card') && c.offsetHeight) return c;
        }
        return null;
    }

    // Moves the card past nb, which slides into its new place like the app's own
    // drop animation. Only ours moves, so React's cards keep their order.
    // Returns how far the card's slot moved.
    function hop(card, nb, up) {
        var top = card.offsetTop, nbTop = nb.offsetTop;
        if (up) nb.before(card); else nb.after(card);
        if (nb.animate) nb.animate([{ transform: 'translateY(' + (nbTop - nb.offsetTop) + 'px)' }, { transform: 'none' }], { duration: 200, easing: 'ease' });
        return card.offsetTop - top;
    }

    // Pointer drag from the grab zone, started after 6px like the app's own:
    // the card follows the pointer and hops past a neighbor whose middle it crosses.
    function drag(e) {
        if (e.button !== 0) return;
        e.preventDefault(); // no text selection
        var card = railPanel, y0 = e.clientY, dy = 0;
        function move(ev) {
            dy = ev.clientY - y0;
            if (!dragging) {
                if (Math.abs(dy) < 6) return;
                dragging = true;
                card.classList.add('bg-page');
                card.style.zIndex = '1';
            }
            for (var up = dy < 0, nb; (nb = neighbor(card, up));) {
                var mid = nb.offsetTop + nb.offsetHeight / 2;
                if (up ? card.offsetTop + dy > mid : card.offsetTop + card.offsetHeight + dy < mid) break;
                var d = hop(card, nb, up);
                y0 += d;
                dy -= d;
            }
            card.style.transform = 'translateY(' + dy + 'px)';
        }
        function end() {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', end);
            document.removeEventListener('pointercancel', end);
            if (!dragging) return;
            dragging = false;
            card.classList.remove('bg-page');
            card.style.zIndex = card.style.transform = '';
            if (card.animate) card.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 200, easing: 'ease' });
            saveRailAt();
            // The release lands on the header button: that click must not fold the card.
            window.addEventListener('click', swallow, true);
            setTimeout(function () { window.removeEventListener('click', swallow, true); }, 0);
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', end);
        document.addEventListener('pointercancel', end);
    }

    function swallow(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Remembers which cards follow ours. Cards not on screen (hidden, or not
    // rendered yet) keep what was remembered for them.
    function saveRailAt() {
        var after = S.railAt ? S.railAt.split(',') : [];
        Array.prototype.forEach.call(railPanel.parentElement.querySelectorAll(':scope > [data-rail-card]'), function (c) {
            var id = c.getAttribute('data-rail-card'), i = after.indexOf(id);
            var follows = !!(railPanel.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
            if (follows && i < 0) after.push(id);
            else if (!follows && i >= 0) after.splice(i, 1);
        });
        if (after.join(',') !== S.railAt) setSetting('railAt', after.join(','));
    }

    // Ours goes into the slot that keeps the most remembered "follows ours"
    // pairs, ignoring the card the user last grabbed (its old side says nothing
    // once it moved). So other cards moving, hiding or appearing never drag ours
    // along; on a tie it stays put.
    function placeRailCard(cards) {
        var after = S.railAt ? S.railAt.split(',') : [], score = 0, scores;
        function side(c) {
            var id = c.getAttribute('data-rail-card');
            return id === nativeGrab ? 0 : after.indexOf(id) >= 0 ? 1 : -1;
        }
        cards.forEach(function (c) { if (side(c) > 0) score++; });
        scores = [score].concat(cards.map(function (c) { return score -= side(c); }));
        var best = Math.max.apply(null, scores), at = scores.indexOf(best);
        var cur = railPanel.parentElement === cards[0].parentElement ? cards.filter(function (c) {
            return c.compareDocumentPosition(railPanel) & Node.DOCUMENT_POSITION_FOLLOWING;
        }).length : -1;
        if (scores[cur] === best) at = cur;
        var next = cards[at], last = cards[cards.length - 1];
        if (next) { if (railPanel.nextElementSibling !== next) next.before(railPanel); }
        else if (last.nextElementSibling !== railPanel) last.after(railPanel);
    }

    // Cheap enough for every mutation burst: no rail on screen is one query.
    function mountRailPanel() {
        if (dragging || !document.body) return;
        var cards = Array.prototype.slice.call(document.querySelectorAll('[data-rail-card]'));
        // Only the first rail (a split view shows one per session).
        cards = cards.filter(function (c) { return c.parentElement === cards[0].parentElement; });
        if (S.railHidden || !cards.length) {
            if (railPanel) railPanel.remove();
            return;
        }
        if (!railPanel) {
            var src = cards.filter(function (c) { return c.querySelector('[data-rail-section] button'); }).pop();
            if (!src) return;
            railPanel = buildRailCard(src);
        }
        var fresh = !railPanel.isConnected;
        placeRailCard(cards);
        saveRailAt();
        if (fresh) railPanel.crtlSync();
    }

    // --- the rail's Show menu ---
    // Right-clicking a rail card's header opens a menu whose "Show" group has a
    // checkbox per card. Ours gets a copy of a checked one; Base UI does not know
    // the copy, so its toggle, highlight and arrow keys are handled here. The
    // menu's last plain item ("Reset to defaults") also resets our card.

    function addMenuItem() {
        var menus = document.querySelectorAll('[role="menu"]');
        for (var i = 0; i < menus.length; i++) {
            var tpl = menus[i].querySelector('[role="menuitemcheckbox"][aria-checked="true"]');
            if (!tpl || menus[i].querySelector('[data-crtl]')) continue;
            menuWanted = 0;
            buildMenuItem(menus[i], tpl);
            return;
        }
    }

    function buildMenuItem(menu, tpl) {
        var item = copyEl(tpl, true), on = item.querySelector('[data-checked]'), off = on.cloneNode(false), last = tpl;
        // Unchecked look: the app's checkbox classes without the checked fill.
        off.removeAttribute('data-checked');
        off.setAttribute('data-unchecked', '');
        off.classList.remove('bg-fill-accent', 'border-transparent');
        off.classList.add('border-strong', 'bg-transparent');
        var w = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        for (var t = w.nextNode(); t; t = w.nextNode()) {
            if (t.nodeValue.trim() && !on.contains(t)) { t.nodeValue = T.title; break; }
        }
        item.setAttribute('data-crtl', 'menu');

        function sync() {
            var shown = !S.railHidden;
            item.setAttribute('aria-checked', String(shown));
            item.toggleAttribute('data-checked', shown);
            item.toggleAttribute('data-unchecked', !shown);
            (shown ? off : on).replaceWith(shown ? on : off);
        }
        function toggle(e) {
            e.preventDefault();
            e.stopPropagation();
            setSetting('railHidden', !S.railHidden);
            sync();
        }
        item.addEventListener('click', toggle);
        item.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') toggle(e); });
        item.addEventListener('pointerenter', function () { item.focus(); });
        item.addEventListener('focus', function () { item.setAttribute('data-highlighted', ''); });
        item.addEventListener('blur', function () { item.removeAttribute('data-highlighted'); });
        // Arrow keys: Base UI steps over the copy, so step onto and off it here.
        menu.addEventListener('keydown', function (e) {
            var down = e.key === 'ArrowDown';
            if (!down && e.key !== 'ArrowUp') return;
            var list = Array.prototype.slice.call(menu.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])'));
            var i = list.indexOf(document.activeElement), to = list[i + (down ? 1 : -1)];
            if (i < 0 || !to || (list[i] !== item && to !== item)) return;
            e.preventDefault();
            e.stopPropagation();
            to.focus();
        }, true);

        var plain = menu.querySelectorAll('[role="menuitem"]'), reset = plain[plain.length - 1];
        if (reset && tpl.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING) {
            reset.addEventListener('click', function () { setSettings({ collapsed: false, railHidden: false, railAt: '' }); });
        }
        while (last.nextElementSibling && last.nextElementSibling.getAttribute('role') === 'menuitemcheckbox') last = last.nextElementSibling;
        last.after(item);
        sync();
    }

    // Ctrl+Alt+Shift+S: show the rail card (unfolded), or else the floating panel.
    function openPanel() {
        if (railPanel && railPanel.isConnected) {
            if (S.collapsed) setSetting('collapsed', false);
            railPanel.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (floatPanel && floatPanel.isConnected) { floatPanel.remove(); return; }
        floatPanel = floatPanel || buildFloat();
        var cs = getComputedStyle(document.body), bg = cs.backgroundColor;
        floatPanel.style.background = /^(transparent|rgba\(0, 0, 0, 0\))$/.test(bg) ? '#262624' : bg;
        floatPanel.style.color = cs.color;
        document.body.appendChild(floatPanel);
        floatPanel.crtlSync();
    }

    // --- diagnostics ---
    // Ctrl+Alt+Shift+D: copy a report of Persian UI text (real DOM structure,
    // styles, which dirs are ours vs native) to the clipboard, to paste back to Claude.

    function sig(el) {
        return el ? el.tagName + '.' + (typeof el.className === 'string' ? el.className : '') : '';
    }

    function toast(msg) {
        var t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
            'background:#222;color:#fff;padding:8px 14px;border-radius:8px;font:13px sans-serif;direction:ltr';
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 2500);
    }

    function describe(el) {
        var cs = getComputedStyle(el), r = el.getBoundingClientRect();
        return {
            sig: sig(el), parent: sig(el.parentElement), grand: sig(el.parentElement && el.parentElement.parentElement),
            text: (el.textContent || '').trim().slice(0, 60),
            rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
            css: [cs.display, cs.position, cs.overflow, cs.whiteSpace, cs.direction, cs.textAlign,
                'pad ' + cs.paddingLeft + '/' + cs.paddingRight, 'flex ' + cs.flex,
                'mask ' + (cs.webkitMaskImage || cs.maskImage || '').slice(0, 80)].join(' | '),
            ours: (el.hasAttribute('dir') ? 'dir=' + el.getAttribute('dir') +
                (el.hasAttribute('data-fa-dir') ? ' (ours)' : ' (native)') : 'no dir') +
                ' ' + (el.style.cssText || ''),
            row: (function () {
                var row = el.closest(ROWS) || (el.parentElement && el.parentElement.parentElement) || el;
                return row.outerHTML.replace(/\s+/g, ' ').slice(0, 1500);
            })()
        };
    }

    // Why the settings card is (not) in the rail: the rail's cards, in order.
    function railReport() {
        return {
            mounted: !!(railPanel && railPanel.isConnected),
            hidden: S.railHidden,
            cards: Array.prototype.map.call(document.querySelectorAll('[data-rail-card]'), function (c) {
                return c.getAttribute('data-rail-card') + (c.querySelector('[data-rail-section]') ? '' : ' (empty)');
            })
        };
    }

    function dump() {
        var els = Array.prototype.slice.call(document.querySelectorAll('[data-fa-dir], [dir="rtl"]'))
            .filter(function (e) { return !e.closest(BLOCKS) && e.matches(UI_LEAVES); }).slice(0, 12);
        var rail = railReport();
        var report = JSON.stringify({ ua: navigator.userAgent, url: location.href,
            settings: S, rail: rail, items: els.map(describe) }, null, 1);
        function done() {
            toast('claude-rtl: report copied (' + els.length + ' items, rail ' +
                (rail.mounted ? 'card shown' : rail.hidden ? 'card hidden' : rail.cards.length ? 'found' : 'not found') + ')');
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(report).then(done, function () { fallbackCopy(report); done(); });
        } else { fallbackCopy(report); done(); }
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        ta.remove();
    }

    document.addEventListener('keydown', function (e) {
        if (!(e.ctrlKey && e.altKey && e.shiftKey)) return;
        if (e.code === 'KeyD') { e.preventDefault(); dump(); }
        if (e.code === 'KeyS') { e.preventDefault(); openPanel(); }
    }, true);

    // The rail card the user is about to drag (cleared by any other press).
    document.addEventListener('pointerdown', function (e) {
        var c = e.target.closest && e.target.closest('[data-rail-grab]');
        nativeGrab = c && c.closest('[data-rail-card]') ? c.closest('[data-rail-card]').getAttribute('data-rail-card') : '';
    }, true);

    // A right-click on a rail card's header (not ours) is about to open the Show menu.
    document.addEventListener('contextmenu', function (e) {
        if (e.target.closest && e.target.closest('[data-rail-card] [data-rail-section] > :first-child')) menuWanted = Date.now();
    }, true);

    function init() {
        applySettings(null);
        mountRailPanel();

        // Process only what changed; fall back to a full pass on big bursts.
        var roots = new Set(), timer = null;
        function flush() {
            timer = null;
            injectStyle();
            if (roots.size > 60) fix(document.body);
            else roots.forEach(function (r) { if (r.isConnected) fix(r); });
            roots.clear();
            mountRailPanel();
        }
        function add(el) {
            if (!el || el.nodeType !== 1 || el.closest(EDITOR + ',[data-crtl]')) return;
            roots.add(el);
            // Changed text inside a block/list/row must re-judge the container.
            var c = el.closest(BLOCKS + ',ul,ol,table,' + ROWS);
            if (c) roots.add(c);
            var list = el.closest('ul,ol');
            if (list) roots.add(list);
        }
        new MutationObserver(function (muts) {
            // The Show menu is mounting: add our checkbox before it is painted.
            if (menuWanted && Date.now() - menuWanted < 1000) addMenuItem();
            for (var i = 0; i < muts.length; i++) {
                var m = muts[i];
                if (m.type === 'characterData') add(m.target.parentElement);
                else {
                    add(m.target);
                    for (var j = 0; j < m.addedNodes.length; j++) add(m.addedNodes[j]);
                }
            }
            if (roots.size && !timer) timer = setTimeout(flush, 120);
        }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }

    // Another window of the same origin changed the settings.
    window.addEventListener('storage', function (e) {
        if (e.key !== KEY && e.key !== null) return;
        var prev = S;
        S = loadSettings();
        applySettings(prev);
        syncPanels();
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
// --- CLAUDE PERSIAN RTL (VAZIRMATN) END ---
