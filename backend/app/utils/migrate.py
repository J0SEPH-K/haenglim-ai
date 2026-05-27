"""Lightweight idempotent column migrations for SQLite.

We don't use Alembic here; instead we inspect tables on startup and ALTER TABLE ADD
COLUMN for anything missing. Keeps dev ergonomics simple for a single-SQLite-file app.
"""
from sqlalchemy import inspect, text
from app.database import engine


# (table, column, SQL type) — additive only.
_COLUMNS: list[tuple[str, str, str]] = [
    ("ai_providers", "token_quota", "INTEGER"),
    ("ai_providers", "input_price_per_1m", "FLOAT"),
    ("ai_providers", "output_price_per_1m", "FLOAT"),
    ("messages", "ai_provider_id", "INTEGER"),
    ("messages", "model_id", "VARCHAR(100)"),
    ("messages", "prompt_tokens", "INTEGER"),
    ("messages", "completion_tokens", "INTEGER"),
    ("users", "token_limit", "INTEGER"),
    ("users", "price_limit_usd", "FLOAT"),
    ("groups", "token_limit", "INTEGER"),
    ("groups", "price_limit_usd", "FLOAT"),
]


def run_migrations() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, column, coltype in _COLUMNS:
            if table not in tables:
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                continue
            conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {coltype}'))
