"""SQLite connection and schema management."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "expenses.db"

DEFAULT_CATEGORIES = (
    "Food & Dining",
    "Groceries",
    "Transport",
    "Housing",
    "Utilities",
    "Health",
    "Shopping",
    "Entertainment",
    "Education",
    "Travel",
    "Other",
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    spent_on     TEXT NOT NULL
                 CHECK (spent_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    note         TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_spent_on
    ON expenses (spent_on);

CREATE INDEX IF NOT EXISTS idx_expenses_category
    ON expenses (category_id);
"""


class Database:
    """Small wrapper around a SQLite file with one connection per operation."""

    def __init__(self, path: str | Path = DEFAULT_DB_PATH) -> None:
        self.path = Path(path).expanduser()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        """Create tables and add the starter categories exactly once."""
        with self.connect() as connection:
            connection.executescript(SCHEMA)

            seeded = connection.execute(
                "SELECT 1 FROM meta WHERE key = 'seeded_defaults'"
            ).fetchone()
            if seeded:
                return

            connection.executemany(
                "INSERT OR IGNORE INTO categories (name) VALUES (?)",
                [(name,) for name in DEFAULT_CATEGORIES],
            )
            connection.execute(
                "INSERT INTO meta (key, value) VALUES ('seeded_defaults', '1')"
            )
