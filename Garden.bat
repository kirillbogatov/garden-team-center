@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Garden

rem Keep persistent Garden data outside the application folder.
set "DESKTOP_DIR="
for /f "usebackq delims=" %%D in (`powershell.exe -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP_DIR=%%D"
if not defined DESKTOP_DIR set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "GARDEN_DATA_DIR=%DESKTOP_DIR%\GardenData"
if not exist "%GARDEN_DATA_DIR%" mkdir "%GARDEN_DATA_DIR%" >nul 2>nul

echo.
echo   Garden startup
echo   ==============
echo.

where node.exe >nul 2>nul
if errorlevel 1 goto node_missing

for /f "delims=" %%V in ('node.exe -v 2^>nul') do set "NODE_VERSION=%%V"
echo   Node.js: %NODE_VERSION%

rem Garden requires the built-in node:sqlite module. Checking the capability is
rem more reliable than parsing a Node version number.
node.exe -e "try{require('node:sqlite');process.exit(0)}catch(e){process.exit(1)}" >nul 2>nul
if errorlevel 1 goto sqlite_missing

echo   SQLite: OK

where npm.cmd >nul 2>nul
if errorlevel 1 goto npm_missing

if not exist "node_modules\react\package.json" goto install_dependencies
if not exist "node_modules\vite\package.json" goto install_dependencies
if not exist "node_modules\@radix-ui\react-dialog\package.json" goto install_dependencies
goto dependencies_ready

:install_dependencies
echo.
echo   Installing React, Radix and Vite dependencies...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 goto install_failed
title Garden

:dependencies_ready
echo   Dependencies: OK

echo.
echo   Building Garden UI...
call npm.cmd run build
if errorlevel 1 goto build_failed
title Garden

:ui_ready
echo   UI build: OK
echo.
echo   Garden: http://127.0.0.1:4173
echo   Data:   %GARDEN_DATA_DIR%\garden.sqlite
echo   Close this window or press Ctrl+C to stop Garden.
echo.

rem Open the browser after the server has had a moment to start.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173'"

node.exe server\index.js
set "EXIT_CODE=%ERRORLEVEL%"
if not defined EXIT_CODE set "EXIT_CODE=1"

echo.
if "%EXIT_CODE%"=="0" goto server_stopped

echo   ERROR: Garden server exited with code %EXIT_CODE%.
echo.
pause
exit /b %EXIT_CODE%

:server_stopped
echo   Garden server stopped.
echo.
pause
exit /b 0

:node_missing
echo   ERROR: Node.js was not found in PATH.
echo   Install a current Node.js LTS release from https://nodejs.org/
goto fail

:sqlite_missing
echo   ERROR: This Node.js installation does not provide node:sqlite.
echo   Install a current Node.js LTS release, then run Garden.bat again.
goto fail

:npm_missing
echo   ERROR: npm.cmd was not found in PATH.
echo   Reinstall Node.js with npm included.
goto fail

:install_failed
echo.
echo   ERROR: npm install failed.
echo   Check the npm error above, your internet connection, and any proxy settings.
goto fail

:build_failed
echo.
echo   ERROR: npm run build failed.
echo   Check the build error above.
goto fail

:fail
echo.
echo   Garden could not start.
echo.
pause
exit /b 1
