"""Alembic environment for the LearnSite API (SQLite, synchronous engine).

The database URL is taken from ``app.core.config`` (``settings.database_url``,
i.e. the ``LEARNSITE_DATABASE_URL`` environment variable / ``.env`` file), so
``alembic.ini`` never hardcodes an absolute path.  Commands are meant to be run
from ``apps/api`` (``python -m alembic -c alembic.ini ...``); running from the
repository root with ``-c apps/api/alembic.ini`` also works because the ``app``
package is located relative to this file.
"""

from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the `app` package importable no matter which directory alembic was
# launched from (apps/api or the repository root).
API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.core.config import settings  # noqa: E402
from app.models import Base  # noqa: E402

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Resolve the database URL from the application settings instead of
# alembic.ini, so the same LEARNSITE_DATABASE_URL / .env used by the API
# applies to migrations.
config.set_main_option("sqlalchemy.url", settings.database_url)

# Model metadata for 'autogenerate' support.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite cannot ALTER most schema elements in place; batch mode
            # rebuilds tables for future migrations that alter columns.
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
