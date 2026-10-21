"""Theme icons: whoever creates a theme (tag) picks its symbol, shown in the public theme strip.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-15
"""
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

# The initial themes get an icon that matches their name; any other existing theme keeps "tag".
INITIAL = {
    "Ciência": "flask-conical", "Confraternização": "party-popper", "Cultura": "palette", "Educação": "graduation-cap",
    "Esporte": "trophy", "Inovação": "lightbulb", "Saúde": "heart-pulse", "Tecnologia": "cpu",
}


def upgrade() -> None:
    # Name of an icon of the lucide set the front-end draws; unknown names fall back to "tag".
    op.execute("ALTER TABLE themes ADD COLUMN icon varchar(40) NOT NULL DEFAULT 'tag' "
               "CHECK (icon ~ '^[a-z0-9-]{1,40}$')")
    for name, icon in INITIAL.items():
        op.execute(f"UPDATE themes SET icon = '{icon}' WHERE name = '{name}'")


def downgrade() -> None:
    op.execute("ALTER TABLE themes DROP COLUMN icon")
