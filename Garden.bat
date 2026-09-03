@echo off
setlocal EnableExtensions
chcp 65001 >nul
cls
title Garden
cd /d "%~dp0"

rem Постоянные данные Garden хранятся отдельно от приложения.
set "DESKTOP_DIR="
for /f "usebackq delims=" %%D in (`powershell.exe -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP_DIR=%%D"
if not defined DESKTOP_DIR set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "GARDEN_DATA_DIR=%DESKTOP_DIR%\GardenData"
if not exist "%GARDEN_DATA_DIR%" mkdir "%GARDEN_DATA_DIR%" >nul 2>nul

echo.
echo   Garden — запуск
echo   ==============================
echo.

rem Проверяем Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo   [ОШИБКА] Node.js не найден в PATH.
  echo.
  echo   Установите современный Node.js 22 LTS или новее:
  echo   https://nodejs.org/
  echo.
  goto :fail
)

for /f "delims=" %%V in ('node -v 2^>nul') do set "NODE_VERSION=%%V"
echo   Node.js: %NODE_VERSION%

rem Проверяем именно нужную возможность вместо жесткой проверки номера версии.
node -e "try{require('node:sqlite');process.exit(0)}catch(e){console.error(e.message);process.exit(1)}" >nul 2>nul
if errorlevel 1 (
  echo   [ОШИБКА] В этой версии Node.js нет встроенного node:sqlite.
  echo   Для Garden нужен Node.js 22.5+; рекомендуется актуальный Node.js 22 LTS.
  echo.
  goto :fail
)

echo   SQLite: OK

rem Устанавливаем Express только если он действительно отсутствует.
if not exist "node_modules\express\package.json" (
  echo.
  echo   Express не найден. Устанавливаю зависимости...

  where npm >nul 2>nul
  if errorlevel 1 (
    echo   [ОШИБКА] npm не найден в PATH.
    echo   Переустановите Node.js вместе с npm.
    echo.
    goto :fail
  )

  call npm install --no-audit --no-fund
  title Garden
  if errorlevel 1 (
    echo.
    echo   [ОШИБКА] npm install завершился с ошибкой.
    echo   Проверьте интернет / proxy и текст ошибки выше.
    echo.
    goto :fail
  )
)

echo   Dependencies: OK
echo.
echo   Запускаю Garden: http://127.0.0.1:4173
echo   Для команды: http://IP-ЭТОГО-КОМПЬЮТЕРА:4173
echo   База: %GARDEN_DATA_DIR%\garden.sqlite
echo   Забыли пароль администратора: Reset-admin-password.bat
echo   Для остановки закройте это окно или нажмите Ctrl+C.
echo.

rem Браузер откроется отдельно; сервер остается в этом окне и показывает ошибки.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173'"

node server\index.js
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo   [ОШИБКА] Сервер Garden завершился с кодом %EXIT_CODE%.
) else (
  echo   Сервер Garden остановлен.
)
echo.
pause
exit /b %EXIT_CODE%

:fail
echo   Запуск Garden невозможен. Сообщение выше содержит причину.
echo.
pause
exit /b 1
