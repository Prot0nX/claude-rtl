# Changelog

## 1.1.0 - 2026-10-19

<img src="https://raw.githubusercontent.com/Prot0nX/claude-rtl/main/docs/settings-panel.png" width="285" alt="Settings card">

- Settings card in the Claude Code session rail: RTL on/off, line height, Persian text size, lists and tables, full-layout mirroring, font on/off and name, and Persian letters inside code. Changes apply live and are saved in `localStorage`, so they survive restarts and re-patching. `Ctrl+Alt+Shift+S` opens the same panel as a floating box anywhere else.
- Persian letters in code blocks now use the chosen font instead of a system fallback (can be turned off).
- The Persian line height now also covers `dt`, `dd`, table cells and blockquotes.
- The `Ctrl+Alt+Shift+D` report now says whether the session rail was found, and why not.
- Clearer console output: numbered steps, aligned `[ OK ]` / `[ !! ]` / `[FAIL]` markers, shortened hashes and a summary at the end. Behavior is unchanged.

## 1.0.0 - 2026-10-18

First public release.

- Vazirmatn (or any installed font via `-Font`) across the whole app; code, math and icon fonts keep their own fonts.
- Per-paragraph text direction. Persian lines that start with a file name, path or Latin word are still detected as RTL.
- Persian lists put their bullets on the right, and Persian tables put their first column on the right.
- Sidebar session titles are right-aligned, using claude.ai's own RTL support. Row icons and the menu button are left in place.
- Code blocks, inline code and math always stay left-to-right.
- `install.cmd` / `uninstall.cmd` launchers that request administrator rights themselves.
- Safe re-runs: clean backups (`*.fa-orig`), and the payload never stacks.
- Diagnostic shortcut `Ctrl+Alt+Shift+D` that copies a report of Persian UI text to the clipboard.
- Tests for the patch tools (`npm test`).
