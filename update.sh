#!/bin/bash

echo ""
echo "========================================"
echo "  CaptionForge - Update"
echo "========================================"
echo ""

# Check if git is available
if ! command -v git &> /dev/null; then
    echo "[ERROR] Git is not installed"
    echo "Please install Git from https://git-scm.com"
    exit 1
fi

# Pull latest changes
echo "[INFO] Pulling latest changes from git..."
git pull
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to pull changes from git"
    echo "Please resolve any conflicts and try again"
    exit 1
fi
echo "[OK] Git pull completed"

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "[ERROR] Virtual environment not found"
    echo "Please run ./install.sh first"
    exit 1
fi

# Activate venv and update dependencies
echo ""
echo "[INFO] Activating Python virtual environment..."
source venv/bin/activate

# Update pip
echo "[INFO] Updating pip..."
python3 -m pip install --upgrade pip
if [ $? -ne 0 ]; then
    echo "[WARNING] Failed to update pip, continuing..."
fi

# Update Python dependencies
echo "[INFO] Updating Python dependencies..."
pip install --upgrade -r requirements.txt
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to update Python dependencies"
    exit 1
fi
echo "[OK] Python dependencies updated"

# Update Node.js dependencies
echo ""
echo "[INFO] Updating Node.js dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to update Node.js dependencies"
    exit 1
fi
echo "[OK] Node.js dependencies updated"

# Check for new config options
echo ""
echo "[INFO] Checking configuration..."
if [ -f "config/settings.yaml.template" ]; then
    if [ -f "config/settings.yaml" ]; then
        echo "[INFO] Config file exists. Check settings.yaml.template for new options."
    else
        echo "[INFO] Creating default configuration..."
        cp "config/settings.yaml.template" "config/settings.yaml"
        echo "[OK] Configuration file created"
    fi
fi

# Create any missing data directories
echo ""
echo "[INFO] Ensuring data directories exist..."
mkdir -p data/thumbnails
mkdir -p data/exports
mkdir -p data/logs
mkdir -p data/caption_jobs
echo "[OK] Data directories checked"

echo ""
echo "========================================"
echo "  Update Complete!"
echo "========================================"
echo ""
echo "To start CaptionForge, run: ./start.sh"
echo ""
