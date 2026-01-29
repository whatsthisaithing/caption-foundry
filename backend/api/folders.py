"""Folder tracking API endpoints."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..logging_config import get_logger
from ..schemas import (
    FolderCreate, FolderUpdate, FolderResponse, 
    FolderScanResult, FileResponse, FileListResponse
)
from ..services.folder_service import FolderService

logger = get_logger("captionforge.api.folders")
router = APIRouter(prefix="/folders", tags=["folders"])


@router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder(folder: FolderCreate, db: Session = Depends(get_db)):
    """Add a new folder to track."""
    logger.info(f"Creating folder: path='{folder.path}', name='{folder.name}', recursive={folder.recursive}")
    service = FolderService(db)
    try:
        result = service.create_folder(folder.path, folder.name, folder.recursive)
        logger.info(f"Folder created: id={result.id}, found {result.file_count} files")
        return result
    except ValueError as e:
        logger.error(f"Folder creation failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Folder creation error: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("", response_model=List[FolderResponse])
def list_folders(
    enabled_only: bool = False,
    db: Session = Depends(get_db)
):
    """List all tracked folders."""
    service = FolderService(db)
    return service.list_folders(enabled_only=enabled_only)


@router.get("/{folder_id}", response_model=FolderResponse)
def get_folder(folder_id: str, db: Session = Depends(get_db)):
    """Get a specific folder by ID."""
    service = FolderService(db)
    folder = service.get_folder(folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


@router.put("/{folder_id}", response_model=FolderResponse)
def update_folder(
    folder_id: str, 
    folder_update: FolderUpdate, 
    db: Session = Depends(get_db)
):
    """Update folder settings."""
    service = FolderService(db)
    folder = service.update_folder(folder_id, folder_update)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return folder


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(folder_id: str, db: Session = Depends(get_db)):
    """Remove a folder from tracking."""
    service = FolderService(db)
    if not service.delete_folder(folder_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")


@router.post("/{folder_id}/scan", response_model=FolderScanResult)
def scan_folder(folder_id: str, db: Session = Depends(get_db)):
    """Trigger a scan of the folder for new/changed files."""
    service = FolderService(db)
    folder = service.get_folder(folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    
    try:
        result = service.scan_folder(folder_id)
        return result
    except Exception as e:
        logger.exception(f"Error scanning folder {folder_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to scan folder: {str(e)}"
        )


@router.get("/{folder_id}/files", response_model=FileListResponse)
def list_folder_files(
    folder_id: str,
    page: int = 1,
    page_size: int = 50,
    filter: str = "all",
    db: Session = Depends(get_db)
):
    """List files in a folder with pagination and optional caption filter."""
    service = FolderService(db)
    folder = service.get_folder(folder_id)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    
    files, total = service.list_folder_files(folder_id, page, page_size, filter)
    return FileListResponse(
        files=files,
        total=total,
        page=page,
        page_size=page_size
    )
