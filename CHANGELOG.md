# Changelog

## Unreleased

- Fix: the settings card was added to the rail but stayed hidden, because it copied a conditional `hidden` class from claude.ai's card wrapper. It now copies the visible card (`[data-rail-section]`) and never hiding classes.
- The settings card finds the session rail in more layouts (cards built as list items, deeper nesting), and the `Ctrl+Alt+Shift+D` report now says whether the rail was found and why not.
- Settings card in the Claude Code session rail (`Ctrl+Alt+Shift+S` elsewhere): RTL on/off, line height, Persian text size, lists and tables, full-layout mirroring, font on/off and name, and Persian letters inside code. Applied live and saved in `localStorage`.
- Persian letters in code blocks now use the chosen font instead of a system fallback (can be turned off).
- The Persian line height now also covers `dt`, `dd`, table cells and blockquotes.
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
