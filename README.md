# Claude RTL

**English** | [فارسی](README.fa.md)

Right-to-left support for Persian (and Arabic) text, plus the **Vazirmatn** font, for the **Claude desktop app on Windows**.

Out of the box, Claude's desktop app shows Persian mixed with English poorly: lines that start with a file name read backwards, bullets sit on the wrong side, and sidebar titles are left-aligned. Claude RTL fixes this by injecting a small script and stylesheet into the app.

> **Unofficial.** This project is not affiliated with or endorsed by Anthropic. It modifies the installed app's files (see [How it works](#how-it-works)). Use it at your own risk; you can undo it at any time.

## Features

- **Vazirmatn everywhere**, or any font you have installed. Code, math and icons keep their own fonts.
- **Correct direction per paragraph.** Persian paragraphs read right-to-left and English ones left-to-right, in answers, in your messages and in the input box.
- **Smart detection.** A Persian line that starts with a file name, path, link or English word (`Patch.ps1: اسکریپت اصلی`) is still treated as Persian.
- **Lists and tables.** Persian lists have their bullets on the right; Persian tables put their first column on the right.
- **Sidebar.** Persian session titles are right-aligned, and the row icons and `⋯` menu stay where they are.
- **Code and math stay LTR**, always.
- **Settings panel.** A *RTL & font* card in the Claude Code session rail, built like the rail's own cards (drag it by its grip, show or hide it from the rail's right-click *Show* menu), changes things live: RTL on/off, line height, Persian text size, lists and tables, full-layout mirroring, the font and its name, and Persian letters inside code. Press **`Ctrl+Alt+Shift+S`** to open it anywhere else.
- **Re-runnable.** After every Claude update, run it again. Running it twice never stacks changes.
- **Reversible.** One command (or `uninstall.cmd`) restores the original files.

## Requirements

