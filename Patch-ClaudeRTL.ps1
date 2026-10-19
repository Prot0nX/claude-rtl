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

# --- console output ----------------------------------------------------------------
$Clock = [Diagnostics.Stopwatch]::StartNew()
$StepNo = 0
$StepCount = if ($Restore) { 3 } elseif ($DryRun) { 2 } else { 5 }
if ($NoRestart -and -not $DryRun) { $StepCount-- }
$Pad = '         '                         # indent of the status column

function Write-Banner {
    $title = if ($Restore) { 'Restore original files' } elseif ($DryRun) { 'Dry run (nothing is installed)' } else { 'Install' }
    Write-Host ''
    Write-Host '  Claude RTL' -NoNewline -ForegroundColor Cyan
    Write-Host "  |  $title" -ForegroundColor White
    Write-Host ('  ' + ('=' * 58)) -ForegroundColor DarkCyan
}
function Step($title) {
    $script:StepNo++
    Write-Host ''
    Write-Host ("  [{0}/{1}] " -f $script:StepNo, $StepCount) -NoNewline -ForegroundColor Cyan
    Write-Host $title -ForegroundColor White
}
function Mark($tag, $color, $msg, $detail) {
    Write-Host "$Pad$tag " -NoNewline -ForegroundColor $color
    if ($detail) {
        Write-Host $msg -NoNewline
        Write-Host "  $detail" -ForegroundColor DarkGray
    } else { Write-Host $msg }
}
function Ok($msg, $detail) { Mark '[ OK ]' Green $msg $detail }
function Warn($msg, $detail) { Mark '[ !! ]' Yellow $msg $detail }
function Note($msg) { Write-Host "$Pad       $msg" -ForegroundColor DarkGray }
function Fail($msg, $details) {
    Mark '[FAIL]' Red $msg
    foreach ($d in @($details)) { if ($d) { Note $d } }
    Write-Host ''
    Write-Host ('  ' + ('-' * 58)) -ForegroundColor DarkGray
    Write-Host '  Stopped. ' -NoNewline -ForegroundColor Red
    Write-Host 'See the message above.'
    exit 1
}
function Write-Summary($headline, $rows, $footer) {
    $secs = '{0:0.0}s' -f $Clock.Elapsed.TotalSeconds
    Write-Host ''
    Write-Host ('  ' + ('=' * 58)) -ForegroundColor DarkCyan
    Write-Host "  $headline" -NoNewline -ForegroundColor Green
    Write-Host "  ($secs)" -ForegroundColor DarkGray
    foreach ($r in $rows) {
        Write-Host ('    {0,-9}' -f $r[0]) -NoNewline -ForegroundColor DarkGray
        Write-Host $r[1]
    }
    if ($footer) { Write-Host ''; Write-Host "  $footer" -ForegroundColor Yellow }
}
function Short($hash) { if ($hash.Length -gt 16) { $hash.Substring(0, 12) } else { $hash } }

# Runs a node tool and returns its stdout lines; stderr lines go to $NodeErr instead of
# the console. (Windows PowerShell 5.1 turns redirected stderr into errors, so 'Stop'
# is lifted for the call.)
function Invoke-Node {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $all = & node @args 2>&1 } finally { $ErrorActionPreference = $prev }
    $script:NodeErr = @($all | Where-Object { $_ -is [Management.Automation.ErrorRecord] } | ForEach-Object { "$_" })
    @($all | Where-Object { $_ -isnot [Management.Automation.ErrorRecord] } | ForEach-Object { "$_" })
}

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
Write-Banner
Step 'Checking requirements'
$pkg = Get-AppxPackage -Name 'Claude' | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1
if (-not $pkg) {
    Fail 'Claude desktop (Microsoft Store / MSIX install) was not found. Other install types are not supported yet.'
}
$App = Join-Path $pkg.InstallLocation 'app'
$Res = Join-Path $App 'resources'
$Asar = Join-Path $Res 'app.asar'
$Exe = Join-Path $App 'claude.exe'
$appId = (Get-AppxPackageManifest $pkg).Package.Applications.Application | Select-Object -First 1 -ExpandProperty Id
Ok "Claude $($pkg.Version)"
Note $App

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js is required.' 'https://nodejs.org' }
Ok 'Node.js' (& node --version)
if (-not $DryRun) {
    if (-not (Test-Admin)) { Fail 'Run this from an elevated (Administrator) PowerShell.' }
    Ok 'Administrator rights'
}
if (-not $Restore) {
    if (Test-FontInstalled $Font) { Ok "Font '$Font' is installed" }
    else {
        Warn "Font '$Font' is not installed in Windows; without it Claude's UI will look broken."
        Note 'Vazirmatn: https://github.com/rastikerdar/vazirmatn/releases (install the static .ttf files)'
        # Ask for another installed font; Enter (or no console) keeps the missing one.
        while ($true) {
            try { $answer = (Read-Host "$Pad       Name of a font that IS installed (Enter to keep '$Font')").Trim() } catch { break }
            if (-not $answer) { Warn "Keeping '$Font'; Claude will fall back to its default font."; break }
            if ($answer -notmatch '^[A-Za-z0-9 -]{1,64}$') { Warn 'Use letters, digits, spaces and hyphens only.'; continue }
            if (Test-FontInstalled $answer) { $Font = $answer; Ok "Font '$Font' is installed"; break }
            Warn "'$answer' is not installed either."
        }
    }
}

