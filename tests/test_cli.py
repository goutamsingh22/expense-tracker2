from __future__ import annotations

import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory

from expense_tracker.cli import main


class CliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "tracker.db"

    def run_cli(self, *args: str, currency: str = "INR") -> tuple[int, str, str]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = main(
                ["--db", str(self.db_path), "--currency", currency, *args]
            )
        return code, stdout.getvalue(), stderr.getvalue()

    def test_add_list_and_summary(self) -> None:
        code, output, _ = self.run_cli(
            "add",
            "250.75",
            "-c",
            "Food",
            "-d",
            "2026-10-05",
            "-n",
            "Dinner",
        )
        self.assertEqual(code, 0)
        self.assertIn("Added expense #1", output)
        self.assertIn("₹250.75", output)
        self.assertIn("Dinner", output)

        code, output, _ = self.run_cli(
            "add", "49.25", "-c", "Transport", "-d", "2026-10-06"
        )
        self.assertEqual(code, 0)

        code, output, _ = self.run_cli("list", "-m", "2026-10")
        self.assertEqual(code, 0)
        self.assertIn("Transport", output)
        self.assertIn("₹300.00", output)

        code, output, _ = self.run_cli("summary", "-m", "2026-10")
        self.assertEqual(code, 0)
        self.assertIn("October 2026 summary", output)
        self.assertIn("Total: ₹300.00", output)
        self.assertIn("Food", output)
        self.assertIn("83.6%", output)

    def test_categories_months_delete_and_export(self) -> None:
        self.run_cli("add-category", "Pets")
        self.run_cli("add", "20", "-c", "Pets", "-d", "2026-09-01")
        self.run_cli("add", "30", "-c", "Food", "-d", "2026-10-01")

        code, output, _ = self.run_cli("categories")
        self.assertEqual(code, 0)
        self.assertIn("Pets", output)
        self.assertIn("₹20.00", output)

        code, output, _ = self.run_cli("months")
        self.assertEqual(code, 0)
        self.assertLess(output.index("October 2026"), output.index("September 2026"))

        export_path = Path(self.temp_dir.name) / "report.csv"
        code, output, _ = self.run_cli(
            "export", str(export_path), "-m", "2026-09"
        )
        self.assertEqual(code, 0)
        self.assertTrue(export_path.exists())
        self.assertIn("Exported 1 expense", output)

        code, output, _ = self.run_cli("delete", "1")
        self.assertEqual(code, 0)
        self.assertIn("Deleted expense #1", output)

        code, _, _ = self.run_cli("delete", "1")
        self.assertEqual(code, 1)

    def test_currency_and_validation_errors(self) -> None:
        code, output, _ = self.run_cli(
            "add", "10", "-c", "Food", currency="USD"
        )
        self.assertEqual(code, 0)
        self.assertIn("$10.00", output)

        code, _, stderr = self.run_cli("add", "nope", "-c", "Food")
        self.assertEqual(code, 1)
        self.assertIn("Error:", stderr)

        code, _, stderr = self.run_cli("remove-category", "Food")
        self.assertEqual(code, 1)
        self.assertIn("used by 1 expense", stderr)

    def test_no_arguments_prints_help(self) -> None:
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            code = main([])
        self.assertEqual(code, 0)
        self.assertIn("Record expenses", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
