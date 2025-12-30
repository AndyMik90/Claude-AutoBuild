@echo off
REM serve-docs.bat - Start documentation server and open browser (Windows)
REM Usage: scripts\serve-docs.bat

echo Starting Auto-Claude documentation server...

REM Check if we're in the right directory
if not exist "docs\index.html" (
    echo Error: docs\index.html not found.
    echo Please run this script from the project root directory.
    exit /b 1
)

REM Start browser after a short delay (in background)
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

REM Start the server (this will block)
echo.
echo Documentation will open in your browser at http://localhost:3000
echo Press Ctrl+C to stop the server.
echo.
npx serve docs -p 3000
