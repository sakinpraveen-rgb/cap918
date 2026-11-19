@echo off
rem Starts the frontend dev server at http://localhost:4200
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-frontend.ps1" %*
if errorlevel 1 pause
