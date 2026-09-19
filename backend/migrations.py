"""
Additive schema reconciliation.

``Base.metadata.create_all`` creates missing tables but never alters existing
ones, so a database created by an earlier build keeps its old columns. This
walks the declarative models and issues ``ALTER TABLE ... ADD COLUMN`` for
anything missing. Additive only: nothing is dropped, renamed, or retyped, so
running it against an up-to-date database is a no-op.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from database import Base


def _column_ddl(column) -> str:
    try:
        type_sql = column.type.compile(dialect=None)
    except Exception:
        type_sql = "VARCHAR"
    return f"{column.name} {type_sql}"


def ensure_schema(engine: Engine) -> list:
    """Add any model column missing from the live database. Returns what changed."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    applied = []

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all handles brand-new tables

        live_columns = {col["name"] for col in inspector.get_columns(table.name)}

        for column in table.columns:
            if column.name in live_columns:
                continue
            # A NOT NULL column cannot be added to a table with existing rows
            # without a default, so add it as nullable and let the app backfill.
            ddl = f"ALTER TABLE {table.name} ADD COLUMN {_column_ddl(column)}"
            try:
                with engine.begin() as conn:
                    conn.execute(text(ddl))
                applied.append(f"{table.name}.{column.name}")
            except Exception as exc:
                print(f"Schema reconcile skipped {table.name}.{column.name}: {exc}")

    if applied:
        print(f"Schema reconciled, added columns: {', '.join(applied)}")
    return applied
