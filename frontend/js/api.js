/**
 * CaptionForge API Client
 * Handles all HTTP communication with the backend
 */

const API = {
    baseUrl: '',  // Will be set on init
    
    /**
     * Initialize the API client
     */
    init(baseUrl = '') {
        this.baseUrl = baseUrl || window.location.origin;
        Utils.log('info', 'api', `API client initialized with baseUrl: ${this.baseUrl}`);
    },
    
    /**
     * Make an API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}/api${endpoint}`;
        const method = options.method || 'GET';
        
        Utils.log('debug', 'api', `→ ${method} ${endpoint}`, options.body ? { body: options.body } : null);
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };
        
        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }
        
        try {
            const startTime = performance.now();
            const response = await fetch(url, config);
            const duration = (performance.now() - startTime).toFixed(1);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: response.statusText }));
                // Handle FastAPI validation errors (422) which have a different structure
                let errorMessage = error.detail;
                if (Array.isArray(error.detail)) {
                    // Pydantic validation errors are arrays of {loc, msg, type}
                    errorMessage = error.detail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join(', ');
                } else if (typeof error.detail === 'object') {
                    errorMessage = JSON.stringify(error.detail);
                }
                Utils.log('error', 'api', `← ✗ ${method} ${endpoint} [${response.status}] ${duration}ms`, { error: errorMessage });
                throw new Error(errorMessage || `HTTP ${response.status}`);
            }
            
            // Handle no-content responses
            if (response.status === 204) {
                Utils.log('debug', 'api', `← ✓ ${method} ${endpoint} [204] ${duration}ms`);
                return null;
            }
            
            const data = await response.json();
            Utils.log('debug', 'api', `← ✓ ${method} ${endpoint} [${response.status}] ${duration}ms`);
            return data;
        } catch (error) {
            if (!error.message.includes('HTTP')) {
                // Network error, not already logged
                Utils.log('error', 'api', `← ✗ ${method} ${endpoint} - Network error: ${error.message}`);
            }
            throw error;
        }
    },
    
    // ============ System Endpoints ============
    
    async healthCheck() {
        return this.request('/system/health');
    },
    
    async getStats() {
        return this.request('/system/stats');
    },
    
    async getConfig() {
        return this.request('/system/config');
    },
    
    async saveConfig(config) {
        return this.request('/system/config', {
            method: 'POST',
            body: config
        });
    },
    
    async testBackendConnection(backend) {
        return this.request(`/system/test-connection/${backend}`, {
            method: 'POST'
        });
    },
    
    // ============ Folder Endpoints ============
    
    async listFolders() {
        return this.request('/folders');
    },
    
    async addFolder(folderPath, name = null, recursive = true) {
        return this.request('/folders', {
            method: 'POST',
            body: {
                path: folderPath,
                name: name,
                recursive: recursive
            }
        });
    },
    
    async getFolder(folderId) {
        return this.request(`/folders/${folderId}`);
    },
    
    async updateFolder(folderId, updates) {
        return this.request(`/folders/${folderId}`, {
            method: 'PUT',
            body: updates
        });
    },
    
    async scanFolder(folderId) {
        return this.request(`/folders/${folderId}/scan`, { method: 'POST' });
    },
    
    async removeFolder(folderId, deleteFiles = false) {
        return this.request(`/folders/${folderId}?delete_files=${deleteFiles}`, {
            method: 'DELETE'
        });
    },
    
    async getFolderFiles(folderId, page = 1, pageSize = 50, filter = null) {
        let url = `/folders/${folderId}/files?page=${page}&page_size=${pageSize}`;
        if (filter && filter !== 'all') {
            url += `&filter=${filter}`;
        }
        return this.request(url);
    },
    
    // ============ File Endpoints ============
    
    getImageUrl(fileId) {
        return `${this.baseUrl}/api/files/${fileId}/image`;
    },
    
    getThumbnailUrl(fileId) {
        return `${this.baseUrl}/api/files/${fileId}/thumbnail`;
    },
    
    async getFileDetails(fileId) {
        return this.request(`/files/${fileId}`);
    },
    
    // ============ Dataset Endpoints ============
    
    async listDatasets(search = null) {
        let url = '/datasets';
        if (search) {
            url += `?search=${encodeURIComponent(search)}`;
        }
        return this.request(url);
    },
    
    async createDataset(name, description = null) {
        return this.request('/datasets', {
            method: 'POST',
            body: { name, description }
        });
    },
    
    async getDataset(datasetId) {
        return this.request(`/datasets/${datasetId}`);
    },
    
    async updateDataset(datasetId, update) {
        return this.request(`/datasets/${datasetId}`, {
            method: 'PATCH',
            body: update
        });
    },
    
    async deleteDataset(datasetId) {
        return this.request(`/datasets/${datasetId}`, { method: 'DELETE' });
    },
    
    async cloneDataset(datasetId, newName = null, includeCaptions = false) {
        let url = `/datasets/${datasetId}/clone?include_captions=${includeCaptions}`;
        if (newName) {
            url += `&new_name=${encodeURIComponent(newName)}`;
        }
        return this.request(url, { method: 'POST' });
    },
    
    async getDatasetStats(datasetId) {
        return this.request(`/datasets/${datasetId}/stats`);
    },
    
    async addFilesToDataset(datasetId, fileIds) {
        return this.request(`/datasets/${datasetId}/files`, {
            method: 'POST',
            body: { file_ids: fileIds }
        });
    },
    
    async removeFileFromDataset(datasetId, fileId) {
        return this.request(`/datasets/${datasetId}/files/${fileId}`, {
            method: 'DELETE'
        });
    },
    
    async getDatasetFiles(datasetId, page = 1, pageSize = 50) {
        return this.request(`/datasets/${datasetId}/files?page=${page}&page_size=${pageSize}`);
    },
    
    async listCaptionSets(datasetId) {
        return this.request(`/datasets/${datasetId}/caption-sets`);
    },
    
    async createCaptionSet(datasetId, data) {
        return this.request(`/datasets/${datasetId}/caption-sets`, {
            method: 'POST',
            body: data
        });
    },
    
    // ============ Caption Endpoints ============
    
    async getCaptionSet(captionSetId) {
        return this.request(`/caption-sets/${captionSetId}`);
    },
    
    async updateCaptionSet(captionSetId, update) {
        return this.request(`/caption-sets/${captionSetId}`, {
            method: 'PATCH',
            body: update
        });
    },
    
    async deleteCaptionSet(captionSetId) {
        return this.request(`/caption-sets/${captionSetId}`, { method: 'DELETE' });
    },
    
    async listCaptions(captionSetId, page = 1, pageSize = 50) {
        return this.request(`/caption-sets/${captionSetId}/captions?page=${page}&page_size=${pageSize}`);
    },
    
    async createOrUpdateCaption(captionSetId, fileId, text, source = 'manual') {
        return this.request(`/caption-sets/${captionSetId}/captions`, {
            method: 'POST',
            body: { file_id: fileId, text, source }
        });
    },
    
    async updateCaption(captionId, text) {
        return this.request(`/captions/${captionId}`, {
            method: 'PATCH',
            body: { text }
        });
    },
    
    async deleteCaption(captionId) {
        return this.request(`/captions/${captionId}`, { method: 'DELETE' });
    },
    
    async getCaptionForFile(captionSetId, fileId) {
        return this.request(`/caption-sets/${captionSetId}/files/${fileId}`);
    },
    
    // ============ Vision Endpoints ============
    
    async listVisionModels() {
        return this.request('/vision/models');
    },
    
    async generateCaption(fileId, options = {}) {
        return this.request('/vision/generate', {
            method: 'POST',
            body: {
                file_id: fileId,
                ...options
            }
        });
    },
    
    async startAutoCaptionJob(captionSetId, options = {}) {
        return this.request(`/vision/caption-sets/${captionSetId}/auto-generate`, {
            method: 'POST',
            body: options
        });
    },
    
    async listJobs(status = null) {
        let url = '/vision/jobs';
        if (status) {
            url += `?status=${status}`;
        }
        return this.request(url);
    },
    
    async getJob(jobId) {
        return this.request(`/vision/jobs/${jobId}`);
    },
    
    async pauseJob(jobId) {
        return this.request(`/vision/jobs/${jobId}/pause`, { method: 'POST' });
    },
    
    async resumeJob(jobId) {
        return this.request(`/vision/jobs/${jobId}/resume`, { method: 'POST' });
    },
    
    async cancelJob(jobId) {
        return this.request(`/vision/jobs/${jobId}/cancel`, { method: 'POST' });
    },
    
    // ============ Export Endpoints ============
    
    async startExport(datasetId, options) {
        return this.request(`/export/datasets/${datasetId}/export`, {
            method: 'POST',
            body: options
        });
    },
    
    async getExportStatus(exportId) {
        return this.request(`/export/jobs/${exportId}`);
    },
    
    getExportDownloadUrl(exportId) {
        return `${this.baseUrl}/api/export/jobs/${exportId}/download`;
    },
    
    async getExportHistory(datasetId = null, limit = 20) {
        let url = `/export/history?limit=${limit}`;
        if (datasetId) {
            url += `&dataset_id=${datasetId}`;
        }
        return this.request(url);
    }
};

// Initialize on load
API.init();