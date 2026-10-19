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
        font: true, fontName: FONT, codeFont: true, collapsed: false
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
    // translucent grays), so it fits both the light and the dark theme.
    var PANEL_CSS = [
        '[data-crtl]{font-size:13px;line-height:1.5;text-align:right;box-sizing:border-box}',
        '[data-crtl] .crtl-head{display:flex;align-items:center;gap:6px;font-weight:600;cursor:pointer;user-select:none}',
        '[data-crtl] .crtl-head svg{opacity:.7;transition:transform .15s}',
        '[data-crtl][data-collapsed] .crtl-head svg{transform:rotate(90deg)}',
        '[data-crtl][data-collapsed] .crtl-body{display:none}',
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
        '[data-crtl] .crtl-x{margin-right:auto;background:none;border:0;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.6;padding:0 2px}',
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

    function setSetting(key, value) {
        var prev = S, next = {};
        Object.keys(S).forEach(function (k) { next[k] = S[k]; });
        next[key] = value;
        S = cleanSettings(next);
        saveSettings();
        applySettings(prev);
        syncPanels();
    }

    function resetSettings() {
        var prev = S, collapsed = S.collapsed;
        S = cleanSettings({});
        S.collapsed = collapsed;
        saveSettings();
        applySettings(prev);
        syncPanels();
    }

    // --- settings panel ---
    // Mounted as one more card in the Claude Code session rail (Environment,
    // Context, Connectors, Changes). The rail has no stable ids, so it is found by
    // its section titles: the closest element holding at least two of them is the
    // rail, and our card copies the look of its last card. When no rail is on
    // screen, Ctrl+Alt+Shift+S opens the same panel as a floating box.

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
        close: '\u0628\u0633\u062a\u0646'
    };
    var FONT_CHOICES = ['Vazirmatn', 'Sahel', 'Shabnam', 'Samim', 'Tanha', 'Estedad', 'Parastoo', 'Tahoma', 'Segoe UI'];
    var RAIL_TITLES = ['Environment', 'Context', 'Connectors', 'Changes'];
    var SVG_NS = 'http://www.w3.org/2000/svg';

    var railPanel = null, floatPanel = null, lastScan = 0, scanTimer = null;

    // DOM helpers only (no innerHTML: claude.ai may enforce Trusted Types).
    function node(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text) e.textContent = text;
        return e;
    }

    function chevron() {
        var svg = document.createElementNS(SVG_NS, 'svg'), p = document.createElementNS(SVG_NS, 'path');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        p.setAttribute('d', 'M4 6l4 4 4-4');
        svg.appendChild(p);
        return svg;
    }

    function buildPanel(floating) {
        var root = node('div', 'crtl-card');
        root.setAttribute('data-crtl', floating ? 'float' : 'rail');
        root.setAttribute('dir', 'rtl');
        var head = node('div', 'crtl-head'), body = node('div', 'crtl-body'), syncers = [];
        head.appendChild(node('span', '', T.title));
        if (floating) {
            var x = node('button', 'crtl-x', '\u00d7');
            x.type = 'button';
            x.title = T.close;
            x.addEventListener('click', function () { root.remove(); });
            head.appendChild(x);
        } else {
            head.setAttribute('role', 'button');
            head.tabIndex = 0;
            head.appendChild(chevron());
            head.addEventListener('click', function () { setSetting('collapsed', !S.collapsed); });
            head.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSetting('collapsed', !S.collapsed); }
            });
        }
        root.appendChild(head);
        root.appendChild(body);

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
            list.id = 'crtl-fonts-' + (floating ? 'float' : 'rail');
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

        // Keys typed in the panel are ours, not the app's shortcuts.
        root.addEventListener('keydown', function (e) {
            if (floating && e.key === 'Escape') root.remove();
            e.stopPropagation();
        });

        root.crtlSync = function () {
            syncers.forEach(function (f) { f(); });
            root.toggleAttribute('data-collapsed', !floating && S.collapsed);
        };
        root.crtlSync();
        return root;
    }

    function syncPanels() {
        [railPanel, floatPanel].forEach(function (p) { if (p && p.isConnected) p.crtlSync(); });
    }

    // Text elements that read exactly like a rail section title. Titles inside
    // paragraphs, code or the editor do not count. (Rail cards may be list items,
    // so li is not excluded; needing 3 titles in one narrow box keeps chat out.)
    function railTitleHits() {
        var hits = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (var t = w.nextNode(); t && hits.length < 40; t = w.nextNode()) {
            var v = t.nodeValue;
            if (v.length > 24) continue;
            v = v.trim();
            if (RAIL_TITLES.indexOf(v) < 0) continue;
            var p = t.parentElement;
            if (!p || p.closest('p,pre,code,[data-crtl],' + EDITOR)) continue;
            hits.push({ el: p, title: v });
        }
        return hits;
    }

    // The rail: the deepest element holding the most distinct section titles (3+).
    function findRail() {
        var hits = railTitleHits(), seen = new Map(), best = null;
        hits.forEach(function (h) {
            var a = h.el.parentElement;
            for (var depth = 1; a && a !== document.body && depth <= 16; depth++, a = a.parentElement) {
                var e = seen.get(a);
                if (!e) seen.set(a, e = { el: a, titles: {}, count: 0, depth: depth });
                if (!e.titles[h.title]) { e.titles[h.title] = 1; e.count++; }
            }
        });
        seen.forEach(function (e) {
            if (e.count < 3) return;
            if (!best || e.count > best.count || (e.count === best.count && e.depth < best.depth)) best = e;
        });
        if (!best || best.el.getBoundingClientRect().width > 720) return null;
        // The rail's last child that holds a title: the card whose look we copy.
        for (var c = best.el.lastElementChild; c; c = c.previousElementSibling) {
            if (c.hasAttribute('data-crtl')) continue;
            for (var i = 0; i < hits.length; i++) if (c.contains(hits[i].el)) return { rail: best.el, card: c };
        }
        return null;
    }

    // The first element in el (or el itself) that is actually drawn as a box.
    function visibleBox(el) {
        var all = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*'), 0, 30));
        for (var i = 0; i < all.length; i++) {
            var d = getComputedStyle(all[i]).display;
            if (d !== 'none' && d !== 'contents' && all[i].getBoundingClientRect().height > 0) return all[i];
        }
        return null;
    }

    function mountRailPanel() {
        if (railPanel && railPanel.isConnected) return;
        var wait = 1500 - (Date.now() - lastScan);
        if (wait > 0) {
            if (!scanTimer) scanTimer = setTimeout(function () { scanTimer = null; mountRailPanel(); }, wait);
            return;
        }
        lastScan = Date.now();
        if (!document.body) return;
        var found = findRail();
        if (!found) return;
        railPanel = railPanel || buildPanel(false);
        // The visible card: claude.ai wraps each one in a display:contents (or
        // conditionally hidden) div, and draws the card on the section inside.
        var look = found.card.matches('[data-rail-section]') ? found.card :
            found.card.querySelector('[data-rail-section]') || visibleBox(found.card) || found.card;
        // Never copy classes that hide or flatten the box.
        var cls = (typeof look.className === 'string' ? look.className : '').split(/\s+/).filter(function (c) {
            return c && !/^(hidden|contents|invisible|sr-only|collapse)$/.test(c);
        }).join(' ');
        railPanel.className = (cls + ' crtl-card').trim();
        railPanel.style.cssText = '';
        found.rail.appendChild(railPanel);
        // Still invisible (a conditional class we cannot know): drop the copied look.
        if (getComputedStyle(railPanel).display === 'none') railPanel.className = 'crtl-card';
        // Cards whose padding / border live elsewhere: give ours its own.
        var cs = getComputedStyle(railPanel);
        if (parseFloat(cs.paddingTop) < 4) { railPanel.style.paddingTop = '12px'; railPanel.style.paddingBottom = '12px'; }
        if (parseFloat(cs.paddingLeft) < 4) { railPanel.style.paddingLeft = '12px'; railPanel.style.paddingRight = '12px'; }
        if (cs.borderTopStyle === 'none' && cs.boxShadow === 'none') {
            railPanel.style.border = '1px solid rgba(127,127,127,.3)';
            railPanel.style.borderRadius = '10px';
        }
        railPanel.crtlSync();
    }

    // Ctrl+Alt+Shift+S: show the rail card (expanded), or else a floating panel.
    function openPanel() {
        if (railPanel && railPanel.isConnected) {
            if (S.collapsed) setSetting('collapsed', false);
            railPanel.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (floatPanel && floatPanel.isConnected) { floatPanel.remove(); return; }
        floatPanel = floatPanel || buildPanel(true);
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

    // Why the settings card is (not) in the rail: each title found, with its ancestors.
    function railReport() {
        var found = findRail();
        return {
            mounted: !!(railPanel && railPanel.isConnected),
            found: found ? sig(found.rail) + ' w=' + Math.round(found.rail.getBoundingClientRect().width) : null,
            titles: railTitleHits().map(function (h) {
                var chain = [];
                for (var a = h.el, i = 0; a && a !== document.body && i < 16; a = a.parentElement, i++) {
                    chain.push(a.tagName + (a.getAttribute('role') ? '[' + a.getAttribute('role') + ']' : '') +
                        ' w=' + Math.round(a.getBoundingClientRect().width));
                }
                return h.title + ': ' + chain.join(' < ');
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
                (rail.mounted ? 'card shown' : rail.found ? 'found' : 'not found, ' + rail.titles.length + ' titles') + ')');
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
