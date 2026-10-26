import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

from alembic import context

# 1. Import all SQLModel models so Alembic can auto-detect schema changes
from app.module.auth.model import User
from app.module.billing.model import CreditTransaction, PaymentOrder, UserCredit
from app.module.contact.model import ContactMessage
from app.module.evaluation.model import EvaluationResultItem, EvaluationRun
from app.module.notification.model import Notification, NotificationDevice

# Alembic Config object
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 2. Target SQLModel's metadata
target_metadata = SQLModel.metadata

# 3. Dynamic Database URL setup from environment variable (with fallback)
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    # Handle asyncpg or postgresql prefix compatibility if needed
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    config.set_main_option("sqlalchemy.url", DATABASE_URL)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
