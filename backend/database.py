"""Database configuration and session management for CaptionFoundry."""

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
    import io
    import sys
    
    try:
        # Lazy import to avoid slowing down module load
        from alembic.config import Config as AlembicConfig
        from alembic import command as alembic_command
        from alembic.script import ScriptDirectory
        from alembic.runtime.migration import MigrationContext
        
        # Suppress Alembic's verbose output BEFORE doing anything
        # This prevents INFO messages from going to stderr
        import logging as alembic_logging
        alembic_logging.getLogger('alembic.runtime.migration').setLevel(alembic_logging.ERROR)
        alembic_logging.getLogger('alembic.env').setLevel(alembic_logging.ERROR)
        alembic_logging.getLogger('alembic').setLevel(alembic_logging.ERROR)
        
        alembic_ini_path = PROJECT_ROOT / "alembic.ini"
        
        if not alembic_ini_path.exists():
            logger.debug("alembic.ini not found, skipping migrations")
            return
        
        # Configure Alembic
        alembic_cfg = AlembicConfig(str(alembic_ini_path))
        
        # Override the database URL to ensure it matches our runtime config
        db_path = get_database_path()
        alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
        
        # Redirect Alembic output to null to prevent stdout/stderr pollution
        alembic_cfg.attributes['configure_logger'] = False
        
        # Get the script directory for revision checks
        script = ScriptDirectory.from_config(alembic_cfg)
        head_rev = script.get_current_head()
        
        # Fast pre-check: if current revision == head revision, skip migration
        engine = get_engine()
        with engine.begin() as conn:  # Use begin() to ensure proper transaction handling
            migration_context = MigrationContext.configure(conn)
            current_rev = migration_context.get_current_revision()
            
            logger.debug(f"Current database revision: {current_rev}, Head revision: {head_rev}")
            
            if current_rev == head_rev and current_rev is not None:
                logger.debug(f"Database schema is up to date at revision {current_rev}")
                return
            
            if current_rev is None:
                logger.info(f"Database has no revision, initializing to {head_rev}")
            else:
                logger.info(f"Database needs migration: {current_rev} -> {head_rev}")
        
        # Run migrations to head (latest) - capture all output to prevent stderr pollution
        logger.info("Running database migrations...")
        
        # Capture stdout and stderr during migration
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = io.StringIO()
        sys.stderr = io.StringIO()
        
        try:
            alembic_command.upgrade(alembic_cfg, "head")
        finally:
            # Restore stdout/stderr
            sys.stdout = old_stdout
            sys.stderr = old_stderr
        
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
