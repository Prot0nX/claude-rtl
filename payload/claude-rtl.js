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

    function css() {
        // One face per weight, matched by the installed font's full name
        // ("Vazirmatn Bold") or PostScript name ("Vazirmatn-Bold"), the naming
        // most static font families use. A missing weight is synthesized.
        var faces = [
            ['Thin', 100], ['ExtraLight', 200], ['Light', 300], ['Regular', 400],
            ['Medium', 500], ['SemiBold', 600], ['Bold', 700], ['ExtraBold', 800], ['Black', 900]
        ].map(function (w) {
            var full = w[0] === 'Regular' ? FONT : FONT + ' ' + w[0];
            // unicode-range skips the Private Use Area, so icon glyphs never resolve here.
            return '@font-face{font-family:"' + FAM + '";font-weight:' + w[1] +
                ';font-display:swap;src:local("' + full + '"),local("' + FONT + '-' + w[0] + '")' +
                ';unicode-range:U+0000-DFFF,U+F900-FFFF,U+10000-EFFFF}';
        });
        return faces.concat([
            // The font everywhere except code/math/mono/icons. Missing glyphs fall
            // through to the icon fonts, then the system UI font.
            'html body, html body *' + FONT_EXCLUDE + '{font-family:"' + FAM + '",' + ICON_FALLBACK + ',ui-sans-serif,system-ui,sans-serif!important}',
            'pre,pre *,code,code *,kbd,samp,.font-mono,.font-mono *{font-family:ui-monospace,"Cascadia Code",Consolas,monospace!important}',

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
            'p[dir="rtl"],li[dir="rtl"]{line-height:1.9}'
        ]).join('\n');
    }

    function injectStyle() {
        if (!document.documentElement) return;
        var el = document.getElementById('claude-fa-rtl-style');
        if (!el) {
            el = document.createElement('style');
            el.id = 'claude-fa-rtl-style';
            el.textContent = css();
        }
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
    var SKIP = EDITOR + ',pre,code,svg,[data-cds="Icon"]';

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
        if (!root || !root.querySelectorAll) return;
        fixBlocks(root);
        fixLists(root);
        fixUi(root);
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

    function dump() {
        var els = Array.prototype.slice.call(document.querySelectorAll('[data-fa-dir], [dir="rtl"]'))
            .filter(function (e) { return !e.closest(BLOCKS) && e.matches(UI_LEAVES); }).slice(0, 12);
        var report = JSON.stringify({ ua: navigator.userAgent, url: location.href,
            items: els.map(describe) }, null, 1);
        function done() { toast('claude-rtl: report copied (' + els.length + ' items)'); }
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
    }, true);

    function init() {
        injectStyle();
        if (MODE === 'full') document.documentElement.setAttribute('dir', 'rtl');
        fix(document.body);

        // Process only what changed; fall back to a full pass on big bursts.
        var roots = new Set(), timer = null;
        function flush() {
            timer = null;
            injectStyle();
            if (roots.size > 60) fix(document.body);
            else roots.forEach(function (r) { if (r.isConnected) fix(r); });
            roots.clear();
        }
        function add(el) {
            if (!el || el.nodeType !== 1 || el.closest(EDITOR)) return;
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

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
// --- CLAUDE PERSIAN RTL (VAZIRMATN) END ---
