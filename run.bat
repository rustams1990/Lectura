@echo off
SETLOCAL EnableDelayedExpansion
title Remix Lectura Runner

echo [1/3] Checking environment...

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed! Please install it from https://nodejs.org/
    pause
    exit /b
)

:: Check for node_modules
if not exist "node_modules\" (
    echo [2/3] node_modules not found. Installing dependencies...
    call npm install
) else (
    echo [2/3] node_modules found. Skipping install.
)

:: Check for .env file
if not exist ".env" (
    if exist ".env-1.example" (
        echo [!] .env file missing. Creating from example...
        copy ".env-1.example" ".env"
        echo [!] Created .env from example. PLEASE ADD YOUR GEMINI_API_KEY to it!
    ) else (
        echo [!] Warning: .env file and .env-1.example missing.
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