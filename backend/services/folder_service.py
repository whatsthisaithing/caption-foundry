"""Folder tracking and file scanning service."""

import hashlib
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image
from sqlalchemy.orm import Session

from ..config import get_settings, PROJECT_ROOT
from ..models import TrackedFolder, TrackedFile
from ..schemas import FolderUpdate, FolderScanResult
from .thumbnail_service import ThumbnailService

logger = logging.getLogger(__name__)


class FolderService:
    """Service for managing tracked folders and scanning files."""
    
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()
        self.thumbnail_service = ThumbnailService()
    
    def create_folder(
        self, 
        path: str, 
        name: Optional[str] = None,
        recursive: bool = True
    ) -> TrackedFolder:
        """Add a new folder to track."""
        folder_path = Path(path)
        
        # Validate path
        if not folder_path.exists():
            raise ValueError(f"Folder does not exist: {path}")
        if not folder_path.is_dir():
            raise ValueError(f"Path is not a directory: {path}")
        
        # Use folder name as display name if not provided
        if not name:
            name = folder_path.name
        
        # Check for duplicates
        absolute_path = str(folder_path.resolve())
        existing = self.db.query(TrackedFolder).filter(
            TrackedFolder.path == absolute_path
        ).first()
        if existing:
            raise ValueError(f"Folder already tracked: {absolute_path}")
        
        # Create folder record
        folder = TrackedFolder(
            path=absolute_path,
            name=name,
            recursive=recursive,
            enabled=True
        )
        self.db.add(folder)
        self.db.commit()
        self.db.refresh(folder)
        
        logger.info(f"Added tracked folder: {absolute_path} (recursive={recursive})")
        
        # Trigger initial scan
        self.scan_folder(folder.id)
        
        return folder
    
    def get_folder(self, folder_id: str) -> Optional[TrackedFolder]:
        """Get a folder by ID."""
        return self.db.query(TrackedFolder).filter(TrackedFolder.id == folder_id).first()
    
    def list_folders(self, enabled_only: bool = False) -> List[TrackedFolder]:
        """List all tracked folders."""
        query = self.db.query(TrackedFolder)
        if enabled_only:
            query = query.filter(TrackedFolder.enabled == True)
        return query.order_by(TrackedFolder.name).all()
    
    def update_folder(self, folder_id: str, update: FolderUpdate) -> Optional[TrackedFolder]:
        """Update folder settings."""
        folder = self.get_folder(folder_id)
        if not folder:
            return None
        
        if update.name is not None:
            folder.name = update.name
        if update.recursive is not None:
            folder.recursive = update.recursive
        if update.enabled is not None:
            folder.enabled = update.enabled
        
        self.db.commit()
        self.db.refresh(folder)
        return folder
    
    def delete_folder(self, folder_id: str) -> bool:
        """Remove a folder from tracking (also removes associated files)."""
        folder = self.get_folder(folder_id)
        if not folder:
            return False
        
        self.db.delete(folder)
        self.db.commit()
        logger.info(f"Removed tracked folder: {folder.path}")
        return True
    
    def scan_folder(self, folder_id: str) -> FolderScanResult:
        """Scan a folder for image files."""
        start_time = time.time()
        folder = self.get_folder(folder_id)
        if not folder:
            raise ValueError(f"Folder not found: {folder_id}")
        
        folder_path = Path(folder.path)
        if not folder_path.exists():
            raise ValueError(f"Folder no longer exists: {folder.path}")
        
        # Get supported extensions
        supported_formats = self.settings.image_processing.supported_formats
        extensions = [f".{ext.lower()}" for ext in supported_formats]
        
        # Find all image files
        files_found = 0
        files_added = 0
        files_updated = 0
        thumbnails_generated = 0
        captions_imported = 0
        
        # Track existing files to detect removals and re-additions
        # Get ALL files for this folder, including ones marked as not existing
        all_existing_files = {f.relative_path: f for f in self.db.query(TrackedFile).filter(
            TrackedFile.folder_id == folder.id
        ).all()}
        seen_paths = set()
        
        # Scan for files
        if folder.recursive:
            file_iter = folder_path.rglob("*")
        else:
            file_iter = folder_path.glob("*")
        
        for file_path in file_iter:
            if not file_path.is_file():
                continue
            if file_path.suffix.lower() not in extensions:
                continue
            
            # Check file size limit
            try:
                file_size = file_path.stat().st_size
                max_size = self.settings.image_processing.max_file_size_mb * 1024 * 1024
                if file_size > max_size:
                    logger.debug(f"Skipping large file: {file_path} ({file_size / 1024 / 1024:.1f} MB)")
                    continue
            except OSError:
                continue
            
            files_found += 1
            relative_path = str(file_path.relative_to(folder_path))
            seen_paths.add(relative_path)
            
            # Check if file exists in database (including previously removed files)
            existing_file = all_existing_files.get(relative_path)
            
            if existing_file:
                # If file was previously marked as not existing, restore it
                if not existing_file.exists:
                    existing_file.exists = True
                    files_added += 1  # Count as added since it's back
                    logger.info(f"Restored previously removed file: {relative_path}")
                
                # Check if file was modified
                file_modified = datetime.fromtimestamp(file_path.stat().st_mtime)
                if existing_file.file_modified and file_modified > existing_file.file_modified:
                    # Update file record
                    self._update_file_record(existing_file, file_path)
                    files_updated += 1
                    
                    # Regenerate thumbnail
                    if self._generate_thumbnail(existing_file, file_path):
                        thumbnails_generated += 1
                elif not existing_file.exists:
                    # File was restored, regenerate thumbnail if needed
                    if self._generate_thumbnail(existing_file, file_path):
                        thumbnails_generated += 1
            else:
                # Add new file
                new_file = self._create_file_record(folder, file_path, relative_path)
                files_added += 1
                
                # Generate thumbnail
                if self._generate_thumbnail(new_file, file_path):
                    thumbnails_generated += 1
                
                # Check for paired caption file
                if self._import_paired_caption(new_file, file_path):
                    captions_imported += 1
        
        # Mark missing files (only check files that were previously existing)
        files_removed = 0
        for relative_path, tracked_file in all_existing_files.items():
            if relative_path not in seen_paths and tracked_file.exists:
                tracked_file.exists = False
                files_removed += 1
        
        # Update folder stats
        folder.last_scan = datetime.utcnow()
        folder.file_count = self.db.query(TrackedFile).filter(
            TrackedFile.folder_id == folder_id,
            TrackedFile.exists == True
        ).count()
        
        self.db.commit()
        
        duration = time.time() - start_time
        logger.info(
            f"Scanned folder {folder.name}: "
            f"{files_found} found, {files_added} added, {files_updated} updated, "
            f"{files_removed} removed, {thumbnails_generated} thumbnails, "
            f"{captions_imported} captions ({duration:.2f}s)"
        )
        
        return FolderScanResult(
            folder_id=folder_id,
            files_found=files_found,
            files_added=files_added,
            files_updated=files_updated,
            files_removed=files_removed,
            thumbnails_generated=thumbnails_generated,
            captions_imported=captions_imported,
            duration_seconds=round(duration, 2)
        )
    
    def list_folder_files(
        self, 
        folder_id: str, 
        page: int = 1, 
        page_size: int = 50,
        filter: str = "all"
    ) -> Tuple[List[TrackedFile], int]:
        """List files in a folder with pagination and optional caption filter."""
        query = self.db.query(TrackedFile).filter(
            TrackedFile.folder_id == folder_id,
            TrackedFile.exists == True
        )
        
        # Apply caption filter
        if filter == "captioned":
            query = query.filter(TrackedFile.imported_caption.isnot(None))
        elif filter == "uncaptioned":
            query = query.filter(TrackedFile.imported_caption.is_(None))
        
        total = query.count()
        files = query.order_by(TrackedFile.filename).offset(
            (page - 1) * page_size
        ).limit(page_size).all()
        
        return files, total
    
    def _create_file_record(
        self, 
        folder: TrackedFolder, 
        file_path: Path, 
        relative_path: str
    ) -> TrackedFile:
        """Create a new file record."""
        stat = file_path.stat()
        
        # Get image dimensions
        width, height = None, None
        img_format = None
        try:
            with Image.open(file_path) as img:
                width, height = img.size
                img_format = img.format.lower() if img.format else file_path.suffix[1:].lower()
        except Exception as e:
            logger.warning(f"Could not read image dimensions: {file_path}: {e}")
            img_format = file_path.suffix[1:].lower()
        
        # Calculate file hash
        file_hash = self._calculate_hash(file_path)
        
        tracked_file = TrackedFile(
            folder_id=folder.id,
            filename=file_path.name,
            relative_path=relative_path,
            absolute_path=str(file_path.resolve()),
            file_hash=file_hash,
            width=width,
            height=height,
            file_size=stat.st_size,
            format=img_format,
            file_modified=datetime.fromtimestamp(stat.st_mtime),
            exists=True
        )
        
        self.db.add(tracked_file)
        self.db.flush()  # Get ID without committing
        
        return tracked_file
    
    def _update_file_record(self, tracked_file: TrackedFile, file_path: Path):
        """Update an existing file record."""
        stat = file_path.stat()
        
        # Get image dimensions
        try:
            with Image.open(file_path) as img:
                tracked_file.width, tracked_file.height = img.size
                tracked_file.format = img.format.lower() if img.format else file_path.suffix[1:].lower()
        except Exception:
            pass
        
        tracked_file.file_size = stat.st_size
        tracked_file.file_modified = datetime.fromtimestamp(stat.st_mtime)
        tracked_file.file_hash = self._calculate_hash(file_path)
        tracked_file.exists = True
    
    def _calculate_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of a file."""
        sha256 = hashlib.sha256()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(8192), b''):
                    sha256.update(chunk)
            return sha256.hexdigest()
        except Exception as e:
            logger.warning(f"Could not calculate hash for {file_path}: {e}")
            return ""
    
    def _generate_thumbnail(self, tracked_file: TrackedFile, file_path: Path) -> bool:
        """Generate thumbnail for a file."""
        try:
            thumbnail_filename = self.thumbnail_service.generate_thumbnail(
                file_path, 
                tracked_file.file_hash or tracked_file.id
            )
            tracked_file.thumbnail_path = thumbnail_filename
            return True
        except Exception as e:
            logger.warning(f"Could not generate thumbnail for {file_path}: {e}")
            return False
    
    def _import_paired_caption(self, tracked_file: TrackedFile, file_path: Path) -> bool:
        """Import caption from paired .txt file if it exists."""
        # Look for .txt file with same name
        caption_path = file_path.with_suffix('.txt')
        if not caption_path.exists():
            return False
        
        try:
            caption_text = caption_path.read_text(encoding='utf-8').strip()
            if caption_text:
                tracked_file.imported_caption = caption_text
                logger.debug(f"Imported caption for {file_path.name}")
                return True
        except Exception as e:
            logger.warning(f"Could not read caption file {caption_path}: {e}")
        
        return False
