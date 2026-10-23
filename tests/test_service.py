from __future__ import annotations

import csv
import unittest
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

from expense_tracker import (
    CategoryInUseError,
    ConflictError,
    ExpenseTracker,
    NotFoundError,
    ValidationError,
)
from expense_tracker.service import normalize_month, parse_amount, parse_date


class ExpenseTrackerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "expenses.db"
        self.tracker = ExpenseTracker(self.db_path)

    def test_default_categories_are_seeded_once(self) -> None:
        names = {category.name for category in self.tracker.list_categories()}
        self.assertIn("Food & Dining", names)
        self.assertIn("Transport", names)
        self.assertEqual(len(names), 11)

        self.tracker.remove_category("Travel")
        reopened = ExpenseTracker(self.db_path)
        names = {category.name for category in reopened.list_categories()}
        self.assertNotIn("Travel", names)

    def test_add_expense_rounds_amount_and_creates_category(self) -> None:
        expense = self.tracker.add_expense(
            "12.345",
            "Coffee",
            "2026-10-05",
            "  Morning\ncoffee  ",
        )

        self.assertEqual(expense.amount_cents, 1235)
        self.assertEqual(str(expense.amount), "12.35")
        self.assertEqual(expense.category, "Coffee")
        self.assertEqual(expense.spent_on, date(2026, 10, 5))
        self.assertEqual(expense.note, "Morning coffee")
        self.assertIn(
            "Coffee", {category.name for category in self.tracker.list_categories()}
        )

    def test_add_expense_rejects_invalid_input(self) -> None:
        for amount in ("", "0", "-5", "abc", "NaN", "Infinity"):
            with self.subTest(amount=amount):
                with self.assertRaises(ValidationError):
                    self.tracker.add_expense(amount, "Food")

        with self.assertRaises(ValidationError):
            self.tracker.add_expense("10", "   ")
        with self.assertRaises(ValidationError):
            self.tracker.add_expense("10", "Food", "05-10-2026")
        with self.assertRaises(ValidationError):
            self.tracker.add_expense("10", "Food", note="x" * 501)

    def test_list_filters_orders_and_limits(self) -> None:
        first = self.tracker.add_expense("10", "Food", "2026-10-01")
        second = self.tracker.add_expense("20", "Travel", "2026-10-20")
        third = self.tracker.add_expense("30", "Food", "2026-10-10")
        self.tracker.add_expense("40", "Transport", "2026-11-02")

        october = self.tracker.list_expenses(month="2026-10")
        self.assertEqual([item.id for item in october], [second.id, third.id, first.id])

        food = self.tracker.list_expenses(category="food")
        self.assertEqual([item.id for item in food], [third.id, first.id])

        limited = self.tracker.list_expenses(month="2026-10", limit=1)
        self.assertEqual([item.id for item in limited], [second.id])

        with self.assertRaises(ValidationError):
            self.tracker.list_expenses(limit=0)

    def test_month_summary_and_category_breakdown(self) -> None:
        self.tracker.add_expense("100.10", "Food", "2026-10-01")
        self.tracker.add_expense("50.00", "Food", "2026-10-15")
        self.tracker.add_expense("25.00", "Transport", "2026-10-31")
        self.tracker.add_expense("99.99", "Travel", "2026-11-01")

        summary = self.tracker.month_summary("2026-10")

        self.assertEqual(summary.month, "2026-10")
        self.assertEqual(summary.total_cents, 17510)
        self.assertEqual(summary.count, 3)
        self.assertEqual(summary.average_cents, 5837)
        self.assertEqual(len(summary.by_category), 2)
        self.assertEqual(summary.by_category[0].category, "Food")
        self.assertEqual(summary.by_category[0].total_cents, 15010)
        self.assertEqual(summary.by_category[0].count, 2)
        self.assertEqual(summary.by_category[1].category, "Transport")
        self.assertEqual(summary.by_category[1].total_cents, 2500)

    def test_empty_month_summary(self) -> None:
        summary = self.tracker.month_summary("2020-01")
        self.assertEqual(summary.total_cents, 0)
        self.assertEqual(summary.count, 0)
        self.assertEqual(summary.average_cents, 0)
        self.assertEqual(summary.by_category, ())

    def test_monthly_totals_are_newest_first(self) -> None:
        self.tracker.add_expense("10", "Food", "2026-09-30")
        self.tracker.add_expense("20", "Food", "2026-10-01")
        self.tracker.add_expense("30", "Food", "2026-10-02")

        totals = self.tracker.monthly_totals()

        self.assertEqual([item.month for item in totals], ["2026-10", "2026-09"])
        self.assertEqual(totals[0].total_cents, 5000)
        self.assertEqual(totals[0].count, 2)
        self.assertEqual(totals[1].total_cents, 1000)

        self.assertEqual(len(self.tracker.monthly_totals(limit=1)), 1)

    def test_delete_expense_and_persistence(self) -> None:
        expense = self.tracker.add_expense("9.99", "Food", "2026-10-01")

        reopened = ExpenseTracker(self.db_path)
        self.assertEqual(reopened.get_expense(expense.id).amount_cents, 999)

        reopened.delete_expense(expense.id)
        with self.assertRaises(NotFoundError):
            reopened.get_expense(expense.id)
        with self.assertRaises(NotFoundError):
            reopened.delete_expense(expense.id)

    def test_category_add_duplicate_and_remove_rules(self) -> None:
        category = self.tracker.add_category("Pets")
        self.assertEqual(category.name, "Pets")

        with self.assertRaises(ConflictError):
            self.tracker.add_category("pets")

        self.tracker.add_expense("20", "Pets", "2026-10-01")
        with self.assertRaises(CategoryInUseError):
            self.tracker.remove_category("PETS")

        self.tracker.add_category("Unused")
        self.assertEqual(self.tracker.remove_category("unused"), "Unused")
        with self.assertRaises(NotFoundError):
            self.tracker.remove_category("Unused")

    def test_export_csv_for_one_month(self) -> None:
        self.tracker.add_expense("12.5", "Food", "2026-10-01", "Lunch")
        self.tracker.add_expense("7", "Travel", "2026-10-02", "Bus")
        self.tracker.add_expense("99", "Food", "2026-11-01", "Party")

        destination = Path(self.temp_dir.name) / "exports" / "october.csv"
        count, written = self.tracker.export_csv(destination, "2026-10")

        self.assertEqual(count, 2)
        self.assertEqual(written, destination)
        with destination.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.reader(handle))

        self.assertEqual(rows[0], ["id", "date", "category", "amount", "note"])
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1][1:], ["2026-10-02", "Travel", "7.00", "Bus"])

    def test_parsing_helpers(self) -> None:
        self.assertEqual(parse_amount("0.01"), 1)
        self.assertEqual(parse_amount("1.999"), 200)
        self.assertEqual(parse_date("2026-02-28"), date(2026, 2, 28))
        self.assertEqual(normalize_month("2026-02"), "2026-02")

        for month in ("2026-13", "2026/10", "October"):
            with self.subTest(month=month):
                with self.assertRaises(ValidationError):
                    normalize_month(month)


if __name__ == "__main__":
    unittest.main()
