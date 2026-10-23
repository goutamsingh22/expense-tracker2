"""Data objects returned by the expense tracker service."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")


def cents_to_decimal(cents: int) -> Decimal:
    """Convert an integer number of cents into a currency decimal."""
    return (Decimal(cents) / Decimal(100)).quantize(CENT)


@dataclass(frozen=True)
class Category:
    id: int
    name: str
    expense_count: int = 0
    total_cents: int = 0

    @property
    def total(self) -> Decimal:
        return cents_to_decimal(self.total_cents)


@dataclass(frozen=True)
class Expense:
    id: int
    amount_cents: int
    category_id: int
    category: str
    spent_on: date
    note: str
    created_at: str

    @property
    def amount(self) -> Decimal:
        return cents_to_decimal(self.amount_cents)


@dataclass(frozen=True)
class CategoryTotal:
    category: str
    total_cents: int
    count: int

    @property
    def total(self) -> Decimal:
        return cents_to_decimal(self.total_cents)


@dataclass(frozen=True)
class MonthlyTotal:
    month: str
    total_cents: int
    count: int

    @property
    def total(self) -> Decimal:
        return cents_to_decimal(self.total_cents)


@dataclass(frozen=True)
class MonthSummary:
    month: str
    total_cents: int
    count: int
    by_category: tuple[CategoryTotal, ...] = ()

    @property
    def total(self) -> Decimal:
        return cents_to_decimal(self.total_cents)

    @property
    def average_cents(self) -> int:
        if self.count == 0:
            return 0
        return int(
            (Decimal(self.total_cents) / Decimal(self.count)).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )
        )
