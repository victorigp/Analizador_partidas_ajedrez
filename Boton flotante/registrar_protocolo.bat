@echo off
:: Este script registra el protocolo ajedrez:// en Windows para que apunte a EJECUTAR.bat
:: Haz clic derecho en este archivo y selecciona "Ejecutar como administrador"

echo Registrando el protocolo ajedrez:// en Windows...

set "EJECUTABLE=%~dp0..\EJECUTAR.bat"
:: Reemplazar barras invertidas simples por dobles para el registro de Windows
set "EJECUTABLE=%EJECUTABLE:\=\\%"

:: Crear archivo de registro temporal
set "REGFILE=%TEMP%\ajedrez_protocol.reg"

echo Windows Registry Editor Version 5.00 > "%REGFILE%"
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
echo @="\"%EJECUTABLE%\" \"%%1\"" >> "%REGFILE%"

:: Importar el archivo de registro silenciosamente
regedit /s "%REGFILE%"

del "%REGFILE%"

echo.
echo ========================================================
echo ¡Protocolo registrado exitosamente!
echo Ahora Tampermonkey podra despertar tu EJECUTAR.bat local.
echo ========================================================
echo.
pause
