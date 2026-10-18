@echo off
rem Claude RTL - install / re-apply after a Claude update.
rem Double-click this file. It asks for administrator rights, then runs
rem Patch-ClaudeRTL.ps1 with any arguments given here (e.g. install.cmd -Font "Sahel").

net session >nul 2>&1
if errorlevel 1 (
    if "%~1"=="" (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    ) else (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
    )
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Patch-ClaudeRTL.ps1" %*
echo.
pause
