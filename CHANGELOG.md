# Changelog

## Unreleased

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
