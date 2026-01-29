/**
 * CaptionForge Main Application
 * Initializes modules and handles view navigation
 */

const App = {
    currentView: 'folders',
    connectionCheckInterval: null,
    settingsModal: null,
    
    /**
     * Initialize the application
     */
    async init() {
        console.log('CaptionForge initializing...');
        
        // Initialize modules
        Folders.init();
        Datasets.init();
        Jobs.init();
        Exports.init();
        
        // Initialize settings modal
        this.initSettingsModal();
        
        // Bind navigation
        this.bindNavigation();
        
        // Check connection
        await this.checkConnection();
        this.startConnectionCheck();
        
        // Load initial data
        await this.loadInitialData();
        
        // Check URL params for initial view
        const params = Utils.getQueryParams();
        if (params.view) {
            this.showView(params.view);
        }
        
        console.log('CaptionForge ready');
    },
    
    /**
     * Initialize the settings modal
     */
    initSettingsModal() {
        const modalEl = document.getElementById('settingsModal');
        if (modalEl) {
            this.settingsModal = new bootstrap.Modal(modalEl);
        } else {
            console.error('Settings modal element not found');
        }
        
        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                App.showSettings();
            });
        } else {
            console.error('Settings button not found');
        }
        
        // Save settings button
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
            App.saveSettings();
        });
        
        // Test connection buttons
        document.getElementById('testOllamaBtn')?.addEventListener('click', () => {
            App.testConnection('ollama');
        });
        
        document.getElementById('testLmstudioBtn')?.addEventListener('click', () => {
            App.testConnection('lmstudio');
        });
    },
    
    /**
     * Show settings modal and load current config
     */
    async showSettings() {
        try {
            const config = await API.getConfig();
            this.populateSettingsForm(config);
            this.settingsModal.show();
        } catch (error) {
            Utils.showToast('Failed to load settings: ' + error.message, 'danger');
        }
    },
    
    /**
     * Populate settings form with config values
     */
    populateSettingsForm(config) {
        // Vision settings
        document.getElementById('settings_vision_backend').value = config.vision?.backend || 'ollama';
        document.getElementById('settings_vision_model').value = config.vision?.default_model || '';
        document.getElementById('settings_ollama_url').value = config.vision?.ollama_url || 'http://localhost:11434';
        document.getElementById('settings_lmstudio_url').value = config.vision?.lmstudio_url || 'http://localhost:1234';
        document.getElementById('settings_vision_max_tokens').value = config.vision?.max_tokens || 4096;
        document.getElementById('settings_vision_timeout').value = config.vision?.timeout_seconds || 120;
        document.getElementById('settings_vision_retries').value = config.vision?.max_retries || 2;
        
        // Thumbnail settings
        document.getElementById('settings_thumb_size').value = config.thumbnails?.max_size || 256;
        document.getElementById('settings_thumb_quality').value = config.thumbnails?.quality || 85;
        document.getElementById('settings_thumb_format').value = config.thumbnails?.format || 'webp';
        
        // Export settings
        document.getElementById('settings_export_format').value = config.export?.default_format || 'jpeg';
        document.getElementById('settings_export_quality').value = config.export?.default_quality || 95;
        document.getElementById('settings_export_padding').value = config.export?.default_padding || 6;
        
        // Debug
        document.getElementById('settings_debug').checked = config.server?.debug || false;
    },
    
    /**
     * Collect form data and save settings
     */
    async saveSettings() {
        const config = {
            vision: {
                backend: document.getElementById('settings_vision_backend').value,
                default_model: document.getElementById('settings_vision_model').value,
                ollama_url: document.getElementById('settings_ollama_url').value,
                lmstudio_url: document.getElementById('settings_lmstudio_url').value,
                max_tokens: parseInt(document.getElementById('settings_vision_max_tokens').value) || 4096,
                timeout_seconds: parseInt(document.getElementById('settings_vision_timeout').value) || 120,
                max_retries: parseInt(document.getElementById('settings_vision_retries').value) || 2,
            },
            thumbnails: {
                max_size: parseInt(document.getElementById('settings_thumb_size').value) || 256,
                quality: parseInt(document.getElementById('settings_thumb_quality').value) || 85,
                format: document.getElementById('settings_thumb_format').value,
            },
            export: {
                default_format: document.getElementById('settings_export_format').value,
                default_quality: parseInt(document.getElementById('settings_export_quality').value) || 95,
                default_padding: parseInt(document.getElementById('settings_export_padding').value) || 6,
            },
            server: {
                debug: document.getElementById('settings_debug').checked,
            }
        };
        
        try {
            const saveBtn = document.getElementById('saveSettingsBtn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
            
            const result = await API.saveConfig(config);
            Utils.showToast(result.message || 'Settings saved successfully', 'success');
            this.settingsModal.hide();
            
        } catch (error) {
            Utils.showToast('Failed to save settings: ' + error.message, 'danger');
        } finally {
            const saveBtn = document.getElementById('saveSettingsBtn');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Save Settings';
        }
    },
    
    /**
     * Test connection to a backend
     */
    async testConnection(backend) {
        const btn = document.getElementById(backend === 'ollama' ? 'testOllamaBtn' : 'testLmstudioBtn');
        const originalHtml = btn.innerHTML;
        
        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            
            const result = await API.testBackendConnection(backend);
            
            if (result.status === 'ok') {
                btn.innerHTML = '<i class="bi bi-check-lg text-success"></i>';
                Utils.showToast(result.message, 'success');
            } else {
                btn.innerHTML = '<i class="bi bi-x-lg text-danger"></i>';
                Utils.showToast(result.message, 'warning');
            }
            
            // Reset button after 2 seconds
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }, 2000);
            
        } catch (error) {
            btn.innerHTML = '<i class="bi bi-x-lg text-danger"></i>';
            Utils.showToast('Connection test failed: ' + error.message, 'danger');
            
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }, 2000);
        }
    },
    
    /**
     * Bind navigation events
     */
    bindNavigation() {
        document.querySelectorAll('[data-view]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.showView(link.dataset.view);
            });
        });
    },
    
    /**
     * Show a specific view
     */
    showView(viewName) {
        // Update nav links
        document.querySelectorAll('[data-view]').forEach(link => {
            link.classList.toggle('active', link.dataset.view === viewName);
        });
        
        // Show/hide view containers
        document.querySelectorAll('.view-container').forEach(container => {
            container.style.display = container.id === `view-${viewName}` ? 'block' : 'none';
        });
        
        this.currentView = viewName;
        Utils.setQueryParam('view', viewName);
        
        // Load view-specific data
        this.onViewChange(viewName);
    },
    
    /**
     * Handle view change - load relevant data
     */
    async onViewChange(viewName) {
        switch (viewName) {
            case 'folders':
                await Folders.loadFolders();
                break;
            case 'datasets':
                await Datasets.loadDatasets();
                // If dataset images need refresh (files were added from folders)
                if (Datasets.needsRefresh && Datasets.currentDatasetId) {
                    // Refresh the current dataset's images AND stats
                    await Promise.all([
                        Datasets.loadDatasetDetails(Datasets.currentDatasetId),
                        Datasets.loadDatasetImages(Datasets.currentDatasetId, 1, true)
                    ]);
                    Datasets.needsRefresh = false;
                    Datasets.lastModifiedDatasetId = null;
                }
                break;
            case 'jobs':
                await Jobs.loadJobs();
                break;
            case 'exports':
                await Exports.loadExports();
                break;
        }
    },
    
    /**
     * Load initial data for the default view
     */
    async loadInitialData() {
        try {
            await Folders.loadFolders();
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    },
    
    /**
     * Check connection to the backend
     */
    async checkConnection() {
        const statusEl = document.getElementById('connectionStatus');
        
        try {
            const health = await API.healthCheck();
            
            if (health.status === 'healthy') {
                statusEl.innerHTML = '<i class="bi bi-circle-fill text-success"></i> Connected';
                statusEl.title = `Ollama: ${health.ollama_available ? '✓' : '✗'} | LM Studio: ${health.lmstudio_available ? '✓' : '✗'}`;
            } else {
                statusEl.innerHTML = '<i class="bi bi-circle-fill text-warning"></i> Unhealthy';
                statusEl.title = 'Database connection issue';
            }
        } catch (error) {
            statusEl.innerHTML = '<i class="bi bi-circle-fill text-danger"></i> Disconnected';
            statusEl.title = 'Cannot reach backend server';
        }
    },
    
    /**
     * Start periodic connection check
     */
    startConnectionCheck() {
        this.connectionCheckInterval = setInterval(() => {
            this.checkConnection();
        }, 30000); // Check every 30 seconds
    },
    
    /**
     * Stop connection check
     */
    stopConnectionCheck() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Make available globally
window.App = App;