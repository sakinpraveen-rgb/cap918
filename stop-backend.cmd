@echo off
rem Stops the local backend and switches the frontend back to demo mode.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-backend.ps1" -Stop
pause