function Stop-Claude {
    # Only the desktop app's processes; Claude Code CLI (also claude.exe) is spared.
    $mine = { Get-Process -Name 'claude' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and $_.Path.StartsWith($App, [StringComparison]::OrdinalIgnoreCase) } }
    $p = & $mine
    if (-not $p) { Ok 'Claude is not running'; return }
    $p | Stop-Process -Force -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 20 -and (& $mine); $i++) { Start-Sleep -Milliseconds 500 }
    if (& $mine) { Fail 'Claude did not close; close it from the tray and rerun.' }
    Ok 'Claude closed'
}

function Start-Claude {
    if ($NoRestart) { return }
    Step 'Starting Claude'
    Start-Process "shell:AppsFolder\$($pkg.PackageFamilyName)!$appId"
    Ok 'Claude launched'
}

# --- restore -------------------------------------------------------------------
if ($Restore) {
    $pairs = @(@($Asar, "$Asar$OrigExt"), @($Exe, "$Exe$OrigExt"))
    Step 'Restoring original files'
    if (-not (Test-Path "$Asar$OrigExt")) { Fail 'No backup found; this version was never patched by this script.' }
    Stop-Claude
    foreach ($p in $pairs) {
        if (Test-Path $p[1]) { Grant-Write $p[0]; Copy-Item $p[1] $p[0] -Force; Ok "Restored $(Split-Path -Leaf $p[0])" }
    }
    Start-Claude
    Write-Summary 'Original files restored.' @(, @('Claude', "$($pkg.Version)"))
    exit 0
}

# --- pick clean sources ----------------------------------------------------------
Step 'Building the patched app'
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
if ($thirdParty) { Warn 'An older RTL patch was found; its .bak originals are used as the clean base.' }
if (Test-FileContains $cleanAsar $ThirdPartyMarker) { Fail 'The source app.asar is not clean (contains another patch).' $cleanAsar }
Ok 'Clean source found' (Split-Path -Leaf $cleanAsar)

# --- build in temp ----------------------------------------------------------------
$work = Join-Path $env:TEMP ("claude-rtl-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null
$payloadOut = Join-Path $work 'claude-rtl.js'
$payloadText = [IO.File]::ReadAllText($Payload).Replace("'__RTL_MODE__'", "'$Mode'").Replace("'__RTL_FONT__'", "'$Font'")
[IO.File]::WriteAllText($payloadOut, $payloadText, (New-Object Text.UTF8Encoding $false))

$newAsar = Join-Path $work 'app.asar'
$newExe = Join-Path $work 'claude.exe'
$oldHash = Get-AsarHeaderHash $cleanAsar
$out = Invoke-Node $AsarTool $cleanAsar $newAsar $payloadOut @Targets
if ($LASTEXITCODE -ne 0) { Fail 'Building app.asar failed.' $NodeErr }
$newHash = ($out | Select-Object -Last 1).Trim()
foreach ($line in $NodeErr) { if ($line -match '^injected: (.+)$') { Ok 'Payload injected' $Matches[1] } }
Ok 'Header hash updated' "$(Short $oldHash) -> $(Short $newHash)"

if ($DryRun) {
    Write-Summary 'Dry run finished. Claude was not changed.' @(
        @('Mode', $Mode), @('Font', $Font), @('Output', $newAsar))
    exit 0
}

Step 'Updating claude.exe integrity'
$out = Invoke-Node $ExeTool $cleanExe $newExe $oldHash $newHash
if ($LASTEXITCODE -eq 3) {
    Fail 'claude.exe does not contain the expected asar hash. Nothing was changed.' 'This Claude build stores integrity differently.'
} elseif ($LASTEXITCODE -ne 0) { Fail 'Updating claude.exe failed.' $NodeErr }
$count = if ("$out" -match '(\d+)') { $Matches[1] } else { '?' }
Ok 'Embedded hash replaced' "$count occurrence(s)"

# --- install ------------------------------------------------------------------------
Step 'Installing'
Stop-Claude
Grant-Write $App; Grant-Write $Res; Grant-Write $Asar; Grant-Write $Exe
foreach ($f in @($Asar, $Exe)) {
    if (-not (Test-Path "$f$OrigExt")) {
        $src = Get-CleanSource $f
        if ($src -ne "$f$OrigExt") { Copy-Item $src "$f$OrigExt" -Force; Ok "Backup saved" "$(Split-Path -Leaf $f)$OrigExt" }
    }
}
# cowork-svc.exe (CoworkVMService) is left alone: RTL does not need it, and it runs
# as an always-on service that keeps the file locked.
Copy-Item $newAsar $Asar -Force
Copy-Item $newExe $Exe -Force
Remove-Item -Recurse -Force $work
Ok 'Patched files installed' 'app.asar, claude.exe'
Start-Claude
Write-Summary 'Claude RTL is installed.' @(
    @('Claude', "$($pkg.Version)"), @('Mode', $Mode), @('Font', $Font)) 'Rerun this script after every Claude update.'
