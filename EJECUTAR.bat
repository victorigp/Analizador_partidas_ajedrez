@echo off
title Analizador de partidas
color 0A

cd /d "%~dp0"
python main.py %*

echo.
pause
