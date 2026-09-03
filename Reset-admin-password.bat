@echo off
setlocal EnableExtensions
chcp 65001 >nul
cls
title Garden - Reset admin password
cd /d "%~dp0"

rem Постоянные данные Garden хранятся отдельно от приложения.
set "DESKTOP_DIR="
for /f "usebackq delims=" %%D in (`powershell.exe -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP_DIR=%%D"
if not defined DESKTOP_DIR set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "GARDEN_DATA_DIR=%DESKTOP_DIR%\GardenData"
if not exist "%GARDEN_DATA_DIR%" mkdir "%GARDEN_DATA_DIR%" >nul 2>nul

echo.
echo   Garden - сброс пароля администратора
echo   =====================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [ОШИБКА] Node.js не найден в PATH.
  echo.
  pause
  exit /b 1
)

set "OUT=%TEMP%\garden-admin-reset-%RANDOM%-%RANDOM%.txt"
node --no-warnings server\reset-admin-password.js > "%OUT%" 2>&1
set "CODE=%ERRORLEVEL%"

findstr /b /c:"RESET_OK" "%OUT%" >nul
if not errorlevel 1 goto :success

findstr /b /c:"MULTIPLE_ADMINS" "%OUT%" >nul
if not errorlevel 1 goto :multiple

echo   Не удалось сбросить пароль.
echo.
type "%OUT%"
del "%OUT%" >nul 2>nul
echo.
pause
exit /b %CODE%

:multiple
echo   Найдено несколько администраторов:
echo.
for /f "skip=1 tokens=1,* delims=	" %%A in ('type "%OUT%"') do echo     %%A  %%B
echo.
set /p "ADMIN_LOGIN=Введите логин администратора: "
if "%ADMIN_LOGIN%"=="" (
  del "%OUT%" >nul 2>nul
  exit /b 1
)
node --no-warnings server\reset-admin-password.js "%ADMIN_LOGIN%" > "%OUT%" 2>&1
findstr /b /c:"RESET_OK" "%OUT%" >nul
if errorlevel 1 (
  echo.
  echo   Не удалось сбросить пароль.
  type "%OUT%"
  del "%OUT%" >nul 2>nul
  echo.
  pause
  exit /b 1
)

:success
set "LOGIN="
set "PASSWORD="
for /f "skip=1 tokens=*" %%A in ('type "%OUT%"') do (
  if not defined LOGIN (
    set "LOGIN=%%A"
  ) else if not defined PASSWORD (
    set "PASSWORD=%%A"
  )
)
del "%OUT%" >nul 2>nul

echo   Новый временный пароль создан.
echo.
echo   Логин:  %LOGIN%
echo   Пароль: %PASSWORD%
echo.
echo   Скопируйте пароль сейчас. После входа Garden попросит его сменить.
echo   Все старые сессии этого администратора завершены.
echo.
pause
exit /b 0
