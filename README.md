# CaptionForge

**AI-Powered Dataset Management for LORA Training** - A desktop application for preparing high-quality image datasets with AI-assisted captioning, designed specifically for LORA and fine-tuning workflows.

![CaptionForge Screenshot](documentation/screenshots/screenshot1.png)
*Caption editing interface with AI-generated descriptions, quality assessment, and batch processing capabilities*

## What is CaptionForge?

CaptionForge streamlines the tedious process of preparing image datasets for AI model training. Instead of manually captioning hundreds of images, you can:

1. **Organize** your images into datasets with drag-and-drop simplicity
2. **Auto-caption** entire datasets using local vision AI models
3. **Review and edit** captions with quality scoring and suggestions
4. **Export** perfectly formatted datasets ready for training

The entire workflow runs locally on your machine - no cloud services, no API costs, complete privacy.

## Key Features

- **Folder Tracking** - Track local image folders with drag-and-drop support
- **Thumbnail Browser** - Fast thumbnail grid with WebP compression and lazy loading
- **Dataset Management** - Organize images into named datasets with descriptions
- **Caption Sets** - Multiple caption styles per dataset (booru tags, natural language, etc.)
- **AI Auto-Captioning** - Generate captions using local Ollama or LM Studio vision models
- **Quality Scoring** - Automatic quality assessment with detailed flags
- **Manual Editing** - Click any image to edit its caption with real-time preview
- **Smart Export** - Export with sequential numbering, format conversion, metadata stripping
- **Desktop App** - Native file dialogs and true drag-and-drop via Electron
- **100% Non-Destructive** - Your original images and captions are never modified, moved, or deleted

## Requirements

- **Python 3.10+** - [Download](https://python.org)
- **Node.js 18+** - [Download](https://nodejs.org)
- **Vision Model Backend** (at least one):
  - [Ollama](https://ollama.ai/) with a vision model
  - [LM Studio](https://lmstudio.ai/) with a vision model loaded

> **New to vision models?** See [QUICKSTART.md](QUICKSTART.md) for detailed setup instructions.

## Installation

### Windows

```batch
install.bat
```

### Linux/macOS

```bash
chmod +x install.sh
./install.sh
```

The installer will:
1. Create a Python virtual environment (venv/)
2. Install Python dependencies from requirements.txt
3. Install Node.js dependencies (npm install)

## Starting the Application

### Windows

```batch
start.bat
```

### Linux/macOS

```bash
./start.sh
```

This launches:
1. The FastAPI backend server (port 8675)
2. The Electron desktop application (connects to backend)

The app window will open automatically once the backend is ready.

## Non-Destructive Design

**CaptionForge never modifies your original files.** All operations are 100% safe and non-destructive:

- ✅ **Folder tracking** only reads file metadata - never writes to your images or captions
- ✅ **Thumbnails** are generated in `data/thumbnails/` - originals untouched
- ✅ **Captions** are stored in SQLite database - paired caption files (.txt) are only read, never modified
- ✅ **Exports** copy files to the destination - source files remain pristine
- ✅ **Removing images** from datasets only affects the database - files stay in place
- ✅ **Deleting folders/datasets** removes tracking records - your actual files are safe

Feel confident experimenting - your source files are always protected.

## Basic Workflow

1. **Add Folders** - Drag folders onto the app or use the folder picker
2. **Browse Images** - Click a folder to see thumbnails
3. **Create Dataset** - Select images and click "Create Dataset"
4. **Add Caption Set** - Choose a captioning style (booru, natural, descriptive)
5. **Auto-Caption** - Click "Auto-Caption All" to generate captions with AI
6. **Review & Edit** - Click any image to review/edit its caption
7. **Export** - Export the completed dataset with sequential naming

## Configuration

Settings are stored in config/settings.yaml:

```yaml
vision:
  backend: ollama              # or "lmstudio"
  ollama_url: http://localhost:11434
  lmstudio_url: http://localhost:1234
  default_model: qwen/qwen3-vl-4b
  max_tokens: 8192             # Important for thinking models
  timeout_seconds: 120

server:
  host: 127.0.0.1
  port: 8675

thumbnails:
  max_size: 256
  quality: 85
  format: webp

export:
  default_format: jpeg
  default_quality: 95
  default_padding: 6           # File numbering padding (000001.jpg)
```

## Architecture

CaptionForge uses a hybrid architecture optimized for desktop use:

- **Frontend**: HTML/CSS/JavaScript with Bootstrap 5
- **Desktop Shell**: Electron (provides native file dialogs, drag-drop paths)
- **Backend**: Python FastAPI (manages data, proxies vision AI requests)
- **Database**: SQLite with SQLAlchemy 2.x ORM
- **Vision AI**: Ollama or LM Studio (local, no cloud)

The Electron shell spawns the Python backend as a child process and loads the frontend from the backend server.

## Project Structure

```
CaptionForge/
 electron/           # Electron main process
    main.js         # App entry, spawns Python backend
    preload.js      # IPC bridge for native features
 backend/            # FastAPI backend
    api/            # REST API routers
    services/       # Business logic
    models.py       # SQLAlchemy ORM models
    main.py         # FastAPI application
 frontend/           # Web frontend
    css/styles.css  # Custom styles
    js/             # JavaScript modules
    index.html      # Main HTML
 config/             # Configuration files
    settings.yaml   # App settings
 data/               # Data storage
    database.db     # SQLite database
    thumbnails/     # Thumbnail cache
    exports/        # Export staging area
    logs/           # Application logs
 install.bat/.sh     # Installation scripts
 start.bat/.sh       # Startup scripts
 package.json        # Node.js dependencies
 requirements.txt    # Python dependencies
```

## Development

### Run with DevTools

```bash
npm run dev
```

### Run Backend Only

```bash
# Activate venv first
# Windows: venv\Scripts\activate
# Linux/Mac: source venv/bin/activate

python -m uvicorn backend.main:app --reload --port 8675
```

### API Documentation

Once running, visit http://localhost:8675/docs for interactive Swagger documentation.

## Troubleshooting

### "No vision models available"

Make sure Ollama or LM Studio is running with a vision model loaded. See [QUICKSTART.md](QUICKSTART.md) for setup instructions.

### Captions are cut off or incomplete

Increase max_tokens in config/settings.yaml. Thinking models (like Qwen3-VL) need higher token limits (8192+) to complete their reasoning.

### Thumbnails not loading

Check that the data/thumbnails/ directory exists and is writable. Try restarting the app.

### Export fails

Ensure the export destination folder exists and you have write permissions.

## License

Apache 2.o - See [LICENSE](LICENSE) file for details.

## See Also

- [QUICKSTART.md](QUICKSTART.md) - Detailed setup guide with Ollama/LM Studio instructions
- [API Documentation](http://localhost:8675/docs) - Interactive API reference (when running)

## Wanna be nice?

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/C0C31T80OE)