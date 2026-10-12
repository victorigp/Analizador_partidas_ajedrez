@echo off
:: Este script registra el protocolo ajedrez:// en Windows para que apunte directamente a pythonw.exe
:: Haz clic derecho en este archivo y selecciona "Ejecutar como administrador"

echo Registrando el protocolo ajedrez:// en Windows...

:: Detectar ruta de pythonw.exe
set "PYTHONW_PATH="
for /f "delims=" %%I in ('where pythonw 2^>nul') do (
    if not defined PYTHONW_PATH set "PYTHONW_PATH=%%I"
)

if not defined PYTHONW_PATH (
    echo [Error] No se encontro pythonw.exe en el PATH del sistema.
    echo Asegurate de tener Python instalado y anadido al PATH de Windows.
    pause
    exit /b 1
)

:: Obtener ruta absoluta de pythonw y main.py
set "PYTHONW_REG=%PYTHONW_PATH:\=\\%"

set "MAIN_PATH=%~dp0..\main.py"
for %%F in ("%MAIN_PATH%") do set "MAIN_PATH=%%~fF"
set "MAIN_REG=%MAIN_PATH:\=\\%"

:: Crear archivo de registro temporal
set "REGFILE=%TEMP%\ajedrez_protocol.reg"

echo Windows Registry Editor Version 5.00 > "%REGFILE%"
echo. >> "%REGFILE%"
echo [HKEY_CURRENT_USER\Software\Classes\ajedrez] >> "%REGFILE%"
echo @="URL:Ajedrez Protocol" >> "%REGFILE%"
echo "URL Protocol"="" >> "%REGFILE%"
echo. >> "%REGFILE%"
echo [HKEY_CURRENT_USER\Software\Classes\ajedrez\shell] >> "%REGFILE%"
echo. >> "%REGFILE%"
echo [HKEY_CURRENT_USER\Software\Classes\ajedrez\shell\open] >> "%REGFILE%"
echo. >> "%REGFILE%"
echo [HKEY_CURRENT_USER\Software\Classes\ajedrez\shell\open\command] >> "%REGFILE%"
echo @="\"%PYTHONW_REG%\" \"%MAIN_REG%\" \"%%1\"" >> "%REGFILE%"
echo. >> "%REGFILE%"
echo [HKEY_CLASSES_ROOT\ajedrez] >> "%REGFILE%"
echo @="URL:Ajedrez Protocol" >> "%REGFILE%"
echo "URL Protocol"="" >> "%REGFILE%"
echo. >> "%REGFILE%"
echo [HKEY_CLASSES_ROOT\ajedrez\shell] >> "%REGFILE%"
echo. >> "%REGFILE%"
echo [HKEY_CLASSES_ROOT\ajedrez\shell\open] >> "%REGFILE%"
echo. >> "%REGFILE%"
echo [HKEY_CLASSES_ROOT\ajedrez\shell\open\command] >> "%REGFILE%"
echo @="\"%PYTHONW_REG%\" \"%MAIN_REG%\" \"%%1\"" >> "%REGFILE%"

:: Importar el archivo de registro silenciosamente
regedit /s "%REGFILE%"

del "%REGFILE%"

echo.
echo ========================================================
echo ¡Protocolo registrado exitosamente con pythonw.exe!
echo Ahora Tampermonkey podra ejecutar el analizador de forma
echo 100%% silenciosa (sin ventana de consola de comandos).
echo ========================================================
echo.
pause
