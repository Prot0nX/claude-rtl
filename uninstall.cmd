@echo off
rem Claude RTL - restore Claude's original files.
rem Double-click this file. It asks for administrator rights, then runs
rem Patch-ClaudeRTL.ps1 -Restore.

net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Patch-ClaudeRTL.ps1" -Restore
echo.
pause
