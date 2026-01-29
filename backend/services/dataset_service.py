"""Dataset management service."""

import logging
import re
from typing import List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models import Dataset, DatasetFile, TrackedFile, CaptionSet, Caption
from ..schemas import DatasetUpdate, CaptionSetCreate, DatasetStatsResponse

logger = logging.getLogger(__name__)


class DatasetService:
    """Service for managing datasets and their files."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_dataset(self, name: str, description: Optional[str] = None) -> Dataset:
        """Create a new dataset."""
        # Generate filesystem-safe slug
        slug = self._generate_slug(name)
        
        # Check for duplicate slug
        existing = self.db.query(Dataset).filter(Dataset.slug == slug).first()
        if existing:
            raise ValueError(f"A dataset with a similar name already exists: {existing.name}")
        
        dataset = Dataset(
            name=name,
            slug=slug,
            description=description
        )
        self.db.add(dataset)
        self.db.commit()
        self.db.refresh(dataset)
        
        logger.info(f"Created dataset: {name} (slug: {slug})")
        return dataset
    
    def get_dataset(self, dataset_id: str) -> Optional[Dataset]:
        """Get a dataset by ID."""
        return self.db.query(Dataset).filter(Dataset.id == dataset_id).first()
    
    def list_datasets(self, search: Optional[str] = None) -> List[Dataset]:
        """List all datasets, optionally filtered by search term."""
        query = self.db.query(Dataset)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                (Dataset.name.ilike(search_term)) | 
                (Dataset.description.ilike(search_term))
            )
        
        return query.order_by(Dataset.created_date.desc()).all()
    
    def update_dataset(self, dataset_id: str, update: DatasetUpdate) -> Optional[Dataset]:
        """Update dataset details."""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            return None
        
        if update.name is not None:
            dataset.name = update.name
            dataset.slug = self._generate_slug(update.name)
        if update.description is not None:
            dataset.description = update.description
        
        self.db.commit()
        self.db.refresh(dataset)
        return dataset
    
    def delete_dataset(self, dataset_id: str) -> bool:
        """Delete a dataset and all its associations."""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            return False
        
        self.db.delete(dataset)
        self.db.commit()
        logger.info(f"Deleted dataset: {dataset.name}")
        return True
    
    def clone_dataset(self, dataset_id: str, new_name: Optional[str] = None, include_captions: bool = False) -> Optional[Dataset]:
        """Clone a dataset with all its files. Optionally include caption sets and captions."""
        original = self.get_dataset(dataset_id)
        if not original:
            return None
        
        # Generate new name and slug
        if not new_name:
            new_name = f"{original.name} (Copy)"
        
        slug = self._generate_slug(new_name)
        
        # Ensure unique slug
        base_slug = slug
        counter = 1
        while self.db.query(Dataset).filter(Dataset.slug == slug).first():
            slug = f"{base_slug}_{counter}"
            counter += 1
        
        # Create new dataset
        cloned_dataset = Dataset(
            name=new_name,
            slug=slug,
            description=f"Cloned from: {original.name}\n\n{original.description or ''}"
        )
        self.db.add(cloned_dataset)
        self.db.flush()  # Get the ID without committing
        
        # Copy all dataset files
        original_files = self.db.query(DatasetFile).filter(
            DatasetFile.dataset_id == dataset_id
        ).all()
        
        for original_file in original_files:
            cloned_file = DatasetFile(
                dataset_id=cloned_dataset.id,
                file_id=original_file.file_id,
                order_index=original_file.order_index,
                excluded=original_file.excluded
            )
            self.db.add(cloned_file)
        
        cloned_dataset.file_count = len(original_files)
        
        # Optionally copy caption sets and captions
        if include_captions:
            original_caption_sets = self.db.query(CaptionSet).filter(
                CaptionSet.dataset_id == dataset_id
            ).all()
            
            for original_cs in original_caption_sets:
                cloned_cs = CaptionSet(
                    dataset_id=cloned_dataset.id,
                    name=original_cs.name,
                    style=original_cs.style,
                    max_length=original_cs.max_length,
                    custom_prompt=original_cs.custom_prompt,
                    trigger_phrase=original_cs.trigger_phrase
                )
                self.db.add(cloned_cs)
                self.db.flush()  # Get the caption set ID
                
                # Copy captions for this caption set
                original_captions = self.db.query(Caption).filter(
                    Caption.caption_set_id == original_cs.id
                ).all()
                
                for original_caption in original_captions:
                    cloned_caption = Caption(
                        caption_set_id=cloned_cs.id,
                        file_id=original_caption.file_id,
                        text=original_caption.text,
                        source=original_caption.source,
                        vision_model=original_caption.vision_model,
                        quality_score=original_caption.quality_score
                    )
                    self.db.add(cloned_caption)
                
                cloned_cs.caption_count = len(original_captions)
        
        self.db.commit()
        self.db.refresh(cloned_dataset)
        
        logger.info(f"Cloned dataset '{original.name}' -> '{new_name}' (captions: {include_captions})")
        return cloned_dataset
    
    def add_files(self, dataset_id: str, file_ids: List[str]) -> int:
        """Add files to a dataset. Returns count of files added."""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            return 0
        
        # Get current max order index
        max_order = self.db.query(func.max(DatasetFile.order_index)).filter(
            DatasetFile.dataset_id == dataset_id
        ).scalar() or 0
        
        added = 0
        for file_id in file_ids:
            # Check if file exists
            file = self.db.query(TrackedFile).filter(TrackedFile.id == file_id).first()
            if not file:
                continue
            
            # Check if already in dataset
            existing = self.db.query(DatasetFile).filter(
                DatasetFile.dataset_id == dataset_id,
                DatasetFile.file_id == file_id
            ).first()
            if existing:
                continue
            
            max_order += 1
            dataset_file = DatasetFile(
                dataset_id=dataset_id,
                file_id=file_id,
                order_index=max_order
            )
            self.db.add(dataset_file)
            added += 1
        
        # Update dataset file count
        dataset.file_count = self.db.query(DatasetFile).filter(
            DatasetFile.dataset_id == dataset_id
        ).count() + added
        
        self.db.commit()
        logger.info(f"Added {added} files to dataset {dataset.name}")
        return added
    
    def remove_file(self, dataset_id: str, file_id: str) -> bool:
        """Remove a file from a dataset."""
        dataset_file = self.db.query(DatasetFile).filter(
            DatasetFile.dataset_id == dataset_id,
            DatasetFile.file_id == file_id
        ).first()
        
        if not dataset_file:
            return False
        
        self.db.delete(dataset_file)
        
        # Update dataset file count
        dataset = self.get_dataset(dataset_id)
        if dataset:
            dataset.file_count = self.db.query(DatasetFile).filter(
                DatasetFile.dataset_id == dataset_id
            ).count() - 1
        
        self.db.commit()
        return True
    
    def remove_files(self, dataset_id: str, file_ids: List[str]) -> int:
        """Remove multiple files from a dataset."""
        removed = 0
        for file_id in file_ids:
            if self.remove_file(dataset_id, file_id):
                removed += 1
        return removed
    
    def list_dataset_files(
        self, 
        dataset_id: str, 
        page: int = 1, 
        page_size: int = 50,
        include_excluded: bool = False
    ) -> List[DatasetFile]:
        """List files in a dataset with their file details."""
        from sqlalchemy.orm import joinedload
        
        query = self.db.query(DatasetFile).options(
            joinedload(DatasetFile.file)  # Eager load the file relationship
        ).filter(
            DatasetFile.dataset_id == dataset_id
        )
        
        if not include_excluded:
            query = query.filter(DatasetFile.excluded == False)
        
        return query.order_by(DatasetFile.order_index).offset(
            (page - 1) * page_size
        ).limit(page_size).all()
    
    def get_dataset_stats(self, dataset_id: str) -> Optional[DatasetStatsResponse]:
        """Get detailed statistics for a dataset."""
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            return None
        
        # Count files
        total_files = self.db.query(DatasetFile).filter(
            DatasetFile.dataset_id == dataset_id
        ).count()
        
        excluded_files = self.db.query(DatasetFile).filter(
            DatasetFile.dataset_id == dataset_id,
            DatasetFile.excluded == True
        ).count()
        
        # Count caption sets
        caption_sets = self.db.query(CaptionSet).filter(
            CaptionSet.dataset_id == dataset_id
        ).count()
        
        # Count captioned files (files with at least one caption in any set)
        captioned_file_ids = self.db.query(Caption.file_id).join(CaptionSet).filter(
            CaptionSet.dataset_id == dataset_id
        ).distinct().count()
        
        # Calculate total size
        total_size = self.db.query(func.sum(TrackedFile.file_size)).join(
            DatasetFile, DatasetFile.file_id == TrackedFile.id
        ).filter(DatasetFile.dataset_id == dataset_id).scalar() or 0
        
        # Calculate average quality score
        avg_quality = self.db.query(func.avg(DatasetFile.quality_score)).filter(
            DatasetFile.dataset_id == dataset_id,
            DatasetFile.quality_score.isnot(None)
        ).scalar()
        
        return DatasetStatsResponse(
            dataset_id=dataset_id,
            total_files=total_files,
            excluded_files=excluded_files,
            captioned_files=captioned_file_ids,
            uncaptioned_files=total_files - captioned_file_ids,
            avg_quality_score=round(avg_quality, 3) if avg_quality else None,
            total_size_bytes=total_size,
            caption_sets=caption_sets
        )
    
    def create_caption_set(self, dataset_id: str, data: CaptionSetCreate) -> CaptionSet:
        """Create a new caption set for a dataset."""
        # Check for duplicate name
        existing = self.db.query(CaptionSet).filter(
            CaptionSet.dataset_id == dataset_id,
            CaptionSet.name == data.name
        ).first()
        if existing:
            raise ValueError(f"Caption set '{data.name}' already exists in this dataset")
        
        caption_set = CaptionSet(
            dataset_id=dataset_id,
            name=data.name,
            description=data.description,
            style=data.style,
            max_length=data.max_length,
            custom_prompt=data.custom_prompt,
            trigger_phrase=data.trigger_phrase
        )
        self.db.add(caption_set)
        self.db.commit()
        self.db.refresh(caption_set)
        
        logger.info(f"Created caption set: {data.name} (style: {data.style}, trigger: {data.trigger_phrase or 'none'})")
        return caption_set
    
    def list_caption_sets(self, dataset_id: str) -> List[CaptionSet]:
        """List all caption sets for a dataset."""
        return self.db.query(CaptionSet).filter(
            CaptionSet.dataset_id == dataset_id
        ).order_by(CaptionSet.created_date).all()
    
    def _generate_slug(self, name: str) -> str:
        """Generate a filesystem-safe slug from a name."""
        # Convert to lowercase
        slug = name.lower()
        # Replace spaces and special chars with underscores
        slug = re.sub(r'[^a-z0-9]+', '_', slug)
        # Remove leading/trailing underscores
        slug = slug.strip('_')
        # Limit length
        slug = slug[:64]
        return slug or 'dataset'
