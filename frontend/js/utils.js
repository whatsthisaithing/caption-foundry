/**
 * CaptionFoundry Utility Functions
 */

const Utils = {
    /**
     * Check if running in Electron desktop mode
     */
    isDesktopMode() {
        return typeof window.electronAPI !== 'undefined' && window.electronAPI.isElectron;
    },
    
    /**
     * Log to backend (in desktop mode) or console
     * @param {string} level - 'debug', 'info', 'warning', 'error'
     * @param {string} source - Component name (e.g., 'folders', 'datasets')
     * @param {string} message - Log message
     * @param {object} data - Optional data object
     */
    log(level, source, message, data = null) {
        // Always log to console
        const consoleMethod = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
        if (data) {
            console[consoleMethod](`[${source}] ${message}`, data);
        } else {
            console[consoleMethod](`[${source}] ${message}`);
        }
        
        // In desktop mode, also send to Electron main process logger
        if (this.isDesktopMode() && window.electronAPI?.log) {
            try {
                window.electronAPI.log(level, source, message, data);
            } catch (e) {
                // Ignore errors sending to backend
            }
        }
    },
    
    /**
     * Format bytes to human-readable size
     */
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
    },
    
    /**
     * Format date to locale string
     */
    formatDate(dateString, options = {}) {
        if (!dateString) return 'N/A';
        
        const date = this.parseApiDate(dateString);
        if (Number.isNaN(date.getTime())) return 'N/A';
        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        return date.toLocaleDateString(undefined, { ...defaultOptions, ...options });
    },
    
    /**
     * Format relative time (e.g., "5 minutes ago")
     */
    formatRelativeTime(dateString) {
        if (!dateString) return 'N/A';
        
        const date = this.parseApiDate(dateString);
        if (Number.isNaN(date.getTime())) return 'N/A';
        const now = new Date();
        const diffMs = Math.max(0, now - date);
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return this.formatDate(dateString, { year: 'numeric', month: 'short', day: 'numeric' });
    },

    /**
     * Parse API datetime safely.
     * If timezone is missing, treat as UTC to match backend utcnow() timestamps.
     */
    parseApiDate(dateString) {
        if (typeof dateString !== 'string') {
            return new Date(dateString);
        }
        
        const hasTimezone = /(?:Z|[+\-]\d{2}:\d{2})$/.test(dateString);
        const normalized = hasTimezone ? dateString : `${dateString}Z`;
        return new Date(normalized);
    },
    
    /**
     * Debounce function calls
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    /**
     * Truncate text with ellipsis
     */
    truncate(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    },
    
    /**
     * Create a toast notification
     */
    showToast(message, type = 'info', duration = 5000) {
        const container = document.getElementById('toastContainer');
        const id = 'toast-' + Date.now();
        
        const iconMap = {
            success: 'bi-check-circle-fill',
            error: 'bi-exclamation-triangle-fill',
            warning: 'bi-exclamation-circle-fill',
            info: 'bi-info-circle-fill'
        };
        
        const colorMap = {
            success: 'text-success',
            error: 'text-danger',
            warning: 'text-warning',
            info: 'text-info'
        };
        
        const html = `
            <div id="${id}" class="toast" role="alert">
                <div class="toast-header bg-dark border-secondary">
                    <i class="bi ${iconMap[type]} ${colorMap[type]} me-2"></i>
                    <strong class="me-auto">${type.charAt(0).toUpperCase() + type.slice(1)}</strong>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', html);
        
        const toastEl = document.getElementById(id);
        const toast = new bootstrap.Toast(toastEl, { delay: duration });
        toast.show();
        
        toastEl.addEventListener('hidden.bs.toast', () => {
            toastEl.remove();
        });
    },
    
    /**
     * Show a confirmation dialog
     */
    async confirm(message, title = 'Confirm') {
        return new Promise((resolve) => {
            const modalEl = document.getElementById('confirmModal');
            const modal = new bootstrap.Modal(modalEl);
            
            // Set title and message
            document.getElementById('confirmModalTitle').textContent = title;
            // Use innerHTML if message contains HTML tags, otherwise use textContent
            const bodyEl = document.getElementById('confirmModalBody');
            if (message.includes('<')) {
                bodyEl.innerHTML = message;
            } else {
                bodyEl.textContent = message;
            }
            
            // Remove any existing event listeners by cloning buttons
            const confirmBtn = document.getElementById('confirmModalConfirm');
            const cancelBtn = document.getElementById('confirmModalCancel');
            const newConfirmBtn = confirmBtn.cloneNode(true);
            const newCancelBtn = cancelBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            
            // Add new event listeners
            newConfirmBtn.addEventListener('click', () => {
                modal.hide();
                resolve(true);
            });
            
            newCancelBtn.addEventListener('click', () => {
                modal.hide();
                resolve(false);
            });
            
            // Handle modal close (X button or backdrop click)
            const handleHidden = () => {
                modalEl.removeEventListener('hidden.bs.modal', handleHidden);
                resolve(false);
            };
            modalEl.addEventListener('hidden.bs.modal', handleHidden);
            
            modal.show();
        });
    },
    
    /**
     * Show a prompt dialog
     */
    async prompt(message, defaultValue = '') {
        return new Promise((resolve) => {
            // Simple prompt for now - could be replaced with a Bootstrap modal
            resolve(window.prompt(message, defaultValue));
        });
    },
    
    /**
     * Clean up any lingering modal backdrops
     * Call this if modals get stuck or inputs become unresponsive
     */
    cleanupModalBackdrops() {
        // Remove any stray modal backdrops
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.remove();
        });
        
        // Remove modal-open class from body
        document.body.classList.remove('modal-open');
        
        // Reset body styles that Bootstrap adds
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    },
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    /**
     * Get quality indicator class
     */
    getQualityClass(score) {
        if (score === null || score === undefined) return '';
        if (score >= 0.7) return 'quality-good';
        if (score >= 0.4) return 'quality-medium';
        return 'quality-poor';
    },
    
    /**
     * Generate a loading spinner HTML
     */
    loadingSpinner(size = '') {
        const sizeClass = size ? `spinner-border-${size}` : '';
        return `
            <div class="loading-spinner">
                <div class="spinner-border ${sizeClass} text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;
    },
    
    /**
     * Generate empty state HTML
     */
    emptyState(icon, message, submessage = '') {
        return `
            <div class="empty-state">
                <i class="bi ${icon}"></i>
                <p class="mb-1">${message}</p>
                ${submessage ? `<small class="text-muted">${submessage}</small>` : ''}
            </div>
        `;
    },
    
    /**
     * Set CSS variable for thumbnail size
     */
    setThumbnailSize(size) {
        document.documentElement.style.setProperty('--cf-thumbnail-size', `${size}px`);
    },
    
    /**
     * Parse query parameters from URL
     */
    getQueryParams() {
        const params = new URLSearchParams(window.location.search);
        const result = {};
        for (const [key, value] of params) {
            result[key] = value;
        }
        return result;
    },
    
    /**
     * Update URL query parameter without reload
     */
    setQueryParam(key, value) {
        const url = new URL(window.location);
        if (value === null || value === undefined) {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, value);
        }
        window.history.replaceState({}, '', url);
    },
    
    /**
     * Initialize droppable path inputs
     * Makes input fields with .droppable-path class accept folder drops
     */
    initDroppablePaths() {
        document.querySelectorAll('.droppable-path').forEach(input => {
            if (input.dataset.droppableInit) return; // Already initialized
            input.dataset.droppableInit = 'true';
            
            // Add drag styling
            input.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                input.classList.add('border-primary');
            });
            
            input.addEventListener('dragleave', (e) => {
                e.stopPropagation();
                input.classList.remove('border-primary');
            });
            
            input.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                input.classList.remove('border-primary');
                
                // In Electron, dropped files have a .path property with full system path
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                    const file = files[0];
                    
                    // Electron provides .path property on dropped files
                    if (file.path) {
                        input.value = file.path;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        Utils.showToast(`Path set: ${file.path}`, 'success');
                        return;
                    }
                }
                
                // Fallback for browser mode - can't get full path
                const items = e.dataTransfer.items;
                if (items && items.length > 0) {
                    const item = items[0];
                    if (item.kind === 'file') {
                        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
                        if (entry) {
                            Utils.showToast(`"${entry.name}" detected. In browser mode, please enter full path manually.`, 'info');
                            input.focus();
                        }
                    }
                }
            });
        });
    },
    
    /**
     * Browse for folder using File System Access API
     */
    async browseForFolder(inputId) {
        // In Electron desktop mode, use native folder picker which provides full paths
        if (typeof window.electronAPI !== 'undefined' && window.electronAPI.isElectron) {
            try {
                const folderPath = await window.electronAPI.selectFolder('Select Folder');
                if (folderPath) {
                    const input = document.getElementById(inputId);
                    if (input) {
                        input.value = folderPath;
                    }
                    return folderPath;
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Folder picker error:', err);
                }
            }
            return null;
        }
        
        // Browser mode - File System Access API (limited, name only)
        if (!('showDirectoryPicker' in window)) {
            Utils.showToast('Folder picker not supported in this browser', 'warning');
            return null;
        }
        
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
            Utils.showToast(`Selected: ${dirHandle.name}. Enter full system path manually.`, 'info');
            
            const input = document.getElementById(inputId);
            if (input) {
                input.value = dirHandle.name; // Placeholder - user needs to enter full path
                input.focus();
            }
            return dirHandle.name;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Folder picker error:', err);
            }
            return null;
        }
    }
};

// Make available globally
window.Utils = Utils;
