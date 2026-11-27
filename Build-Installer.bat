@echo off
cd /d "%~dp0"
echo Installing (needs internet, first time only)...
call npm install
if errorlevel 1 goto err
echo Building installer...
call npm run build
if errorlevel 1 goto err
echo.
echo DONE. Your installer is in the "dist" folder.
start "" dist
pause
exit /b
:err
echo Something failed. Take a photo of this screen and send it to me.
pause
