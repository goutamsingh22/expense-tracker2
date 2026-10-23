"""Application-specific exceptions."""

from __future__ import annotations


class ExpenseTrackerError(Exception):
    """Base class for errors that should be shown to the user."""


class ValidationError(ExpenseTrackerError):
    """Raised when user input is not valid."""


class NotFoundError(ExpenseTrackerError):
    """Raised when a requested record does not exist."""


class ConflictError(ExpenseTrackerError):
    """Raised when a record already exists or cannot be changed."""


class CategoryInUseError(ConflictError):
    def __init__(self, name: str, expense_count: int) -> None:
        super().__init__(
            f'Category "{name}" is used by {expense_count} '
            f'expense{"s" if expense_count != 1 else ""}. '
            "Delete or move those expenses first."
        )
        self.name = name
        self.expense_count = expense_count
