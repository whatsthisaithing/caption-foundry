# CaptionForge - LORA Dataset Management System

**Project Name**: CaptionForge  
**Version**: 1.0  
**Date**: January 28, 2026  
**Status**: Active Development  
**Priority**: High  
**Type**: Desktop Application (Electron)

---

## Table of Contents

1. [Overview](#overview)
2. [Goals & Motivations](#goals--motivations)
3. [Architecture Design](#architecture-design)
4. [Database Schema](#database-schema)
5. [Vision System Integration](#vision-system-integration)
6. [API Design](#api-design)
7. [UI Design](#ui-design)
8. [Export System](#export-system)
9. [Implementation Phases](#implementation-phases)
10. [Testing Checklist](#testing-checklist)
11. [Future Enhancements](#future-enhancements)

---

## Overview

A standalone desktop application for managing image/video datasets used for training LORAs with visual models (Flux, SD 3.x, LTX2, Hunyuan, etc.). Provides virtual dataset organization, multi-style captioning, automated caption generation via vision models, and flexible export capabilities.

### Key Features
- **Virtual Dataset Management**: Track images anywhere on disk without copying
- **Multi-Caption Sets**: Create multiple caption styles per dataset (natural language, detailed, tags, etc.)
- **Trigger Phrase Support**: Set caption prefixes per caption set for LORA trigger words (e.g., "Nova Chorus, a woman")
- **Auto-Captioning**: Generate captions using vision models (Ollama-based, extensible)
- **Quality Scoring**: Automatic quality assessment for filtering and weighting
- **Flexible Export**: Export with numbering, format conversion, and resolution adjustment
- **Caption Import**: Auto-detect and import existing caption files
- **Background Processing**: Pause/resume caption generation, recoverable on crash
- **Native File Dialogs**: Full filesystem access via Electron for drag-and-drop folder selection

### Technical Stack
- **Desktop Shell**: Electron (native window with Chromium webview)
- **Backend**: Python + FastAPI (async, proven architecture)
- **Frontend**: HTML/JavaScript + Bootstrap (simple, no build step required)
- **Database**: SQLite (portable, single-file, sufficient for local use)
- **Vision**: Ollama + LM Studio backends with Qwen3-VL family models

### Why Electron?
- **Native filesystem access**: Real folder pickers and drag-and-drop with full `file.path`
- **Chromium consistency**: Same rendering engine across all platforms
- **Mature ecosystem**: Extensive documentation and community support
- **IPC for native features**: Secure context bridge for file dialogs and path access
- **Cross-platform**: Windows, macOS, Linux with native installers

---

## Goals & Motivations

### Primary Goals
1. **Eliminate tedious manual work**: Reduce 4+ hours of dataset prep to < 1 hour
2. **Maintain flexibility**: Non-destructive operations, multiple caption styles
3. **Quality assurance**: Automated quality scoring for curation
4. **Training optimization**: Export in formats compatible with popular trainers
5. **Local-first**: 100% locally hosted, no cloud dependencies, no authentication

### Use Cases
- **LORA trainer**: Prepare 500-image character dataset with natural language captions
- **Style transfer**: Organize 1000+ images across folders, tag-based captions
- **Fine-tuning**: Curate high-quality subset based on automated quality scores
- **Multi-style training**: Same images, different caption approaches for comparison
- **Existing dataset enhancement**: Import existing captions, improve with vision model

### Non-Goals
- ❌ Multi-user collaboration or authentication
- ❌ Budget management or usage tracking
- ❌ Cloud storage or remote datasets
- ❌ Training execution (prepare data only)
- ❌ Video processing (Phase 2+ feature)

---

## Architecture Design

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    PyWebView Desktop Shell                   │
│   (Chromium webview + Node.js, IPC for file dialogs)         │
├─────────────────────────────────────────────────────────────┤
│                 HTML/JS + Bootstrap Frontend                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Dataset  │  │  Image   │  │ Caption  │  │  Export  │   │
│  │ Manager  │  │  Grid    │  │  Editor  │  │ Manager  │   │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘   │
└────────┼─────────────┼─────────────┼─────────────┼─────────┘
         │             │             │             │
         └─────────────┴─────────────┴─────────────┘
                       │ REST API + JS API Bridge
┌─────────────────────▼─────────────────────────────────────┐
│                  FastAPI Backend                           │
│  ┌────────────────────────────────────────────────────┐   │
│  │              API Routes Layer                       │   │
│  │  /folders  /datasets  /captions  /export  /vision  │   │
│  └────────────────┬───────────────────────────────────┘   │
│                   │                                         │
│  ┌────────────────▼───────────────────────────────────┐   │
│  │            Services Layer                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │ Dataset  │ │ Caption  │ │ Vision   │           │   │
│  │  │ Service  │ │ Service  │ │ Service  │           │   │
│  │  └──────────┘ └──────────┘ └─────┬────┘           │   │
│  │  ┌──────────┐ ┌──────────┐       │                │   │
│  │  │  Folder  │ │  Export  │       │                │   │
│  │  │ Service  │ │ Service  │       │                │   │
│  │  └──────────┘ └──────────┘       │                │   │
│  └───────────────────────────────────┼────────────────┘   │
│                                      │                     │
│  ┌───────────────────────────────────▼────────────────┐   │
│  │              Ollama Integration                     │   │
│  │   (Vision Model Inference - Qwen3-VL family)       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
    ┌────▼────┐              ┌──────▼──────┐
    │ SQLite  │              │ File System │
    │Database │              │ (Original   │
    │         │              │  Files)     │
    └─────────┘              └─────────────┘
```

### Project Structure

```
captionforge/
├── electron/
│   ├── main.js                    # Electron main process (spawns Python backend)
│   └── preload.js                 # Context bridge for secure IPC
│
├── backend/
│   ├── __init__.py                # Package marker
│   ├── main.py                    # FastAPI application entry
│   ├── config.py                  # Configuration management
│   ├── database.py                # Database session management
│   ├── models.py                  # SQLAlchemy ORM models
│   ├── schemas.py                 # Pydantic models for API validation
│   │
│   ├── services/
│   │   ├── __init__.py            # Package marker with exports
│   │   ├── folder_service.py      # Track folders and scan files
│   │   ├── dataset_service.py     # Dataset CRUD operations
│   │   ├── caption_service.py     # Caption management
│   │   ├── vision_service.py      # Vision model integration (Ollama + LM Studio)
│   │   ├── export_service.py      # Export datasets with processing
│   │   └── thumbnail_service.py   # Thumbnail generation/caching (256px)
│   │
│   ├── api/
│   │   ├── __init__.py            # Package marker with router exports
│   │   ├── folders.py             # Folder tracking endpoints
│   │   ├── datasets.py            # Dataset management endpoints
│   │   ├── captions.py            # Caption CRUD endpoints
│   │   ├── vision.py              # Vision/auto-caption endpoints
│   │   ├── files.py               # File/image/thumbnail serving endpoints
│   │   └── export.py              # Export endpoints
│   │
│   └── utils/
│       ├── __init__.py            # Package marker
│       ├── file_utils.py          # File operations, hashing
│       ├── image_utils.py         # Image processing (resize, convert)
│       └── caption_utils.py       # Caption parsing/pairing
│
├── frontend/
│   ├── index.html                 # Main HTML page (served by FastAPI)
│   ├── css/
│   │   └── styles.css             # Custom styles (Bootstrap loaded via CDN)
│   └── js/
│       ├── app.js                 # Main application logic
│       ├── api.js                 # API client wrapper
│       ├── datasets.js            # Dataset management UI
│       ├── imageGrid.js           # Image grid component
│       ├── captionEditor.js       # Caption editor component
│       ├── folderManager.js       # Folder tracking UI
│       ├── exportModal.js         # Export configuration modal
│       ├── visionSettings.js      # Vision model configuration
│       └── progressMonitor.js     # Caption generation progress
│
├── data/
│   ├── database.db                # SQLite database
│   ├── thumbnails/                # Cached thumbnails (256px, hash-named)
│   ├── exports/                   # Temporary export staging
│   └── caption_jobs/              # Persistent job state (recovery)
│
├── config/
│   ├── settings.yaml              # Application configuration
│   └── settings.yaml.template     # Configuration template
│
├── app.py                         # PyWebView desktop launcher
├── requirements.txt               # Python dependencies (includes pywebview)
├── README.md
├── .gitignore
│
├── install.bat                    # Windows installation script
├── install.sh                     # Linux/macOS installation script
├── start_app.bat                  # Windows desktop app launcher (recommended)
├── start_app.sh                   # Linux/macOS desktop app launcher
├── start.bat                      # Windows server-only startup
├── start.sh                       # Linux/macOS server-only startup
└── update.bat / update.sh         # Update scripts
```

---

## Installation & Deployment

### Python Virtual Environment Strategy

**Pattern**: Based on Chorus Engine's Discord Bridge implementation - self-contained, portable Python venv.

CaptionForge uses a **self-contained virtual environment** approach for maximum portability and ease of deployment:

- **Virtual environment in `.venv/`**: All Python dependencies installed locally
- **Cross-platform scripts**: Batch files for Windows, shell scripts for Linux/macOS
- **No system pollution**: Python packages isolated from system Python
- **Portable**: Entire project folder can be copied/moved without breaking
- **Simple updates**: `update.bat` / `update.sh` pulls latest code and updates dependencies

### Installation Scripts

#### `install.bat` (Windows)

```batch
@echo off
REM CaptionForge - Windows Installation Script
REM Creates a self-contained virtual environment for portability

echo ============================================
echo  CaptionForge - Installation (Windows)
echo ============================================
echo.
echo This application is PORTABLE - you can copy this folder
echo anywhere and it will work independently.
echo.

REM Stay in project directory
cd /d "%~dp0"

REM Check for Python on PATH
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found on PATH!
    echo.
    echo Please install Python 3.10 or newer:
    echo   https://www.python.org/downloads/
    echo.
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

REM Check Python version
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo [OK] Found Python %PYTHON_VERSION%
echo.

REM Create virtual environment in .venv folder
if exist .venv (
    echo [INFO] Virtual environment already exists
) else (
    echo [1/5] Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created
)
echo.

REM Activate virtual environment and install backend dependencies
echo [2/5] Installing backend dependencies...
echo.
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies
    pause
    exit /b 1
)
echo [OK] Backend dependencies installed
echo.

REM Initialize database
echo [3/4] Initializing database...
.venv\Scripts\python.exe -c "from backend.models import Base; from backend.config import engine; Base.metadata.create_all(engine)"
if errorlevel 1 (
    echo [ERROR] Failed to initialize database
    pause
    exit /b 1
)
echo [OK] Database initialized
echo.

REM Create data directories
echo [4/4] Creating data directories...
if not exist data mkdir data
if not exist data\thumbnails mkdir data\thumbnails
if not exist data\exports mkdir data\exports
if not exist data\caption_jobs mkdir data\caption_jobs
echo [OK] Data directories created
echo.

REM Create config from template if needed
if not exist config\settings.yaml (
    echo [INFO] Creating default configuration...
    copy config\settings.yaml.template config\settings.yaml
    echo [OK] Configuration created at config\settings.yaml
    echo      Please review and customize settings before starting.
    echo.
)

echo ============================================
echo  Installation Complete!
echo ============================================
echo.
echo Next steps:
echo   1. Review config\settings.yaml
echo   2. Run start.bat to launch CaptionForge
echo.
pause
```

#### `install.sh` (Linux/macOS)

```bash
#!/bin/bash
# CaptionForge - Linux/Mac Installation Script
# Creates a self-contained virtual environment for portability

echo "============================================"
echo " CaptionForge - Installation (Linux/Mac)"
echo "============================================"
echo ""
echo "This application is PORTABLE - you can copy this folder"
echo "anywhere and it will work independently."
echo ""

# Stay in project directory
cd "$(dirname "$0")"

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 not found!"
    echo ""
    echo "Please install Python 3.10 or newer:"
    echo "  https://www.python.org/downloads/"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "[OK] Found Python $PYTHON_VERSION"
echo ""

# Create virtual environment in .venv folder
if [ -d ".venv" ]; then
    echo "[INFO] Virtual environment already exists"
else
    echo "[1/5] Creating virtual environment..."
    python3 -m venv .venv
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to create virtual environment"
        exit 1
    fi
    echo "[OK] Virtual environment created"
fi
echo ""

# Activate virtual environment and install backend dependencies
echo "[2/5] Installing backend dependencies..."
echo ""
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install backend dependencies"
    exit 1
fi
echo "[OK] Backend dependencies installed"
echo ""

# Initialize database
echo "[3/4] Initializing database..."
.venv/bin/python -c "from backend.models import Base; from backend.config import engine; Base.metadata.create_all(engine)"
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to initialize database"
    exit 1
fi
echo "[OK] Database initialized"
echo ""

# Create data directories
echo "[4/4] Creating data directories..."
mkdir -p data/thumbnails data/exports data/caption_jobs
echo "[OK] Data directories created"
echo ""

# Create config from template if needed
if [ ! -f "config/settings.yaml" ]; then
    echo "[INFO] Creating default configuration..."
    cp config/settings.yaml.template config/settings.yaml
    echo "[OK] Configuration created at config/settings.yaml"
    echo "     Please review and customize settings before starting."
    echo ""
fi

echo "============================================"
echo " Installation Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Review config/settings.yaml"
echo "  2. Run ./start.sh to launch CaptionForge"
echo ""
```

### Startup Scripts

CaptionForge can be launched in two modes:

1. **Desktop Mode** (`start_app.bat` / `start_app.sh`) - Recommended for most users
   - Opens as a native desktop application window
   - Provides native file/folder dialogs for easy browsing
   - No need to open a browser manually

2. **Server Mode** (`start.bat` / `start.sh`) - For advanced users
   - Runs the API server only
   - Access via browser at http://localhost:8000
   - Useful for remote access or debugging

#### `start_app.bat` (Windows Desktop Mode)

```batch
@echo off
setlocal enabledelayedexpansion
REM CaptionForge - Windows Desktop Application Launcher

echo ============================================
echo   CaptionForge - Desktop Application
echo ============================================
echo.

cd /d "%~dp0"

if not exist "venv" (
    echo [ERROR] Virtual environment not found
    echo Please run install.bat first
    pause
    exit /b 1
)

call venv\Scripts\activate.bat

if not exist "config\settings.yaml" (
    echo [WARNING] Configuration file not found
    echo Copying template...
    copy "config\settings.yaml.template" "config\settings.yaml" >nul
)

echo [INFO] Starting CaptionForge Desktop...
echo.

python app.py
pause
```

#### `start.bat` (Windows Server Mode)

```batch
@echo off
REM CaptionForge - Windows Startup Script

echo ============================================
echo    CaptionForge - Starting Up
echo ============================================
echo.

REM Stay in project directory
cd /d "%~dp0"

REM Check for virtual environment
if not exist .venv\Scripts\python.exe (
    echo [ERROR] Virtual environment not found!
    echo.
    echo Please run the installation script first:
    echo   install.bat
    echo.
    pause
    exit /b 1
)

echo [OK] Using virtual environment
echo.

REM Check for config
if not exist config\settings.yaml (
    echo [ERROR] Configuration not found!
    echo.
    echo Please run the installation script first:
    echo   install.bat
    echo.
    pause
    exit /b 1
)

echo [OK] Configuration found
echo.

REM Start backend server
echo [INFO] Starting CaptionForge backend...
echo       API: http://localhost:8000
echo       Press Ctrl+C to stop
echo.

.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

#### `start.sh` (Linux/macOS)

```bash
#!/bin/bash
# CaptionForge - Linux/Mac Startup Script

echo "============================================"
echo "   CaptionForge - Starting Up"
echo "============================================"
echo ""

# Stay in project directory
cd "$(dirname "$0")"

# Check for virtual environment
if [ ! -d ".venv" ]; then
    echo "[ERROR] Virtual environment not found!"
    echo ""
    echo "Please run the installation script first:"
    echo "  ./install.sh"
    echo ""
    exit 1
fi

# Activate virtual environment
source .venv/bin/activate
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to activate virtual environment"
    exit 1
fi

echo "[OK] Using virtual environment"
echo ""

# Check for config
if [ ! -f "config/settings.yaml" ]; then
    echo "[ERROR] Configuration not found!"
    echo ""
    echo "Please run the installation script first:"
    echo "  ./install.sh"
    echo ""
    exit 1
fi

echo "[OK] Configuration found"
echo ""

# Start backend server
echo "[INFO] Starting CaptionForge backend..."
echo "       API: http://localhost:8000"
echo "       Press Ctrl+C to stop"
echo ""

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Update Scripts

#### `update.bat` (Windows)

```batch
@echo off
REM CaptionForge - Windows Update Script

echo ============================================
echo    CaptionForge - Update
echo ============================================
echo.

cd /d "%~dp0"

REM Pull latest code (if git repo)
if exist .git (
    echo [1/3] Pulling latest code...
    git pull
    if errorlevel 1 (
        echo [ERROR] Failed to pull latest code
        pause
        exit /b 1
    )
    echo [OK] Code updated
    echo.
)

REM Update backend dependencies
echo [2/2] Updating backend dependencies...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt --upgrade
echo [OK] Backend dependencies updated
echo.

echo ============================================
echo  Update Complete!
echo ============================================
echo.
echo Run start.bat to launch CaptionForge
echo.
pause
```

#### `update.sh` (Linux/macOS)

```bash
#!/bin/bash
# CaptionForge - Linux/Mac Update Script

echo "============================================"
echo "   CaptionForge - Update"
echo "============================================"
echo ""

cd "$(dirname "$0")"

# Pull latest code (if git repo)
if [ -d ".git" ]; then
    echo "[1/3] Pulling latest code..."
    git pull
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to pull latest code"
        exit 1
    fi
    echo "[OK] Code updated"
    echo ""
fi

# Update backend dependencies
echo "[2/2] Updating backend dependencies..."
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt --upgrade
echo "[OK] Backend dependencies updated"
echo ""

echo "============================================"
echo " Update Complete!"
echo "============================================"
echo ""
echo "Run ./start.sh to launch CaptionForge"
echo ""
```

### Key Design Principles

**Portability** (from Discord Bridge pattern):
- All dependencies in `.venv/` folder
- No system-wide Python package installation
- Entire folder can be copied/moved
- Works independently of other Python projects

**Simplicity**:
- Double-click installation (Windows: `install.bat`, Linux/macOS: `./install.sh`)
- Double-click startup (Windows: `start.bat`, Linux/macOS: `./start.sh`)
- No complex configuration required for basic usage
- Clear error messages with actionable suggestions

**Cross-Platform**:
- Identical functionality on Windows and Linux/macOS
- Platform-specific paths handled automatically
- Same user experience across platforms

**Update Safety**:
- `update.bat` / `update.sh` handles dependency updates
- Preserves user configuration files
- Git integration for code updates (if cloned)

---

## Database Schema

### Database Design Philosophy

**Abstraction Layer**: While SQLite is the perfect choice for this local-first application, all database access is abstracted through SQLAlchemy ORM. This provides flexibility for future evolution without architectural changes.

**Key Principles**:
- **Avoid SQLite-specific SQL**: Use standard SQL features and SQLAlchemy constructs
- **Service layer encapsulation**: All database operations go through service classes, never direct queries in API routes
- **Migration support**: Alembic for schema evolution with forward compatibility
- **Future-proof**: Architecture supports swapping to PostgreSQL/other databases if needed, though SQLite will likely remain the default

### Caption Data Model Architecture

CaptionForge uses a **two-tier caption architecture** to separate source captions from working captions:

#### Imported Captions (Read-Only Reference)
- **Location**: `tracked_files.imported_caption`
- **Purpose**: Stores the original caption text from paired `.txt` files found during folder scanning
- **Behavior**: **READ-ONLY** - never modified after import
- **Use case**: Reference material when editing captions; can be copied to caption sets as a starting point
- **UI**: Displayed in Folders tab image details as a read-only reference

#### Caption Set Captions (Editable Working Copy)
- **Location**: `captions` table (linked via `caption_set_id` and `file_id`)
- **Purpose**: User-editable captions for training export
- **Behavior**: Full CRUD operations - create, edit, regenerate, delete
- **Use case**: The actual captions used in dataset exports
- **UI**: Displayed and edited in Datasets tab caption editor

#### Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FOLDER SCANNING                              │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  tracked_files.imported_caption                                      │
│  ─────────────────────────────                                       │
│  • Auto-populated from paired .txt files                             │
│  • READ-ONLY after import                                            │
│  • Shown in Folders tab (reference only)                             │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  ▼                              ▼
    ┌──────────────────────┐      ┌──────────────────────┐
    │  Caption Set A       │      │  Caption Set B       │
    │  (Natural Language)  │      │  (Tags)              │
    │  ─────────────────── │      │  ─────────────────── │
    │  captions table      │      │  captions table      │
    │  • Initialized from  │      │  • Initialized from  │
    │    imported_caption  │      │    vision model      │
    │    (optional)        │      │                      │
    │  • EDITABLE          │      │  • EDITABLE          │
    └──────────────────────┘      └──────────────────────┘
                  │                              │
                  └──────────────┬──────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           EXPORT                                     │
│  Uses captions from selected Caption Set only                        │
└─────────────────────────────────────────────────────────────────────┘
```

#### UI Tab Behavior

| Tab      | View Type         | Caption Source                    | Editable? |
|----------|-------------------|-----------------------------------|-----------|
| Folders  | Image Details     | `tracked_files.imported_caption`  | No        |
| Datasets | Caption Editor    | `captions` table (per caption set)| Yes       |

#### API Endpoints

| Endpoint | Purpose | Caption Source |
|----------|---------|----------------|
| `GET /files/{id}` | Get file details with imported caption | `tracked_files.imported_caption` |
| `GET /caption-sets/{id}/files/{file_id}` | Get caption for file in caption set | `captions` table + imported reference |
| `POST /caption-sets/{id}/captions` | Create/update caption in set | `captions` table |

### Trigger Phrase / Caption Prefix Feature

**Purpose**: LORA training often requires a consistent trigger word or phrase at the start of every caption to associate the trained concept. CaptionForge supports this natively via the "Trigger Phrase" field on caption sets.

#### How It Works

1. **Configuration**: When creating or editing a caption set, set the "Trigger Phrase" field (e.g., `Nova Chorus, a woman`)

2. **Auto-Generation**: When generating captions via the vision model:
   - The prompt instructs the model to start the caption with the trigger phrase
   - Post-processing ensures the caption starts with the trigger (fallback prepend if needed)
   
3. **Manual Editing**: When manually writing captions, the trigger phrase is shown as guidance but not auto-inserted (user has full control)

4. **Export**: Captions are exported as-is, including the trigger phrase prefix

#### Example

| Setting | Value |
|---------|-------|
| Trigger Phrase | `Nova Chorus, a woman` |
| Generated Caption | `Nova Chorus, a woman with long dark hair standing in a sunlit garden...` |

#### Implementation Details

- **Database**: `caption_sets.trigger_phrase` column (VARCHAR 500, nullable)
- **API**: Included in `CaptionSetCreate`, `CaptionSetUpdate`, `CaptionSetResponse` schemas
- **Vision Service**: `generate_caption()` accepts trigger_phrase, injects into prompts
- **Frontend**: Input field in both Create and Edit Caption Set modals

### Tables Overview

```
tracked_folders         # Folders being monitored for images
tracked_files          # All discovered image files
datasets               # Virtual dataset collections
dataset_files          # Junction: files in datasets
caption_sets           # Caption collections per dataset
captions               # Individual captions per file per set
caption_jobs           # Background caption generation jobs
export_history         # Log of past exports
```

### Detailed Schema

#### `tracked_folders`

Folders that the user has added for monitoring.

```sql
CREATE TABLE tracked_folders (
    id TEXT PRIMARY KEY,                          -- UUID
    path TEXT NOT NULL UNIQUE,                    -- Absolute path to folder
    name TEXT NOT NULL,                           -- Display name (folder name)
    date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_scanned TIMESTAMP,                       -- Last time folder was scanned
    file_count INTEGER DEFAULT 0,                 -- Cached count of files
    enabled BOOLEAN DEFAULT TRUE,                 -- Can disable without deleting
    recursive BOOLEAN DEFAULT FALSE,              -- Scan subdirectories?
    max_depth INTEGER DEFAULT 3,                  -- Max recursion depth
    notes TEXT,                                   -- User notes
    
    INDEX idx_path (path),
    INDEX idx_enabled (enabled)
);
```

#### `tracked_files`

Individual image files discovered in tracked folders.

```sql
CREATE TABLE tracked_files (
    id TEXT PRIMARY KEY,                          -- UUID
    folder_id TEXT NOT NULL,                      -- Foreign key to tracked_folders
    filename TEXT NOT NULL,                       -- Filename only (no path)
    file_path TEXT NOT NULL UNIQUE,               -- Full absolute path
    file_hash TEXT NOT NULL,                      -- SHA256 hash (for deduplication)
    file_size_mb REAL NOT NULL,                   -- File size in MB
    file_type TEXT NOT NULL,                      -- Extension: jpg, png, webp, gif
    mime_type TEXT,                               -- MIME type
    
    -- Image metadata
    width INTEGER,                                -- Image width in pixels
    height INTEGER,                               -- Image height in pixels
    aspect_ratio REAL,                            -- width / height
    
    -- Timestamps
    date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_modified TIMESTAMP,                      -- Original file modification time
    
    -- Import detection
    has_paired_caption BOOLEAN DEFAULT FALSE,     -- Found .txt file with same name?
    imported_caption TEXT,                        -- Text from paired caption file
    imported_caption_path TEXT,                   -- Path to original caption file
    
    -- Status
    exists BOOLEAN DEFAULT TRUE,                  -- File still exists on disk?
    last_verified TIMESTAMP,                      -- Last time existence was checked
    
    FOREIGN KEY (folder_id) REFERENCES tracked_folders(id) ON DELETE CASCADE,
    
    INDEX idx_folder (folder_id),
    INDEX idx_hash (file_hash),
    INDEX idx_type (file_type),
    INDEX idx_exists (exists)
);
```

#### `datasets`

Virtual collections of images for training.

```sql
CREATE TABLE datasets (
    id TEXT PRIMARY KEY,                          -- UUID
    name TEXT NOT NULL,                           -- User-facing name
    name_filesystem_safe TEXT NOT NULL UNIQUE,    -- Filesystem-safe version
    description TEXT,                             -- User description
    
    -- Metadata
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_count INTEGER DEFAULT 0,                 -- Cached count
    
    -- Organization
    tags TEXT,                                    -- Comma-separated tags
    category TEXT,                                -- Optional category
    
    -- Statistics (cached)
    total_size_mb REAL DEFAULT 0,                 -- Total size of all files
    avg_quality_score REAL,                       -- Average quality across captions
    
    -- Settings
    default_caption_set_id TEXT,                  -- Default caption set to show
    
    notes TEXT,                                   -- User notes
    
    INDEX idx_name (name),
    INDEX idx_name_fs (name_filesystem_safe),
    INDEX idx_created (created_date DESC)
);
```

#### `dataset_files`

Junction table: which files belong to which datasets.

```sql
CREATE TABLE dataset_files (
    id TEXT PRIMARY KEY,                          -- UUID
    dataset_id TEXT NOT NULL,                     -- Foreign key to datasets
    file_id TEXT NOT NULL,                        -- Foreign key to tracked_files
    
    -- Metadata
    date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    order_index INTEGER,                          -- User-defined ordering
    notes TEXT,                                   -- Per-file notes for this dataset
    
    -- Flags
    excluded BOOLEAN DEFAULT FALSE,               -- Temporarily exclude from exports
    
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES tracked_files(id) ON DELETE CASCADE,
    
    UNIQUE (dataset_id, file_id),
    INDEX idx_dataset (dataset_id),
    INDEX idx_file (file_id),
    INDEX idx_order (dataset_id, order_index)
);
```

#### `caption_sets`

Collections of captions for a dataset (e.g., "Natural", "Detailed", "Tags").

```sql
CREATE TABLE caption_sets (
    id TEXT PRIMARY KEY,                          -- UUID
    dataset_id TEXT NOT NULL,                     -- Foreign key to datasets
    name TEXT NOT NULL,                           -- "Natural Language", "Tags", etc.
    description TEXT,                             -- Purpose/notes
    
    -- Style configuration
    style TEXT NOT NULL,                          -- natural_simple, natural_detailed, tags, custom
    max_length INTEGER,                           -- Character limit (null = unlimited)
    trigger_phrase TEXT,                          -- Caption prefix/trigger word (e.g., "Nova Chorus, a woman")
    
    -- Auto-generation settings
    vision_model TEXT,                            -- Model used for generation
    generation_prompt TEXT,                       -- Custom prompt template
    
    -- Metadata
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Statistics
    caption_count INTEGER DEFAULT 0,              -- Cached count of captions
    avg_quality_score REAL,                       -- Average quality in this set
    auto_generated_count INTEGER DEFAULT 0,       -- How many were auto-generated
    manually_edited_count INTEGER DEFAULT 0,      -- How many were manually edited
    
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    
    INDEX idx_dataset (dataset_id),
    INDEX idx_style (style)
);
```

#### `captions`

Individual captions for each file in each caption set.

```sql
CREATE TABLE captions (
    id TEXT PRIMARY KEY,                          -- UUID
    caption_set_id TEXT NOT NULL,                 -- Foreign key to caption_sets
    file_id TEXT NOT NULL,                        -- Foreign key to tracked_files
    
    -- Caption content
    caption_text TEXT NOT NULL,                   -- The actual caption
    
    -- Quality metadata
    quality_score REAL,                           -- 0.0-1.0 overall quality
    quality_details TEXT,                         -- JSON: sharpness, clarity, etc.
    quality_schema_version INTEGER DEFAULT 1,     -- Version of quality scoring schema
    
    -- Generation metadata
    auto_generated BOOLEAN DEFAULT FALSE,         -- Was this auto-generated?
    manually_edited BOOLEAN DEFAULT FALSE,        -- Has user edited it?
    vision_model TEXT,                            -- Model that generated it
    generation_date TIMESTAMP,                    -- When it was generated
    
    -- Source tracking
    source TEXT,                                  -- imported, generated, manual
    imported_from_path TEXT,                      -- If imported, original path
    
    -- Timestamps
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    notes TEXT,                                   -- User notes
    
    FOREIGN KEY (caption_set_id) REFERENCES caption_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES tracked_files(id) ON DELETE CASCADE,
    
    UNIQUE (caption_set_id, file_id),
    INDEX idx_caption_set (caption_set_id),
    INDEX idx_file (file_id),
    INDEX idx_quality (quality_score DESC),
    INDEX idx_source (source)
);
```

#### `caption_jobs`

Background jobs for auto-generating captions.

```sql
CREATE TABLE caption_jobs (
    id TEXT PRIMARY KEY,                          -- UUID (job ID)
    caption_set_id TEXT NOT NULL,                 -- Foreign key to caption_sets
    
    -- Job configuration
    style TEXT NOT NULL,                          -- Caption style
    vision_model TEXT NOT NULL,                   -- Model to use
    generation_prompt TEXT,                       -- Custom prompt
    max_length INTEGER,                           -- Character limit
    
    -- Progress tracking
    status TEXT NOT NULL,                         -- pending, running, paused, completed, failed
    total_files INTEGER NOT NULL,                 -- Total files to process
    completed_files INTEGER DEFAULT 0,            -- Files completed
    failed_files INTEGER DEFAULT 0,               -- Files that failed
    skipped_files INTEGER DEFAULT 0,              -- Files skipped (existing captions)
    
    -- Timing
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_date TIMESTAMP,
    completed_date TIMESTAMP,
    paused_date TIMESTAMP,
    
    -- Error tracking
    last_error TEXT,                              -- Last error message
    
    -- Recovery state (JSON)
    state TEXT,                                   -- Serialized job state for recovery
    
    -- Settings
    overwrite_existing BOOLEAN DEFAULT FALSE,     -- Overwrite existing captions?
    min_quality_threshold REAL,                   -- Re-generate if quality < threshold
    
    FOREIGN KEY (caption_set_id) REFERENCES caption_sets(id) ON DELETE CASCADE,
    
    INDEX idx_caption_set (caption_set_id),
    INDEX idx_status (status),
    INDEX idx_created (created_date DESC)
);
```

#### `export_history`

Log of dataset exports for reference.

```sql
CREATE TABLE export_history (
    id TEXT PRIMARY KEY,                          -- UUID
    dataset_id TEXT NOT NULL,                     -- Foreign key to datasets
    caption_set_id TEXT,                          -- Foreign key to caption_sets (optional)
    
    -- Export configuration
    export_path TEXT NOT NULL,                    -- Where it was exported
    export_format TEXT NOT NULL,                  -- zip, folder
    
    -- Processing settings
    image_format TEXT,                            -- jpeg, png, original
    target_resolution INTEGER,                    -- Pixels on longest side (null = original)
    jpeg_quality INTEGER,                         -- 1-100 (if JPEG)
    png_compression INTEGER,                      -- 0-9 (if PNG)
    
    -- Naming
    numbering_start INTEGER DEFAULT 1,            -- Starting number
    numbering_padding INTEGER DEFAULT 6,          -- Padding digits (000001)
    
    -- Filtering
    min_quality_score REAL,                       -- Only export if quality >= this
    
    -- Results
    file_count INTEGER,                           -- Files exported
    total_size_mb REAL,                           -- Total size of export
    
    -- Timestamps
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_date TIMESTAMP,
    
    status TEXT NOT NULL,                         -- pending, processing, completed, failed
    error_message TEXT,                           -- If failed
    
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    FOREIGN KEY (caption_set_id) REFERENCES caption_sets(id) ON DELETE SET NULL,
    
    INDEX idx_dataset (dataset_id),
    INDEX idx_created (created_date DESC),
    INDEX idx_status (status)
);
```

---

## Vision System Integration

### Adapted from Chorus Engine

The vision system architecture is directly adapted from Chorus Engine's proven implementation, with modifications for caption generation and quality assessment specific to training datasets.

### Vision Model Configuration

**Dual Backend Support**: CaptionForge supports both Ollama and LM Studio as vision model backends. Each model in the curated list includes proper names for both backends, and the system can automatically pull/download models if not already available.

**Default Backend**: Ollama (recommended for most users due to simpler setup and broader model support)

**Quantization Handling**: The curated models list includes default quantizations (Q4_K_M for LM Studio, standard for Ollama). Users who want specific quantizations can use the "Custom Model Name" feature to manually specify any model name/quantization supported by their chosen backend.

Available vision models (configurable in settings.yaml):

```python
# backend/config.py

VISION_MODELS = [
    {
        "id": "qwen3-vl-2b",
        "name": "Qwen3-VL 2B",
        "description": "Fastest, good for simple captions",
        "vram_mb": 3000,
        "speed": "Very Fast (~2-3s per image)",
        "quality": "Good",
        "recommended_for": ["Large datasets (1000+ images)", "Simple captions", "8GB VRAM"],
        
        # Backend-specific model names and commands
        "backends": {
            "ollama": {
                "model_name": "qwen3-vl:2b",
                "pull_command": "ollama pull qwen3-vl:2b"
            },
            "lmstudio": {
                "model_name": "qwen/qwen3-vl-2b",  # LM Studio uses qwen/model-name format
                "pull_command": "lms get qwen/qwen3-vl-2b",
                "repo_id": "Qwen/Qwen3-VL-2B-GGUF",  # HuggingFace repo for lms get
                "default_quant": "Q4_K_M"  # Default quantization
            }
        },
        
        "default": False
    },
    {
        "id": "qwen3-vl-4b",
        "name": "Qwen3-VL 4B",
        "description": "Balanced speed and quality (RECOMMENDED)",
        "vram_mb": 5000,
        "speed": "Fast (~5-8s per image)",
        "quality": "Excellent",
        "recommended_for": ["Most use cases", "Balanced performance", "12GB VRAM"],
        
        "backends": {
            "ollama": {
                "model_name": "qwen3-vl:4b",
                "pull_command": "ollama pull qwen3-vl:4b"
            },
            "lmstudio": {
                "model_name": "qwen/qwen3-vl-4b",
                "pull_command": "lms get qwen/qwen3-vl-4b",
                "repo_id": "Qwen/Qwen3-VL-4B-GGUF",
                "default_quant": "Q4_K_M"
            }
        },
        
        "default": True  # Recommended default for both backends
    },
    {
        "id": "qwen3-vl-8b",
        "name": "Qwen3-VL 8B",
        "description": "Higher quality, more detailed captions",
        "vram_mb": 9000,
        "speed": "Medium (~10-15s per image)",
        "quality": "Excellent",
        "recommended_for": ["Detailed captions", "Complex scenes", "16GB+ VRAM"],
        
        "backends": {
            "ollama": {
                "model_name": "qwen3-vl:8b",
                "pull_command": "ollama pull qwen3-vl:8b"
            },
            "lmstudio": {
                "model_name": "qwen/qwen3-vl-8b",
                "pull_command": "lms get qwen/qwen3-vl-8b",
                "repo_id": "Qwen/Qwen3-VL-8B-GGUF",
                "default_quant": "Q4_K_M"
            }
        },
        
        "default": False
    },
    {
        "id": "qwen3-vl-30b",
        "name": "Qwen3-VL 30B",
        "description": "Best quality, very detailed analysis",
        "vram_mb": 20000,
        "speed": "Slow (~20-30s per image)",
        "quality": "Exceptional",
        "recommended_for": ["Premium datasets", "Maximum quality", "24GB+ VRAM"],
        
        "backends": {
            "ollama": {
                "model_name": "qwen3-vl:30b",
                "pull_command": "ollama pull qwen3-vl:30b"
            },
            "lmstudio": {
                "model_name": "qwen/qwen3-vl-30b",
                "pull_command": "lms get qwen/qwen3-vl-30b",
                "repo_id": "Qwen/Qwen3-VL-30B-GGUF",
                "default_quant": "Q4_K_M"
            }
        },
        
        "default": False
    }
]

# Model Management Functions

async def check_model_available(backend: str, model_name: str) -> bool:
    """Check if vision model is available in the specified backend."""
    if backend == "ollama":
        # Check via Ollama API: GET /api/tags
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:11434/api/tags") as response:
                if response.status == 200:
                    data = await response.json()
                    return any(m["name"] == model_name for m in data.get("models", []))
    elif backend == "lmstudio":
        # Check via LM Studio API: GET /v1/models
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:1234/v1/models") as response:
                if response.status == 200:
                    data = await response.json()
                    return any(m["id"] == model_name for m in data.get("data", []))
    return False

async def pull_model(backend: str, pull_command: str) -> bool:
    """Pull/download vision model using backend-specific command."""
    import subprocess
    try:
        result = subprocess.run(
            pull_command.split(),
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout for large models
        )
        return result.returncode == 0
    except Exception as e:
        logger.error(f"Failed to pull model: {e}")
        return False
```

### Model Pulling UX (Adapted from Chorus Engine)

CaptionForge implements a proven model pulling workflow adapted from Chorus Engine's Model Manager:

#### UI Flow

**Vision Settings Modal**:
1. **Backend Selection**: Radio buttons for Ollama (default) / LM Studio
2. **Model Selection**: 
   - Dropdown with curated models (shows name, VRAM requirement, speed)
   - "Custom Model Name" option (checkbox) - reveals text input for manual entry
3. **Model Status Check**: On selection, automatically checks if model is available
   - ✅ **Available**: Green badge "Ready to use"
   - 📥 **Not Found**: Shows "Download Model" button
4. **Download Button**:
   - Displays estimated size (if available)
   - Click opens download progress modal

#### Download Progress Modal (Streaming)

```
┌─────────────────────────────────────────────┐
│  Downloading qwen3-vl:4b                    │
├─────────────────────────────────────────────┤
│                                             │
│  ████████████░░░░░░░░░░░░░  48%           │
│                                             │
│  Downloaded: 2.4 GB / 5.1 GB                │
│  Speed: 15.3 MB/s                           │
│  Status: Pulling layers...                  │
│                                             │
│            [Pause]  [Cancel]                │
│                                             │
└─────────────────────────────────────────────┘
```

**Progress Updates** (Server-Sent Events from backend):
- Real-time progress percentage
- Downloaded bytes / total bytes
- Current download speed
- Status messages ("Pulling layers", "Verifying", "Complete")

**Key Implementation Details** (from Chorus Engine):

1. **Streaming Progress**: Both Ollama and LM Studio support streaming progress
   - Ollama: `/api/pull` endpoint with `stream: true`
   - LM Studio: `lms get` with progress output parsing
   
2. **SSE Endpoint**: Backend endpoint streams progress events
   ```python
   @router.get("/api/vision/models/download/{model_id}/stream")
   async def stream_model_download(model_id: str):
       async def event_generator():
           async for progress in pull_model_with_progress(model_id):
               yield f"data: {json.dumps(progress)}\n\n"
       return StreamingResponse(event_generator(), media_type="text/event-stream")
   ```

3. **Progress Callback Pattern**:
   ```python
   async def progress_callback(status: Dict[str, Any]):
       # Extract progress from backend-specific format
       if backend == "ollama":
           # Ollama format: {"status": "pulling", "completed": 123, "total": 456}
           percent = (status.get("completed", 0) / status.get("total", 1)) * 100
       elif backend == "lmstudio":
           # Parse lms output format
           percent = parse_lms_progress(status)
       
       # Broadcast to UI via SSE
       await broadcast_progress(percent, status)
   ```

4. **Auto-Close on Completion**:
   - Modal shows "✓ Download Complete" for 2 seconds
   - Automatically refreshes model list
   - Closes modal and updates UI

5. **Error Handling**:
   - Network errors: Show "Retry" button
   - Timeout: Suggest checking backend connection
   - Disk space: Show specific error message

#### Model Selection Pattern

**From Chorus Engine Character Editor**:
- Two modes: "Select from Curated" (dropdown) or "Custom Model Name" (text input)
- CaptionForge uses same pattern in Vision Settings:

```html
<div class="model-selection">
  <div class="form-check">
    <input class="form-check-input" type="radio" name="model-mode" 
           id="mode-curated" value="curated" checked>
    <label class="form-check-label" for="mode-curated">
      Select from Curated Models
    </label>
  </div>
  <select class="form-select" id="model-select">
    <option value="qwen3-vl-4b">Qwen3-VL 4B (Recommended) ✓</option>
    <option value="qwen3-vl-8b">Qwen3-VL 8B 📥</option>
  </select>
  
  <div class="form-check mt-2">
    <input class="form-check-input" type="radio" name="model-mode" 
           id="mode-custom" value="custom">
    <label class="form-check-label" for="mode-custom">
      Custom Model Name
    </label>
  </div>
  <input type="text" class="form-control" id="custom-model" 
         placeholder="e.g., qwen3-vl:4b-q5_k_m" disabled>
  <small class="text-muted">
    For specific quantizations or custom models. Ensure model is already pulled in your backend.
  </small>
</div>
```

**Benefits of Custom Mode**:
- Users can specify exact quantizations (e.g., `qwen3-vl:4b-q5_k_m`, `qwen/qwen3-vl-4b:Q8_0`)
- Supports experimental or unreleased models
- No need to update CaptionForge's curated list for every model variant

#### Database Tracking

Track pulled models in database for UI state:

```sql
CREATE TABLE vision_models (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,          -- "qwen3-vl-4b"
    backend TEXT NOT NULL,            -- "ollama" or "lmstudio"
    backend_model_name TEXT NOT NULL, -- "qwen3-vl:4b" or "qwen/qwen3-vl-4b"
    is_available BOOLEAN DEFAULT TRUE,
    last_checked TIMESTAMP,
    pulled_at TIMESTAMP,
    file_size_mb INTEGER,
    
    UNIQUE (model_id, backend)
);
```

### VisionService Implementation

```python
# backend/services/vision_service.py

"""
Vision service for caption generation using vision-language models.

Adapted from Chorus Engine's VisionService with modifications for
LORA training dataset captioning.
"""

import logging
import asyncio
import json
import base64
import time
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from PIL import Image
import aiohttp

logger = logging.getLogger(__name__)


class VisionServiceError(Exception):
    """Base exception for vision service errors."""
    pass


class VisionModelError(VisionServiceError):
    """Error during vision model inference."""
    pass


@dataclass
class CaptionGenerationResult:
    """Result of vision-based caption generation."""
    caption: str                                  # Generated caption text
    quality_score: float                          # 0.0-1.0 overall quality
    quality_details: Dict[str, float]             # Detailed quality metrics
    quality_schema_version: int = 1               # Quality schema version
    flags: List[str] = field(default_factory=list)  # Quality flags/issues
    processing_time_ms: int = 0                   # Processing duration
    model: str = ""                               # Model used
    backend: str = ""                             # Backend (ollama, lmstudio)
    raw_response: Optional[Dict] = None           # Full model response


class VisionService:
    """
    Vision model integration for caption generation.
    
    Supports both Ollama and LM Studio as backends, with automatic
    model name resolution and availability checking.
    
    Adapted from Chorus Engine's VisionService with modifications
    for LORA training dataset captioning.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize vision service.
        
        Args:
            config: Configuration dictionary with:
                - backend: "ollama" (default) or "lmstudio"
                - base_url: API endpoint (default: ollama=11434, lmstudio=1234)
                - model_id: Model ID from curated list (e.g., "qwen3-vl-4b")
                - timeout_seconds: Request timeout
                - max_retries: Retry attempts
                - auto_pull: Automatically pull missing models (default: True)
        """
        self.backend = config.get("backend", "ollama")  # Default to Ollama
        
        # Backend-specific default URLs
        default_url = "http://localhost:11434" if self.backend == "ollama" else "http://localhost:1234"
        self.base_url = config.get("base_url", default_url)
        
        # Resolve model name based on backend
        model_id = config.get("model_id", "qwen3-vl-4b")
        self.model_config = self._get_model_config(model_id, self.backend)
        self.model_name = self.model_config["model_name"]
        
        self.timeout_seconds = config.get("timeout_seconds", 30)
        self.max_retries = config.get("max_retries", 2)
        self.auto_pull = config.get("auto_pull", True)
        
        logger.info(f"VisionService initialized: {self.backend}/{self.model_name}")
    
    def _get_model_config(self, model_id: str, backend: str) -> Dict[str, str]:
        """Get backend-specific model configuration from curated list."""
        for model in VISION_MODELS:
            if model["id"] == model_id:
                return model["backends"][backend]
        raise ValueError(f"Unknown model ID: {model_id}")
    
    async def generate_caption(
        self,
        image_path: Path,
        style: str,
        max_length: Optional[int] = None,
        custom_prompt: Optional[str] = None
    ) -> CaptionGenerationResult:
        """
        Generate caption for image using vision model.
        
        Args:
            image_path: Path to image file
            style: Caption style (natural_simple, natural_detailed, tags, custom)
            max_length: Maximum caption length in characters
            custom_prompt: Optional custom prompt override
            
        Returns:
            CaptionGenerationResult with caption and quality assessment
        """
        start_time = time.time()
        
        # Build prompt based on style
        prompt = custom_prompt or self._build_prompt(style, max_length)
        
        # Call vision model with retry logic
        raw_response = await self._call_vision_model_with_retry(image_path, prompt)
        
        # Parse structured response
        result = self._parse_response(raw_response, style)
        result.processing_time_ms = int((time.time() - start_time) * 1000)
        
        return result
    
    def _build_prompt(self, style: str, max_length: Optional[int]) -> str:
        """
        Build prompt for vision model based on caption style.
        
        Args:
            style: Caption style
            max_length: Maximum caption length
            
        Returns:
            Formatted prompt string
        """
        length_constraint = f"Maximum length: {max_length} characters. " if max_length else ""
        
        if style == "natural_simple":
            return f"""Describe this image in one clear, concise sentence suitable for AI training.
Focus on: main subject, action/pose, setting/background.
Be objective and descriptive. Avoid subjective interpretations.
{length_constraint}

Output format (JSON):
{{
  "caption": "Your caption here",
  "quality": {{
    "sharpness": 0.0-1.0,
    "clarity": 0.0-1.0,
    "composition": 0.0-1.0,
    "exposure": 0.0-1.0,
    "overall": 0.0-1.0
  }},
  "flags": ["list", "of", "quality", "issues"]
}}"""
        
        elif style == "natural_detailed":
            return f"""Provide a detailed 2-3 sentence description of this image suitable for AI training.
Include: subjects, actions, environment, mood, lighting, notable details, composition.
Be specific and objective. Suitable for high-quality model training.
{length_constraint}

Output format (JSON):
{{
  "caption": "Your detailed caption here",
  "quality": {{
    "sharpness": 0.0-1.0,
    "clarity": 0.0-1.0,
    "composition": 0.0-1.0,
    "exposure": 0.0-1.0,
    "overall": 0.0-1.0
  }},
  "flags": ["list", "of", "quality", "issues"]
}}"""
        
        elif style == "tags":
            return f"""Extract visual tags from this image suitable for AI training.
Format: comma-separated tags, ordered by importance (most to least).
Include: subjects, objects, actions, style, mood, colors, technical aspects.
Be specific and comprehensive.
{length_constraint}

Output format (JSON):
{{
  "caption": "tag1, tag2, tag3, tag4, tag5, ...",
  "quality": {{
    "sharpness": 0.0-1.0,
    "clarity": 0.0-1.0,
    "composition": 0.0-1.0,
    "exposure": 0.0-1.0,
    "overall": 0.0-1.0
  }},
  "flags": ["list", "of", "quality", "issues"]
}}"""
        
        else:  # custom
            return f"""Analyze this image and provide a caption suitable for AI training.
{length_constraint}

Output format (JSON):
{{
  "caption": "Your caption here",
  "quality": {{
    "sharpness": 0.0-1.0,
    "clarity": 0.0-1.0,
    "composition": 0.0-1.0,
    "exposure": 0.0-1.0,
    "overall": 0.0-1.0
  }},
  "flags": ["list", "of", "quality", "issues"]
}}"""
    
    async def _call_vision_model_with_retry(
        self,
        image_path: Path,
        prompt: str
    ) -> str:
        """
        Call vision model with retry logic.
        
        Args:
            image_path: Path to image
            prompt: Vision prompt
            
        Returns:
            Raw model response string
        """
        last_error = None
        
        for attempt in range(self.max_retries + 1):
            try:
                if self.backend == "ollama":
                    return await self._ollama_inference(image_path, prompt)
                elif self.backend == "lmstudio":
                    return await self._lmstudio_inference(image_path, prompt)
                else:
                    raise ValueError(f"Unsupported backend: {self.backend}")
            
            except Exception as e:
                last_error = e
                if attempt < self.max_retries:
                    wait_time = (attempt + 1) * 2
                    logger.warning(f"Vision inference failed (attempt {attempt + 1}), retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
        
        raise VisionModelError(f"Vision inference failed after {self.max_retries + 1} attempts: {last_error}")
    
    async def _ollama_inference(self, image_path: Path, prompt: str) -> str:
        """Call Ollama API with vision model."""
        # Convert image to base64
        with open(image_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
        
        # Build request
        payload = {
            "model": self.model_name,
            "messages": [{
                "role": "user",
                "content": prompt,
                "images": [image_data]
            }],
            "stream": False
        }
        
        # Make API request
        url = f"{self.base_url}/api/chat"
        timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise VisionModelError(f"Ollama API error ({response.status}): {error_text}")
                
                result = await response.json()
                return result["message"]["content"]
    
    async def _lmstudio_inference(self, image_path: Path, prompt: str) -> str:
        """Call LM Studio API with vision model (OpenAI-compatible format)."""
        # Convert image to base64
        with open(image_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
        
        # Detect MIME type
        img = Image.open(image_path)
        mime_type = f"image/{img.format.lower()}" if img.format else "image/jpeg"
        
        # Build request (OpenAI format)
        payload = {
            "model": self.model_name,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_data}"}}
                ]
            }],
            "max_tokens": 1000,
            "temperature": 0.1
        }
        
        # Make API request
        url = f"{self.base_url}/v1/chat/completions"
        timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise VisionModelError(f"LM Studio API error ({response.status}): {error_text}")
                
                result = await response.json()
                return result["choices"][0]["message"]["content"]
    
    def _parse_response(self, raw_response: str, style: str) -> CaptionGenerationResult:
        """
        Parse vision model response into structured result.
        
        Args:
            raw_response: Raw JSON string from model
            style: Caption style (for fallback parsing)
            
        Returns:
            CaptionGenerationResult
        """
        try:
            data = json.loads(raw_response)
            
            # Extract caption
            caption = data.get("caption", "").strip()
            
            # Extract quality metrics
            quality = data.get("quality", {})
            quality_score = quality.get("overall", 0.8)
            quality_details = {
                "sharpness": quality.get("sharpness", 0.8),
                "clarity": quality.get("clarity", 0.8),
                "composition": quality.get("composition", 0.8),
                "exposure": quality.get("exposure", 0.8),
                "overall": quality_score
            }
            
            # Extract flags
            flags = data.get("flags", [])
            
            return CaptionGenerationResult(
                caption=caption,
                quality_score=quality_score,
                quality_details=quality_details,
                quality_schema_version=1,  # Current schema version
                flags=flags,
                processing_time_ms=0,  # Set by caller
                model=self.model_name,
                backend=self.backend,
                raw_response=data
            )
        
        except json.JSONDecodeError:
            # Fallback: use raw response as caption
            logger.warning(f"Failed to parse vision response as JSON, using raw text")
            return CaptionGenerationResult(
                caption=raw_response.strip(),
                quality_score=0.5,  # Unknown quality
                quality_details={"overall": 0.5},
                quality_schema_version=1,
                flags=["unparsed_response"],
                processing_time_ms=0,
                model=self.model_name,
                backend=self.backend
            )
```

---

## API Design

### API Endpoints Overview

```
Folder Management:
  POST   /api/folders                    # Add folder to track
  GET    /api/folders                    # List tracked folders
  GET    /api/folders/{id}               # Get folder details
  PUT    /api/folders/{id}               # Update folder settings
  DELETE /api/folders/{id}               # Remove folder
  POST   /api/folders/{id}/scan          # Trigger folder scan
  GET    /api/folders/{id}/files         # List files in folder

Dataset Management:
  POST   /api/datasets                   # Create new dataset
  GET    /api/datasets                   # List all datasets
  GET    /api/datasets/{id}              # Get dataset details
  PUT    /api/datasets/{id}              # Update dataset
  DELETE /api/datasets/{id}              # Delete dataset
  GET    /api/datasets/{id}/files        # List files in dataset
  POST   /api/datasets/{id}/files        # Add files to dataset
  DELETE /api/datasets/{id}/files/{file_id}  # Remove file from dataset
  GET    /api/datasets/{id}/stats        # Get dataset statistics

Caption Set Management:
  POST   /api/datasets/{id}/caption-sets # Create caption set
  GET    /api/datasets/{id}/caption-sets # List caption sets
  GET    /api/caption-sets/{id}          # Get caption set details
  PUT    /api/caption-sets/{id}          # Update caption set
  DELETE /api/caption-sets/{id}          # Delete caption set

Caption Management:
  POST   /api/caption-sets/{id}/captions # Create/update caption
  GET    /api/caption-sets/{id}/captions # List all captions in set
  GET    /api/captions/{id}              # Get specific caption
  PUT    /api/captions/{id}              # Update caption
  DELETE /api/captions/{id}              # Delete caption
  POST   /api/caption-sets/{id}/batch    # Batch update captions

Vision / Auto-Captioning:
  GET    /api/vision/models              # List available vision models
  POST   /api/vision/generate            # Generate single caption (test)
  POST   /api/caption-sets/{id}/auto-generate  # Start batch job
  GET    /api/vision/jobs                # List caption jobs
  GET    /api/vision/jobs/{id}           # Get job status
  POST   /api/vision/jobs/{id}/pause     # Pause job
  POST   /api/vision/jobs/{id}/resume    # Resume job
  POST   /api/vision/jobs/{id}/cancel    # Cancel job
  GET    /api/vision/jobs/{id}/stream    # SSE progress stream

Export:
  POST   /api/datasets/{id}/export       # Start export
  GET    /api/export/jobs                # List export jobs
  GET    /api/export/jobs/{id}           # Get export status
  GET    /api/export/jobs/{id}/download  # Download ZIP (if applicable)
  GET    /api/export/history             # List past exports

File Serving:
  GET    /api/files/{id}/image           # Serve original image
  GET    /api/files/{id}/thumbnail       # Serve cached thumbnail (256px)

System:
  GET    /api/system/config              # Get system configuration
  PUT    /api/system/config              # Update configuration
  GET    /api/system/stats               # System statistics
```

### Key Endpoint Details

#### POST /api/vision/generate (Test Single Image)

Test caption generation on a single image before running batch job.

**Request**:
```json
{
  "file_id": "abc-123",
  "style": "natural_detailed",
  "max_length": 200,
  "vision_model": "qwen3-vl:4b",
  "custom_prompt": "Optional custom prompt override"
}
```

**Response**:
```json
{
  "caption": "A golden retriever sitting in a sunlit park...",
  "quality_score": 0.92,
  "quality_details": {
    "sharpness": 0.95,
    "clarity": 0.90,
    "composition": 0.88,
    "exposure": 0.95,
    "overall": 0.92
  },
  "flags": [],
  "processing_time_ms": 5432,
  "model": "qwen3-vl:4b",
  "backend": "ollama"
}
```

#### POST /api/caption-sets/{id}/auto-generate (Batch Generation)

Start background job to generate captions for all images in caption set.

**Request**:
```json
{
  "vision_model": "qwen3-vl:4b",
  "overwrite_existing": false,
  "min_quality_threshold": 0.7,
  "custom_prompt": "Optional custom prompt"
}
```

**Response**:
```json
{
  "job_id": "job-xyz-789",
  "status": "pending",
  "total_files": 245,
  "estimated_time_seconds": 1225
}
```

#### GET /api/vision/jobs/{id}/stream (SSE Progress)

Server-Sent Events stream for real-time progress updates.

**Event Types**:
```javascript
// Progress update
event: progress
data: {
  "job_id": "job-xyz-789",
  "status": "running",
  "completed_files": 42,
  "total_files": 245,
  "failed_files": 1,
  "current_file": "image_042.jpg",
  "percent_complete": 17.1,
  "estimated_time_remaining_seconds": 1015
}

// Individual caption generated
event: caption_generated
data: {
  "file_id": "file-abc-123",
  "filename": "image_042.jpg",
  "caption": "Generated caption text...",
  "quality_score": 0.89,
  "processing_time_ms": 5234
}

// Job completed
event: completed
data: {
  "job_id": "job-xyz-789",
  "status": "completed",
  "completed_files": 244,
  "failed_files": 1,
  "total_time_seconds": 1189
}

// Error
event: error
data: {
  "file_id": "file-abc-123",
  "filename": "image_042.jpg",
  "error": "Vision model timeout"
}
```

#### POST /api/datasets/{id}/export

Export dataset with processing options.

**Request**:
```json
{
  "caption_set_id": "caption-set-456",
  "export_type": "folder",
  "export_path": "C:\\Training\\my_lora_dataset",
  
  "numbering": {
    "start": 1,
    "padding": 6
  },
  
  "image_processing": {
    "format": "jpeg",
    "target_resolution": 1024,
    "jpeg_quality": 95,
    "png_compression": 9,
    "strip_metadata": true
  },
  
  "filtering": {
    "min_quality_score": 0.7,
    "exclude_flagged": ["blur", "poor_exposure"]
  },
  
  "caption_format": "txt",
  "include_manifest": true
}
```

**Response**:
```json
{
  "export_id": "export-abc-123",
  "status": "processing",
  "estimated_files": 238,
  "estimated_size_mb": 1250
}
```

---

## UI Design

### Three-Column Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  [CaptionForge]  [+ Folder]  [Settings]                        [@username]  │
├─────────────────┬──────────────────────────────────┬───────────────────────┤
│   DATASETS      │       IMAGE GRID                 │   CAPTION EDITOR      │
│   (Left Panel)  │       (Center Panel)             │   (Right Panel)       │
│                 │                                  │                       │
│ Search: [____]  │  Dataset: Landscapes (245)       │ 📷 Image Preview      │
│                 │  Caption Set: [Natural ▼]        │                       │
│ ○ My LORA       │                                  │ [Large thumbnail]     │
│   (324)         │  [Sort: Name ▼] [Quality ▼]     │                       │
│                 │                                  │ Quality: ★★★★☆ 0.92   │
│ ○ Portraits     │  ┌───┬───┬───┬───┬───┐         │                       │
│   (89)          │  │[✓]│[✓]│[ ]│[✓]│[ ]│         │ Flags: ✓ Sharp        │
│                 │  │★★★│★★★│★★☆│★★★│★☆☆│         │        ✓ Well-lit     │
│ ● Landscapes    │  └───┴───┴───┴───┴───┘         │        ⚠ Busy bg      │
│   (245) ★       │  ┌───┬───┬───┬───┬───┐         │                       │
│                 │  │[ ]│[✓]│[ ]│[ ]│[✓]│         │ Caption Set:          │
│ Caption Sets:   │  │★★★│★★★│★★★│★★☆│★★★│         │ [Natural ▼]           │
│ ● Natural       │  └───┴───┴───┴───┴───┘         │                       │
│   (245/245) ✓   │  ┌───┬───┬───┬───┬───┐         │ ┌───────────────────┐ │
│ ○ Detailed      │  │[ ]│[ ]│[✓]│[ ]│[ ]│         │ │ A golden retriever │ │
│   (128/245)     │  │★★☆│★★★│★★★│★★★│★★☆│         │ │ sitting in a       │ │
│ ○ Tags          │  └───┴───┴───┴───┴───┘         │ │ sunlit park...     │ │
│   (0/245)       │                                  │ └───────────────────┘ │
│                 │  [← Prev]  [42/245]  [Next →]   │                       │
│ [+ New Set]     │                                  │ Length: 156 / 200     │
│ [Auto-Caption]  │  Selected: 8                     │                       │
│                 │  [Add to Dataset] [Remove]       │ Source: Generated     │
│ [+ New Dataset] │  [Export Dataset...]             │ Model: qwen3-vl:4b    │
│                 │                                  │                       │
│ [Import Folder] │  Auto-Caption Progress:          │ [Save]  [← Prev]      │
│                 │  ████████░░░░░░  42/245 (17%)   │         [Next →]      │
│                 │  Current: image_042.jpg          │                       │
│                 │  [Pause] [Cancel]                │ [Copy] [Clear]        │
└─────────────────┴──────────────────────────────────┴───────────────────────┘
```

### JavaScript Component Patterns

Due to length constraints, here are the key component patterns using vanilla JavaScript:

**Image Grid with Thumbnails**:
```javascript
// js/imageGrid.js

class ImageGrid {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.images = [];
    this.selectedImages = new Set();
  }

  render(images) {
    this.images = images;
    this.container.innerHTML = images.map(image => `
      <div class="image-thumbnail-container" data-id="${image.id}">
        <input type="checkbox" class="image-select" 
               ${this.selectedImages.has(image.id) ? 'checked' : ''}>
        <img src="/api/files/${image.id}/thumbnail" 
             alt="${image.filename}" 
             loading="lazy">
        <div class="quality-badge">
          ${this.renderStarRating(image.quality_score)}
        </div>
      </div>
    `).join('');
    
    this.bindEvents();
  }

  renderStarRating(score) {
    const stars = Math.round(score * 5);
    return '★'.repeat(stars) + '☆'.repeat(5 - stars);
  }

  bindEvents() {
    this.container.querySelectorAll('.image-select').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const id = e.target.closest('.image-thumbnail-container').dataset.id;
        if (e.target.checked) {
          this.selectedImages.add(id);
        } else {
          this.selectedImages.delete(id);
        }
        this.onSelectionChange?.(Array.from(this.selectedImages));
      });
    });
  }
}
```

**Caption Editor**:
```javascript
// js/captionEditor.js

class CaptionEditor {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentImage = null;
    this.captionSet = null;
  }

  render(image, captionSet) {
    this.currentImage = image;
    this.captionSet = captionSet;
    const maxLength = captionSet?.max_length || 500;
    const caption = image.caption || '';

    this.container.innerHTML = `
      <div class="caption-editor">
        <img src="/api/files/${image.id}/image" class="preview-image">
        <div class="quality-indicator">
          Quality: ${this.renderStarRating(image.quality_score)} 
          <span class="score">${(image.quality_score * 100).toFixed(0)}%</span>
        </div>
        
        <textarea id="caption-text" 
                  maxlength="${maxLength}" 
                  placeholder="Enter caption...">${caption}</textarea>
        
        <div class="char-counter">
          <span id="char-count">${caption.length}</span> / ${maxLength}
        </div>
        
        <div class="editor-actions">
          <button class="btn btn-primary" id="save-caption">Save</button>
          <button class="btn btn-secondary" id="prev-image">← Prev</button>
          <button class="btn btn-secondary" id="next-image">Next →</button>
        </div>
      </div>
    `;
    
    this.bindEvents();
  }

  bindEvents() {
    const textarea = document.getElementById('caption-text');
    const charCount = document.getElementById('char-count');
    
    textarea.addEventListener('input', () => {
      charCount.textContent = textarea.value.length;
    });
    
    document.getElementById('save-caption').addEventListener('click', () => {
      this.onSave?.(this.currentImage.id, textarea.value);
    });
  }

  renderStarRating(score) {
    const stars = Math.round(score * 5);
    return '★'.repeat(stars) + '☆'.repeat(5 - stars);
  }
}
```

---

## Export System

### Image Processing Utility

```python
# backend/utils/image_utils.py

from PIL import Image
from pathlib import Path
from typing import Optional, Tuple

def process_image(
    input_path: Path,
    output_path: Path,
    target_resolution: Optional[int] = None,
    output_format: str = "original",
    jpeg_quality: int = 95,
    png_compression: int = 9,
    strip_metadata: bool = True
) -> Tuple[int, int]:
    """
    Process image with resize, format conversion, and metadata stripping.
    
    Returns:
        Tuple of (width, height) of output image
    """
    # Open image
    img = Image.open(input_path)
    
    # Convert RGBA to RGB if saving as JPEG
    if output_format == "jpeg" and img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        img = background
    
    # Resize if needed
    if target_resolution:
        width, height = img.size
        if width > height:
            new_width = target_resolution
            new_height = int(height * (target_resolution / width))
        else:
            new_height = target_resolution
            new_width = int(width * (target_resolution / height))
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Save with settings
    save_kwargs = {}
    if output_format == "jpeg":
        save_kwargs["quality"] = jpeg_quality
        save_kwargs["optimize"] = True
        if strip_metadata:
            save_kwargs["exif"] = b""
    elif output_format == "png":
        save_kwargs["compress_level"] = png_compression
        save_kwargs["optimize"] = True
        if strip_metadata:
            img.info = {}
    
    img.save(output_path, format=output_format.upper(), **save_kwargs)
    return img.size
```

---

## Implementation Phases

### Phase 1: Foundation & Infrastructure (Week 1-2, 20-28 hours)

#### Task 1.1: Project Setup (4-6 hours) ✅ COMPLETED
- [x] Initialize Git repository
- [x] Create project structure
- [x] Set up Python virtual environment
- [x] Create requirements.txt
- [x] Create frontend HTML/CSS/JS structure
- [x] Create .gitignore
- [x] Create README.md

#### Task 1.2: Database Schema Implementation (6-8 hours) ✅ COMPLETED
- [x] Create SQLAlchemy models (all 9 tables)
- [x] Create database initialization script
- [x] Add indexes
- [ ] Create Alembic migration system (deferred - not needed for v1)
- [x] Test database creation

#### Task 1.3: Configuration System (3-4 hours) ✅ COMPLETED
- [x] Create settings.yaml template
- [x] Implement config loader (Pydantic-based)
- [x] Environment variable support
- [x] Validate configuration

#### Task 1.4: FastAPI Application Setup (4-6 hours) ✅ COMPLETED
- [x] Create main.py with FastAPI app
- [x] Set up CORS
- [x] Implement database session dependency
- [x] Create API router structure (7 routers)
- [x] Add Pydantic models (schemas.py)
- [x] Set up logging

#### Task 1.5: Frontend Scaffold (4-6 hours) ✅ COMPLETED
- [x] Create HTML structure with Bootstrap
- [x] Create main layout (tab-based navigation)
- [x] Add Bootstrap via CDN
- [x] Create API client (api.js)
- [x] Create main app.js initialization
- [x] Test API connectivity

---

### Phase 2: Folder & File Management (Week 2-3, 24-30 hours)

#### Task 2.1: Folder Tracking Service (6-8 hours) ✅ COMPLETED
- [x] Implement FolderService
- [x] Add folder scanning with file discovery
- [x] Recursive scanning
- [x] File hash calculation (SHA256)
- [x] Duplicate detection
- [x] Paired caption detection
- [x] Import captions from paired files

#### Task 2.2: Folder Management API (4-6 hours) ✅ COMPLETED
- [x] Implement all folder endpoints
- [x] Error handling and validation

#### Task 2.3: Thumbnail Generation (6-8 hours) ✅ COMPLETED
- [x] Implement ThumbnailService
- [x] Generate thumbnails (256px max dimension)
- [x] Hash-based filename for caching
- [x] Cache to data/thumbnails/
- [x] Batch generation when folder is added/scanned
- [x] Serve thumbnails via /api/files/{id}/thumbnail

#### Task 2.4: Folder Manager UI (6-8 hours) ✅ COMPLETED
- [x] Create folder manager component (folders.js)
- [x] Folder list with status badges
- [x] Add folder button/dialog
- [x] **Drag-and-drop folder support** (File System Access API + fallback)
- [x] Scan progress indicator (deferred - scan is fast enough)
- [x] File count display

---

### Phase 3: Dataset Management (Week 3-4, 30-38 hours)

#### Task 3.1: Dataset Service (8-10 hours) ✅ COMPLETED
- [x] Implement DatasetService
- [x] Create dataset
- [x] Add/remove files
- [x] Batch operations
- [x] Calculate statistics
- [x] Generate filesystem-safe names (slug)

#### Task 3.2: Dataset Management API (6-8 hours) ✅ COMPLETED
- [x] Implement all dataset endpoints
- [x] Error handling

#### Task 3.3: Dataset List UI (6-8 hours) ✅ COMPLETED
- [x] Create dataset list module (datasets.js)
- [x] Search/filter datasets (deferred - small dataset counts in v1)
- [x] New dataset modal
- [x] Edit/delete datasets
- [x] **Drag-and-drop images to dataset** (drop on dataset list items or image panel)

#### Task 3.4: Image Grid UI (10-12 hours) ✅ COMPLETED
- [x] Create image grid module (in folders.js)
- [x] Thumbnail display with lazy loading
- [x] Checkbox selection
- [x] Multi-select
- [x] Quality badge overlay
- [x] Pagination
- [x] Sort/filter controls (deferred - not critical for v1)
- [x] Batch actions (add to dataset)
- [x] **Drag-and-drop selection to dataset** (draggable images with multi-select support)

---

### Phase 4: Caption Management (Week 4-5, 30-38 hours)

#### Task 4.1: Caption Service (8-10 hours) ✅ COMPLETED
- [x] Implement CaptionService
- [x] Create caption set
- [x] Add/update caption
- [x] Batch operations
- [x] Calculate statistics
- [x] Caption length validation

#### Task 4.2: Caption Management API (6-8 hours) ✅ COMPLETED
- [x] Implement all caption endpoints

#### Task 4.3: Caption Editor UI (10-12 hours) ✅ COMPLETED
- [x] Image preview in detail modal
- [x] Quality score display (after generation)
- [x] Caption textarea with counter
- [x] Prev/Next navigation
- [x] Keyboard shortcuts (deferred - conflicts with text editing)
- [x] Save functionality
- [x] Generate single caption button
- [x] Copy imported caption button

#### Task 4.4: Caption Set Management (6-8 hours) ✅ COMPLETED
- [x] New caption set modal
- [x] Caption set configuration (style, max length, trigger phrase)
- [x] Edit caption set modal
- [x] Delete confirmation
- [x] Statistics display
- [x] Trigger phrase / caption prefix support

---

### Phase 5: Vision Integration & Auto-Captioning (Week 5-6, 38-46 hours)

#### Task 5.1: Vision Service (10-12 hours) ✅ COMPLETED
- [x] Implement VisionService (adapted from Chorus)
- [x] Ollama backend integration
- [x] LM Studio backend integration
- [x] Image preprocessing
- [x] Prompt building per style
- [x] Response parsing
- [x] Quality assessment extraction
- [x] Retry logic
- [x] Trigger phrase injection in prompts
- [x] Quality score persistence to database

#### Task 5.2: Caption Job Manager (8-10 hours) ✅ COMPLETED
- [x] Background job processing
- [x] Job queue management
- [x] Progress tracking
- [x] Pause/resume functionality (async event loop fix applied)
- [x] Job state persistence
- [x] Error tracking
- [x] Job cancellation

#### Task 5.3: Vision API Endpoints (6-8 hours) ✅ COMPLETED
- [x] Implement all vision endpoints
- [ ] SSE streaming for progress (deferred - polling works well)

#### Task 5.4: Auto-Caption UI (10-12 hours) ✅ COMPLETED
- [x] Create auto-caption modal 
- [x] Vision model selector (simplified - uses system config)
- [x] Backend selection (uses system config)
- [x] Settings configuration
- [x] Progress monitor via job cards with auto-refresh
- [x] Pause/Resume/Cancel buttons
- [x] Error display
- [x] Single image caption generation (in caption editor)
- [x] Quality score display after generation

#### Task 5.5: Vision/System Settings UI (4-6 hours) ✅ COMPLETED
- [x] Settings modal (gear icon in navbar)
- [x] Vision backend configuration (Ollama URL, LM Studio URL)
- [x] Default vision model selection
- [x] Test connection button
- [x] Save settings to settings.yaml
- [x] Configurable max_tokens for thinking models

---

### Phase 6: Export System (Week 6-7, 36-46 hours)

#### Task 6.1: Export Service (10-12 hours) ✅ COMPLETED
- [x] Implement ExportService
- [x] File numbering logic
- [x] Image processing integration
- [x] Caption file generation
- [x] Manifest generation (optional)
- [x] ZIP creation
- [x] Folder export
- [x] Progress tracking
- [x] Quality filtering

#### Task 6.2: Image Processing Utils (6-8 hours) ✅ COMPLETED
- [x] Implement image_utils.py
- [x] Resize functionality
- [x] Format conversion
- [x] Quality/compression settings
- [x] Metadata stripping

#### Task 6.3: Export API (6-8 hours) ✅ COMPLETED
- [x] Implement export endpoints
- [x] Download ZIP endpoint
- [x] Export history endpoint

#### Task 6.4: Export Modal UI (10-12 hours) ✅ COMPLETED
- [x] Create export modal
- [x] Settings inputs (export type, path, format, etc.)
- [x] Browse button with File System Access API
- [x] Droppable path input (Electron file.path support)
- [x] Pre-select currently active caption set
- [x] Auto-navigate to exports view on start
- [ ] Export summary preview (nice-to-have)
- [ ] Progress tracking for large exports (nice-to-have)

#### Task 6.5: Export History UI (4-6 hours) ✅ COMPLETED
- [x] Export history view
- [x] Download buttons for ZIP exports
- [x] Status badges

---

### Phase 7: Polish & Optimization (Week 7-8, 38-46 hours)

#### Task 7.1: Performance Optimization (8-10 hours) ⏸️ DEFERRED
- [ ] Optimize database queries (not needed yet - performance is good)
- [ ] Add caching (not needed yet)
- [x] Lazy loading for large datasets (thumbnails load lazily)
- [x] Thumbnail loading optimization (hash-based caching works well)
- [x] Background job efficiency (async jobs don't block UI)

#### Task 7.2: UI/UX Polish (8-10 hours) ✅ COMPLETED
- [x] Consistent styling (Bootstrap dark theme throughout)
- [x] Loading states (spinners on all async operations)
- [x] Error messages (toast notifications)
- [x] Success notifications (toast notifications)
- [x] Keyboard shortcuts (deferred - conflicts with text editing)
- [x] Tooltips (on key buttons and badges)
- [x] Responsive design (Bootstrap responsive grid)

#### Task 7.3: Error Handling & Validation (6-8 hours) ✅ COMPLETED
- [x] Comprehensive input validation (Pydantic on backend, JS on frontend)
- [x] User-friendly error messages (toast system)
- [x] Graceful degradation (fallbacks for Electron vs browser)

#### Task 7.4: Documentation (6-8 hours) ⏸️ DEFERRED
- [ ] User guide
- [ ] Installation instructions
- [ ] Configuration guide
- [ ] Vision model setup guide
- [ ] Troubleshooting guide

#### Task 7.5: Testing & Bug Fixes (10-12 hours) 🔄 ONGOING
- [x] Comprehensive manual testing (done during development)
- [ ] Test with various dataset sizes (1000+ images)
- [x] Test with different image formats (jpg, png, webp work)
- [ ] Cross-platform testing (Windows only so far)
- [ ] Cross-browser testing (Electron only so far)
- [x] Fix discovered bugs (many fixed during development)

**Total Estimated Time: 7-8 weeks (140-160 hours)**

---

## Testing Checklist

### Functional Testing

#### Folder Management
- [ ] Can add folder successfully
- [ ] Folder scan discovers all files
- [ ] Recursive scanning works
- [ ] Paired captions imported correctly
- [ ] Duplicate detection works
- [ ] File existence verification functional
- [ ] Can enable/disable folders
- [ ] Can remove folders
- [ ] Re-scan updates file list

#### Dataset Management
- [ ] Can create new dataset
- [ ] Filesystem-safe name generated
- [ ] Can add files to dataset
- [ ] Can remove files
- [ ] Batch operations work
- [ ] Statistics update correctly
- [ ] Can edit dataset
- [ ] Can delete dataset
- [ ] Search/filter functional

#### Caption Management
- [ ] Can create caption set
- [ ] Caption set styles configured
- [ ] Can add/edit captions
- [ ] Character limit enforced
- [ ] Multi-line captions supported
- [ ] Prev/Next navigation works
- [ ] Keyboard shortcuts functional
- [ ] Statistics accurate
- [ ] Can switch between caption sets
- [ ] Imported captions display

#### Vision & Auto-Captioning
- [ ] Vision model list loads
- [ ] Single caption test works
- [ ] Batch job starts successfully
- [ ] Progress updates in real-time
- [ ] Can pause job
- [ ] Can resume job
- [ ] Can cancel job
- [ ] Job recovers after crash
- [ ] Quality scores reasonable
- [ ] Captions match prompt style
- [ ] Errors handled gracefully

#### Export System
- [ ] Folder export works
- [ ] ZIP export works
- [ ] Image numbering correct
- [ ] Caption files match images
- [ ] Image resize works
- [ ] Format conversion correct
- [ ] Quality settings applied
- [ ] Metadata stripping works
- [ ] Filtering applies correctly
- [ ] Manifest generated correctly
- [ ] Export history recorded

### Performance Testing
- [ ] Handles 1000+ images
- [ ] Thumbnail generation performant
- [ ] Image grid scrolling smooth
- [ ] Caption navigation responsive
- [ ] Background jobs don't block UI
- [ ] Export processing reasonable
- [ ] Database queries optimized
- [ ] Memory usage acceptable

### Cross-Platform Testing
- [ ] Windows: All features work
- [ ] Linux: All features work
- [ ] macOS: All features work

### Browser Testing
- [ ] Chrome/Edge: Full functionality
- [ ] Firefox: Full functionality (ZIP fallback)
- [ ] Safari: Full functionality (ZIP fallback)

---

## Future Enhancements

### Phase 8: Video Support (Future)

#### Features
- [ ] Track video files (.mp4, .mov, .avi, .webm)
- [ ] Video thumbnail generation
- [ ] Frame extraction at intervals
- [ ] Keyframe detection
- [ ] Temporal captioning
- [ ] Video preview in UI
- [ ] Scene detection
- [ ] Export frames as images

#### Database Changes
```sql
ALTER TABLE tracked_files ADD COLUMN is_video BOOLEAN DEFAULT FALSE;
ALTER TABLE tracked_files ADD COLUMN duration_seconds REAL;
ALTER TABLE tracked_files ADD COLUMN fps REAL;
ALTER TABLE tracked_files ADD COLUMN frame_count INTEGER;

CREATE TABLE video_frames (
    id TEXT PRIMARY KEY,
    video_file_id TEXT NOT NULL,
    frame_number INTEGER NOT NULL,
    timestamp_seconds REAL NOT NULL,
    frame_path TEXT NOT NULL,
    is_keyframe BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (video_file_id) REFERENCES tracked_files(id) ON DELETE CASCADE
);
```

### Additional Future Features

#### Advanced Caption Tools
- [ ] Caption templates system
- [ ] Caption inheritance
- [ ] Find and replace
- [ ] Spell check integration
- [ ] Caption translation
- [ ] Tag auto-complete

#### Dataset Enhancement
- [ ] Dataset versioning/snapshots
- [ ] Dataset merge/split tools
- [ ] Smart suggestions (similar images)
- [ ] Image similarity clustering
- [ ] Automatic duplicate removal
- [ ] Dataset comparison tool

#### Training Integration
- [ ] Export format presets (Kohya, EveryDream2, SimpleTuner)
- [ ] Tag balancing/weighting tools
- [ ] Training data validation
- [ ] Sample image generation preview
- [ ] Dataset statistics for optimization

#### Advanced Vision Features
- [ ] Multiple vision model ensemble
- [ ] Region-based captioning
- [ ] Face detection
- [ ] OCR text extraction
- [ ] NSFW content detection

---

## Appendix

### Dependencies

**Python (requirements.txt)**:
```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
sqlalchemy>=2.0.0
aiosqlite>=0.19.0
pillow>=10.1.0
aiohttp>=3.9.0
python-multipart>=0.0.6
pyyaml>=6.0.1
```

**Frontend (CDN-based, no package.json required)**:
```html
<!-- Bootstrap 5.3 CSS -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">

<!-- Bootstrap 5.3 JS Bundle (includes Popper) -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>

<!-- Bootstrap Icons (optional) -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet">
```

### Configuration Example

```yaml
# config/settings.yaml

database:
  path: "data/database.db"

vision:
  backend: "ollama"  # Default backend (also supports "lmstudio")
  base_url: "http://localhost:11434"  # Ollama default URL
  default_model: "qwen3-vl-4b"  # Recommended for both backends
  timeout_seconds: 30
  max_retries: 2
  auto_pull: true  # Automatically download models if missing

thumbnails:
  max_size: 256
  quality: 85
  format: "webp"
  cache_path: "data/thumbnails"

export:
  default_format: "jpeg"
  default_quality: 95
  default_padding: 6
  max_concurrent_exports: 2

image_processing:
  supported_formats: ["jpg", "jpeg", "png", "webp", "gif"]
  max_file_size_mb: 50

server:
  host: "localhost"
  port: 8000
  reload: true
```

---

**End of Document**

This comprehensive planning document covers all aspects of the CaptionForge LORA Dataset Management System, from database design through implementation phases, providing a complete roadmap for development.