@echo off
chcp 65001 >nul
title Lumiere Media Server

echo ========================================================
echo   Lumiere Media Server - Запуск
echo ========================================================
echo.

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

:: 1. Проверка и запуск TorrServer
netstat -ano | findstr ":8590" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] TorrServer уже запущен на порту 8590.
) else (
    echo [..] Запуск TorrServer (порт 8590)...
    if not exist "%PROJECT_DIR%torrserver\data" mkdir "%PROJECT_DIR%torrserver\data"
    start "TorrServer" /min "%PROJECT_DIR%torrserver\TorrServer.exe" -p 8590 -d "%PROJECT_DIR%torrserver\data" --dontkill
    timeout /t 2 /nobreak >nul
    echo [OK] TorrServer запущен.
)

:: 2. Проверка и запуск бэкенда Lumiere
netstat -ano | findstr ":3500" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Lumiere Backend уже запущен на порту 3500.
) else (
    echo [..] Запуск Lumiere Backend (порт 3500)...
    cd /d "%PROJECT_DIR%back"
    start "Lumiere Backend" node dist/index.js
    timeout /t 3 /nobreak >nul
    echo [OK] Lumiere Backend запущен.
)

echo.
echo ========================================================
echo   Сервисы активны:
echo   - Web App / Клиенты:  http://localhost:3500
echo   - Smart TV Tizen:     http://localhost:3500/tv/
echo   - TorrServer UI:      http://localhost:8590
echo ========================================================
echo.
pause
