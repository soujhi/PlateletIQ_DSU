import datetime
from typing import Optional


def compute_staleness_hours(source_entry_date: Optional[datetime.datetime], reference_time: Optional[datetime.datetime] = None) -> float:
    if not source_entry_date:
        return 170.6  # PRD average default staleness if missing
    if reference_time is None:
        reference_time = datetime.datetime.utcnow()
    
    delta = (reference_time - source_entry_date).total_seconds()
    return max(0.0, round(delta / 3600.0, 1))


def get_freshness_state(staleness_hours: float) -> str:
    if staleness_hours <= 24.0:
        return "CURRENT"
    elif staleness_hours <= 72.0:
        return "AGING"
    elif staleness_hours <= 168.0:
        return "STALE"
    else:
        return "VERY_STALE"
