# Patch-ClaudeRTL.ps1 - Persian/Arabic RTL + a custom font (default Vazirmatn) for the
# Claude desktop app on Windows (Microsoft Store / MSIX install).
#
# Run again after every Claude update (each update installs a fresh, unpatched folder).
# Run from an ELEVATED PowerShell window that is NOT inside Claude (the script closes Claude),
# or double-click install.cmd / uninstall.cmd, which ask for elevation themselves.
#
#   .\Patch-ClaudeRTL.ps1                    # patch: per-paragraph RTL, Vazirmatn font
#   .\Patch-ClaudeRTL.ps1 -Font "Sahel"      # use another installed font
#   .\Patch-ClaudeRTL.ps1 -Mode full         # experimental: also mirror the whole layout
#   .\Patch-ClaudeRTL.ps1 -DryRun            # build the patched asar in %TEMP% only, touch nothing
#   .\Patch-ClaudeRTL.ps1 -Restore           # put the original files back
#
# Requires: Node.js on PATH, the font installed in Windows (static weights).
# Source is kept pure ASCII so Windows PowerShell 5.1 reads it correctly.

[CmdletBinding()]
param(
    [ValidateSet('content', 'full')] [string]$Mode = 'content',
    # Letters, digits, spaces and hyphens only: the name is spliced into CSS.
    [ValidatePattern('^[A-Za-z0-9 -]{1,64}$')] [string]$Font = 'Vazirmatn',
    [switch]$Restore,
    [switch]$DryRun,
    [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Payload = Join-Path $Here 'payload\claude-rtl.js'
$AsarTool = Join-Path $Here 'tools\asar-inject.js'
$ExeTool = Join-Path $Here 'tools\exe-hash.js'
$UtilTool = Join-Path $Here 'tools\asar-util.js'
$Targets = @('.vite/build/mainView.js', '.vite/build/mainWindow.js', '.vite/build/quickWindow.js')
$OrigExt = '.fa-orig'                       # our backups
$ThirdPartyMarker = 'CLAUDE RTL PATCH START' # an older, unrelated RTL patch

function Say($msg, $color = 'Cyan') { Write-Host "[claude-rtl] $msg" -ForegroundColor $color }
function Fail($msg) { Write-Host "[claude-rtl] $msg" -ForegroundColor Red; exit 1 }

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-AsarHeaderHash($path) {
    $h = & node $UtilTool hash $path
    if ($LASTEXITCODE -ne 0 -or -not $h) { Fail "cannot read asar header: $path" }
    return $h.Trim()
}

function Test-FileContains($path, $text) {
    & node $UtilTool contains $path $text
    return ($LASTEXITCODE -eq 0)
}

function Test-FontInstalled($name) {
    # Per-machine and per-user font registrations; value names look like
    # "Vazirmatn Bold (TrueType)".
    $keys = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts',
            'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
    foreach ($k in $keys) {
        $props = Get-ItemProperty -Path $k -ErrorAction SilentlyContinue
        if (-not $props) { continue }
        foreach ($p in $props.PSObject.Properties) {
            if ($p.Name -like "$name *" -or $p.Name -eq $name) { return $true }
        }
    }
    return $false
}

function Grant-Write($path) {
    # MSIX folders belong to TrustedInstaller; take ownership so admins can write.
    & takeown.exe /f $path /a | Out-Null
    & icacls.exe $path /grant '*S-1-5-32-544:(F)' | Out-Null
}

# --- locate Claude -------------------------------------------------------------
$pkg = Get-AppxPackage -Name 'Claude' | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1
if (-not $pkg) {
    Fail 'Claude desktop (Microsoft Store / MSIX install) was not found. Other install types are not supported yet.'
}
$App = Join-Path $pkg.InstallLocation 'app'
$Res = Join-Path $App 'resources'
$Asar = Join-Path $Res 'app.asar'
$Exe = Join-Path $App 'claude.exe'
$appId = (Get-AppxPackageManifest $pkg).Package.Applications.Application | Select-Object -First 1 -ExpandProperty Id
Say "Claude $($pkg.Version) at $App"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js is required (https://nodejs.org).' }
if (-not $DryRun -and -not (Test-Admin)) { Fail 'Run this from an elevated (Administrator) PowerShell.' }
if (-not $Restore -and -not (Test-FontInstalled $Font)) {
    Say "Font '$Font' does not look installed in Windows; Claude will fall back to its default font." 'Yellow'
    Say 'Vazirmatn: https://github.com/rastikerdar/vazirmatn/releases (install the static .ttf files).' 'Yellow'
}

function Stop-Claude {
    # Only the desktop app's processes; Claude Code CLI (also claude.exe) is spared.
    $mine = { Get-Process -Name 'claude' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and $_.Path.StartsWith($App, [StringComparison]::OrdinalIgnoreCase) } }
    $p = & $mine
    if (-not $p) { return }
    Say 'Closing Claude...'
    $p | Stop-Process -Force -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 20 -and (& $mine); $i++) { Start-Sleep -Milliseconds 500 }
    if (& $mine) { Fail 'Claude did not close; close it from the tray and rerun.' }
}

function Start-Claude {
    if ($NoRestart) { return }
    Say 'Starting Claude...'
    Start-Process "shell:AppsFolder\$($pkg.PackageFamilyName)!$appId"
}

# --- restore -------------------------------------------------------------------
if ($Restore) {
    $pairs = @(@($Asar, "$Asar$OrigExt"), @($Exe, "$Exe$OrigExt"))
    if (-not (Test-Path "$Asar$OrigExt")) { Fail 'No backup found; this version was never patched by this script.' }
    Stop-Claude
    foreach ($p in $pairs) {
        if (Test-Path $p[1]) { Grant-Write $p[0]; Copy-Item $p[1] $p[0] -Force; Say "restored $(Split-Path -Leaf $p[0])" 'Green' }
    }
    Start-Claude
    exit 0
}

# --- pick clean sources ----------------------------------------------------------
# Priority: our own backup > the older third-party patch's .bak (if that patch is
# applied) > the live file (fresh install / update).
$thirdParty = (-not (Test-Path "$Asar$OrigExt")) -and (Test-FileContains $Asar $ThirdPartyMarker)
function Get-CleanSource($live) {
    if (Test-Path "$live$OrigExt") { return "$live$OrigExt" }
    if ($thirdParty) {
        if (Test-Path "$live.bak") { return "$live.bak" }
        Fail "Another RTL patch is applied to $(Split-Path -Leaf $live) and no .bak original exists. Reinstall Claude, then rerun."
    }
    return $live
}
$cleanAsar = Get-CleanSource $Asar
$cleanExe = Get-CleanSource $Exe
if ($thirdParty) { Say 'An older RTL patch was found; its .bak originals will be used as the clean base.' 'Yellow' }
if (Test-FileContains $cleanAsar $ThirdPartyMarker) { Fail "$cleanAsar is not clean (contains another patch)." }

# --- build in temp ----------------------------------------------------------------
$work = Join-Path $env:TEMP ("claude-rtl-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null
$payloadOut = Join-Path $work 'claude-rtl.js'
$payloadText = [IO.File]::ReadAllText($Payload).Replace("'__RTL_MODE__'", "'$Mode'").Replace("'__RTL_FONT__'", "'$Font'")
[IO.File]::WriteAllText($payloadOut, $payloadText, (New-Object Text.UTF8Encoding $false))

$newAsar = Join-Path $work 'app.asar'
$newExe = Join-Path $work 'claude.exe'
$oldHash = Get-AsarHeaderHash $cleanAsar
$newHash = (& node $AsarTool $cleanAsar $newAsar $payloadOut @Targets | Select-Object -Last 1).Trim()
if ($LASTEXITCODE -ne 0) { Fail 'asar build failed.' }
Say "asar header hash: $oldHash -> $newHash"

if ($DryRun) {
    Say "Dry run: patched asar written to $newAsar (install untouched)." 'Green'
    exit 0
}

& node $ExeTool $cleanExe $newExe $oldHash $newHash
if ($LASTEXITCODE -eq 3) {
    Fail 'claude.exe does not contain the expected asar hash; this Claude build stores integrity differently. Nothing was changed.'
} elseif ($LASTEXITCODE -ne 0) { Fail 'exe update failed.' }

# --- install ------------------------------------------------------------------------
Stop-Claude
Grant-Write $App; Grant-Write $Res; Grant-Write $Asar; Grant-Write $Exe
foreach ($f in @($Asar, $Exe)) {
    if (-not (Test-Path "$f$OrigExt")) {
        $src = Get-CleanSource $f
        if ($src -ne "$f$OrigExt") { Copy-Item $src "$f$OrigExt" -Force }
    }
}
# cowork-svc.exe (CoworkVMService) is left alone: RTL does not need it, and it runs
# as an always-on service that keeps the file locked.
Copy-Item $newAsar $Asar -Force
Copy-Item $newExe $Exe -Force
Remove-Item -Recurse -Force $work
Say "Patched (mode: $Mode, font: $Font). Rerun this script after each Claude update." 'Green'
Start-Claude
