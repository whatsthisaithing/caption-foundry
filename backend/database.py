"""Database configuration and session management for CaptionForge."""

import logging
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session, declarative_base

from .config import get_settings, PROJECT_ROOT

logger = logging.getLogger(__name__)

# Base class for all ORM models
Base = declarative_base()

# Engine and session factory (initialized lazily)
_engine = None
_SessionLocal = None


def get_database_path() -> Path:
    """Get the absolute path to the database file."""
    settings = get_settings()
    db_path = Path(settings.database.path)
    
    # If relative path, resolve relative to project root
    if not db_path.is_absolute():
        db_path = PROJECT_ROOT / db_path
    
    return db_path


def get_engine():
    """Get or create the database engine."""
    global _engine
    
    if _engine is None:
        db_path = get_database_path()
        
        # Ensure parent directory exists
        db_path.parent.mkdir(parents=True, exist_ok=True)
        
        database_url = f"sqlite:///{db_path}"
        
        _engine = create_engine(
            database_url,
            connect_args={
                "check_same_thread": False,  # Required for SQLite with FastAPI
                "timeout": 30  # Wait up to 30 seconds for locks
            },
            echo=False  # Set to True for SQL debugging
        )
        
        logger.info(f"Database engine created: {db_path}")
    
    return _engine


def get_session_factory():
    """Get or create the session factory."""
    global _SessionLocal
    
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine()
        )
    
    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    """
    Get a database session for dependency injection.
    
    Usage in FastAPI endpoints:
        @app.get("/endpoint")
        def endpoint(db: Session = Depends(get_db)):
            # Use db here
            pass
    
    Yields:
        Database session that auto-closes after use
    """
    SessionLocal = get_session_factory()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize the database.
    
    Creates all tables, runs Alembic migrations, and enables WAL mode for better concurrency.
    Should be called on application startup.
    """
    engine = get_engine()
    
    # Import all models to register them with Base
    from . import models  # noqa: F401
    
    # Create all tables (for new installations)
    Base.metadata.create_all(bind=engine)
    
    # Run Alembic migrations (for existing installations)
    _run_alembic_migrations()
    
    # Enable WAL mode for better concurrency (allows readers during writes)
    with engine.connect() as conn:
        conn.execute(text("PRAGMA journal_mode=WAL"))
        conn.execute(text("PRAGMA synchronous=NORMAL"))  # Faster, still safe with WAL
        conn.commit()
    
    db_path = get_database_path()
    logger.info(f"Database initialized at: {db_path} (WAL mode enabled)")


def _run_alembic_migrations():
    """Run Alembic migrations to upgrade database schema."""
    try:
        # Fast pre-check: if alembic_version table exists and is at latest, skip entirely
        engine = get_engine()
        with engine.connect() as conn:
            # Check if alembic_version table exists
            result = conn.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'"
            )).fetchone()
            
            if result:
                # Check current version
                current_version = conn.execute(text(
                    "SELECT version_num FROM alembic_version"
                )).scalar()
                
                # Hard-coded latest version (update this when adding new migrations)
                LATEST_VERSION = "7be3a357459c"
                
                if current_version == LATEST_VERSION:
                    logger.debug("Database schema is up to date, skipping migration check")
                    return
        
        # Lazy import to avoid slowing down module load
        from alembic.config import Config as AlembicConfig
        from alembic import command as alembic_command
        
        alembic_ini_path = PROJECT_ROOT / "alembic.ini"
        
        if not alembic_ini_path.exists():
            logger.debug("alembic.ini not found, skipping migrations")
            return
        
        # Configure Alembic
        alembic_cfg = AlembicConfig(str(alembic_ini_path))
        
        # Override the database URL to ensure it matches our runtime config
        db_path = get_database_path()
        alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
        
        # Suppress Alembic's verbose output to stderr
        import logging as alembic_logging
        alembic_logging.getLogger('alembic').setLevel(alembic_logging.WARNING)
        
        # Run migrations to head (latest)
        logger.info("Running database migrations...")
        alembic_command.upgrade(alembic_cfg, "head")
        logger.info("Database migrations complete")
        
    except Exception as e:
        logger.error(f"Failed to run database migrations: {e}")
        logger.warning("Continuing with existing schema...")


def _run_migrations(engine):
    """
    Legacy migration function (deprecated - use Alembic instead).
    Kept for backwards compatibility.
    """
    migrations = [
        # (table_name, column_name, column_definition)
        ("caption_sets", "trigger_phrase", "VARCHAR(500)"),
    ]
    
    with engine.connect() as conn:
        for table, column, definition in migrations:
            # Check if column exists
            result = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            existing_columns = [row[1] for row in result]
            
            if column not in existing_columns:
                logger.info(f"Adding column {column} to {table}")
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
                    conn.commit()
                except Exception as e:
                    logger.warning(f"Failed to add column {column} to {table}: {e}")


def close_db():
    """Close database connections. Call on application shutdown."""
    global _engine, _SessionLocal
    
    if _engine is not None:
        _engine.dispose()
        _engine = None
        _SessionLocal = None
        logger.info("Database connections closed")
