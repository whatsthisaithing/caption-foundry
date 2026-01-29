/**
 * CaptionForge - Electron Main Process
 * 
 * Launches the Python FastAPI backend as a subprocess and creates
 * the Electron BrowserWindow to load the frontend.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Try to load tree-kill for graceful shutdown, fall back to basic kill
let treeKill;
try {
    treeKill = require('tree-kill');
} catch (e) {
    treeKill = (pid, signal, callback) => {
        try {
            process.kill(pid, signal);
            if (callback) callback();
        } catch (err) {
            if (callback) callback(err);
        }
    };
}

// Configuration
const BACKEND_PORT = 8765;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const isDev = process.argv.includes('--dev');

let mainWindow = null;
let pythonProcess = null;

/**
 * Get the path to the Python executable
 */
function getPythonPath() {
    const projectRoot = path.dirname(__dirname);
    
    // Check for local venv first
    const venvPaths = [
        path.join(projectRoot, 'venv', 'Scripts', 'python.exe'),  // Windows venv
        path.join(projectRoot, 'venv', 'bin', 'python'),          // Unix venv
        path.join(projectRoot, '.venv', 'Scripts', 'python.exe'), // Windows .venv
        path.join(projectRoot, '.venv', 'bin', 'python'),         // Unix .venv
    ];
    
    for (const venvPath of venvPaths) {
        if (fs.existsSync(venvPath)) {
            console.log(`[Electron] Found Python at: ${venvPath}`);
            return venvPath;
        }
    }
    
    // Fall back to system Python
    console.log('[Electron] No venv found, using system Python');
    return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Start the FastAPI backend server
 */
function startBackend() {
    return new Promise((resolve, reject) => {
        const projectRoot = path.dirname(__dirname);
        const pythonPath = getPythonPath();
        
        console.log(`[Electron] Starting backend with: ${pythonPath}`);
        console.log(`[Electron] Working directory: ${projectRoot}`);
        
        // Spawn the Python backend
        pythonProcess = spawn(pythonPath, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)], {
            cwd: projectRoot,
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let started = false;
        
        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[Backend] ${output}`);
            
            // Check if server has started
            if (!started && output.includes('Uvicorn running')) {
                started = true;
                console.log('[Electron] Backend server is ready');
                resolve();
            }
        });
        
        pythonProcess.stderr.on('data', (data) => {
            const output = data.toString();
            console.error(`[Backend Error] ${output}`);
            
            // Uvicorn also logs startup to stderr
            if (!started && output.includes('Uvicorn running')) {
                started = true;
                console.log('[Electron] Backend server is ready');
                resolve();
            }
        });
        
        pythonProcess.on('error', (err) => {
            console.error('[Electron] Failed to start Python backend:', err);
            reject(err);
        });
        
        pythonProcess.on('exit', (code) => {
            console.log(`[Electron] Python backend exited with code ${code}`);
            pythonProcess = null;
            
            if (!started) {
                reject(new Error(`Backend failed to start (exit code ${code})`));
            }
        });
        
        // Timeout after 45 seconds (increased to allow for database migrations on first run)
        setTimeout(() => {
            if (!started) {
                console.log('[Electron] Backend startup timeout - assuming it\'s running');
                resolve();
            }
        }, 45000);
    });
}

/**
 * Stop the Python backend
 */
function stopBackend() {
    if (pythonProcess) {
        console.log('[Electron] Stopping Python backend...');
        treeKill(pythonProcess.pid, 'SIGTERM', (err) => {
            if (err) {
                console.error('[Electron] Error killing backend:', err);
                // Force kill
                treeKill(pythonProcess.pid, 'SIGKILL');
            }
        });
        pythonProcess = null;
    }
}

/**
 * Create the main application window
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#1a1a1a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, '..', 'frontend', 'images', 'icon.png'),
        show: false,
        title: 'CaptionForge'
    });
    
    // Load the frontend from the backend server
    mainWindow.loadURL(`${BACKEND_URL}/`);
    
    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
    });
    
    // Add keyboard shortcut to toggle DevTools (F12 or Ctrl+Shift+I)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown') {
            if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
                mainWindow.webContents.toggleDevTools();
                event.preventDefault();
            }
        }
    });
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ============================================================
// IPC Handlers - Bridge between renderer and Node.js
// ============================================================

// Folder selection dialog
ipcMain.handle('select-folder', async (event, title = 'Select Folder') => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: title,
        properties: ['openDirectory']
    });
    
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

// File selection dialog
ipcMain.handle('select-file', async (event, title = 'Select File', filters = []) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: title,
        properties: ['openFile'],
        filters: filters
    });
    
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

// Save dialog
ipcMain.handle('select-save-location', async (event, title = 'Save File', defaultPath = '', filters = []) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: title,
        defaultPath: defaultPath,
        filters: filters
    });
    
    if (result.canceled) {
        return null;
    }
    return result.filePath;
});

// Log from renderer
ipcMain.on('log', (event, level, module, message, data) => {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    console.log(`[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${dataStr}`);
});

// ============================================================
// App Lifecycle
// ============================================================

app.whenReady().then(async () => {
    console.log('[Electron] App ready, starting backend...');
    
    try {
        await startBackend();
        createWindow();
    } catch (err) {
        console.error('[Electron] Failed to start:', err);
        dialog.showErrorBox('Startup Error', `Failed to start the backend server:\n\n${err.message}\n\nMake sure Python is installed and dependencies are set up.`);
        app.quit();
    }
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    stopBackend();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopBackend();
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('[Electron] Uncaught exception:', err);
    stopBackend();
});
