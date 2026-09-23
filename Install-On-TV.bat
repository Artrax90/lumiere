@echo off
chcp 65001 >nul
title Установка Lumiere на Samsung Smart TV

echo ========================================================
echo   Установка Lumiere на Samsung Smart TV (Tizen)
echo ========================================================
echo.

cd /d "%~dp0"
node scratch\install_tv.js %*

echo.
pause
