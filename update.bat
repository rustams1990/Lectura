@echo off
SETLOCAL EnableDelayedExpansion
title Lectura Updater

echo ===================================================
echo             Lectura Automatic Update
echo ===================================================
echo.

:: 1. Database backup (Mandatory safety step)
if not exist "backups" mkdir "backups"
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=%datetime:~0,8%_%datetime:~8,6%
if "%TIMESTAMP%"=="" set TIMESTAMP=%random%

if exist "local_server_db.sqlite" (
    echo [1/3] Creating database backup...
    copy "local_server_db.sqlite" "backups\db_backup_%TIMESTAMP%.sqlite" >nul
    echo       Saved backup: backups\db_backup_%TIMESTAMP%.sqlite
) else (
    echo [1/3] No local database found yet, skipping backup.
)
echo.

:: 2. Update files (Git or ZIP)
if exist ".git" (
    echo [2/3] Updating files via Git...
    call git pull
    if !ERRORLEVEL! neq 0 (
        echo [WARNING] Git pull encountered conflicts or failed.
    )
) else (
    echo [2/3] Downloading latest update from GitHub...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -Uri 'https://github.com/rustams1990/Lectura/archive/refs/heads/main.zip' -OutFile 'update_temp.zip' -UseBasicParsing; Write-Host 'Download complete.' } catch { Write-Error $_; exit 1 }"
    if exist "update_temp.zip" (
        echo       Extracting files...
        powershell -NoProfile -Command "Expand-Archive -Path 'update_temp.zip' -DestinationPath 'update_extracted' -Force; Copy-Item -Path 'update_extracted\Lectura-main\*' -Destination '.' -Recurse -Force; Remove-Item -Recurse -Force 'update_temp.zip', 'update_extracted'"
        echo       Application files updated successfully!
    ) else (
        echo [!] Automated download failed.
        echo     Manual update: download new release ZIP and transfer your local_server_db.sqlite and .env into it.
    )
)
echo.

:: 3. Update npm dependencies
echo [3/3] Updating dependencies (npm install)...
call npm install

echo.
echo ===================================================
echo            Update completed successfully!
echo   Run run.bat to start the updated application.
echo ===================================================
echo.
pause
