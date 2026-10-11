"""Event dates (RF004 note 3): exact day, single month or month range — and the retention
deadline derived from them (RNF12)."""
from __future__ import annotations

import calendar
from datetime import date

from app.db.models import DatePrecision

MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
          "Setembro", "Outubro", "Novembro", "Dezembro"]


class EventDateError(ValueError):
    """Message safe to show to the user."""


def _last_day(d: date) -> date:
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def normalize(precision: DatePrecision, start: date, end: date | None = None) -> tuple[date, date]:
    """Store every precision as a [start, end] interval, so filters by date and period
    (RF013 note 5) work the same for all of them."""
    if precision == DatePrecision.DAY:
        return start, start
    if precision == DatePrecision.MONTH:
        return start.replace(day=1), _last_day(start)
    if end is None:
        raise EventDateError("Informe o mês final do intervalo.")
    first, last = start.replace(day=1), _last_day(end)
    if last < first:
        raise EventDateError("O mês final não pode ser anterior ao inicial.")
    months = (end.year - start.year) * 12 + end.month - start.month + 1
    if months > 12:
        raise EventDateError("O intervalo máximo é de 12 meses.")
    return first, last


def add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year, month = d.year + month_index // 12, month_index % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def expiry_date(date_end: date, retention_months: int) -> date:
    """Counted from the END of the event, so a month range is not cut short (RF004 note 9)."""
    return add_months(date_end, retention_months)


def label(precision: DatePrecision, start: date, end: date) -> str:
    """Shown with the precision it was registered with (RF013 note 3)."""
    if precision == DatePrecision.DAY:
        return start.strftime("%d/%m/%Y")
    if precision == DatePrecision.MONTH:
        return f"{MONTHS[start.month - 1]}/{start.year}"
    if start.year == end.year:
        return f"{MONTHS[start.month - 1]} a {MONTHS[end.month - 1]}/{end.year}"
    return f"{MONTHS[start.month - 1]}/{start.year} a {MONTHS[end.month - 1]}/{end.year}"
