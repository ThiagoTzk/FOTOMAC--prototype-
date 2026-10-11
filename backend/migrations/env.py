from alembic import context
from sqlalchemy import create_engine

from app.config import get_settings

settings = get_settings()
target = context.get_x_argument(as_dictionary=True).get("db", "main")
url = settings.test_database_url if target == "test" else settings.database_url
if not url:
    raise RuntimeError("FOTOMAC_TEST_DATABASE_URL is not set in backend/.env")

engine = create_engine(url)
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()
