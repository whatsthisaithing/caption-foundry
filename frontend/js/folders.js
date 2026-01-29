/**
 * CaptionForge Folders Module
 * Handles folder browsing and file selection with drag-and-drop support
 */

const Folders = {
    currentFolderId: null,
    currentPage: 1,
    pageSize: 50,
    selectedFiles: new Set(),
    files: [],
    totalFiles: 0,
    isLoading: false,
    hasMoreFiles: true,
    currentFilter: 'all',
    allFilesSelected: false,  // Track if "select all" was clicked
    
    /**
     * Check if running in Electron desktop mode
     */
    isDesktopMode() {
        return typeof window.electronAPI !== 'undefined' && window.electronAPI.isElectron;
    },
    
    /**
     * Initialize the folders module
     */
    init() {
        this.bindEvents();
        this.initDragAndDrop();
    },
    
    /**
     * Initialize drag-and-drop support
     */
    initDragAndDrop() {
        const dropZone = document.getElementById('folderDropZone');
        const folderList = document.getElementById('folderList');
        
        // Prevent default drag behaviors on the whole document
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });
        
        // Highlight drop zone when dragging over folder list area
        ['dragenter', 'dragover'].forEach(eventName => {
            folderList.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
                dropZone.style.display = 'flex';
            }, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
                dropZone.style.display = 'none';
            }, false);
        });
        
        // Handle drop - in Electron, File objects have a .path property!
        dropZone.addEventListener('drop', async (e) => {
            Utils.log('info', 'folders', 'Folder drop event triggered', { isDesktopMode: this.isDesktopMode() });
            
            const files = e.dataTransfer.files;
            const items = e.dataTransfer.items;
            
            // In Electron, we can get the full path directly from dropped files!
            if (this.isDesktopMode() && files.length > 0 && files[0].path) {
                const droppedPath = files[0].path;
                Utils.log('info', 'folders', `Electron: got dropped path: ${droppedPath}`);
                
                // Check if it's a directory using the webkitGetAsEntry API
                let isDirectory = false;
                if (items && items.length > 0) {
                    const entry = items[0].webkitGetAsEntry?.();
                    isDirectory = entry?.isDirectory || false;
                }
                
                if (!isDirectory) {
                    // If they dropped a file, get its parent directory
                    const folderPath = droppedPath.replace(/[/\\][^/\\]+$/, '');
                    Utils.log('info', 'folders', `Dropped file, using parent: ${folderPath}`);
                    this.showAddFolderModalWithPath(folderPath);
                } else {
                    this.showAddFolderModalWithPath(droppedPath);
                }
                return;
            }
            
            // Fallback: try to get folder name from webkitGetAsEntry
            let folderName = null;
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i].webkitGetAsEntry?.();
                    if (item && item.isDirectory) {
                        folderName = item.name;
                        break;
                    }
                }
            }
            
            // Browser fallback - guide user to paste path
            if (folderName) {
                Utils.log('info', 'folders', `Dropped folder detected (no path): ${folderName}`);
                this.showAddFolderModal(folderName);
            } else {
                Utils.showToast('Please drop a folder, not individual files', 'warning');
            }
        }, false);
    },
    
    /**
     * Show add folder modal with path pre-filled (for Electron drag-drop)
     */
    showAddFolderModalWithPath(folderPath) {
        const modal = new bootstrap.Modal(document.getElementById('addFolderModal'));
        const pathInput = document.getElementById('folderPath');
        const nameInput = document.getElementById('folderName');
        
        pathInput.value = folderPath;
        nameInput.value = folderPath.split(/[/\\]/).pop();
        
        modal.show();
        Utils.showToast('Folder path captured!', 'success');
    },
    
    /**
     * Show the add folder modal with optional pre-filled name
     */
    showAddFolderModal(folderName = '') {
        const modal = new bootstrap.Modal(document.getElementById('addFolderModal'));
        const pathInput = document.getElementById('folderPath');
        const nameInput = document.getElementById('folderName');
        
        pathInput.value = '';
        nameInput.value = folderName;
        pathInput.placeholder = 'C:\\path\\to\\images';
        
        modal.show();
        
        if (folderName) {
            // Focus path input and try to auto-paste from clipboard
            document.getElementById('addFolderModal').addEventListener('shown.bs.modal', async () => {
                pathInput.focus();
                try {
                    const clipText = await navigator.clipboard.readText();
                    if (clipText && clipText.includes(folderName) && (clipText.includes('\\') || clipText.includes('/'))) {
                        pathInput.value = clipText.replace(/^["']|["']$/g, '');
                        Utils.showToast('Path auto-filled from clipboard!', 'success');
                    }
                } catch (err) {
                    // Clipboard access denied - that's fine
                }
            }, { once: true });
        }
    },
    
    /**
     * Browse for folder using native dialog (Electron) or show modal (browser)
     */
    async browseForFolder() {
        Utils.log('info', 'folders', 'browseForFolder() called', { isDesktopMode: this.isDesktopMode() });
        
        if (this.isDesktopMode()) {
            // Use Electron's native folder dialog
            try {
                Utils.log('debug', 'folders', 'Calling electronAPI.selectFolder()');
                const folderPath = await window.electronAPI.selectFolder('Select Image Folder');
                Utils.log('info', 'folders', `Native folder picker result: ${folderPath}`);
                
                if (folderPath) {
                    // We got a real path! Fill in the modal and show it
                    const modal = new bootstrap.Modal(document.getElementById('addFolderModal'));
                    document.getElementById('folderPath').value = folderPath;
                    document.getElementById('folderName').value = folderPath.split(/[/\\]/).pop();
                    modal.show();
                }
            } catch (err) {
                Utils.log('error', 'folders', `Folder picker error: ${err.message}`, { error: err });
                Utils.showToast('Error opening folder picker', 'error');
            }
        } else {
            // Browser fallback - just show the modal
            Utils.log('debug', 'folders', 'Browser mode: showing manual path modal');
            this.showAddFolderModal();
        }
    },
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Add folder button - use native browse in desktop mode
        document.getElementById('addFolderBtn').addEventListener('click', () => {
            if (this.isDesktopMode()) {
                // In desktop mode, go straight to folder picker
                this.browseForFolder();
            } else {
                // Browser mode - show modal with manual path entry
                const modal = new bootstrap.Modal(document.getElementById('addFolderModal'));
                document.getElementById('folderPath').placeholder = 'C:\\path\\to\\images';
                modal.show();
            }
        });
        
        // Browse path button inside modal
        document.getElementById('browsePathBtn')?.addEventListener('click', async () => {
            if (this.isDesktopMode()) {
                try {
                    const folderPath = await window.electronAPI.selectFolder('Select Image Folder');
                    if (folderPath) {
                        document.getElementById('folderPath').value = folderPath;
                        document.getElementById('folderName').value = folderPath.split(/[/\\]/).pop();
                    }
                } catch (err) {
                    console.error('Folder picker error:', err);
                    Utils.showToast('Error opening folder picker', 'error');
                }
            } else {
                Utils.showToast('Native folder browsing is only available in desktop mode. Please paste the path manually.', 'info');
            }
        });
        
        // Confirm add folder
        document.getElementById('confirmAddFolder').addEventListener('click', () => this.addFolder());
        
        // Confirm edit folder
        document.getElementById('confirmEditFolder')?.addEventListener('click', () => this.saveEditFolder());
        
        // Paste path button
        document.getElementById('pastePathBtn')?.addEventListener('click', async () => {
            try {
                const clipText = await navigator.clipboard.readText();
                if (clipText) {
                    // Remove surrounding quotes if present (Windows "Copy as path" adds them)
                    document.getElementById('folderPath').value = clipText.replace(/^["']|["']$/g, '');
                }
            } catch (err) {
                Utils.showToast('Unable to access clipboard. Please paste manually (Ctrl+V)', 'warning');
            }
        });
        
        // Select all button
        document.getElementById('selectAllBtn').addEventListener('click', () => this.toggleSelectAll());
        
        // Add to dataset button
        document.getElementById('addToDatasetBtn').addEventListener('click', () => this.showAddToDatasetDialog());
        
        // Confirm add to dataset button (in modal)
        document.getElementById('confirmAddToDataset')?.addEventListener('click', () => this.confirmAddToDataset());
        
        // File filter
        document.getElementById('fileFilterType').addEventListener('change', (e) => {
            if (this.currentFolderId) {
                this.loadFolderFiles(this.currentFolderId, 1, e.target.value, true);
            }
        });
        
        // Thumbnail size slider
        document.getElementById('thumbnailSize').addEventListener('input', (e) => {
            Utils.setThumbnailSize(e.target.value);
        });
        
        // Image detail modal - save caption button
        document.getElementById('saveImageCaption')?.addEventListener('click', () => this.saveImageCaption());
        
        // Image detail modal - generate caption button
        document.getElementById('generateImageCaption')?.addEventListener('click', () => this.generateSingleCaption());
        
        // Caption character counter
        const captionEl = document.getElementById('imageDetailCaption');
        const charCountEl = document.getElementById('captionCharCount');
        if (captionEl && charCountEl) {
            captionEl.addEventListener('input', () => {
                const len = captionEl.value.length;
                charCountEl.textContent = `${len} character${len === 1 ? '' : 's'}`;
            });
        }
    },
    
    /**
     * Load and display folders list
     */
    async loadFolders() {
        const list = document.getElementById('folderList');
        list.innerHTML = Utils.loadingSpinner('sm');
        
        try {
            const folders = await API.listFolders();
            
            if (folders.length === 0) {
                list.innerHTML = Utils.emptyState('bi-folder2-open', 'No folders tracked yet', 'Click + to add a folder');
                return;
            }
            
            list.innerHTML = folders.map(folder => `
                <a href="#" class="list-group-item list-group-item-action ${folder.id === this.currentFolderId ? 'active' : ''}" 
                   data-folder-id="${folder.id}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <i class="bi bi-folder me-2"></i>
                            <span>${Utils.escapeHtml(folder.name || folder.path.split(/[\\/]/).pop())}</span>
                        </div>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-light btn-sm edit-btn" title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-outline-light btn-sm rescan-btn" title="Rescan">
                                <i class="bi bi-arrow-clockwise"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm remove-btn" title="Remove">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="folder-info mt-1">
                        <small>${folder.file_count} files • Last scan: ${Utils.formatRelativeTime(folder.last_scan)}</small>
                    </div>
                </a>
            `).join('');
            
            // Bind folder click events
            list.querySelectorAll('[data-folder-id]').forEach(el => {
                el.addEventListener('click', (e) => {
                    // Ignore if clicking buttons
                    if (e.target.closest('.btn')) return;
                    e.preventDefault();
                    this.selectFolder(el.dataset.folderId);
                });
                
                // Edit button
                el.querySelector('.edit-btn').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showEditFolderModal(el.dataset.folderId);
                });
                
                // Rescan button
                el.querySelector('.rescan-btn').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.rescanFolder(el.dataset.folderId);
                });
                
                // Remove button
                el.querySelector('.remove-btn').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.removeFolder(el.dataset.folderId);
                });
            });
            
        } catch (error) {
            list.innerHTML = Utils.emptyState('bi-exclamation-triangle', 'Error loading folders', error.message);
            Utils.showToast('Failed to load folders: ' + error.message, 'error');
        }
    },
    
    /**
     * Add a new folder
     */
    async addFolder() {
        const path = document.getElementById('folderPath').value.trim();
        const name = document.getElementById('folderName').value.trim() || null;
        const recursive = document.getElementById('scanRecursively').checked;
        
        if (!path) {
            Utils.showToast('Please enter a folder path', 'warning');
            return;
        }
        
        const btn = document.getElementById('confirmAddFolder');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Adding...';
        
        try {
            const folder = await API.addFolder(path, name, recursive);
            Utils.showToast(`Added folder: ${folder.name || path}`, 'success');
            
            // Close modal and refresh
            bootstrap.Modal.getInstance(document.getElementById('addFolderModal')).hide();
            document.getElementById('addFolderForm').reset();
            
            await this.loadFolders();
            this.selectFolder(folder.id);
            
        } catch (error) {
            Utils.showToast('Failed to add folder: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Add Folder';
        }
    },
    
    /**
     * Select a folder and load its files
     */
    async selectFolder(folderId) {
        this.currentFolderId = folderId;
        this.selectedFiles.clear();
        this.allFilesSelected = false;
        this.currentPage = 1;
        this.hasMoreFiles = true;
        this.files = [];
        this.updateSelectionUI();
        
        // Update active state in list
        document.querySelectorAll('#folderList [data-folder-id]').forEach(el => {
            el.classList.toggle('active', el.dataset.folderId === folderId);
        });
        
        const filter = document.getElementById('fileFilterType').value;
        await this.loadFolderFiles(folderId, 1, filter, true);
    },
    
    /**
     * Load files for a folder with infinite scroll support
     */
    async loadFolderFiles(folderId, page = 1, filter = 'all', reset = false) {
        if (this.isLoading) return;
        
        const grid = document.getElementById('imageGrid');
        
        // Show initial loading spinner on first load
        if (reset) {
            grid.innerHTML = Utils.loadingSpinner();
            this.files = [];
            this.currentPage = 1;
            this.hasMoreFiles = true;
            this.currentFilter = filter;
        }
        
        this.isLoading = true;
        this.currentPage = page;
        
        try {
            const folder = await API.getFolder(folderId);
            const response = await API.getFolderFiles(folderId, page, this.pageSize, filter);
            
            this.totalFiles = response.total;
            
            // Update header
            document.getElementById('folderTitle').innerHTML = `<i class="bi bi-folder me-2"></i>${Utils.escapeHtml(folder.name || folder.path)}`;
            document.getElementById('fileCount').textContent = `${response.total} files`;
            
            // Enable toolbar buttons
            document.getElementById('selectAllBtn').disabled = false;
            
            if (response.files.length === 0 && reset) {
                grid.innerHTML = Utils.emptyState('bi-images', 'No images found', filter !== 'all' ? 'Try changing the filter' : '');
                this.hasMoreFiles = false;
                return;
            }
            
            // Append new files to the list
            this.files.push(...response.files);
            this.hasMoreFiles = this.files.length < response.total;
            
            // Render new image cards (append if not reset)
            const newCardsHtml = response.files.map(file => this.renderImageCard(file)).join('');
            
            if (reset) {
                grid.innerHTML = newCardsHtml;
            } else {
                grid.insertAdjacentHTML('beforeend', newCardsHtml);
            }
            
            // Bind click events to new cards only
            this.bindImageCardEvents();
            
            // Setup infinite scroll on first load
            if (reset) {
                this.setupInfiniteScroll(grid);
            }
            
            // Remove pagination, add loading indicator if more files available
            document.getElementById('imagePagination').style.display = 'none';
            
            // Manage loading indicator
            let indicator = document.getElementById('loadMoreIndicator');
            if (this.hasMoreFiles) {
                if (!indicator) {
                    indicator = document.createElement('div');
                    indicator.id = 'loadMoreIndicator';
                    indicator.className = 'text-center text-muted py-2';
                    indicator.innerHTML = '<small><i class="bi bi-arrow-down-circle"></i> Scroll for more...</small>';
                    // Insert at the end of the grid
                    grid.appendChild(indicator);
                }
            } else if (indicator) {
                indicator.remove();
            }
            
        } catch (error) {
            grid.innerHTML = Utils.emptyState('bi-exclamation-triangle', 'Error loading files', error.message);
            Utils.showToast('Failed to load files: ' + error.message, 'error');
        } finally {
            this.isLoading = false;
        }
    },
    
    /**
     * Setup infinite scroll detection
     */
    setupInfiniteScroll(grid) {
        // Remove any existing scroll listener
        if (this._scrollHandler) {
            grid.removeEventListener('scroll', this._scrollHandler);
        }
        
        this._scrollHandler = () => {
            if (this.isLoading || !this.hasMoreFiles) return;
            
            // Check if user scrolled near bottom (within 500px)
            const scrollTop = grid.scrollTop;
            const scrollHeight = grid.scrollHeight;
            const clientHeight = grid.clientHeight;
            
            if (scrollTop + clientHeight >= scrollHeight - 500) {
                // Load next page
                this.loadFolderFiles(this.currentFolderId, this.currentPage + 1, this.currentFilter, false);
            }
        };
        
        grid.addEventListener('scroll', this._scrollHandler);
    },
    
    /**
     * Render an image card
     */
    renderImageCard(file) {
        const isSelected = this.selectedFiles.has(file.id);
        const qualityClass = Utils.getQualityClass(file.quality_score);
        
        return `
            <div class="image-card draggable ${isSelected ? 'selected' : ''}" data-file-id="${file.id}" draggable="true">
                <input type="checkbox" class="form-check-input select-checkbox" ${isSelected ? 'checked' : ''}>
                <img src="${API.getThumbnailUrl(file.id)}" alt="${Utils.escapeHtml(file.filename)}" loading="lazy">
                ${file.has_caption ? '<span class="badge bg-success caption-badge"><i class="bi bi-chat-quote-fill"></i></span>' : ''}
                ${qualityClass ? `<span class="quality-indicator ${qualityClass}"></span>` : ''}
                <div class="image-overlay">
                    <span>${Utils.escapeHtml(Utils.truncate(file.filename, 25))}</span>
                </div>
            </div>
        `;
    },
    
    /**
     * Bind events to image cards
     */
    bindImageCardEvents() {
        document.querySelectorAll('#imageGrid .image-card').forEach(card => {
            const fileId = card.dataset.fileId;
            const checkbox = card.querySelector('.select-checkbox');
            
            // Card click - show details
            card.addEventListener('click', (e) => {
                if (e.target === checkbox) return; // Don't trigger on checkbox click
                this.showImageDetails(fileId);
            });
            
            // Checkbox click - toggle selection
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFileSelection(fileId, card, checkbox);
            });
            
            // Drag start - set up data for dropping into datasets
            card.addEventListener('dragstart', (e) => {
                card.classList.add('dragging');
                
                // If the dragged item is selected, drag all selected items
                // If not selected, just drag this one item
                let dragIds;
                if (this.selectedFiles.has(fileId)) {
                    dragIds = Array.from(this.selectedFiles);
                } else {
                    dragIds = [fileId];
                }
                
                // Set the drag data
                e.dataTransfer.setData('application/x-captionforge-images', JSON.stringify(dragIds));
                e.dataTransfer.setData('text/plain', `${dragIds.length} image(s)`);
                e.dataTransfer.effectAllowed = 'copy';
                
                // Create a custom drag image showing count
                if (dragIds.length > 1) {
                    const dragImage = document.createElement('div');
                    dragImage.className = 'drag-image-preview';
                    dragImage.innerHTML = `<i class="bi bi-images"></i> ${dragIds.length} images`;
                    dragImage.style.cssText = 'position:absolute;top:-1000px;padding:8px 12px;background:#0d6efd;color:white;border-radius:4px;font-weight:500;';
                    document.body.appendChild(dragImage);
                    e.dataTransfer.setDragImage(dragImage, 0, 0);
                    setTimeout(() => dragImage.remove(), 0);
                }
            });
            
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
            });
        });
    },
    
    /**
     * Toggle file selection
     */
    toggleFileSelection(fileId, card, checkbox) {
        if (this.selectedFiles.has(fileId)) {
            this.selectedFiles.delete(fileId);
            card.classList.remove('selected');
            checkbox.checked = false;
        } else {
            this.selectedFiles.add(fileId);
            card.classList.add('selected');
            checkbox.checked = true;
        }
        this.updateSelectionUI();
    },
    
    /**
     * Toggle select all
     */
    async toggleSelectAll() {
        const isAllSelected = this.allFilesSelected || (this.selectedFiles.size === this.totalFiles);
        
        if (isAllSelected) {
            // Deselect all
            this.selectedFiles.clear();
            this.allFilesSelected = false;
            
            document.querySelectorAll('#imageGrid .image-card').forEach(card => {
                card.classList.remove('selected');
                const checkbox = card.querySelector('.select-checkbox');
                if (checkbox) checkbox.checked = false;
            });
        } else {
            // Select all - need to fetch all file IDs if we haven't loaded them all
            if (this.files.length < this.totalFiles) {
                try {
                    // Fetch all file IDs from the backend
                    const filter = this.currentFilter || 'all';
                    const response = await API.getFolderFiles(this.currentFolderId, 1, this.totalFiles, filter);
                    
                    // Add all IDs to selection
                    this.selectedFiles.clear();
                    response.files.forEach(file => this.selectedFiles.add(file.id));
                    this.allFilesSelected = true;
                } catch (error) {
                    Utils.showToast('Failed to fetch all files: ' + error.message, 'error');
                    return;
                }
            } else {
                // All files are loaded, just select them
                this.files.forEach(file => this.selectedFiles.add(file.id));
            }
            
            // Update UI for currently visible cards
            document.querySelectorAll('#imageGrid .image-card').forEach(card => {
                card.classList.add('selected');
                const checkbox = card.querySelector('.select-checkbox');
                if (checkbox) checkbox.checked = true;
            });
        }
        
        this.updateSelectionUI();
    },
    
    /**
     * Update selection UI elements
     */
    updateSelectionUI() {
        const count = this.selectedFiles.size;
        const btn = document.getElementById('addToDatasetBtn');
        const selectBtn = document.getElementById('selectAllBtn');
        
        btn.disabled = count === 0;
        btn.innerHTML = count > 0 
            ? `<i class="bi bi-plus"></i> Add ${count} to Dataset` 
            : '<i class="bi bi-plus"></i> Add to Dataset';
        
        // Update select all button text
        const isAllSelected = this.allFilesSelected || this.selectedFiles.size === this.totalFiles;
        selectBtn.innerHTML = isAllSelected
            ? '<i class="bi bi-x-lg"></i> Deselect All'
            : `<i class="bi bi-check2-all"></i> Select All${this.totalFiles > 0 ? ' (' + this.totalFiles + ')' : ''}`;
    },
    
    /**
     * Show add to dataset dialog
     */
    async showAddToDatasetDialog() {
        if (this.selectedFiles.size === 0) return;
        
        try {
            const datasets = await API.listDatasets();
            
            if (datasets.length === 0) {
                Utils.showToast('No datasets available. Create a dataset first.', 'warning');
                return;
            }
            
            // Populate the dataset selector modal
            const select = document.getElementById('selectDatasetList');
            select.innerHTML = datasets.map(d => `
                <option value="${d.id}">${Utils.escapeHtml(d.name)} (${d.file_count} files)</option>
            `).join('');
            
            // Update count display
            document.getElementById('selectedFilesCount').textContent = this.selectedFiles.size;
            
            // Show the modal
            const modal = new bootstrap.Modal(document.getElementById('selectDatasetModal'));
            modal.show();
            
        } catch (error) {
            Utils.showToast('Failed to load datasets: ' + error.message, 'error');
        }
    },
    
    /**
     * Confirm adding selected files to dataset (called from modal)
     */
    async confirmAddToDataset() {
        const datasetId = document.getElementById('selectDatasetList').value;
        if (!datasetId) {
            Utils.showToast('Please select a dataset', 'warning');
            return;
        }
        
        try {
            const result = await API.addFilesToDataset(datasetId, Array.from(this.selectedFiles));
            const datasetName = document.getElementById('selectDatasetList').selectedOptions[0].text;
            Utils.showToast(`Added ${result.added} files to dataset`, 'success');
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('selectDatasetModal')).hide();
            
            // Mark that the dataset needs refresh (will be picked up when switching to datasets view)
            Datasets.needsRefresh = true;
            Datasets.lastModifiedDatasetId = datasetId;
            
            // Clear selection
            this.selectedFiles.clear();
            this.updateSelectionUI();
            
            // Refresh the grid to update selection state
            document.querySelectorAll('#imageGrid .image-card.selected').forEach(card => {
                card.classList.remove('selected');
                card.querySelector('.select-checkbox').checked = false;
            });
            
        } catch (error) {
            Utils.showToast('Failed to add files: ' + error.message, 'error');
        }
    },
    
    /**
     * Show image details modal
     */
    async showImageDetails(fileId) {
        const modal = new bootstrap.Modal(document.getElementById('imageDetailModal'));
        
        try {
            const file = await API.getFileDetails(fileId);
            
            document.getElementById('imageDetailTitle').textContent = file.filename;
            document.getElementById('imageDetailPreview').src = API.getImageUrl(fileId);
            
            // File info table
            document.getElementById('imageDetailInfo').innerHTML = `
                <tr><td>Filename</td><td>${Utils.escapeHtml(file.filename)}</td></tr>
                <tr><td>Path</td><td><small>${Utils.escapeHtml(file.relative_path)}</small></td></tr>
                <tr><td>Dimensions</td><td>${file.width} × ${file.height}</td></tr>
                <tr><td>Size</td><td>${Utils.formatBytes(file.file_size)}</td></tr>
                <tr><td>Format</td><td>${file.format}</td></tr>
                <tr><td>Added</td><td>${Utils.formatDate(file.discovered_date)}</td></tr>
            `;
            
            // Imported caption (read-only) - this is from the paired .txt file
            const captionArea = document.getElementById('imageDetailCaptionArea');
            if (file.imported_caption) {
                captionArea.innerHTML = `
                    <div class="alert alert-secondary mb-0">
                        <small class="text-muted d-block mb-1"><i class="bi bi-file-text me-1"></i>Imported from paired .txt file</small>
                        <div style="white-space: pre-wrap;">${Utils.escapeHtml(file.imported_caption)}</div>
                    </div>
                `;
            } else {
                captionArea.innerHTML = `
                    <div class="text-muted fst-italic">
                        <i class="bi bi-info-circle me-1"></i>No paired caption file found.
                        <br><small>Add a .txt file with the same name as the image to import a caption.</small>
                    </div>
                `;
            }
            
            modal.show();
            
        } catch (error) {
            Utils.showToast('Failed to load file details: ' + error.message, 'error');
        }
    },
    
    /**
     * Save caption for current image in detail modal
     */
    async saveImageCaption() {
        const captionEl = document.getElementById('imageDetailCaption');
        const fileId = captionEl.dataset.fileId;
        const text = captionEl.value.trim();
        
        if (!fileId) {
            Utils.showToast('No file selected', 'warning');
            return;
        }
        
        try {
            // Update the imported_caption field on the file
            await API.request(`/files/${fileId}/caption`, {
                method: 'PUT',
                body: { text }
            });
            
            Utils.showToast('Caption saved', 'success');
            
            // Update the has_caption indicator if in the grid
            const card = document.querySelector(`[data-file-id="${fileId}"]`);
            if (card && text) {
                let badge = card.querySelector('.caption-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'badge bg-success caption-badge';
                    badge.innerHTML = '<i class="bi bi-chat-quote-fill"></i>';
                    card.appendChild(badge);
                }
            }
            
        } catch (error) {
            Utils.showToast('Failed to save caption: ' + error.message, 'error');
        }
    },
    
    /**
     * Generate caption for current image using vision model
     */
    async generateSingleCaption() {
        const captionEl = document.getElementById('imageDetailCaption');
        const fileId = captionEl.dataset.fileId;
        
        if (!fileId) {
            Utils.showToast('No file selected', 'warning');
            return;
        }
        
        const btn = document.getElementById('generateImageCaption');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating...';
        
        try {
            const result = await API.generateCaption(fileId);
            captionEl.value = result.caption;
            Utils.showToast('Caption generated', 'success');
            
        } catch (error) {
            Utils.showToast('Failed to generate caption: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    },
    
    /**
     * Show edit folder modal
     */
    async showEditFolderModal(folderId) {
        try {
            const folder = await API.getFolder(folderId);
            
            document.getElementById('editFolderId').value = folder.id;
            document.getElementById('editFolderPath').value = folder.path;
            document.getElementById('editFolderName').value = folder.name || '';
            document.getElementById('editFolderEnabled').checked = folder.enabled !== false;
            
            const modal = new bootstrap.Modal(document.getElementById('editFolderModal'));
            modal.show();
        } catch (error) {
            Utils.showToast('Failed to load folder: ' + error.message, 'error');
        }
    },
    
    /**
     * Save edited folder
     */
    async saveEditFolder() {
        const folderId = document.getElementById('editFolderId').value;
        const name = document.getElementById('editFolderName').value.trim() || null;
        const enabled = document.getElementById('editFolderEnabled').checked;
        
        const btn = document.getElementById('confirmEditFolder');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
        
        try {
            await API.updateFolder(folderId, { name, enabled });
            Utils.showToast('Folder updated successfully', 'success');
            
            bootstrap.Modal.getInstance(document.getElementById('editFolderModal')).hide();
            await this.loadFolders();
            
        } catch (error) {
            Utils.showToast('Failed to update folder: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Save Changes';
        }
    },
    
    /**
     * Rescan a folder
     */
    async rescanFolder(folderId) {
        const btn = event.target.closest('.rescan-btn');
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        
        try {
            const result = await API.scanFolder(folderId);
            Utils.showToast(`Scan complete: ${result.files_added} added, ${result.files_updated} updated, ${result.files_removed} removed`, 'success');
            
            // Immediately refresh the folder list and files if this folder is selected
            await this.loadFolders();
            
            if (this.currentFolderId === folderId) {
                // Update the file count in the header immediately
                const folder = await API.getFolder(folderId);
                document.getElementById('fileCount').textContent = `${folder.file_count} files`;
                
                // Reload the files
                await this.loadFolderFiles(folderId, 1, document.getElementById('fileFilterType').value, true);
            }
            
        } catch (error) {
            Utils.showToast('Failed to scan folder: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    },
    
    /**
     * Remove a folder
     */
    async removeFolder(folderId) {
        if (!await Utils.confirm('Remove this folder from tracking? (Files will not be deleted)')) {
            return;
        }
        
        try {
            await API.removeFolder(folderId);
            Utils.showToast('Folder removed', 'success');
            
            if (this.currentFolderId === folderId) {
                this.currentFolderId = null;
                document.getElementById('imageGrid').innerHTML = Utils.emptyState('bi-images', 'Select a folder to view images');
                document.getElementById('folderTitle').innerHTML = '<i class="bi bi-image me-2"></i>Select a folder';
                document.getElementById('fileCount').textContent = '';
            }
            
            await this.loadFolders();
            
        } catch (error) {
            Utils.showToast('Failed to remove folder: ' + error.message, 'error');
        }
    },
    
    /**
     * Render pagination controls
     */
    renderPagination(total, currentPage) {
        const totalPages = Math.ceil(total / this.pageSize);
        const pagination = document.getElementById('imagePagination');
        
        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }
        
        pagination.style.display = 'block';
        const ul = pagination.querySelector('ul');
        
        let html = '';
        
        // Previous button
        html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a>
        </li>`;
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                </li>`;
            } else if (i === currentPage - 3 || i === currentPage + 3) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }
        
        // Next button
        html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>
        </li>`;
        
        ul.innerHTML = html;
        
        // Bind events
        ul.querySelectorAll('[data-page]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const page = parseInt(el.dataset.page);
                if (page >= 1 && page <= totalPages && page !== currentPage) {
                    const filter = document.getElementById('fileFilterType').value;
                    this.loadFolderFiles(this.currentFolderId, page, filter);
                }
            });
        });
    }
};

// Make available globally
window.Folders = Folders;