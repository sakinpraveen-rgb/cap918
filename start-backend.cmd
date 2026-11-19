@echo off
rem Starts the local Supabase backend (needs Docker Desktop). Add -Reset to wipe the database.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-backend.ps1" %*
pause
