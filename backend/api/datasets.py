"""Dataset management API endpoints."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..logging_config import get_logger
from ..schemas import (
    DatasetCreate, DatasetUpdate, DatasetResponse,
    DatasetFilesAdd, DatasetFilesRemove, DatasetFileResponse,
    DatasetStatsResponse, CaptionSetCreate, CaptionSetResponse
)
from ..services.dataset_service import DatasetService

logger = get_logger("captionforge.api.datasets")
router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def create_dataset(dataset: DatasetCreate, db: Session = Depends(get_db)):
    """Create a new dataset."""
    logger.info(f"Creating dataset: name='{dataset.name}', description='{dataset.description}'")
    service = DatasetService(db)
    try:
        result = service.create_dataset(dataset.name, dataset.description)
        logger.info(f"Dataset created successfully: id={result.id}")
        return result
    except ValueError as e:
        logger.error(f"Dataset creation failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Dataset creation error: {type(e).__name__}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("", response_model=List[DatasetResponse])
def list_datasets(
    search: str = None,
    db: Session = Depends(get_db)
):
    """List all datasets, optionally filtered by search term."""
    service = DatasetService(db)
    return service.list_datasets(search=search)


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    """Get a specific dataset by ID."""
    service = DatasetService(db)
    dataset = service.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset


@router.put("/{dataset_id}", response_model=DatasetResponse)
def update_dataset(
    dataset_id: str,
    dataset_update: DatasetUpdate,
    db: Session = Depends(get_db)
):
    """Update dataset details."""
    service = DatasetService(db)
    dataset = service.update_dataset(dataset_id, dataset_update)
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    """Delete a dataset."""
    service = DatasetService(db)
    if not service.delete_dataset(dataset_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")


@router.post("/{dataset_id}/clone", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def clone_dataset(
    dataset_id: str,
    new_name: str = None,
    include_captions: bool = False,
    db: Session = Depends(get_db)
):
    """Clone a dataset with all its files. Optionally include caption sets and captions."""
    logger.info(f"Cloning dataset {dataset_id}: new_name='{new_name}', include_captions={include_captions}")
    service = DatasetService(db)
    cloned = service.clone_dataset(dataset_id, new_name, include_captions)
    if not cloned:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    logger.info(f"Dataset cloned successfully: id={cloned.id}")
    return cloned


@router.get("/{dataset_id}/files", response_model=List[DatasetFileResponse])
def list_dataset_files(
    dataset_id: str,
    page: int = 1,
    page_size: int = 50,
    include_excluded: bool = False,
    db: Session = Depends(get_db)
):
    """List files in a dataset."""
    service = DatasetService(db)
    dataset = service.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    
    return service.list_dataset_files(dataset_id, page, page_size, include_excluded)


@router.post("/{dataset_id}/files", status_code=status.HTTP_201_CREATED)
def add_files_to_dataset(
    dataset_id: str,
    files: DatasetFilesAdd,
    db: Session = Depends(get_db)
):
    """Add files to a dataset."""
    service = DatasetService(db)
    dataset = service.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    
    added_count = service.add_files(dataset_id, files.file_ids)
    return {"added": added_count}


@router.delete("/{dataset_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_file_from_dataset(
    dataset_id: str,
    file_id: str,
    db: Session = Depends(get_db)
):
    """Remove a file from a dataset."""
    service = DatasetService(db)
    if not service.remove_file(dataset_id, file_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in dataset")


@router.delete("/{dataset_id}/files", status_code=status.HTTP_204_NO_CONTENT)
def remove_files_from_dataset(
    dataset_id: str,
    files: DatasetFilesRemove,
    db: Session = Depends(get_db)
):
    """Remove multiple files from a dataset."""
    service = DatasetService(db)
    service.remove_files(dataset_id, files.file_ids)


@router.get("/{dataset_id}/stats", response_model=DatasetStatsResponse)
def get_dataset_stats(dataset_id: str, db: Session = Depends(get_db)):
    """Get detailed statistics for a dataset."""
    service = DatasetService(db)
    stats = service.get_dataset_stats(dataset_id)
    if not stats:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return stats


# Caption Set endpoints nested under datasets
@router.post("/{dataset_id}/caption-sets", response_model=CaptionSetResponse, status_code=status.HTTP_201_CREATED)
def create_caption_set(
    dataset_id: str,
    caption_set: CaptionSetCreate,
    db: Session = Depends(get_db)
):
    """Create a new caption set for a dataset."""
    service = DatasetService(db)
    dataset = service.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    
    try:
        result = service.create_caption_set(dataset_id, caption_set)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{dataset_id}/caption-sets", response_model=List[CaptionSetResponse])
def list_caption_sets(dataset_id: str, db: Session = Depends(get_db)):
    """List all caption sets for a dataset."""
    service = DatasetService(db)
    dataset = service.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    
    return service.list_caption_sets(dataset_id)
