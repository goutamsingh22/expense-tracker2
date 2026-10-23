"""Personal expense tracker backed by SQLite."""

from .errors import (
    CategoryInUseError,
    ConflictError,
    ExpenseTrackerError,
    NotFoundError,
    ValidationError,
)
from .models import Category, CategoryTotal, Expense, MonthlyTotal, MonthSummary
from .service import ExpenseTracker

__version__ = "1.0.0"

__all__ = [
    "Category",
    "CategoryInUseError",
    "CategoryTotal",
    "ConflictError",
    "Expense",
    "ExpenseTracker",
    "ExpenseTrackerError",
    "MonthSummary",
    "MonthlyTotal",
    "NotFoundError",
    "ValidationError",
]
