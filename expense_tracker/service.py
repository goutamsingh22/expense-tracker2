"""Business logic for recording and reporting expenses."""

from __future__ import annotations

import csv
import re
import sqlite3
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from .db import DEFAULT_DB_PATH, Database
from .errors import CategoryInUseError, ConflictError, NotFoundError, ValidationError
from .models import Category, CategoryTotal, Expense, MonthlyTotal, MonthSummary

_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MONTH_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")
_MAX_CATEGORY_LENGTH = 60
_MAX_NOTE_LENGTH = 500

_EXPENSE_SELECT = """
SELECT
    e.id,
    e.amount_cents,
    e.category_id,
    c.name AS category,
    e.spent_on,
    e.note,
    e.created_at
FROM expenses AS e
JOIN categories AS c ON c.id = e.category_id
"""


def parse_amount(value: object) -> int:
    """Validate an amount and return it as integer cents."""
    text = str(value).strip()
    if not text:
        raise ValidationError("Amount is required.")

    try:
        amount = Decimal(text)
    except (InvalidOperation, ValueError):
        raise ValidationError(f'"{value}" is not a valid amount.') from None

    if not amount.is_finite() or amount <= 0:
        raise ValidationError("Amount must be greater than zero.")

    cents = int(
        (amount * Decimal(100)).to_integral_value(rounding=ROUND_HALF_UP)
    )
    if cents <= 0:
        raise ValidationError("Amount must be at least 0.01.")
    return cents


def parse_date(value: object | None = None) -> date:
    """Validate an ISO date string, defaulting to today."""
    if value is None:
        return date.today()
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = str(value).strip()
    if not _DATE_PATTERN.fullmatch(text):
        raise ValidationError("Date must be in YYYY-MM-DD format.")
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise ValidationError(f'"{text}" is not a valid date.') from None


def normalize_month(value: object | None = None) -> str:
    """Return a validated month in YYYY-MM form."""
    if value is None:
        value = date.today()
    if isinstance(value, (date, datetime)):
        return value.strftime("%Y-%m")

    text = str(value).strip()
    match = _MONTH_PATTERN.fullmatch(text)
    if not match:
        raise ValidationError("Month must be in YYYY-MM format.")

    year, month = int(match.group(1)), int(match.group(2))
    try:
        date(year, month, 1)
    except ValueError:
        raise ValidationError(f'"{text}" is not a valid month.') from None
    return f"{year:04d}-{month:02d}"


def normalize_category_name(value: object) -> str:
    if not isinstance(value, str):
        raise ValidationError("Category name must be text.")
    name = " ".join(value.split())
    if not name:
        raise ValidationError("Category name cannot be empty.")
    if len(name) > _MAX_CATEGORY_LENGTH:
        raise ValidationError(
            f"Category name must be {_MAX_CATEGORY_LENGTH} characters or fewer."
        )
    return name


def normalize_note(value: object | None) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValidationError("Note must be text.")
    note = " ".join(value.split())
    if len(note) > _MAX_NOTE_LENGTH:
        raise ValidationError(
            f"Note must be {_MAX_NOTE_LENGTH} characters or fewer."
        )
    return note


def _month_bounds(month: str) -> tuple[str, str]:
    year, month_number = (int(part) for part in month.split("-"))
    start = date(year, month_number, 1)
    if month_number == 12:
        if year == 9999:
            raise ValidationError("Year must be 9998 or earlier.")
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month_number + 1, 1)
    return start.isoformat(), end.isoformat()


def _validate_expense_id(expense_id: int) -> int:
    if isinstance(expense_id, bool) or not isinstance(expense_id, int):
        raise ValidationError("Expense ID must be a whole number.")
    if expense_id <= 0:
        raise ValidationError("Expense ID must be greater than zero.")
    return expense_id


def _validate_limit(limit: int | None) -> int | None:
    if limit is None:
        return None
    if isinstance(limit, bool) or not isinstance(limit, int) or limit <= 0:
        raise ValidationError("Limit must be a whole number greater than zero.")
    return limit


