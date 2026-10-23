"""Terminal formatting helpers."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Sequence

CURRENCY_SYMBOLS = {
    "INR": "₹",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "JPY": "¥",
    "CNY": "¥",
    "AUD": "A$",
    "CAD": "C$",
    "SGD": "S$",
}


def format_money(cents: int, currency: str = "INR") -> str:
    code = (currency or "INR").strip().upper() or "INR"
    body = f"{Decimal(abs(cents)) / Decimal(100):,.2f}"
    sign = "-" if cents < 0 else ""
    symbol = CURRENCY_SYMBOLS.get(code)
    if symbol is None:
        return f"{sign}{body} {code}"
    return f"{sign}{symbol}{body}"


def format_month_label(month: str) -> str:
    return datetime.strptime(month, "%Y-%m").strftime("%B %Y")


def shorten(value: str, width: int) -> str:
    if len(value) <= width:
        return value
    if width <= 3:
        return value[:width]
    return value[: width - 3] + "..."


def render_table(
    headers: Sequence[str],
    rows: Sequence[Sequence[str]],
    aligns: Sequence[str] | None = None,
) -> str:
    if not rows:
        return ""

    column_count = len(headers)
    if aligns is None:
        aligns = ["left"] * column_count
    if len(aligns) != column_count:
        raise ValueError("aligns must match the number of headers")

    widths = [len(header) for header in headers]
    for row in rows:
        if len(row) != column_count:
            raise ValueError("every row must match the number of headers")
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(cell))

    def line(cells: Sequence[str]) -> str:
        padded = []
        for index, cell in enumerate(cells):
            if aligns[index] == "right":
                padded.append(cell.rjust(widths[index]))
            else:
                padded.append(cell.ljust(widths[index]))
        return "  ".join(padded).rstrip()

    separator = "  ".join("-" * width for width in widths)
    output = [line(list(headers)), separator]
    output.extend(line([str(cell) for cell in row]) for row in rows)
    return "\n".join(output)
