# Database Migrations

This directory contains Alembic database migrations for CaptionForge.

## Automatic Migrations

**Migrations run automatically on application startup!** You don't need to run any commands manually. The app will:

1. Create all tables (for new installations)
2. Run any pending migrations (for existing installations)
3. Continue starting up normally

## Manual Migration Commands

If you need to run migrations manually (for debugging or advanced usage):

```bash
# Upgrade to latest version
alembic upgrade head

# Create a new migration
alembic revision -m "description_of_change"

# View migration history
alembic history

# Downgrade one version
alembic downgrade -1
```

## Creating New Migrations

When you add or modify database models:

1. Update the model in `backend/models.py`
2. Create a migration:
   ```bash
   alembic revision -m "add_my_new_column"
   ```
3. Edit the generated file in `alembic/versions/` to add the upgrade/downgrade logic
4. Test by restarting the app (migrations run automatically)

## Migration History

- `7be3a357459c` - Add overwrite_existing column to caption_jobs table
