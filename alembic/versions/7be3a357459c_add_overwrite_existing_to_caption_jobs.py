"""add_overwrite_existing_to_caption_jobs

Revision ID: 7be3a357459c
Revises: 
Create Date: 2026-01-29 10:46:46.057268

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7be3a357459c'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add overwrite_existing column to caption_jobs table
    op.add_column('caption_jobs', sa.Column('overwrite_existing', sa.Boolean(), nullable=True, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove overwrite_existing column from caption_jobs table
    op.drop_column('caption_jobs', 'overwrite_existing')
