@echo off
title Analizador de partidas
color 0A

echo ==================================================
echo         ANALIZADOR DE PARTIDAS
echo ==================================================
echo.
echo Introduce la URL de la partida de Chess.com que deseas analizar.
echo (O deja en blanco y pulsa ENTER para abrir el menu interactivo)
echo.

set /p url="URL: "

if "%url%"=="" (
    echo.
    echo Iniciando menu principal...
    python main.py
) else (
    echo.
    echo Iniciando analisis para: %url%
    python main.py "%url%"
)

echo.
pause
