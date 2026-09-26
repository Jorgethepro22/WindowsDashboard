@echo off
chcp 65001 > nul
echo ========================================================
echo   WindowsDashboard - Compilador a Ejecutable (.exe)
echo ========================================================
echo.

:: Verificar si PyInstaller está instalado
echo [*] Verificando PyInstaller...
python -m pip install pyinstaller

echo.
echo [*] Compilando WindowsDashboard con PyInstaller...
echo.

:: Compilación con PyInstaller
python -m PyInstaller --noconsole --clean --noconfirm ^
    --name "WindowsDashboard" ^
    --add-data "ui;ui" ^
    --add-data "config.json;." ^
    main.py

if %ERRORLEVEL% EQU 0 (
    copy /y config.json dist\WindowsDashboard\ > nul
    echo.
    echo ========================================================
    echo   [OK] Compilacion completada con exito!
    echo   El ejecutable se encuentra en: dist\WindowsDashboard\
    echo ========================================================
) else (
    echo.
    echo [ERROR] Ocurrio un error durante la compilacion.
)

pause
