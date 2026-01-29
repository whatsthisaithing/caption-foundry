@echo off
setlocal enabledelayedexpansion

echo.
echo ========================================
echo   CaptionForge - Update
echo ========================================
echo.

:: Check if git is available
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed or not in PATH
    echo Please install Git from https://git-scm.com
    pause
    exit /b 1
)

:: Pull latest changes
echo [INFO] Pulling latest changes from git...
git pull
if errorlevel 1 (
    echo [ERROR] Failed to pull changes from git
    echo Please resolve any conflicts and try again
    pause
    exit /b 1
)
echo [OK] Git pull completed

:: Check if venv exists
if not exist "venv" (
    echo [ERROR] Virtual environment not found
    echo Please run install.bat first
    pause
    exit /b 1
)

:: Activate venv and update dependencies
echo.
echo [INFO] Activating Python virtual environment...
call venv\Scripts\activate.bat

:: Update pip
echo [INFO] Updating pip...
python -m pip install --upgrade pip
if errorlevel 1 (
    echo [WARNING] Failed to update pip, continuing...
)

:: Update Python dependencies
echo [INFO] Updating Python dependencies...
pip install --upgrade -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to update Python dependencies
    pause
    exit /b 1
)
echo [OK] Python dependencies updated

:: Update Node.js dependencies
echo.
echo [INFO] Updating Node.js dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to update Node.js dependencies
    pause
    exit /b 1
)
echo [OK] Node.js dependencies updated

:: Check for new config options
echo.
echo [INFO] Checking configuration...
if exist "config\settings.yaml.template" (
    if exist "config\settings.yaml" (
        echo [INFO] Config file exists. Check settings.yaml.template for new options.
    ) else (
        echo [INFO] Creating default configuration...
        copy "config\settings.yaml.template" "config\settings.yaml" >nul
        echo [OK] Configuration file created
    )
)

:: Create any missing data directories
echo.
echo [INFO] Ensuring data directories exist...
if not exist "data\thumbnails" mkdir "data\thumbnails"
if not exist "data\exports" mkdir "data\exports"
if not exist "data\logs" mkdir "data\logs"
if not exist "data\caption_jobs" mkdir "data\caption_jobs"
echo [OK] Data directories checked

echo.
echo ========================================
echo   Update Complete!
echo ========================================
echo.
echo To start CaptionForge, run: start.bat
echo.
pause
