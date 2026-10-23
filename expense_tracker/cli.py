"""Command-line interface for the expense tracker."""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from datetime import date
from pathlib import Path
from typing import Sequence

from . import __version__
from .db import DEFAULT_DB_PATH
from .errors import ExpenseTrackerError, ValidationError
from .formatting import (
    format_money,
    format_month_label,
    render_table,
    shorten,
)
from .service import ExpenseTracker, normalize_month, parse_date


def _month_type(value: str) -> str:
    try:
        return normalize_month(value)
    except ValidationError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from None


def _date_type(value: str) -> date:
    try:
        return parse_date(value)
    except ValidationError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="expense-tracker",
        description=(
            "Record expenses, organize them by category, and review monthly totals."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python main.py add 249.50 -c 'Food & Dining' -n 'Dinner'\n"
            "  python main.py list -m 2026-10\n"
            "  python main.py summary -m 2026-10\n"
            "  python main.py months\n"
            "  python main.py export expenses.csv -m 2026-10"
        ),
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB_PATH,
        help=f"SQLite database path (default: {DEFAULT_DB_PATH})",
    )
    parser.add_argument(
        "--currency",
        default=os.environ.get("EXPENSE_TRACKER_CURRENCY", "INR"),
        help="Currency code used for display (default: INR)",
    )
    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {__version__}"
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help="Record a new expense")
    add_parser.add_argument("amount", help="Amount to record, e.g. 249.50")
    add_parser.add_argument(
        "-c", "--category", required=True, help="Expense category"
    )
    add_parser.add_argument(
        "-d",
        "--date",
        type=_date_type,
        default=None,
        help="Expense date in YYYY-MM-DD format (default: today)",
    )
    add_parser.add_argument("-n", "--note", default="", help="Optional note")
    add_parser.set_defaults(func=_cmd_add)

    list_parser = subparsers.add_parser(
        "list", aliases=["ls"], help="List recorded expenses"
    )
    list_parser.add_argument("-m", "--month", type=_month_type, help="YYYY-MM")
    list_parser.add_argument("-c", "--category", help="Filter by category")
    list_parser.add_argument(
        "-l", "--limit", type=int, help="Show at most this many expenses"
    )
    list_parser.set_defaults(func=_cmd_list)

    summary_parser = subparsers.add_parser(
        "summary", help="Show the total and category breakdown for one month"
    )
    summary_parser.add_argument(
        "-m",
        "--month",
        type=_month_type,
        default=normalize_month(),
        help="Month in YYYY-MM format (default: current month)",
    )
    summary_parser.set_defaults(func=_cmd_summary)

    months_parser = subparsers.add_parser(
        "months", help="Show monthly totals across all recorded months"
    )
    months_parser.add_argument(
        "-l",
        "--limit",
        type=int,
        default=12,
        help="Number of recent months to show; 0 shows all (default: 12)",
    )
    months_parser.set_defaults(func=_cmd_months)

    delete_parser = subparsers.add_parser("delete", help="Delete an expense by ID")
    delete_parser.add_argument("id", type=int, help="Expense ID")
    delete_parser.set_defaults(func=_cmd_delete)

    categories_parser = subparsers.add_parser(
        "categories", help="List categories and their spending"
    )
    categories_parser.set_defaults(func=_cmd_categories)

    add_category_parser = subparsers.add_parser(
        "add-category", help="Create a category"
    )
    add_category_parser.add_argument("name", help="Category name")
    add_category_parser.set_defaults(func=_cmd_add_category)

    remove_category_parser = subparsers.add_parser(
        "remove-category", help="Remove an unused category"
    )
    remove_category_parser.add_argument("name", help="Category name")
    remove_category_parser.set_defaults(func=_cmd_remove_category)

    export_parser = subparsers.add_parser(
        "export", help="Export expenses to a CSV file"
    )
    export_parser.add_argument("path", type=Path, help="Destination CSV file")
    export_parser.add_argument(
        "-m", "--month", type=_month_type, help="Export one month (YYYY-MM)"
    )
    export_parser.set_defaults(func=_cmd_export)

    return parser


def _cmd_add(
    args: argparse.Namespace, tracker: ExpenseTracker, currency: str
) -> int:
    expense = tracker.add_expense(
        args.amount, args.category, args.date, args.note
    )
    details = " | ".join(
        (
            format_money(expense.amount_cents, currency),
            expense.category,
            expense.spent_on.isoformat(),
        )
    )
    if expense.note:
        details += f" | {expense.note}"
    print(f"Added expense #{expense.id}: {details}")
    return 0


