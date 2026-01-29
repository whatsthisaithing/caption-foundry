"""SQLAlchemy ORM models for CaptionForge."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, 
    String, Text, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship

from .database import Base


def generate_uuid() -> str:
    """Generate a new UUID string."""
    return str(uuid.uuid4())


class TrackedFolder(Base):
    """Folders being monitored for images."""
    
    __tablename__ = "tracked_folders"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    path = Column(Text, nullable=False, unique=True)
    name = Column(String(255), nullable=False)  # Display name
    recursive = Column(Boolean, default=True)
    enabled = Column(Boolean, default=True)
    
    # Scan state
    last_scan = Column(DateTime, nullable=True)
    file_count = Column(Integer, default=0)
    
    # Timestamps
    created_date = Column(DateTime, default=datetime.utcnow)
    updated_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    files = relationship("TrackedFile", back_populates="folder", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_folders_enabled", "enabled"),
    )


class TrackedFile(Base):
    """Individual image files discovered in tracked folders."""
    
    __tablename__ = "tracked_files"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    folder_id = Column(String(36), ForeignKey("tracked_folders.id", ondelete="CASCADE"), nullable=False)
    
    # File info
    filename = Column(String(255), nullable=False)
    relative_path = Column(Text, nullable=False)  # Path relative to folder
    absolute_path = Column(Text, nullable=False)
    file_hash = Column(String(64), nullable=True)  # SHA256 hash
    
    # Image metadata
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    file_size = Column(Integer, nullable=True)  # bytes
    format = Column(String(10), nullable=True)  # jpg, png, etc.
    
    # State
    exists = Column(Boolean, default=True)
    thumbnail_path = Column(String(255), nullable=True)
    
    # Imported caption (from paired .txt file)
    imported_caption = Column(Text, nullable=True)
    
    # Timestamps
    file_modified = Column(DateTime, nullable=True)
    discovered_date = Column(DateTime, default=datetime.utcnow)
    updated_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    folder = relationship("TrackedFolder", back_populates="files")
    dataset_associations = relationship("DatasetFile", back_populates="file", cascade="all, delete-orphan")
    captions = relationship("Caption", back_populates="file", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_files_folder", "folder_id"),
        Index("idx_files_hash", "file_hash"),
        Index("idx_files_exists", "exists"),
        UniqueConstraint("folder_id", "relative_path", name="uq_folder_path"),
    )


class Dataset(Base):
    """Virtual collections of images for training."""
    
    __tablename__ = "datasets"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False, unique=True)  # Filesystem-safe name
    description = Column(Text, nullable=True)
    
    # Statistics (cached)
    file_count = Column(Integer, default=0)
    captioned_count = Column(Integer, default=0)
    
    # Timestamps
    created_date = Column(DateTime, default=datetime.utcnow)
    updated_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    file_associations = relationship("DatasetFile", back_populates="dataset", cascade="all, delete-orphan")
    caption_sets = relationship("CaptionSet", back_populates="dataset", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_datasets_created", "created_date"),
    )


class DatasetFile(Base):
    """Junction table: which files belong to which datasets."""
    
    __tablename__ = "dataset_files"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    dataset_id = Column(String(36), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    file_id = Column(String(36), ForeignKey("tracked_files.id", ondelete="CASCADE"), nullable=False)
    
    # Ordering within dataset
    order_index = Column(Integer, default=0)
    
    # Per-dataset file state
    excluded = Column(Boolean, default=False)  # Temporarily exclude from exports
    
    # Quality assessment (populated by vision model)
    quality_score = Column(Float, nullable=True)  # 0.0 - 1.0
    quality_flags = Column(Text, nullable=True)  # JSON array of flags
    
    # Timestamps
    added_date = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    dataset = relationship("Dataset", back_populates="file_associations")
    file = relationship("TrackedFile", back_populates="dataset_associations")
    
    __table_args__ = (
        UniqueConstraint("dataset_id", "file_id", name="uq_dataset_file"),
        Index("idx_dataset_files_order", "dataset_id", "order_index"),
    )


class CaptionSet(Base):
    """Collections of captions for a dataset (e.g., 'Natural', 'Detailed', 'Tags')."""
    
    __tablename__ = "caption_sets"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    dataset_id = Column(String(36), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Caption style configuration
    style = Column(String(50), default="natural")  # natural, detailed, tags, custom
    max_length = Column(Integer, nullable=True)  # Max caption length
    custom_prompt = Column(Text, nullable=True)  # Custom prompt for vision model
    trigger_phrase = Column(String(500), nullable=True)  # Prefix for captions (e.g., "Nova Chorus, a woman")
    
    # Statistics (cached)
    caption_count = Column(Integer, default=0)
    
    # Timestamps
    created_date = Column(DateTime, default=datetime.utcnow)
    updated_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    dataset = relationship("Dataset", back_populates="caption_sets")
    captions = relationship("Caption", back_populates="caption_set", cascade="all, delete-orphan")
    
    __table_args__ = (
        UniqueConstraint("dataset_id", "name", name="uq_dataset_caption_set"),
        Index("idx_caption_sets_style", "style"),
    )


class Caption(Base):
    """Individual captions for each file in each caption set."""
    
    __tablename__ = "captions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    caption_set_id = Column(String(36), ForeignKey("caption_sets.id", ondelete="CASCADE"), nullable=False)
    file_id = Column(String(36), ForeignKey("tracked_files.id", ondelete="CASCADE"), nullable=False)
    
    # Caption content
    text = Column(Text, nullable=False)
    
    # Source tracking
    source = Column(String(50), default="manual")  # manual, generated, imported
    vision_model = Column(String(100), nullable=True)  # Model used for generation
    
    # Quality metrics (from vision model)
    quality_score = Column(Float, nullable=True)
    quality_flags = Column(Text, nullable=True)  # JSON array
    
    # Timestamps
    created_date = Column(DateTime, default=datetime.utcnow)
    updated_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    caption_set = relationship("CaptionSet", back_populates="captions")
    file = relationship("TrackedFile", back_populates="captions")
    
    __table_args__ = (
        UniqueConstraint("caption_set_id", "file_id", name="uq_caption_set_file"),
        Index("idx_captions_source", "source"),
    )


class CaptionJob(Base):
    """Background jobs for auto-generating captions."""
    
    __tablename__ = "caption_jobs"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    caption_set_id = Column(String(36), ForeignKey("caption_sets.id", ondelete="SET NULL"), nullable=True)
    
    # Job configuration
    vision_model = Column(String(100), nullable=False)
    vision_backend = Column(String(20), default="ollama")  # ollama or lmstudio
    overwrite_existing = Column(Boolean, default=False)
    
    # Progress tracking
    status = Column(String(20), default="pending")  # pending, running, paused, completed, failed, cancelled
    total_files = Column(Integer, default=0)
    completed_files = Column(Integer, default=0)
    failed_files = Column(Integer, default=0)
    current_file_id = Column(String(36), nullable=True)
    
    # Error tracking
    last_error = Column(Text, nullable=True)
    
    # Timestamps
    created_date = Column(DateTime, default=datetime.utcnow)
    started_date = Column(DateTime, nullable=True)
    completed_date = Column(DateTime, nullable=True)
    updated_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        Index("idx_jobs_status", "status"),
        Index("idx_jobs_created", "created_date"),
    )


class ExportHistory(Base):
    """Log of dataset exports for reference."""
    
    __tablename__ = "export_history"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    dataset_id = Column(String(36), ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    caption_set_id = Column(String(36), ForeignKey("caption_sets.id", ondelete="SET NULL"), nullable=True)
    
    # Export configuration (stored as JSON)
    export_config = Column(Text, nullable=True)
    
    # Results
    export_path = Column(Text, nullable=True)
    export_type = Column(String(20), default="folder")  # folder, zip
    
    # Statistics
    file_count = Column(Integer, default=0)
    total_size_bytes = Column(Integer, default=0)
    
    # Status
    status = Column(String(20), default="pending")  # pending, running, completed, failed
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_date = Column(DateTime, default=datetime.utcnow)
    completed_date = Column(DateTime, nullable=True)
    
    __table_args__ = (
        Index("idx_exports_dataset", "dataset_id"),
        Index("idx_exports_status", "status"),
    )


class VisionModel(Base):
    """Track available vision models in backends."""
    
    __tablename__ = "vision_models"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    
    model_id = Column(String(100), nullable=False)  # e.g., "qwen2.5-vl-7b"
    backend = Column(String(20), nullable=False)  # "ollama" or "lmstudio"
    backend_model_name = Column(String(200), nullable=False)  # e.g., "qwen2.5-vl:7b"
    
    # Status
    is_available = Column(Boolean, default=False)
    last_checked = Column(DateTime, nullable=True)
    pulled_at = Column(DateTime, nullable=True)
    file_size_mb = Column(Integer, nullable=True)
    
    __table_args__ = (
        UniqueConstraint("model_id", "backend", name="uq_model_backend"),
    )
