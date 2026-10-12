@echo off
setlocal enabledelayedexpansion
title Analizador de partidas
cd /d "%~dp0"

set "ARG1=%~1"
if "!ARG1!" == "" goto manual

if not "!ARG1:ajedrez:=!" == "!ARG1!" goto web
goto manual

:manual
python main.py %*
echo.
pause
exit /b

:web
start "" pythonw main.py %*
exit /b