def _cmd_list(
    args: argparse.Namespace, tracker: ExpenseTracker, currency: str
) -> int:
    expenses = tracker.list_expenses(args.month, args.category, args.limit)
    if not expenses:
        print("No expenses found.")
        return 0

    rows = [
        (
            str(expense.id),
            expense.spent_on.isoformat(),
            expense.category,
            format_money(expense.amount_cents, currency),
            shorten(expense.note, 40),
        )
        for expense in expenses
    ]
    print(
        render_table(
            ("ID", "Date", "Category", "Amount", "Note"),
            rows,
            aligns=("right", "left", "left", "right", "left"),
        )
    )
    total = sum(expense.amount_cents for expense in expenses)
    print()
    print(
        f"{len(expenses)} expense{'s' if len(expenses) != 1 else ''} | "
        f"Total: {format_money(total, currency)}"
    )
    return 0


def _cmd_summary(
    args: argparse.Namespace, tracker: ExpenseTracker, currency: str
) -> int:
    summary = tracker.month_summary(args.month)
    print(f"{format_month_label(summary.month)} summary")
    print()

    if summary.count == 0:
        print("No expenses recorded for this month.")
        return 0

    print(
        f"Total: {format_money(summary.total_cents, currency)} | "
        f"Expenses: {summary.count} | "
        f"Average: {format_money(summary.average_cents, currency)}"
    )
    print()

    rows = [
        (
            item.category,
            format_money(item.total_cents, currency),
            f"{(item.total_cents / summary.total_cents) * 100:.1f}%",
            str(item.count),
        )
        for item in summary.by_category
    ]
    print(
        render_table(
            ("Category", "Amount", "Share", "Expenses"),
            rows,
            aligns=("left", "right", "right", "right"),
        )
    )
    return 0


def _cmd_months(
    args: argparse.Namespace, tracker: ExpenseTracker, currency: str
) -> int:
    if args.limit < 0:
        raise ValidationError("Limit cannot be negative.")
    limit = None if args.limit == 0 else args.limit
    totals = tracker.monthly_totals(limit)
    if not totals:
        print("No expenses recorded yet.")
        return 0

    rows = [
        (
            format_month_label(total.month),
            str(total.count),
            format_money(total.total_cents, currency),
        )
        for total in totals
    ]
    print(
        render_table(
            ("Month", "Expenses", "Total"),
            rows,
            aligns=("left", "right", "right"),
        )
    )
    return 0


def _cmd_delete(
    args: argparse.Namespace, tracker: ExpenseTracker, currency: str
) -> int:
    tracker.delete_expense(args.id)
    print(f"Deleted expense #{args.id}.")
    return 0


def _cmd_categories(
    args: argparse.Namespace, tracker: ExpenseTracker, currency: str
) -> int:
    categories = tracker.list_categories()
    if not categories:
        print("No categories found.")
        return 0

    rows = [
        (
            str(category.id),
            category.name,
            str(category.expense_count),
            format_money(category.total_cents, currency),
        )
        for category in categories
    ]
    print(
        render_table(
            ("ID", "Category", "Expenses", "Total"),
            rows,
            aligns=("right", "left", "right", "right"),
        )
    )
    return 0


def _cmd_add_category(
    args: argparse.Namespace, tracker: ExpenseTracker, currency: str
) -> int:
    category = tracker.add_category(args.name)
    print(f'Added category "{category.name}" (ID {category.id}).')
    return 0


def _cmd_remove_category(
    args: argparse.Namespace, tracker: ExpenseTracker, currency: str
) -> int:
    name = tracker.remove_category(args.name)
    print(f'Removed category "{name}".')
    return 0


def _cmd_export(
    args: argparse.Namespace, tracker: ExpenseTracker, currency: str
) -> int:
    count, destination = tracker.export_csv(args.path, args.month)
    print(
        f"Exported {count} expense{'s' if count != 1 else ''} "
        f"to {destination}."
    )
    return 0


def _configure_output() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (OSError, ValueError):
                pass


def main(argv: Sequence[str] | None = None) -> int:
    _configure_output()
    parser = build_parser()
    arguments = list(sys.argv[1:] if argv is None else argv)
    if not arguments:
        parser.print_help()
        return 0

    args = parser.parse_args(arguments)
    try:
        tracker = ExpenseTracker(args.db)
        return args.func(args, tracker, args.currency)
    except ExpenseTrackerError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except sqlite3.Error as exc:
        print(f"Database error: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"File error: {exc}", file=sys.stderr)
        return 1
