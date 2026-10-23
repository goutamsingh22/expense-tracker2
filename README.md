<<<<<<< HEAD
# Expense Tracker

A dependency-free Python command-line expense tracker backed by SQLite. Record
daily spending, organize it by category, and see exactly where your money goes
each month.

## Features

- Record expenses with an amount, category, date, and optional note
- Automatic category creation when a new category name is used
- Category management with protection against deleting categories in use
- Filter expenses by month or category
- Monthly totals, averages, and category breakdowns
- Monthly history across all recorded months
- CSV export for a specific month or all expenses
- Exact money storage using integer cents
- Input validation and clear terminal error messages
- No third-party packages required

## Requirements

- Python 3.10 or newer (uses only the standard library)

## Quick start

Run these commands from this directory:

```powershell
# Record an expense (date defaults to today)
python main.py add 249.50 -c "Food & Dining" -n "Dinner"

# Record an expense for a specific date
python main.py add 1200 -c Housing -d 2026-10-01 -n "October rent"

# List this month's expenses
python main.py list -m 2026-10

# Totals and category breakdown for a month
python main.py summary -m 2026-10

# Totals for every month (most recent first)
python main.py months
```

The database is created automatically at `data/expenses.db` the first time the
app runs. The starter categories are added once and can be extended or removed.

## Commands

Global options must appear before the command:

| Option | Description |
| --- | --- |
| `--db PATH` | Use a different SQLite database file |
| `--currency CODE` | Display currency (default: `INR`, or `EXPENSE_TRACKER_CURRENCY`) |
| `--version` | Print the version |

| Command | Description |
| --- | --- |
| `add AMOUNT -c CATEGORY [-d YYYY-MM-DD] [-n NOTE]` | Record an expense |
| `list [-m YYYY-MM] [-c CATEGORY] [-l LIMIT]` | List expenses, newest first |
| `summary [-m YYYY-MM]` | Total, average, and category breakdown for a month |
| `months [-l LIMIT]` | Monthly totals across all months (`0` shows all) |
| `delete ID` | Delete an expense by ID |
| `categories` | List categories with expense counts and totals |
| `add-category NAME` | Create a category |
| `remove-category NAME` | Remove an unused category |
| `export PATH [-m YYYY-MM]` | Export expenses to CSV |

Without `-m`, `summary` uses the current month. Without `-d`, `add` uses today's
date. Amounts are rounded to two decimal places and stored as integer cents.

### Examples

```powershell
# Use a USD database for a side project
python main.py --db data\side-project.db --currency USD add 15.99 -c Subscriptions

# Show the last 25 expenses
python main.py list -l 25

# Category-only view
python main.py list -c Transport

# Export October 2026 to CSV
python main.py export reports\october-2026.csv -m 2026-10
```

## Project layout

```text
expense-tracker/
├── main.py                  # CLI entry point
├── expense_tracker/
│   ├── cli.py               # Argument parsing and terminal output
│   ├── db.py                # Schema, connection handling, starter categories
│   ├── errors.py            # User-facing exception types
│   ├── formatting.py        # Money and table formatting
│   ├── models.py            # Dataclasses for expenses and reports
│   └── service.py           # Validation and all database operations
├── tests/
│   ├── test_cli.py
│   └── test_service.py
└── data/expenses.db         # Created automatically
```

## Database

SQLite is configured with foreign keys enabled. Expenses reference a category
and store dates as ISO `YYYY-MM-DD` text, which makes month filtering and
sorting reliable. Amounts are stored as whole cents to avoid floating-point
rounding errors.

```sql
categories(id, name)
expenses(id, amount_cents, category_id, spent_on, note, created_at)
```

## Tests

Run the full test suite from this directory:

```powershell
python -m unittest discover -s tests -v
```

To use a temporary database manually, pass `--db`:

```powershell
python main.py --db data\demo.db add 42 -c "Food & Dining"
```

> Note: this directory also contains an earlier Node.js web prototype
> (`server.js`, `public/`, `package.json`). The Python application described
> above is independent and does not require Node.js.
=======
# expense-tracker2
>>>>>>> b8d26c147bf4a67a1412d3c23c5822ab130a2dc1
