@echo off
SETLOCAL EnableDelayedExpansion
title Lectura Runner

echo [1/3] Checking environment...

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed! Please install it from https://nodejs.org/
    pause
    exit /b
)

:: Check if Python is installed (required by yt-dlp-exec for YouTube processing)
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    where py >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        echo [WARNING] Python 3 was not detected in PATH.
        echo yt-dlp-exec requires Python 3. If installation fails, please install Python from https://python.org/
        echo and ensure you check "Add python.exe to PATH" during installation.
        echo.
    )
)

:: Check for node_modules and tsx
set NEED_INSTALL=0
if not exist "node_modules\" (
    set NEED_INSTALL=1
) else if not exist "node_modules\tsx\" (
    echo [!] Incomplete node_modules detected (missing tsx). Reinstalling...
    set NEED_INSTALL=1
)

if "!NEED_INSTALL!"=="1" (
    echo [2/3] Installing dependencies...
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo.
        echo ====================================================================
        echo [ERROR] Dependencies installation failed!
        echo.
        echo Common fixes:
        echo 1. If error mentions Python: install Python from https://python.org/
        echo    and check "Add python.exe to PATH" during setup.
        echo 2. Or install without native scripts: npm install --ignore-scripts
        echo.
        echo Tip: Delete the incomplete "node_modules" folder before retrying.
        echo ====================================================================
        pause
        exit /b
    )
) else (
    echo [2/3] node_modules found. Skipping install.
)

:: Check for .env file
if not exist ".env" (
    if exist ".env.example" (
        echo [!] .env file missing. Creating from example...
        copy ".env.example" ".env"
        echo [!] Created .env from example. PLEASE ADD YOUR GEMINI_API_KEY to it!
    ) else (
        echo [!] Warning: .env file and .env.example missing.
    )
)

echo [3/3] Starting server...
echo.
echo ========================================
echo   Server will be available at:
echo   http://localhost:3000
echo ========================================
echo.

call npm run dev

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Server crashed or failed to start.
    echo Check if port 3000 is already in use.
    pause
)

pause