class ExpenseTracker:
    """High-level interface for the expense database."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self.db = Database(db_path or DEFAULT_DB_PATH)
        self.db.initialize()

    def add_expense(
        self,
        amount: object,
        category: str,
        spent_on: object | None = None,
        note: str | None = "",
    ) -> Expense:
        amount_cents = parse_amount(amount)
        spent_date = parse_date(spent_on)
        category_name = normalize_category_name(category)
        clean_note = normalize_note(note)

        with self.db.connect() as connection:
            category_row = self._category_row(connection, category_name, create=True)
            cursor = connection.execute(
                """
                INSERT INTO expenses (amount_cents, category_id, spent_on, note)
                VALUES (?, ?, ?, ?)
                """,
                (
                    amount_cents,
                    category_row["id"],
                    spent_date.isoformat(),
                    clean_note,
                ),
            )
            row = connection.execute(
                _EXPENSE_SELECT + " WHERE e.id = ?", (cursor.lastrowid,)
            ).fetchone()

        return self._to_expense(row)

    def get_expense(self, expense_id: int) -> Expense:
        expense_id = _validate_expense_id(expense_id)
        with self.db.connect() as connection:
            row = connection.execute(
                _EXPENSE_SELECT + " WHERE e.id = ?", (expense_id,)
            ).fetchone()
        if row is None:
            raise NotFoundError(f"Expense #{expense_id} was not found.")
        return self._to_expense(row)

    def list_expenses(
        self,
        month: object | None = None,
        category: str | None = None,
        limit: int | None = None,
    ) -> list[Expense]:
        where: list[str] = []
        params: list[object] = []

        if month is not None:
            month_key = normalize_month(month)
            start, end = _month_bounds(month_key)
            where.append("e.spent_on >= ? AND e.spent_on < ?")
            params.extend((start, end))

        if category is not None:
            category_name = normalize_category_name(category)
            where.append("c.name = ? COLLATE NOCASE")
            params.append(category_name)

        limit = _validate_limit(limit)
        sql = _EXPENSE_SELECT
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY e.spent_on DESC, e.id DESC"
        if limit is not None:
            sql += " LIMIT ?"
            params.append(limit)

        with self.db.connect() as connection:
            rows = connection.execute(sql, params).fetchall()
        return [self._to_expense(row) for row in rows]

    def delete_expense(self, expense_id: int) -> None:
        expense_id = _validate_expense_id(expense_id)
        with self.db.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM expenses WHERE id = ?", (expense_id,)
            )
        if cursor.rowcount == 0:
            raise NotFoundError(f"Expense #{expense_id} was not found.")

    def month_summary(self, month: object | None = None) -> MonthSummary:
        month_key = normalize_month(month)
        start, end = _month_bounds(month_key)

        with self.db.connect() as connection:
            totals = connection.execute(
                """
                SELECT COUNT(*) AS count,
                       COALESCE(SUM(amount_cents), 0) AS total_cents
                FROM expenses
                WHERE spent_on >= ? AND spent_on < ?
                """,
                (start, end),
            ).fetchone()
            category_rows = connection.execute(
                """
                SELECT c.name AS category,
                       SUM(e.amount_cents) AS total_cents,
                       COUNT(*) AS count
                FROM expenses AS e
                JOIN categories AS c ON c.id = e.category_id
                WHERE e.spent_on >= ? AND e.spent_on < ?
                GROUP BY c.id, c.name
                ORDER BY total_cents DESC, c.name COLLATE NOCASE ASC
                """,
                (start, end),
            ).fetchall()

        return MonthSummary(
            month=month_key,
            total_cents=int(totals["total_cents"]),
            count=int(totals["count"]),
            by_category=tuple(
                CategoryTotal(
                    category=str(row["category"]),
                    total_cents=int(row["total_cents"]),
                    count=int(row["count"]),
                )
                for row in category_rows
            ),
        )

    def monthly_totals(self, limit: int | None = None) -> list[MonthlyTotal]:
        limit = _validate_limit(limit)
        sql = """
            SELECT substr(spent_on, 1, 7) AS month,
                   SUM(amount_cents) AS total_cents,
                   COUNT(*) AS count
            FROM expenses
            GROUP BY substr(spent_on, 1, 7)
            ORDER BY month DESC
        """
        params: list[object] = []
        if limit is not None:
            sql += " LIMIT ?"
            params.append(limit)

        with self.db.connect() as connection:
            rows = connection.execute(sql, params).fetchall()
        return [
            MonthlyTotal(
                month=str(row["month"]),
                total_cents=int(row["total_cents"]),
                count=int(row["count"]),
            )
            for row in rows
        ]

    def list_categories(self) -> list[Category]:
        with self.db.connect() as connection:
            rows = connection.execute(
                """
                SELECT c.id,
                       c.name,
                       COUNT(e.id) AS expense_count,
                       COALESCE(SUM(e.amount_cents), 0) AS total_cents
                FROM categories AS c
                LEFT JOIN expenses AS e ON e.category_id = c.id
                GROUP BY c.id, c.name
                ORDER BY c.name COLLATE NOCASE ASC
                """
            ).fetchall()
        return [
            Category(
                id=int(row["id"]),
                name=str(row["name"]),
                expense_count=int(row["expense_count"]),
                total_cents=int(row["total_cents"]),
            )
            for row in rows
        ]

    def add_category(self, name: str) -> Category:
        category_name = normalize_category_name(name)
        with self.db.connect() as connection:
            if self._category_row(connection, category_name, create=False):
                raise ConflictError(f'Category "{category_name}" already exists.')
            try:
                cursor = connection.execute(
                    "INSERT INTO categories (name) VALUES (?)", (category_name,)
                )
            except sqlite3.IntegrityError:
                raise ConflictError(
                    f'Category "{category_name}" already exists.'
                ) from None
            row = connection.execute(
                "SELECT id, name FROM categories WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        return Category(id=int(row["id"]), name=str(row["name"]))

    def remove_category(self, name: str) -> str:
        category_name = normalize_category_name(name)
        with self.db.connect() as connection:
            row = self._category_row(connection, category_name, create=False)
            if row is None:
                raise NotFoundError(f'Category "{category_name}" was not found.')
            count = connection.execute(
                "SELECT COUNT(*) FROM expenses WHERE category_id = ?", (row["id"],)
            ).fetchone()[0]
            if count:
                raise CategoryInUseError(str(row["name"]), int(count))
            connection.execute("DELETE FROM categories WHERE id = ?", (row["id"],))
        return str(row["name"])

    def export_csv(
        self, path: str | Path, month: object | None = None
    ) -> tuple[int, Path]:
        expenses = self.list_expenses(month=month)
        destination = Path(path).expanduser()
        destination.parent.mkdir(parents=True, exist_ok=True)

        with destination.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(("id", "date", "category", "amount", "note"))
            for expense in expenses:
                writer.writerow(
                    (
                        expense.id,
                        expense.spent_on.isoformat(),
                        expense.category,
                        f"{expense.amount:.2f}",
                        expense.note,
                    )
                )
        return len(expenses), destination

    @staticmethod
    def _category_row(
        connection: sqlite3.Connection, name: str, create: bool
    ) -> sqlite3.Row | None:
        row = connection.execute(
            "SELECT id, name FROM categories WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        if row is not None or not create:
            return row

        try:
            connection.execute("INSERT INTO categories (name) VALUES (?)", (name,))
        except sqlite3.IntegrityError:
            pass
        return connection.execute(
            "SELECT id, name FROM categories WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()

    @staticmethod
    def _to_expense(row: sqlite3.Row) -> Expense:
        return Expense(
            id=int(row["id"]),
            amount_cents=int(row["amount_cents"]),
            category_id=int(row["category_id"]),
            category=str(row["category"]),
            spent_on=date.fromisoformat(str(row["spent_on"])),
            note=str(row["note"]),
            created_at=str(row["created_at"]),
        )
