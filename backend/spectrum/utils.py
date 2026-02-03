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

EXCLUDED_DIVISIONS = {"145", "115"}
ALLOWED_STATUS_CODES = {"A", "I"}
ALLOWED_PHASE_COST_TYPES = {"S", "L"}


def filter_divisions(divisions: Optional[list[str]]) -> list[str]:
    if not divisions:
        return []
    seen: set[str] = set()
    filtered: list[str] = []
    for div in divisions:
        if not div:
            continue
        text = str(div).strip()
        if not text or text in EXCLUDED_DIVISIONS:
            continue
        if text in seen:
            continue
        seen.add(text)
        filtered.append(text)
    return filtered


def normalize_statuses(status_code: Optional[str] = None, statuses: Optional[list[str]] = None) -> list[str]:
    if statuses is not None:
        allowed = [str(s).strip().upper() for s in statuses if str(s).strip().upper() in ALLOWED_STATUS_CODES]
        return allowed
    if status_code is None:
        return ["A", "I"]
    text = str(status_code).strip().upper()
    if text in ("", "ALL"):
        return ["A", "I"]
    if text in ALLOWED_STATUS_CODES:
        return [text]
    return []


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
    fmts = (
        "%m/%d/%Y",
        "%m/%d/%y",
        "%Y-%m-%d",
        "%m-%d-%Y",
        "%m-%d-%y",
        "%Y/%m/%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%y %H:%M:%S",
        "%m-%d-%Y %H:%M:%S",
        "%m-%d-%y %H:%M:%S",
    )
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
        text = str(value).strip()
        if not text or text.lower() in {"none", "null"}:
            return None
        # Normalize common numeric formatting (e.g., "81,928.00", "(1,234.56)")
        negative = False
        if text.startswith("(") and text.endswith(")"):
            negative = True
            text = text[1:-1].strip()
        text = text.replace(",", "")
        dec = Decimal(text)
        return -dec if negative else dec
    except (InvalidOperation, ValueError):
        return None


def parse_decimal_or_zero(value: Any) -> Decimal:
    """
    Parse a decimal, returning Decimal("0") for blank/invalid values.
    Useful for quantity fields when UOM is missing.
    """
    parsed = parse_decimal(value)
    return parsed if parsed is not None else Decimal("0")


ZERO_STRINGS = {"", ".00", "0.00", "0"}


def parse_quantity(value: Any, unit_of_measure: Optional[str]) -> Optional[Decimal]:
    """
    Parse quantity fields with UOM-aware rules.
    - Treat blank/zero-ish values as missing.
    - If UOM is blank or HRS/HR, quantities are not meaningful -> return None.
    - Otherwise, return the parsed decimal.
    """
    raw = "" if value is None else str(value).strip()
    if raw in ZERO_STRINGS:
        uom = (unit_of_measure or "").strip().upper()
        if not uom or uom in {"HRS", "HR"}:
            return None
        return None
    return parse_decimal(raw)
