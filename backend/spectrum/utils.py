"""
Shared helpers for Spectrum parsing and import.
Keep all parsing logic here so services/views/commands are consistent.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional, Any
import logging

logger = logging.getLogger(__name__)


def safe_strip(value: Any) -> Any:
    """Safely strip a value, returning None if value is None or empty string."""
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip()
        return v if v else None
    return value


def truncate_field(value: Optional[str], max_len: int) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    value = value.strip()
    if not value:
        return None
    return value[:max_len]


def parse_date_robust(date_value: Any) -> Optional[date]:
    """
    Robust date parser that handles Spectrum's inconsistent formats.
    Accepts: date/datetime objects, common string formats, and returns date or None.
    """
    if not date_value:
        return None

    if isinstance(date_value, date) and not isinstance(date_value, datetime):
        return date_value
    if isinstance(date_value, datetime):
        return date_value.date()

    if not isinstance(date_value, str):
        try:
            date_value = str(date_value)
        except Exception:
            return None

    s = date_value.strip()
    if not s or s.lower() == "null":
        return None

    # Try a small set of common formats first (fast path)
    fmts = ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y")
    for fmt in fmts:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue

    # Try ISO-ish datetime (e.g. 2026-01-15T21:51:41)
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except Exception:
        return None


def parse_decimal(value: Any) -> Optional[Decimal]:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return None