| | |
|---|---|
| OS | Windows 10/11 |
| Claude | Claude desktop from the Microsoft Store / MSIX installer (the default on Windows) |
| [Node.js](https://nodejs.org) | 18 or newer, on `PATH` |
| Font | [Vazirmatn](https://github.com/rastikerdar/vazirmatn/releases), installed in Windows (the static `.ttf` files) |
| Rights | Administrator (the app lives in the protected `WindowsApps` folder) |

## Install

1. Install [Node.js](https://nodejs.org) and the [Vazirmatn](https://github.com/rastikerdar/vazirmatn/releases) font (select the `.ttf` files → right-click → *Install*).
2. Download this repository (**Code → Download ZIP**) and extract it anywhere.
3. Double-click **`install.cmd`** and accept the administrator prompt.

The script closes Claude, patches it, and starts it again. When you see `Patched`, you're done.

**After every Claude update, run `install.cmd` again.** Each update installs a fresh, unpatched copy of the app.

### From PowerShell

Run these from an **elevated** PowerShell window that is not inside Claude:

```powershell
powershell -ExecutionPolicy Bypass -File .\Patch-ClaudeRTL.ps1
```

| Option | Effect |
|---|---|
| `-Font "Sahel"` | Use another installed font instead of Vazirmatn |
| `-Mode full` | *Experimental.* Also mirror the whole layout (sidebar on the right) |
| `-DryRun` | Build the patched file in `%TEMP%` only; nothing is installed and no admin rights are needed |
| `-Restore` | Put the original files back |
| `-NoRestart` | Don't start Claude again afterwards |

`install.cmd` passes its arguments through, for example `install.cmd -Font "Sahel"`.

## Uninstall

Double-click **`uninstall.cmd`**, or run:

```powershell
powershell -ExecutionPolicy Bypass -File .\Patch-ClaudeRTL.ps1 -Restore
```

A Claude update also removes the patch, because it installs a fresh copy.

## Settings

The settings card appears at the bottom of the session rail in Claude Code and behaves like the rail's other cards:

- **Move it:** hover its header and drag the grip, or focus the grip with `Tab` and press `↑` / `↓`. It keeps its place when you move, hide or show other cards.
- **Hide or show it:** right-click any card's header and toggle *راست‌چین و فونت* under *Show*. *Reset to defaults* there also puts it back at the bottom.
- **Fold it:** click its title.

If it is not there (another page, it is hidden, or Claude changed the rail), press **`Ctrl+Alt+Shift+S`** for a floating copy; `Esc` closes it.

<p align="center"><img src="docs/settings-panel.png" width="285" alt="The RTL & font settings card in the Claude Code session rail"></p>

| Setting | Default | What it does |
|---|---|---|
| RTL | on | Per-paragraph direction, lists, tables and sidebar titles. Off gives Claude's own layout back; the font setting is separate. |
| Line height | 1.9 | Line height of Persian paragraphs, list items and table cells. |
| Persian text size | 100% | Size of Persian blocks in answers, relative to the surrounding text. |
| Lists and tables RTL | on | Bullets on the right and first column on the right for Persian lists and tables. |
| Mirror whole page | `-Mode` | Experimental full-layout mirroring (`-Mode full`). |
| Custom font | on | The font everywhere except code, math and icons. |
| Font name | `-Font` | Any installed font (letters, digits, spaces, hyphens). Applied as you type. |
| Persian inside code | on | Persian letters in code blocks use the font above instead of a system fallback. |

Choices are saved in the app (`localStorage`) and survive restarts and re-patching. Only changed values are saved, so `-Font` and `-Mode` still set the defaults. **Reset** returns to them.

## How it works

The Claude desktop app is an [Electron](https://www.electronjs.org/) app. Its code lives in `resources\app.asar`, and its windows load *preload scripts* from there before the page.

1. **Payload.** [`payload/claude-rtl.js`](payload/claude-rtl.js) is prepended to three preload scripts (`mainView.js`, `mainWindow.js`, `quickWindow.js`). It adds a stylesheet (font, per-paragraph `unicode-bidi: plaintext`, LTR code) and a `MutationObserver` that sets `dir` where the browser's first-letter rule gets it wrong. It never overrides a `dir` that claude.ai set itself, unless its own detection clearly disagrees on a text block.
2. **Archive.** [`tools/asar-inject.js`](tools/asar-inject.js) rewrites `app.asar` with the payload added. It has no dependencies, keeps every other file byte-identical, and updates the per-file integrity hashes.
3. **Integrity hash.** Electron checks that `app.asar` matches a SHA-256 hash stored inside `claude.exe`. [`tools/exe-hash.js`](tools/exe-hash.js) replaces that 64-character hash in place, so the file size stays the same and Electron's integrity check stays **enabled**. If the old hash isn't found, the script stops before changing anything.
4. **Install.** [`Patch-ClaudeRTL.ps1`](Patch-ClaudeRTL.ps1) takes ownership of the files it needs to write, backs up the originals as `*.fa-orig`, copies the new files in, and restarts Claude.

What this means for you:

- `claude.exe` is modified, so **its digital signature is no longer valid**. Windows still runs it. The Cowork service (`cowork-svc`) may refuse a modified client; if Cowork matters to you, test it and uninstall if needed.
- The script **takes ownership** of the Claude package folder and of `app.asar` / `claude.exe` (Administrators group) so it can write them.
- Only the Claude **desktop app** is closed; Claude Code CLI processes are left running.
- If another RTL patch was already applied, its `.bak` originals are used as the clean base.

## Troubleshooting

| Problem | What to do |
|---|---|
| `Run this from an elevated PowerShell` | Use `install.cmd`, or right-click PowerShell → *Run as administrator*. |
| `Node.js is required` | Install Node.js 18+ and open a **new** window. |
| `Font ... does not look installed` | Install the font for your user or all users, then run again. |
| `claude.exe does not contain the expected asar hash` | This Claude build stores integrity differently. Nothing was changed. Please [open an issue](../../issues) with your Claude version. |
| `Claude did not close` | Quit Claude from the system tray, then run again. |
| Claude doesn't start after patching | Run `uninstall.cmd`, then [open an issue](../../issues). |
| The settings card is missing from the session rail | Right-click a card's header and check it under *Show*, or press **`Ctrl+Alt+Shift+S`** for the floating panel. The `Ctrl+Alt+Shift+D` report (below) lists the rail's cards and says whether ours is hidden; attach it to an issue. |
| Something looks wrong in the UI | Press **`Ctrl+Alt+Shift+D`** in Claude. It copies a JSON report of the Persian UI elements (structure, styles, which `dir` came from Claude vs. this patch) to the clipboard. Attach it to an issue with a screenshot. *The report contains the text of those elements, e.g. session titles; review it before posting.* |

## Development

```powershell
npm test                                       # tests for the patch tools (Node built-in runner, no dependencies)
.\Patch-ClaudeRTL.ps1 -DryRun                  # build the patched asar without installing it
```

Project layout:

```
Patch-ClaudeRTL.ps1     install / restore script
install.cmd             double-click launcher (asks for admin)
uninstall.cmd           double-click restore
payload/claude-rtl.js   the CSS + JS injected into Claude
tools/asar-inject.js    rewrites app.asar with the payload
tools/exe-hash.js       updates the asar hash inside claude.exe
tools/asar-util.js      small helpers for the script
test/                   npm test
docs/                   README images
.github/workflows/      release automation
```

Keep `.ps1`, `.cmd` and payload sources **pure ASCII** (write non-ASCII characters as `\u` escapes). Windows PowerShell 5.1 misreads non-ASCII files without a BOM. A test checks this.

Contributions are welcome. For UI issues, please include the `Ctrl+Alt+Shift+D` report, since claude.ai's markup changes often.

## Credits

- [Vazirmatn](https://github.com/rastikerdar/vazirmatn) by Saber Rastikerdar (SIL Open Font License). The font is not bundled; install it separately.
- Claude is a product of Anthropic. This project only changes how the desktop app displays text on your own machine.

## License

[MIT](LICENSE)
