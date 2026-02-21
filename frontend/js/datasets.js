/**
 * CaptionFoundry Datasets Module
 * Handles dataset management and caption sets
 */

const Datasets = {
    currentDatasetId: null,
    currentCaptionSetId: null,
    draggedImageIds: [], // Track dragged images for adding to datasets
    currentDatasetFiles: [],
    currentEditingFileId: null,
    lastGeneratedCaption: null,
    isLoadingImages: false,
    hasMoreImages: true,
    currentImagePage: 1,
    imagePageSize: 50,
    totalDatasetFiles: 0,
    needsRefresh: false,  // Track if dataset images need refresh
    lastModifiedDatasetId: null,  // Track which dataset was modified
    imagePageSize: 50,
    totalDatasetFiles: 0,
    
    // Prompt templates for custom caption style (creative instructions only)
    // System will automatically append quality assessment and JSON output format requirements
    promptTemplates: {
        natural: `Describe this image in one clear, concise sentence suitable for AI image generation training.
Focus on: main subject, action/pose, setting/background.
Be objective and descriptive. Avoid subjective interpretations.`,
        detailed: `Provide a detailed 2-3 sentence description of this image suitable for AI training.
Include: subjects, actions, environment, mood, lighting, notable details, composition.
Be specific and objective.`,
        tags: `Generate 15-25 comma-separated lowercase tags describing this image. NOT a sentence - just tags separated by commas.
Include: subject, gender, pose/action, clothing details, hair color/style, eye color, background/setting, lighting, colors, mood.`
    },
    
    /**
     * Initialize the datasets module
     */
    init() {
        this.bindEvents();
        this.initDragAndDrop();
    },
    
    /**
     * Initialize drag and drop for dataset images
     */
    initDragAndDrop() {
        const dropZone = document.getElementById('datasetImageDropZone');
        const datasetCard = dropZone?.closest('.card');
        
        if (!dropZone || !datasetCard) return;
        
        // Prevent default drag behaviors on the whole document
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
            datasetCard.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        // Show drop zone when dragging over
        datasetCard.addEventListener('dragenter', (e) => {
            if (!this.currentDatasetId) return;
            
            // Check if it's a file drag or internal drag
            const hasFiles = e.dataTransfer.types.includes('Files');
            const hasInternal = e.dataTransfer.types.includes('application/x-captionforge-images');
            
            if (hasFiles || hasInternal) {
                dropZone.classList.add('active');
            }
        });
        
        datasetCard.addEventListener('dragover', (e) => {
            if (!this.currentDatasetId) return;
            dropZone.classList.add('drag-over');
        });
        
        datasetCard.addEventListener('dragleave', (e) => {
            // Only hide if we're leaving the card entirely
            if (!datasetCard.contains(e.relatedTarget)) {
                dropZone.classList.remove('active', 'drag-over');
            }
        });
        
        datasetCard.addEventListener('drop', async (e) => {
            dropZone.classList.remove('active', 'drag-over');
            
            if (!this.currentDatasetId) {
                Utils.showToast('Please select a dataset first', 'warning');
                return;
            }
            
            // Check for internal image drag (from folder view)
            const internalData = e.dataTransfer.getData('application/x-captionforge-images');
            if (internalData) {
                try {
                    const imageIds = JSON.parse(internalData);
                    await this.addImagesToDataset(imageIds);
                } catch (err) {
                    console.error('Failed to parse drag data:', err);
                }
                return;
            }
            
            // Handle external file drops
            const files = Array.from(e.dataTransfer.files);
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            
            if (imageFiles.length === 0) {
                Utils.showToast('No image files found in drop', 'warning');
                return;
            }
            
            Utils.showToast(`External file drops require the files to be in a tracked folder first`, 'info');
        });
        
        // Add button for adding images from folder
        document.getElementById('addFromFolderBtn')?.addEventListener('click', () => {
            this.showAddFromFolderDialog();
        });
    },
    
    /**
     * Add images to current dataset
     */
    async addImagesToDataset(fileIds) {
        if (!this.currentDatasetId || !fileIds.length) return;
        
        try {
            await API.addFilesToDataset(this.currentDatasetId, fileIds);
            Utils.showToast(`Added ${fileIds.length} image(s) to dataset`, 'success');
            await this.selectDataset(this.currentDatasetId);
        } catch (error) {
            // Check if it's a duplicate error
            if (error.message.includes('already')) {
                Utils.showToast('Some images are already in the dataset', 'info');
            } else {
                Utils.showToast('Failed to add images: ' + error.message, 'error');
            }
        }
    },
    
    /**
     * Show dialog to add images from a folder
     */
    async showAddFromFolderDialog() {
        if (!this.currentDatasetId) {
            Utils.showToast('Please select a dataset first', 'warning');
            return;
        }
        
        // For now, show a simple toast - full modal implementation would be added later
        Utils.showToast('Go to Folders view and drag images here, or select images and use "Add to Dataset"', 'info');
    },
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Create dataset button
        document.getElementById('createDatasetBtn').addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('createDatasetModal'));
            modal.show();
        });
        
        // Auto-focus dataset name input when modal is shown
        document.getElementById('createDatasetModal').addEventListener('shown.bs.modal', () => {
            document.getElementById('datasetName').focus();
        });
        
        // Prevent form submission
        document.getElementById('createDatasetForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createDataset();
        });
        
        // Confirm create dataset
        document.getElementById('confirmCreateDataset').addEventListener('click', () => this.createDataset());
        
        // Create caption set button
        document.getElementById('createCaptionSetBtn').addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('createCaptionSetModal'));
            modal.show();
        });
        
        // Auto-focus caption set name input when modal is shown
        document.getElementById('createCaptionSetModal').addEventListener('shown.bs.modal', () => {
            document.getElementById('captionSetName').focus();
        });
        
        // Prevent form submission for caption set
        document.getElementById('createCaptionSetForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createCaptionSet();
        });
        
        // Confirm create caption set
        document.getElementById('confirmCreateCaptionSet').addEventListener('click', () => this.createCaptionSet());
        
        // Caption set style change - show/hide custom prompt
        document.getElementById('captionSetStyle')?.addEventListener('change', (e) => {
            const customPromptGroup = document.getElementById('customPromptGroup');
            customPromptGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        });
        
        // Copy template buttons (create modal)
        document.querySelectorAll('.copy-template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const template = e.target.dataset.template;
                const promptText = this.promptTemplates[template];
                if (promptText) {
                    document.getElementById('captionSetCustomPrompt').value = promptText;
                    Utils.showToast(`Copied ${template} template`, 'success');
                }
            });
        });
        
        // Confirm edit caption set
        document.getElementById('confirmEditCaptionSet')?.addEventListener('click', () => this.saveCaptionSet());
        
        // Edit caption set style change - show/hide custom prompt
        document.getElementById('editCaptionSetStyle')?.addEventListener('change', (e) => {
            const customPromptGroup = document.getElementById('editCustomPromptGroup');
            customPromptGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        });
        
        // Copy template buttons (edit modal)
        document.querySelectorAll('.edit-copy-template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const template = e.target.dataset.template;
                const promptText = this.promptTemplates[template];
                if (promptText) {
                    document.getElementById('editCaptionSetCustomPrompt').value = promptText;
                    Utils.showToast(`Copied ${template} template`, 'success');
                }
            });
        });
        
        // Edit dataset button
        document.getElementById('editDatasetBtn').addEventListener('click', () => this.showEditDataset());
        
        // Clone dataset button
        document.getElementById('cloneDatasetBtn').addEventListener('click', () => this.cloneDataset());
        
        // Confirm clone dataset
        document.getElementById('confirmCloneDataset')?.addEventListener('click', () => this.confirmCloneDataset());
        
        // Prevent form submission and handle Enter key for clone modal
        document.getElementById('cloneDatasetForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.confirmCloneDataset();
        });
        
        // Confirm edit dataset
        document.getElementById('confirmEditDataset')?.addEventListener('click', () => this.saveDataset());
        
        // Auto-focus clone dataset name when modal opens
        const cloneDatasetModal = document.getElementById('cloneDatasetModal');
        if (cloneDatasetModal) {
            cloneDatasetModal.addEventListener('shown.bs.modal', () => {
                document.getElementById('cloneDatasetName')?.focus();
            });
        }
        
        // Export dataset button
        document.getElementById('exportDatasetBtn').addEventListener('click', () => this.showExportDialog());
        
        // Export type radio buttons
        document.querySelectorAll('input[name="exportType"]').forEach(el => {
            el.addEventListener('change', (e) => {
                document.getElementById('exportPathGroup').style.display = 
                    e.target.value === 'folder' ? 'block' : 'none';
            });
        });
        
        // Confirm export button
        document.getElementById('confirmExport').addEventListener('click', () => this.startExport());
        
        // Browse export path button
        document.getElementById('browseExportPath')?.addEventListener('click', async () => {
            if (typeof window.electronAPI !== 'undefined' && window.electronAPI.isElectron) {
                try {
                    const folderPath = await window.electronAPI.selectFolder('Select Export Folder');
                    if (folderPath) {
                        document.getElementById('exportPath').value = folderPath;
                    }
                } catch (err) {
                    console.error('Folder picker error:', err);
                    Utils.showToast('Error opening folder picker', 'error');
                }
            } else {
                Utils.showToast('Native folder browsing is only available in desktop mode. Please enter the path manually.', 'info');
            }
        });
        
        // Dataset caption editor buttons
        document.getElementById('datasetCaptionSaveBtn')?.addEventListener('click', () => this.saveCaption());
        document.getElementById('datasetCaptionCopyImported')?.addEventListener('click', () => this.copyImportedCaption());
        document.getElementById('datasetCaptionGenerateBtn')?.addEventListener('click', () => this.generateCaption());
        document.getElementById('datasetCaptionHistoryBtn')?.addEventListener('click', () => this.showCaptionHistory());
        document.getElementById('datasetCaptionPrevBtn')?.addEventListener('click', () => this.navigatePrev());
        document.getElementById('datasetCaptionNextBtn')?.addEventListener('click', () => this.navigateNext());
        
        // Character count update and clear generation metadata on manual edit
        document.getElementById('datasetCaptionText')?.addEventListener('input', () => {
            this.updateCaptionCharCount();
            // Clear generation metadata when user manually edits the text
            this.lastGeneratedCaption = null;
        });
    },
    
    /**
     * Load and display datasets list
     */
    async loadDatasets() {
        const list = document.getElementById('datasetList');
        list.innerHTML = Utils.loadingSpinner('sm');
        
        try {
            const datasets = await API.listDatasets();
            
            if (datasets.length === 0) {
                list.innerHTML = Utils.emptyState('bi-collection', 'No datasets yet', 'Create a dataset to organize images');
                return;
            }
            
            list.innerHTML = datasets.map(dataset => `
                <a href="#" class="list-group-item list-group-item-action dataset-drop-target ${dataset.id === this.currentDatasetId ? 'active' : ''}" 
                   data-dataset-id="${dataset.id}">
                    <div class="d-flex justify-content-between align-items-center">
                        <span><i class="bi bi-collection me-2"></i>${Utils.escapeHtml(dataset.name)}</span>
                        <button class="btn btn-outline-danger btn-sm delete-btn" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                    <div class="dataset-info mt-1">
                        <small>${dataset.file_count} files • Created ${Utils.formatRelativeTime(dataset.created_date)}</small>
                    </div>
                </a>
            `).join('');
            
            // Bind click events and drop handlers
            list.querySelectorAll('[data-dataset-id]').forEach(el => {
                const datasetId = el.dataset.datasetId;
                
                el.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-btn')) return;
                    e.preventDefault();
                    this.selectDataset(datasetId);
                });
                
                el.querySelector('.delete-btn').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.deleteDataset(datasetId);
                });
                
                // Drop handlers for each dataset item
                el.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.types.includes('application/x-captionforge-images')) {
                        el.classList.add('drag-over');
                        e.dataTransfer.dropEffect = 'copy';
                    }
                });
                
                el.addEventListener('dragleave', (e) => {
                    e.stopPropagation();
                    el.classList.remove('drag-over');
                });
                
                el.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    el.classList.remove('drag-over');
                    
                    const data = e.dataTransfer.getData('application/x-captionforge-images');
                    if (data) {
                        try {
                            const imageIds = JSON.parse(data);
                            const originalDatasetId = this.currentDatasetId;
                            this.currentDatasetId = datasetId;
                            await this.addImagesToDataset(imageIds);
                            this.currentDatasetId = originalDatasetId;
                            await this.loadDatasets(); // Refresh counts
                        } catch (err) {
                            console.error('Drop error:', err);
                        }
                    }
                });
            });
            
        } catch (error) {
            list.innerHTML = Utils.emptyState('bi-exclamation-triangle', 'Error loading datasets', error.message);
        }
    },
    
    /**
     * Create a new dataset
     */
    async createDataset() {
        const name = document.getElementById('datasetName').value.trim();
        const description = document.getElementById('datasetDescription').value.trim() || null;
        
        Utils.log('info', 'datasets', `Creating dataset: name='${name}', description='${description}'`);
        
        if (!name) {
            Utils.showToast('Please enter a dataset name', 'warning');
            return;
        }
        
        try {
            const dataset = await API.createDataset(name, description);
            Utils.log('info', 'datasets', `Dataset created successfully: id=${dataset.id}`);
            Utils.showToast(`Created dataset: ${dataset.name}`, 'success');
            
            bootstrap.Modal.getInstance(document.getElementById('createDatasetModal')).hide();
            document.getElementById('createDatasetForm').reset();
            
            await this.loadDatasets();
            this.selectDataset(dataset.id);
            
        } catch (error) {
            Utils.log('error', 'datasets', `Dataset creation failed: ${error.message}`, { error: error.toString() });
            Utils.showToast('Failed to create dataset: ' + error.message, 'error');
        }
    },
    
    /**
     * Select a dataset and load its details
     */
    async selectDataset(datasetId) {
        this.currentDatasetId = datasetId;
        
        // Update active state
        document.querySelectorAll('#datasetList [data-dataset-id]').forEach(el => {
            el.classList.toggle('active', el.dataset.datasetId === datasetId);
        });
        
        // Enable buttons
        document.getElementById('editDatasetBtn').disabled = false;
        document.getElementById('cloneDatasetBtn').disabled = false;
        document.getElementById('exportDatasetBtn').disabled = false;
        document.getElementById('createCaptionSetBtn').disabled = false;
        document.getElementById('addFromFolderBtn').disabled = false;
        
        await Promise.all([
            this.loadDatasetDetails(datasetId),
            this.loadCaptionSets(datasetId),
            this.loadDatasetImages(datasetId, 1, true)
        ]);
    },
    
    /**
     * Load dataset details and stats
     */
    async loadDatasetDetails(datasetId) {
        const statsEl = document.getElementById('datasetStats');
        statsEl.innerHTML = Utils.loadingSpinner('sm');
        
        try {
            const [dataset, stats] = await Promise.all([
                API.getDataset(datasetId),
                API.getDatasetStats(datasetId)
            ]);
            
            document.getElementById('datasetTitle').innerHTML = `<i class="bi bi-collection me-2"></i>${Utils.escapeHtml(dataset.name)}`;
            document.getElementById('datasetFileCount').textContent = `${stats.total_files} files`;
            
            statsEl.innerHTML = `
                <div class="row g-3">
                    <div class="col-md-3">
                        <div class="stat-card">
                            <div class="stat-value">${stats.total_files}</div>
                            <div class="stat-label">Total Files</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card">
                            <div class="stat-value">${stats.captioned_files}</div>
                            <div class="stat-label">Captioned</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card">
                            <div class="stat-value">${stats.uncaptioned_files}</div>
                            <div class="stat-label">Uncaptioned</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-card">
                            <div class="stat-value">${Utils.formatBytes(stats.total_size_bytes)}</div>
                            <div class="stat-label">Total Size</div>
                        </div>
                    </div>
                </div>
                ${dataset.description ? `<p class="text-muted mt-3 mb-0"><small>${Utils.escapeHtml(dataset.description)}</small></p>` : ''}
            `;
            
        } catch (error) {
            statsEl.innerHTML = Utils.emptyState('bi-exclamation-triangle', 'Error loading stats', error.message);
        }
    },
    
    /**
     * Load caption sets for a dataset
     */
    async loadCaptionSets(datasetId) {
        const list = document.getElementById('captionSetList');
        list.innerHTML = Utils.loadingSpinner('sm');
        
        try {
            const captionSets = await API.listCaptionSets(datasetId);
            
            if (captionSets.length === 0) {
                list.innerHTML = `<div class="text-center text-muted py-3"><small>No caption sets yet</small></div>`;
                return;
            }
            
            list.innerHTML = captionSets.map(cs => `
                <div class="caption-set-item ${cs.id === this.currentCaptionSetId ? 'selected' : ''}" data-caption-set-id="${cs.id}">
                    <div class="caption-set-info">
                        <div class="caption-set-name">
                            ${cs.id === this.currentCaptionSetId ? '<i class="bi bi-check-circle-fill text-primary me-1"></i>' : ''}
                            ${Utils.escapeHtml(cs.name)}
                        </div>
                        <div class="caption-set-meta">
                            ${cs.style} • ${cs.caption_count} captions
                            ${cs.max_length ? `• max ${cs.max_length} chars` : ''}
                        </div>
                    </div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary auto-caption-btn" title="Auto-caption">
                            <i class="bi bi-magic"></i>
                        </button>
                        <button class="btn btn-outline-info bulk-edit-btn" title="Bulk Edit Captions">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        ${cs.can_rollback_bulk_edit ? `
                            <button class="btn btn-outline-warning bulk-rollback-btn" title="Rollback Last Bulk Edit">
                                <i class="bi bi-arrow-counterclockwise"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-outline-secondary edit-btn" title="Edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-danger delete-btn" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
            
            // Bind events
            list.querySelectorAll('[data-caption-set-id]').forEach(el => {
                const csId = el.dataset.captionSetId;
                
                // Click on the item itself to select it
                el.addEventListener('click', (e) => {
                    // Don't select if clicking a button
                    if (e.target.closest('.btn-group')) return;
                    this.selectCaptionSet(csId);
                });
                
                el.querySelector('.auto-caption-btn').addEventListener('click', () => {
                    this.showAutoCaptionDialog(csId);
                });
                
                el.querySelector('.bulk-edit-btn').addEventListener('click', () => {
                    this.showBulkEditModal(csId);
                });
                
                // Bulk rollback button (conditional - may not exist)
                const rollbackBtn = el.querySelector('.bulk-rollback-btn');
                if (rollbackBtn) {
                    rollbackBtn.addEventListener('click', () => {
                        this.showBulkRollbackDialog(csId);
                    });
                }
                
                el.querySelector('.edit-btn').addEventListener('click', () => {
                    this.editCaptionSet(csId);
                });
                
                el.querySelector('.delete-btn').addEventListener('click', () => {
                    this.deleteCaptionSet(csId);
                });
            });
            
            // Auto-select first caption set if none selected
            if (!this.currentCaptionSetId && captionSets.length > 0) {
                this.selectCaptionSet(captionSets[0].id);
            }
            
        } catch (error) {
            list.innerHTML = Utils.emptyState('bi-exclamation-triangle', 'Error loading caption sets', error.message);
        }
    },
    
    /**
     * Create a new caption set
     */
    async createCaptionSet() {
        if (!this.currentDatasetId) {
            Utils.showToast('Please select a dataset first', 'warning');
            return;
        }
        
        const name = document.getElementById('captionSetName').value.trim();
        const style = document.getElementById('captionSetStyle').value;
        const maxLength = parseInt(document.getElementById('captionSetMaxLength').value) || null;
        const description = document.getElementById('captionSetDescription').value.trim() || null;
        const triggerPhrase = document.getElementById('captionSetTriggerPhrase').value.trim() || null;
        const customPrompt = style === 'custom' ? document.getElementById('captionSetCustomPrompt').value.trim() || null : null;
        
        if (!name) {
            Utils.showToast('Please enter a name', 'warning');
            return;
        }
        
        if (style === 'custom' && !customPrompt) {
            Utils.showToast('Please enter a custom prompt', 'warning');
            return;
        }
        
        try {
            await API.createCaptionSet(this.currentDatasetId, {
                name,
                style,
                max_length: maxLength,
                description,
                trigger_phrase: triggerPhrase,
                custom_prompt: customPrompt
            });
            
            Utils.showToast(`Created caption set: ${name}`, 'success');
            bootstrap.Modal.getInstance(document.getElementById('createCaptionSetModal')).hide();
            document.getElementById('createCaptionSetForm').reset();
            document.getElementById('customPromptGroup').style.display = 'none';
            
            await this.loadCaptionSets(this.currentDatasetId);
            
        } catch (error) {
            Utils.showToast('Failed to create caption set: ' + error.message, 'error');
        }
    },
    
    /**
     * Load dataset images with infinite scroll
     */
    async loadDatasetImages(datasetId, page = 1, reset = false) {
        if (this.isLoadingImages && !reset) return;
        
        const grid = document.getElementById('datasetImageGrid');
        
        if (reset) {
            grid.innerHTML = Utils.loadingSpinner();
            this.currentDatasetFiles = [];
            this.currentImagePage = 1;
            this.hasMoreImages = true;
        }
        
        this.isLoadingImages = true;
        this.currentImagePage = page;
        
        try {
            // API returns array directly, not {files: [...]}
            const files = await API.getDatasetFiles(datasetId, page, this.imagePageSize);
            
            if (!files || files.length === 0) {
                if (reset) {
                    grid.innerHTML = Utils.emptyState('bi-images', 'No images in dataset', 'Add images from the Folders view');
                }
                this.hasMoreImages = false;
                return;
            }
            
            // Assuming we need to check total count somehow - for now, if we get less than pageSize, no more
            this.hasMoreImages = files.length >= this.imagePageSize;
            
            // Build HTML for new cards
            const newCardsHtml = files.map(df => {
                // Safety check for nested file object
                const file = df.file || {};
                const filename = file.filename || 'Unknown';
                const hasCaption = file.has_caption || false;
                const qualityScore = df.quality_score;
                
                // Build quality badge HTML if we have a score
                let qualityBadgeHtml = '';
                if (qualityScore !== null && qualityScore !== undefined) {
                    const scorePercent = Math.round(qualityScore * 100);
                    let badgeClass = 'bg-success'; // Green for high quality
                    if (scorePercent < 60) badgeClass = 'bg-danger';
                    else if (scorePercent < 80) badgeClass = 'bg-warning';
                    qualityBadgeHtml = `<span class="badge ${badgeClass} quality-badge" title="Quality: ${scorePercent}%">${scorePercent}%</span>`;
                }
                
                return `
                    <div class="image-card" data-file-id="${df.file_id}" data-dataset-file-id="${df.id}">
                        <img src="${API.getThumbnailUrl(df.file_id)}" alt="${Utils.escapeHtml(filename)}" loading="lazy">
                        ${hasCaption ? '<span class="badge bg-success caption-badge"><i class="bi bi-chat-quote-fill"></i></span>' : ''}
                        ${qualityBadgeHtml}
                        <button class="btn btn-sm btn-danger remove-from-dataset-btn" title="Remove from dataset" data-file-id="${df.file_id}">
                            <i class="bi bi-x-lg"></i>
                        </button>
                        <div class="image-overlay">
                            <span>${Utils.escapeHtml(Utils.truncate(filename, 20))}</span>
                        </div>
                    </div>
                `;
            }).join('');
            
            if (reset) {
                grid.innerHTML = newCardsHtml;
            } else {
                grid.insertAdjacentHTML('beforeend', newCardsHtml);
            }
            
            // Add file IDs for navigation
            this.currentDatasetFiles.push(...files.map(df => df.file_id));
            
            // Bind click events for caption editor (only to new cards)
            const newCards = grid.querySelectorAll('.image-card:not([data-bound])');
            newCards.forEach(card => {
                card.dataset.bound = 'true';
                
                // Remove button handler
                const removeBtn = card.querySelector('.remove-from-dataset-btn');
                if (removeBtn) {
                    removeBtn.addEventListener('click', async (e) => {
                        e.stopPropagation(); // Don't trigger card click
                        const fileId = removeBtn.dataset.fileId;
                        if (await Utils.confirm('Remove this image from the dataset?')) {
                            await this.removeImageFromDataset(fileId);
                        }
                    });
                }
                
                // Card click for caption editor
                card.addEventListener('click', () => {
                    this.showCaptionEditor(card.dataset.fileId);
                });
            });
            
            // Setup infinite scroll on first load
            if (reset) {
                this.setupDatasetInfiniteScroll(grid);
            }
            
            // Add/remove loading indicator
            let indicator = document.getElementById('datasetLoadMoreIndicator');
            if (this.hasMoreImages) {
                if (!indicator) {
                    indicator = document.createElement('div');
                    indicator.id = 'datasetLoadMoreIndicator';
                    indicator.className = 'text-center text-muted py-2';
                    indicator.innerHTML = '<small><i class="bi bi-arrow-down-circle"></i> Scroll for more...</small>';
                    grid.appendChild(indicator);
                }
            } else if (indicator) {
                indicator.remove();
            }
            
        } catch (error) {
            grid.innerHTML = Utils.emptyState('bi-exclamation-triangle', 'Error loading images', error.message);
        } finally {
            this.isLoadingImages = false;
        }
    },
    
    /**
     * Setup infinite scroll for dataset images
     */
    setupDatasetInfiniteScroll(grid) {
        // Remove any existing scroll listener
        if (this._datasetScrollHandler) {
            grid.removeEventListener('scroll', this._datasetScrollHandler);
        }
        
        this._datasetScrollHandler = () => {
            if (this.isLoadingImages || !this.hasMoreImages) return;
            
            // Check if user scrolled near bottom (within 500px)
            const scrollTop = grid.scrollTop;
            const scrollHeight = grid.scrollHeight;
            const clientHeight = grid.clientHeight;
            
            if (scrollTop + clientHeight >= scrollHeight - 500) {
                // Load next page
                this.loadDatasetImages(this.currentDatasetId, this.currentImagePage + 1, false);
            }
        };
        
        grid.addEventListener('scroll', this._datasetScrollHandler);
    },
    
    /**
     * Show caption editor for a file in current caption set
     */
    async showCaptionEditor(fileId) {
        if (!this.currentCaptionSetId) {
            Utils.showToast('Please select a caption set first', 'warning');
            return;
        }
        
        this.currentEditingFileId = fileId;
        // Clear any previous generation metadata when switching files
        this.lastGeneratedCaption = null;
        
        const modalEl = document.getElementById('datasetCaptionModal');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        
        try {
            // Fetch caption data for this file in this caption set
            const data = await API.request(`/caption-sets/${this.currentCaptionSetId}/files/${fileId}`);
            
            // Update modal
            document.getElementById('datasetCaptionTitle').textContent = `Edit Caption - ${data.filename}`;
            document.getElementById('datasetCaptionPreview').src = API.getImageUrl(fileId);
            document.getElementById('datasetCaptionFileInfo').textContent = data.filename;
            document.getElementById('datasetCaptionSetName').textContent = `(${data.caption_set_name})`;
            
            // Imported caption reference
            const importedEl = document.getElementById('datasetCaptionImported');
            if (data.imported_caption) {
                importedEl.textContent = data.imported_caption;
                importedEl.parentElement.classList.remove('d-none');
            } else {
                importedEl.textContent = 'No imported caption';
            }
            
            // Caption text
            const textEl = document.getElementById('datasetCaptionText');
            textEl.value = data.caption?.text || '';
            textEl.dataset.fileId = fileId;
            textEl.dataset.captionId = data.caption?.id || '';
            
            // Max length indicator
            const maxLengthEl = document.getElementById('datasetCaptionMaxLength');
            if (data.caption_set_max_length) {
                maxLengthEl.textContent = `/ ${data.caption_set_max_length} max`;
            } else {
                maxLengthEl.textContent = '';
            }
            
            // Update character count
            this.updateCaptionCharCount();
            
            // Display quality assessment if available
            const qualityContainer = document.getElementById('datasetCaptionQualityContainer');
            const qualityEl = document.getElementById('datasetCaptionQuality');
            const flagsEl = document.getElementById('datasetCaptionFlags');
            
            if (data.caption?.quality_score !== null && data.caption?.quality_score !== undefined) {
                const scorePercent = Math.round(data.caption.quality_score * 100);
                qualityEl.textContent = `${scorePercent}%`;
                qualityEl.className = 'badge ' + (scorePercent >= 80 ? 'bg-success' : scorePercent >= 60 ? 'bg-warning' : 'bg-danger');
                qualityContainer.classList.remove('d-none');
                
                // Display quality flags as badges
                if (data.caption.quality_flags && data.caption.quality_flags.length > 0) {
                    flagsEl.innerHTML = data.caption.quality_flags.map(flag => {
                        // Determine badge color based on flag type
                        const isPositive = !flag.toLowerCase().includes('blur') && 
                                          !flag.toLowerCase().includes('noise') && 
                                          !flag.toLowerCase().includes('dark') &&
                                          !flag.toLowerCase().includes('overexposed') &&
                                          !flag.toLowerCase().includes('low') &&
                                          !flag.toLowerCase().includes('poor');
                        const badgeClass = isPositive ? 'bg-info' : 'bg-secondary';
                        return `<span class="badge ${badgeClass}">${Utils.escapeHtml(flag)}</span>`;
                    }).join('');
                } else {
                    flagsEl.innerHTML = '<span class="text-muted small">No specific flags</span>';
                }
            } else {
                qualityContainer.classList.add('d-none');
                flagsEl.innerHTML = '';
            }
            
            // Update navigation index
            const idx = this.currentDatasetFiles.indexOf(fileId);
            document.getElementById('datasetCaptionIndex').textContent = 
                `${idx + 1} / ${this.currentDatasetFiles.length}`;
            
            modal.show();
            
        } catch (error) {
            Utils.showToast('Failed to load caption: ' + error.message, 'error');
        }
    },
    
    /**
     * Update character count display
     */
    updateCaptionCharCount() {
        const textEl = document.getElementById('datasetCaptionText');
        const countEl = document.getElementById('datasetCaptionCharCount');
        countEl.textContent = textEl.value.length;
    },
    
    /**
     * Save current caption
     */
    async saveCaption() {
        const textEl = document.getElementById('datasetCaptionText');
        const fileId = textEl.dataset.fileId;
        const text = textEl.value.trim();
        
        if (!fileId || !this.currentCaptionSetId) {
            Utils.showToast('No file or caption set selected', 'warning');
            return;
        }
        
        try {
            // Build the save payload
            const payload = {
                file_id: fileId,
                text: text,
                source: 'manual'
            };
            
            // Include generation metadata if we just generated this caption
            if (this.lastGeneratedCaption) {
                payload.source = 'generated';
                payload.vision_model = this.lastGeneratedCaption.vision_model;
                payload.quality_score = this.lastGeneratedCaption.quality_score;
                payload.quality_flags = this.lastGeneratedCaption.quality_flags;
            }
            
            await API.request(`/caption-sets/${this.currentCaptionSetId}/captions`, {
                method: 'POST',
                body: payload
            });
            
            // Clear the generated metadata after saving
            this.lastGeneratedCaption = null;
            
            Utils.showToast('Caption saved', 'success');
            
            // Update the caption badge in the grid
            const card = document.querySelector(`[data-file-id="${fileId}"]`);
            if (card && text) {
                let badge = card.querySelector('.caption-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'badge bg-success caption-badge';
                    badge.innerHTML = '<i class="bi bi-chat-quote-fill"></i>';
                    card.appendChild(badge);
                }
                
                // Update quality badge if we have quality data
                if (payload.quality_score !== null && payload.quality_score !== undefined) {
                    const scorePercent = Math.round(payload.quality_score * 100);
                    let qualityBadge = card.querySelector('.quality-badge');
                    if (!qualityBadge) {
                        qualityBadge = document.createElement('span');
                        qualityBadge.className = 'badge quality-badge';
                        card.appendChild(qualityBadge);
                    }
                    qualityBadge.textContent = `${scorePercent}%`;
                    qualityBadge.title = `Quality: ${scorePercent}%`;
                    // Update color based on score
                    qualityBadge.classList.remove('bg-success', 'bg-warning', 'bg-danger');
                    qualityBadge.classList.add(scorePercent >= 80 ? 'bg-success' : scorePercent >= 60 ? 'bg-warning' : 'bg-danger');
                }
            }
            
            // Refresh caption set list to update counts
            if (this.currentDatasetId) {
                await this.loadCaptionSets(this.currentDatasetId);
            }
            
        } catch (error) {
            Utils.showToast('Failed to save caption: ' + error.message, 'error');
        }
    },
    
    // Storage for last generated caption metadata
    lastGeneratedCaption: null,

    /**
     * Copy imported caption to editor
     */
    copyImportedCaption() {
        const importedText = document.getElementById('datasetCaptionImported').textContent;
        if (importedText && importedText !== 'No imported caption') {
            document.getElementById('datasetCaptionText').value = importedText;
            this.updateCaptionCharCount();
            // Clear generated metadata since this is now from imported
            this.lastGeneratedCaption = null;
            Utils.showToast('Imported caption copied', 'info');
        }
    },
    
    /**
     * Generate caption using vision model
     */
    async generateCaption() {
        const fileId = this.currentEditingFileId;
        if (!fileId) {
            Utils.showToast('No file selected', 'warning');
            return;
        }
        
        const btn = document.getElementById('datasetCaptionGenerateBtn');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating...';
        
        try {
            // Get caption set info including trigger_phrase and custom_prompt
            const captionSetInfo = await API.request(`/caption-sets/${this.currentCaptionSetId}`);
            const style = captionSetInfo.style || 'natural';
            const maxLength = captionSetInfo.max_length;
            const triggerPhrase = captionSetInfo.trigger_phrase;
            const customPrompt = captionSetInfo.custom_prompt;
            
            const result = await API.request('/vision/generate', {
                method: 'POST',
                body: {
                    file_id: fileId,
                    style: style,
                    max_length: maxLength,
                    trigger_phrase: triggerPhrase,
                    custom_prompt: customPrompt
                }
            });
            
            // Put the generated caption in the textarea
            const textEl = document.getElementById('datasetCaptionText');
            textEl.value = result.caption;
            this.updateCaptionCharCount();
            
            // Store generation metadata for saving
            this.lastGeneratedCaption = {
                vision_model: result.vision_model,
                quality_score: result.quality_score,
                quality_flags: result.quality_flags
            };
            
            // Build success message with quality info if available
            let message = `Caption generated in ${result.processing_time_ms}ms`;
            const qualityContainer = document.getElementById('datasetCaptionQualityContainer');
            const qualityEl = document.getElementById('datasetCaptionQuality');
            const flagsEl = document.getElementById('datasetCaptionFlags');
            
            if (result.quality_score !== null && result.quality_score !== undefined) {
                const qualityPercent = Math.round(result.quality_score * 100);
                message += ` | Quality: ${qualityPercent}%`;
                
                // Update quality display
                if (qualityEl && qualityContainer) {
                    qualityEl.textContent = `${qualityPercent}%`;
                    qualityEl.className = 'badge ' + (qualityPercent >= 80 ? 'bg-success' : 
                                         qualityPercent >= 60 ? 'bg-warning' : 'bg-danger');
                    qualityContainer.classList.remove('d-none');
                    
                    // Display quality flags as badges
                    if (flagsEl) {
                        if (result.quality_flags && result.quality_flags.length > 0) {
                            flagsEl.innerHTML = result.quality_flags.map(flag => {
                                const isPositive = !flag.toLowerCase().includes('blur') && 
                                                  !flag.toLowerCase().includes('noise') && 
                                                  !flag.toLowerCase().includes('dark') &&
                                                  !flag.toLowerCase().includes('overexposed') &&
                                                  !flag.toLowerCase().includes('low') &&
                                                  !flag.toLowerCase().includes('poor');
                                const badgeClass = isPositive ? 'bg-info' : 'bg-secondary';
                                return `<span class="badge ${badgeClass}">${Utils.escapeHtml(flag)}</span>`;
                            }).join('');
                        } else {
                            flagsEl.innerHTML = '<span class="text-muted small">No specific flags</span>';
                        }
                    }
                }
            } else if (qualityContainer) {
                qualityContainer.classList.add('d-none');
                if (flagsEl) flagsEl.innerHTML = '';
            }
            
            if (result.quality_flags && result.quality_flags.length > 0) {
                message += ` | Flags: ${result.quality_flags.join(', ')}`;
            }
            
            Utils.showToast(message, 'success');
            
        } catch (error) {
            Utils.showToast('Failed to generate caption: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    },
    
    /**
     * Navigate to previous image
     */
    navigatePrev() {
        const idx = this.currentDatasetFiles.indexOf(this.currentEditingFileId);
        if (idx > 0) {
            this.showCaptionEditor(this.currentDatasetFiles[idx - 1]);
        }
    },
    
    /**
     * Navigate to next image
     */
    navigateNext() {
        const idx = this.currentDatasetFiles.indexOf(this.currentEditingFileId);
        if (idx < this.currentDatasetFiles.length - 1) {
            this.showCaptionEditor(this.currentDatasetFiles[idx + 1]);
        }
    },
    
    /**
     * Delete a dataset
     */
    async deleteDataset(datasetId) {
        if (!await Utils.confirm('Delete this dataset? This will not delete the original images.')) {
            return;
        }
        
        try {
            await API.deleteDataset(datasetId);
            Utils.showToast('Dataset deleted', 'success');
            
            if (this.currentDatasetId === datasetId) {
                this.currentDatasetId = null;
                document.getElementById('datasetStats').innerHTML = '<div class="text-center text-muted py-3">Select a dataset to view details</div>';
                document.getElementById('datasetTitle').innerHTML = '<i class="bi bi-collection me-2"></i>Select a dataset';
                document.getElementById('datasetFileCount').textContent = '';
                document.getElementById('captionSetList').innerHTML = '<div class="text-center text-muted py-3"><small>No caption sets yet</small></div>';
                document.getElementById('datasetImageGrid').innerHTML = '<div class="text-center text-muted py-4">Select a dataset to view images</div>';
            }
            
            await this.loadDatasets();
            
        } catch (error) {
            Utils.showToast('Failed to delete dataset: ' + error.message, 'error');
        }
    },
    
    /**
     * Clone a dataset
     */
    async cloneDataset() {
        if (!this.currentDatasetId) {
            Utils.showToast('Please select a dataset to clone', 'warning');
            return;
        }
        
        // Get current dataset info for default name
        const currentDataset = await API.getDataset(this.currentDatasetId);
        const defaultName = `${currentDataset.name} (Copy)`;
        
        // Set default value and show modal
        document.getElementById('cloneDatasetName').value = defaultName;
        document.getElementById('cloneIncludeCaptions').checked = false;
        
        const modal = new bootstrap.Modal(document.getElementById('cloneDatasetModal'));
        modal.show();
    },
    
    /**
     * Confirm clone dataset (called from modal)
     */
    async confirmCloneDataset() {
        const newName = document.getElementById('cloneDatasetName').value.trim();
        if (!newName) {
            Utils.showToast('Please enter a dataset name', 'warning');
            return;
        }
        
        const includeCaptions = document.getElementById('cloneIncludeCaptions').checked;
        
        try {
            const cloned = await API.cloneDataset(this.currentDatasetId, newName, includeCaptions);
            Utils.showToast(`Dataset cloned: ${cloned.name}`, 'success');
            
            // Hide modal
            bootstrap.Modal.getInstance(document.getElementById('cloneDatasetModal')).hide();
            
            // Refresh and select cloned dataset
            await this.loadDatasets();
            this.selectDataset(cloned.id);
        } catch (error) {
            Utils.showToast('Failed to clone dataset: ' + error.message, 'error');
        }
    },
    
    /**
     * Remove an image from the current dataset
     */
    async removeImageFromDataset(fileId) {
        if (!this.currentDatasetId) return;
        
        try {
            await API.removeFileFromDataset(this.currentDatasetId, fileId);
            Utils.showToast('Image removed from dataset', 'success');
            
            // Remove from UI
            const card = document.querySelector(`.image-card[data-file-id="${fileId}"]`);
            if (card) {
                card.remove();
            }
            
            // Remove from current files list
            this.currentDatasetFiles = this.currentDatasetFiles.filter(id => id !== fileId);
            
            // Reload stats to update counts
            await this.loadDatasetDetails(this.currentDatasetId);
            
            // Refresh dataset list to update count in sidebar
            await this.loadDatasets();
            
        } catch (error) {
            Utils.showToast('Failed to remove image: ' + error.message, 'error');
        }
    },
    
    /**
     * Select a caption set for editing
     */
    selectCaptionSet(captionSetId) {
        this.currentCaptionSetId = captionSetId;
        
        // Update visual selection
        document.querySelectorAll('.caption-set-item').forEach(el => {
            el.classList.remove('selected');
            const nameEl = el.querySelector('.caption-set-name');
            // Remove existing check icon if any
            const existingIcon = nameEl.querySelector('.bi-check-circle-fill');
            if (existingIcon) existingIcon.remove();
        });
        
        const selectedEl = document.querySelector(`[data-caption-set-id="${captionSetId}"]`);
        if (selectedEl) {
            selectedEl.classList.add('selected');
            const nameEl = selectedEl.querySelector('.caption-set-name');
            const icon = document.createElement('i');
            icon.className = 'bi bi-check-circle-fill text-primary me-1';
            nameEl.prepend(icon);
        }
        
        // Show toast to confirm selection
        const name = selectedEl?.querySelector('.caption-set-name')?.textContent?.trim() || 'Caption set';
        Utils.showToast(`Selected: ${name}`, 'info');
    },
    
    /**
     * Delete a caption set
     */
    async deleteCaptionSet(captionSetId) {
        if (!await Utils.confirm('Delete this caption set and all its captions?')) {
            return;
        }
        
        try {
            await API.deleteCaptionSet(captionSetId);
            Utils.showToast('Caption set deleted', 'success');
            await this.loadCaptionSets(this.currentDatasetId);
            
        } catch (error) {
            Utils.showToast('Failed to delete caption set: ' + error.message, 'error');
        }
    },
    
    /**
     * Show auto-caption dialog
     */
    showAutoCaptionDialog(captionSetId) {
        this.currentCaptionSetId = captionSetId;
        
        // Reset the overwrite checkbox
        document.getElementById('overwriteExisting').checked = false;
        
        const modal = new bootstrap.Modal(document.getElementById('autoCaptionModal'));
        modal.show();
    },
    
    /**
     * Show export dialog
     */
    async showExportDialog() {
        if (!this.currentDatasetId) return;
        
        try {
            const captionSets = await API.listCaptionSets(this.currentDatasetId);
            const select = document.getElementById('exportCaptionSet');
            
            if (captionSets.length === 0) {
                Utils.showToast('Create a caption set before exporting', 'warning');
                return;
            }
            
            // Build options, pre-selecting the currently active caption set if one is selected
            select.innerHTML = captionSets.map(cs => `
                <option value="${cs.id}" ${cs.id === this.currentCaptionSetId ? 'selected' : ''}>
                    ${Utils.escapeHtml(cs.name)} (${cs.caption_count} captions)
                </option>
            `).join('');
            
            const modal = new bootstrap.Modal(document.getElementById('exportModal'));
            modal.show();
            
            // Initialize droppable paths after modal is shown (DOM needs to be visible)
            setTimeout(() => Utils.initDroppablePaths(), 100);
            
        } catch (error) {
            Utils.showToast('Failed to load caption sets: ' + error.message, 'error');
        }
    },
    
    /**
     * Start an export
     */
    async startExport() {
        const captionSetId = document.getElementById('exportCaptionSet').value;
        const exportType = document.querySelector('input[name="exportType"]:checked').value;
        const exportPath = document.getElementById('exportPath').value || null;
        
        if (exportType === 'folder' && !exportPath) {
            Utils.showToast('Please enter an export path', 'warning');
            return;
        }
        
        const options = {
            caption_set_id: captionSetId,
            export_type: exportType,
            export_path: exportPath,
            image_format: document.getElementById('exportImageFormat').value || 'original',
            max_resolution_longest_side: parseInt(document.getElementById('exportMaxResolution').value) || null,
            caption_extension: document.getElementById('exportCaptionExt').value,
            filename_prefix: document.getElementById('exportFilenamePrefix').value.trim() || null,
            numbering_start: parseInt(document.getElementById('exportNumberStart').value) || 1,
            numbering_padding: parseInt(document.getElementById('exportNumberPad').value) || 4,
            strip_metadata: document.getElementById('exportStripMetadata').checked,
            include_manifest: document.getElementById('exportIncludeManifest').checked,
            // exclude_flagged expects a list of flag types or null (not a boolean)
            exclude_flagged: document.getElementById('exportExcludeFlagged').checked ? ['flagged'] : null
        };
        
        try {
            const result = await API.startExport(this.currentDatasetId, options);
            
            // Hide the modal first
            const modalEl = document.getElementById('exportModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) {
                modal.hide();
            }
            
            // Show success toast
            Utils.showToast(`Export started: ${result.estimated_files} files`, 'success');
            
            // Switch to exports view (this will auto-load the exports list)
            App.showView('exports');
            
        } catch (error) {
            Utils.showToast('Failed to start export: ' + error.message, 'error');
        }
    },
    
    /**
     * Show edit dataset modal
     */
    async showEditDataset() {
        if (!this.currentDatasetId) {
            Utils.showToast('No dataset selected', 'warning');
            return;
        }
        
        try {
            const dataset = await API.getDataset(this.currentDatasetId);
            
            // Populate the edit modal
            document.getElementById('editDatasetId').value = dataset.id;
            document.getElementById('editDatasetName').value = dataset.name || '';
            document.getElementById('editDatasetDescription').value = dataset.description || '';
            
            const modal = new bootstrap.Modal(document.getElementById('editDatasetModal'));
            modal.show();
        } catch (error) {
            Utils.showToast('Failed to load dataset: ' + error.message, 'error');
        }
    },
    
    /**
     * Save dataset changes
     */
    async saveDataset() {
        const datasetId = document.getElementById('editDatasetId').value;
        const name = document.getElementById('editDatasetName').value.trim();
        const description = document.getElementById('editDatasetDescription').value.trim() || null;
        
        if (!name) {
            Utils.showToast('Please enter a dataset name', 'warning');
            return;
        }
        
        try {
            await API.request(`/datasets/${datasetId}`, {
                method: 'PUT',
                body: { name, description }
            });
            
            Utils.showToast('Dataset updated', 'success');
            bootstrap.Modal.getInstance(document.getElementById('editDatasetModal')).hide();
            
            // Refresh the datasets list and details
            await this.loadDatasets();
            await this.loadDatasetDetails(datasetId);
            
        } catch (error) {
            Utils.showToast('Failed to update dataset: ' + error.message, 'error');
        }
    },
    
    /**
     * Edit caption set - load data and show modal
     */
    async editCaptionSet(captionSetId) {
        try {
            // Fetch the caption set data
            const captionSet = await API.request(`/caption-sets/${captionSetId}`);
            
            // Populate the edit modal
            document.getElementById('editCaptionSetId').value = captionSetId;
            document.getElementById('editCaptionSetName').value = captionSet.name || '';
            document.getElementById('editCaptionSetStyle').value = captionSet.style || 'natural';
            document.getElementById('editCaptionSetTriggerPhrase').value = captionSet.trigger_phrase || '';
            document.getElementById('editCaptionSetMaxLength').value = captionSet.max_length || '';
            document.getElementById('editCaptionSetDescription').value = captionSet.description || '';
            document.getElementById('editCaptionSetCustomPrompt').value = captionSet.custom_prompt || '';
            
            // Show/hide custom prompt based on style
            document.getElementById('editCustomPromptGroup').style.display = 
                captionSet.style === 'custom' ? 'block' : 'none';
            
            // Show the modal
            const modal = new bootstrap.Modal(document.getElementById('editCaptionSetModal'));
            modal.show();
        } catch (error) {
            Utils.showToast('Failed to load caption set: ' + error.message, 'error');
        }
    },
    
    /**
     * Save caption set changes
     */
    async saveCaptionSet() {
        const captionSetId = document.getElementById('editCaptionSetId').value;
        const name = document.getElementById('editCaptionSetName').value.trim();
        const style = document.getElementById('editCaptionSetStyle').value;
        const triggerPhrase = document.getElementById('editCaptionSetTriggerPhrase').value.trim();
        const maxLengthVal = document.getElementById('editCaptionSetMaxLength').value;
        const description = document.getElementById('editCaptionSetDescription').value.trim();
        const customPrompt = style === 'custom' ? document.getElementById('editCaptionSetCustomPrompt').value.trim() : null;
        
        if (!name) {
            Utils.showToast('Caption set name is required', 'warning');
            return;
        }
        
        if (style === 'custom' && !customPrompt) {
            Utils.showToast('Please enter a custom prompt', 'warning');
            return;
        }
        
        try {
            await API.request(`/caption-sets/${captionSetId}`, {
                method: 'PUT',
                body: {
                    name: name,
                    style: style,
                    trigger_phrase: triggerPhrase || null,
                    max_length: maxLengthVal ? parseInt(maxLengthVal) : null,
                    description: description || null,
                    custom_prompt: customPrompt
                }
            });
            
            // Close modal
            const modalEl = document.getElementById('editCaptionSetModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            
            // Refresh caption set list
            if (this.currentDatasetId) {
                await this.loadCaptionSets(this.currentDatasetId);
            }
            
            Utils.showToast('Caption set updated', 'success');
        } catch (error) {
            Utils.showToast('Failed to update caption set: ' + error.message, 'error');
        }
    },
    
    // ============================================================
    // Bulk Edit Functions
    // ============================================================
    
    /**
     * Show bulk edit modal for a caption set
     */
    async showBulkEditModal(captionSetId) {
        try {
            // Fetch caption set details
            const captionSet = await API.request(`/caption-sets/${captionSetId}`);
            
            // Store for later use
            this.bulkEditCaptionSetId = captionSetId;
            this.bulkEditCaptionSetName = captionSet.name;
            
            // Update modal title
            document.getElementById('bulkEditCaptionSetName').textContent = captionSet.name;
            
            // Reset form
            this.resetBulkEditForm();
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('bulkEditModal'));
            modal.show();
        } catch (error) {
            Utils.showToast('Failed to load caption set: ' + error.message, 'error');
        }
    },
    
    /**
     * Reset bulk edit form to initial state
     */
    resetBulkEditForm() {
        // Uncheck all operations
        document.querySelectorAll('#bulkEditModal input[type="checkbox"]').forEach(cb => cb.checked = false);
        
        // Clear all inputs
        document.getElementById('prependText').value = '';
        document.getElementById('appendText').value = '';
        document.getElementById('findText').value = '';
        document.getElementById('replaceText').value = '';
        document.getElementById('useRegex').checked = false;
        document.getElementById('caseSensitive').checked = true;
        document.getElementById('caseType').value = 'lower';
        document.getElementById('removePattern').value = '';
        document.getElementById('patternIsRegex').checked = false;
        
        // Hide all config sections
        document.querySelectorAll('.operation-config').forEach(el => el.style.display = 'none');
        
        // Hide preview
        document.getElementById('bulkEditPreview').style.display = 'none';
    },
    
    /**
     * Toggle operation config visibility
     */
    toggleOperationConfig(operationType, checkbox) {
        const configEl = document.getElementById(operationType + 'Config');
        if (configEl) {
            configEl.style.display = checkbox.checked ? 'block' : 'none';
        }
        
        // Also expand/collapse the accordion section
        const collapseMap = {
            'prepend': 'prependCollapse',
            'append': 'appendCollapse',
            'findReplace': 'findReplaceCollapse',
            'caseConvert': 'caseConvertCollapse',
            'removePattern': 'removePatternCollapse'
        };
        
        const collapseId = collapseMap[operationType];
        if (collapseId) {
            const collapseEl = document.getElementById(collapseId);
            const bsCollapse = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl, { toggle: false });
            
            if (checkbox.checked) {
                bsCollapse.show();
            } else {
                bsCollapse.hide();
            }
        }
    },
    
    /**
     * Build operations array from form
     */
    buildBulkEditOperations() {
        const operations = [];
        
        // Prepend
        if (document.getElementById('enablePrepend').checked) {
            const text = document.getElementById('prependText').value;
            if (text) {
                operations.push({
                    operation_type: 'prepend',
                    text: text
                });
            }
        }
        
        // Append
        if (document.getElementById('enableAppend').checked) {
            const text = document.getElementById('appendText').value;
            if (text) {
                operations.push({
                    operation_type: 'append',
                    text: text
                });
            }
        }
        
        // Find and replace
        if (document.getElementById('enableFindReplace').checked) {
            const find = document.getElementById('findText').value;
            const replace = document.getElementById('replaceText').value;
            if (find) {
                operations.push({
                    operation_type: 'find_replace',
                    find: find,
                    replace: replace || '',
                    use_regex: document.getElementById('useRegex').checked,
                    case_sensitive: document.getElementById('caseSensitive').checked
                });
            }
        }
        
        // Trim
        if (document.getElementById('enableTrim').checked) {
            operations.push({
                operation_type: 'trim'
            });
        }
        
        // Case convert
        if (document.getElementById('enableCaseConvert').checked) {
            operations.push({
                operation_type: 'case_convert',
                case_type: document.getElementById('caseType').value
            });
        }
        
        // Remove pattern
        if (document.getElementById('enableRemovePattern').checked) {
            const pattern = document.getElementById('removePattern').value;
            if (pattern) {
                operations.push({
                    operation_type: 'remove_pattern',
                    pattern: pattern,
                    pattern_is_regex: document.getElementById('patternIsRegex').checked
                });
            }
        }
        
        return operations;
    },
    
    /**
     * Preview bulk edit operations
     */
    async previewBulkEdit() {
        const operations = this.buildBulkEditOperations();
        
        if (operations.length === 0) {
            Utils.showToast('Please enable and configure at least one operation', 'warning');
            return;
        }
        
        const previewBtn = document.getElementById('previewBulkEditBtn');
        const originalText = previewBtn.innerHTML;
        previewBtn.disabled = true;
        previewBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Previewing...';
        
        try {
            const result = await API.request(`/caption-sets/${this.bulkEditCaptionSetId}/bulk-edit-preview`, {
                method: 'POST',
                body: { operations }
            });
            
            // Show preview section
            const previewEl = document.getElementById('bulkEditPreview');
            previewEl.style.display = 'block';
            
            // Update summary
            document.getElementById('previewSummary').innerHTML = `
                <div class="alert alert-info mb-3">
                    <strong>Operations:</strong> ${Utils.escapeHtml(result.operation_summary)}<br>
                    <strong>Total captions:</strong> ${result.total_captions}<br>
                    <strong>Will be affected:</strong> ${result.affected_captions}
                </div>
            `;
            
            // Show samples
            const samplesEl = document.getElementById('previewSamples');
            if (result.samples && result.samples.length > 0) {
                samplesEl.innerHTML = result.samples.map(sample => `
                    <div class="card mb-2">
                        <div class="card-body p-3">
                            <div class="mb-2">
                                <small class="text-muted">Before:</small>
                                <div class="bg-dark p-2 rounded font-monospace small text-white">${Utils.escapeHtml(sample.before)}</div>
                            </div>
                            <div>
                                <small class="text-muted">After:</small>
                                <div class="bg-success bg-opacity-10 p-2 rounded font-monospace small">${Utils.escapeHtml(sample.after)}</div>
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                samplesEl.innerHTML = '<p class="text-muted text-center">No changes detected</p>';
            }
            
            // Enable apply button if changes detected
            document.getElementById('applyBulkEditBtn').disabled = result.affected_captions === 0;
            
        } catch (error) {
            Utils.showToast('Preview failed: ' + error.message, 'error');
        } finally {
            previewBtn.disabled = false;
            previewBtn.innerHTML = originalText;
        }
    },
    
    /**
     * Apply bulk edit operations
     */
    async applyBulkEdit() {
        if (!confirm('Are you sure you want to apply these changes? This will modify all affected captions.')) {
            return;
        }
        
        const operations = this.buildBulkEditOperations();
        
        if (operations.length === 0) {
            Utils.showToast('Please enable and configure at least one operation', 'warning');
            return;
        }
        
        const applyBtn = document.getElementById('applyBulkEditBtn');
        const originalText = applyBtn.innerHTML;
        applyBtn.disabled = true;
        applyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Applying...';
        
        try {
            const result = await API.request(`/caption-sets/${this.bulkEditCaptionSetId}/bulk-edit-apply`, {
                method: 'POST',
                body: { operations }
            });
            
            // Close modal
            const modalEl = document.getElementById('bulkEditModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            
            // Show success message
            let message = `Bulk edit complete: ${result.updated_count} captions updated`;
            if (result.skipped_count > 0) {
                message += `, ${result.skipped_count} unchanged`;
            }
            if (result.error_count > 0) {
                message += `, ${result.error_count} errors`;
            }
            
            Utils.showToast(message, result.error_count > 0 ? 'warning' : 'success');
            
            // Refresh current view if showing captions from this set
            if (this.currentCaptionSetId === this.bulkEditCaptionSetId && this.currentEditingFileId) {
                await this.loadFileCaption(this.currentEditingFileId);
            }
            
        } catch (error) {
            Utils.showToast('Bulk edit failed: ' + error.message, 'error');
        } finally {
            applyBtn.disabled = false;
            applyBtn.innerHTML = originalText;
        }
    },
    
    // ============================================================
    // Version History Methods
    // ============================================================
    
    /**
     * Show version history for the current caption
     */
    async showCaptionHistory() {
        if (!this.currentEditingFileId || !this.currentCaptionSetId) {
            Utils.showToast('No caption loaded', 'warning');
            return;
        }
        
        try {
            // Get the caption data for this file
            const data = await API.request(`/caption-sets/${this.currentCaptionSetId}/files/${this.currentEditingFileId}`);
            
            if (!data.caption || !data.caption.id) {
                Utils.showToast('No caption exists yet - save a caption first', 'info');
                return;
            }
            
            // Set filename in modal
            document.getElementById('captionHistoryFilename').textContent = data.filename;
            
            // Show current version
            document.getElementById('captionHistoryCurrentText').textContent = data.caption.text || '--';
            document.getElementById('captionHistoryCurrentDate').textContent = data.caption.modified_date ? 
                Utils.formatDate(data.caption.modified_date) : '--';
            document.getElementById('captionHistoryCurrentSource').textContent = data.caption.source || 'unknown';
            
            const modelEl = document.getElementById('captionHistoryCurrentModel');
            if (data.caption.vision_model) {
                modelEl.innerHTML = `<strong>Model:</strong> ${Utils.escapeHtml(data.caption.vision_model)}`;
            } else {
                modelEl.innerHTML = '';
            }
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('captionHistoryModal'));
            modal.show();
            
            // Load version history
            await this.loadCaptionVersions(data.caption.id);
            
        } catch (error) {
            Utils.showToast('Failed to load caption history: ' + error.message, 'error');
        }
    },
    
    /**
     * Load version history for a caption
     */
    async loadCaptionVersions(captionId) {
        const listEl = document.getElementById('captionHistoryList');
        listEl.innerHTML = `
            <div class="text-center text-muted py-4">
                <div class="spinner-border spinner-border-sm" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <div class="mt-2">Loading version history...</div>
            </div>
        `;
        
        try {
            const result = await API.request(`/captions/${captionId}/history`);
            
            if (!result.versions || result.versions.length === 0) {
                listEl.innerHTML = `
                    <div class="text-center text-muted py-4">
                        <i class="bi bi-clock-history fs-1 mb-2 d-block"></i>
                        No previous versions
                    </div>
                `;
                return;
            }
            
            // Render versions (already sorted by version_number desc)
            listEl.innerHTML = result.versions.map(version => `
                <div class="card bg-dark border-secondary mb-2" data-version-id="${version.id}">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <span class="badge bg-secondary">Version ${version.version_number}</span>
                                ${version.operation ? `<span class="badge bg-info ms-1">${Utils.escapeHtml(version.operation)}</span>` : ''}
                            </div>
                            <small class="text-muted">${Utils.formatDate(version.created_date)}</small>
                        </div>
                        ${version.operation_description ? `
                            <div class="small text-muted mb-2">
                                <i class="bi bi-info-circle me-1"></i>${Utils.escapeHtml(version.operation_description)}
                            </div>
                        ` : ''}
                        <div class="font-monospace small bg-darker p-2 rounded border border-secondary mb-2" style="max-height: 100px; overflow-y: auto;">
                            ${Utils.escapeHtml(version.text)}
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">
                                ${version.source ? `Source: ${version.source}` : ''}
                                ${version.vision_model ? ` • Model: ${Utils.escapeHtml(version.vision_model)}` : ''}
                            </small>
                            <button class="btn btn-sm btn-outline-warning rollback-version-btn" data-caption-id="${captionId}" data-version-id="${version.id}">
                                <i class="bi bi-arrow-counterclockwise me-1"></i>Rollback
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
            
            // Bind rollback buttons
            listEl.querySelectorAll('.rollback-version-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.rollbackCaptionToVersion(btn.dataset.captionId, btn.dataset.versionId);
                });
            });
            
        } catch (error) {
            listEl.innerHTML = Utils.emptyState('bi-exclamation-triangle', 'Error loading history', error.message);
        }
    },
    
    /**
     * Rollback caption to a specific version
     */
    async rollbackCaptionToVersion(captionId, versionId) {
        if (!confirm('Are you sure you want to rollback to this version? The current caption will be saved as a new version before rolling back.')) {
            return;
        }
        
        try {
            const result = await API.request(`/captions/${captionId}/rollback/${versionId}`, {
                method: 'POST'
            });
            
            Utils.showToast('Caption rolled back successfully', 'success');
            
            // Close history modal
            const modalEl = document.getElementById('captionHistoryModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            
            // Reload the caption in the editor
            if (this.currentEditingFileId) {
                await this.showCaptionEditor(this.currentEditingFileId);
            }
            
        } catch (error) {
            Utils.showToast('Failed to rollback caption: ' + error.message, 'error');
        }
    },
    
    // ============================================================
    // Bulk Rollback Methods
    // ============================================================
    
    /**
     * Show bulk rollback confirmation dialog
     */
    async showBulkRollbackDialog(captionSetId) {
        try {
            // Get caption set details
            const captionSet = await API.request(`/caption-sets/${captionSetId}`);
            
            // Get preview
            const preview = await API.request(`/caption-sets/${captionSetId}/bulk-rollback-preview`, {
                method: 'POST'
            });
            
            if (preview.rollbackable_count === 0) {
                Utils.showToast('No bulk edits to rollback', 'info');
                return;
            }
            
            // Build confirmation message
            let message = `<strong>Rollback Last Bulk Edit</strong><br><br>`;
            message += `Caption Set: <strong>${Utils.escapeHtml(captionSet.name)}</strong><br>`;
            message += `Total captions: ${preview.total_captions}<br>`;
            message += `<strong>Will rollback: ${preview.rollbackable_count} captions</strong><br>`;
            
            if (preview.skipped_count > 0) {
                message += `<span class="text-muted">Will skip: ${preview.skipped_count} captions</span><br>`;
            }
            
            if (preview.samples && preview.samples.length > 0) {
                message += `<br><strong>Preview (first ${preview.samples.length}):</strong><br>`;
                message += `<div class="mt-2" style="max-height: 300px; overflow-y: auto;">`;
                preview.samples.forEach(sample => {
                    message += `
                        <div class="card bg-dark border-secondary mb-2">
                            <div class="card-body p-2">
                                <small class="text-muted">${sample.bulk_edit_description || 'Bulk edit'}</small>
                                <div class="small mt-1">
                                    <strong>Current:</strong> ${Utils.escapeHtml(sample.current_text.substring(0, 100))}${sample.current_text.length > 100 ? '...' : ''}
                                </div>
                                <div class="small mt-1 text-success">
                                    <strong>Rollback to:</strong> ${Utils.escapeHtml(sample.rollback_to_text.substring(0, 100))}${sample.rollback_to_text.length > 100 ? '...' : ''}
                                </div>
                            </div>
                        </div>
                    `;
                });
                message += `</div>`;
            }
            
            message += `<br><strong>Are you sure?</strong> This will restore captions to their state before the last bulk edit.`;
            
            // Show confirmation (note: Utils.confirm takes message first, then title)
            if (await Utils.confirm(message, 'Rollback Bulk Edit')) {
                await this.applyBulkRollback(captionSetId);
            }
            
        } catch (error) {
            Utils.showToast('Failed to prepare rollback: ' + error.message, 'error');
        }
    },
    
    /**
     * Apply bulk rollback
     */
    async applyBulkRollback(captionSetId) {
        try {
            const result = await API.request(`/caption-sets/${captionSetId}/bulk-rollback-apply`, {
                method: 'POST'
            });
            
            let message = `Rollback complete: ${result.rolled_back_count} captions restored`;
            if (result.skipped_count > 0) {
                message += `, ${result.skipped_count} skipped`;
            }
            if (result.error_count > 0) {
                message += `, ${result.error_count} errors`;
            }
            
            Utils.showToast(message, result.error_count > 0 ? 'warning' : 'success');
            
            // Refresh caption sets to update rollback button visibility
            await this.loadCaptionSets(this.currentDatasetId);
            
            // Refresh current caption if showing one from this set
            if (this.currentCaptionSetId === captionSetId && this.currentEditingFileId) {
                await this.showCaptionEditor(this.currentEditingFileId);
            }
            
        } catch (error) {
            Utils.showToast('Rollback failed: ' + error.message, 'error');
        }
    }
};

// Make available globally
window.Datasets = Datasets;
