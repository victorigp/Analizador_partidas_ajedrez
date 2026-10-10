@echo off
title Analizador de partidas
cd /d "%~dp0"

if "%~1" == "" goto manual
echo "%~1" | findstr /I "ajedrez://" >nul
if %errorlevel% == 0 goto web

:manual
python main.py %*
echo.
pause
exit /b

:web
start /min python main.py %*
exit /b
