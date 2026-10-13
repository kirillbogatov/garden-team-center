@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Garden - Reset admin password

set "DESKTOP_DIR="
for /f "usebackq delims=" %%D in (`powershell.exe -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP_DIR=%%D"
if not defined DESKTOP_DIR set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "GARDEN_DATA_DIR=%DESKTOP_DIR%\GardenData"
if not exist "%GARDEN_DATA_DIR%" mkdir "%GARDEN_DATA_DIR%" >nul 2>nul

echo.
echo   Garden - reset admin password
echo   =============================
echo.

where node.exe >nul 2>nul
if errorlevel 1 goto node_missing

set "OUT=%TEMP%\garden-admin-reset-%RANDOM%-%RANDOM%.txt"
node.exe --no-warnings server\reset-admin-password.js > "%OUT%" 2>&1
set "CODE=%ERRORLEVEL%"

findstr /b /c:"RESET_OK" "%OUT%" >nul
if not errorlevel 1 goto success

findstr /b /c:"MULTIPLE_ADMINS" "%OUT%" >nul
if not errorlevel 1 goto multiple

echo   Password reset failed.
echo.
type "%OUT%"
del "%OUT%" >nul 2>nul
echo.
pause
exit /b %CODE%

:multiple
echo   Multiple administrators were found:
echo.
for /f "skip=1 tokens=1,* delims=	" %%A in ('type "%OUT%"') do echo     %%A  %%B
echo.
set /p "ADMIN_LOGIN=Enter administrator login: "
if "%ADMIN_LOGIN%"=="" goto cancelled
node.exe --no-warnings server\reset-admin-password.js "%ADMIN_LOGIN%" > "%OUT%" 2>&1
findstr /b /c:"RESET_OK" "%OUT%" >nul
if errorlevel 1 goto reset_failed

goto success

:success
set "LOGIN="
set "PASSWORD="
for /f "skip=1 tokens=*" %%A in ('type "%OUT%"') do call :capture_line "%%A"
del "%OUT%" >nul 2>nul

echo   A temporary password was created.
echo.
echo   Login:    %LOGIN%
echo   Password: %PASSWORD%
echo.
echo   Copy the password now. Garden will ask you to change it after sign-in.
echo.
pause
exit /b 0

:capture_line
if not defined LOGIN (
  set "LOGIN=%~1"
  exit /b 0
)
if not defined PASSWORD set "PASSWORD=%~1"
exit /b 0

:cancelled
del "%OUT%" >nul 2>nul
exit /b 1

:reset_failed
echo.
echo   Password reset failed.
type "%OUT%"
del "%OUT%" >nul 2>nul
echo.
pause
exit /b 1

:node_missing
echo   ERROR: Node.js was not found in PATH.
echo.
pause
exit /b 1
