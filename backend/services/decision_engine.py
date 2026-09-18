import math
import datetime
from typing import List, Dict, Any, Tuple, Optional


def evaluate_decision(
    forecast_days: List[Dict[str, Any]],  # list of {date, q50, q67, q90}
    current_inventory_units: List[Dict[str, Any]],  # list of {expiry_at, status}
    safety_stock_alpha: float = 13.0,
    lead_time_days: int = 2,
) -> Dict[str, Any]:
    """
    Deterministically computes HOLD / PROCURE / COLLECT decision based on forecast and inventory.
    """
    total_q50 = sum(f["q50"] for f in forecast_days)
    total_q67 = sum(f["q67"] for f in forecast_days)

    now = datetime.datetime.utcnow()
    available_units = [
        u for u in current_inventory_units
        if u.get("status") == "AVAILABLE" and u.get("expiry_at") and u["expiry_at"] > now
    ]
    usable_now = len(available_units)

    # Compute expected surplus or gap
    daily_avg_demand = total_q50 / max(1, len(forecast_days))
    safety_stock = math.ceil((total_q67 / max(1, len(forecast_days))) * (safety_stock_alpha / 7.0))
    net_position = usable_now - total_q50

    if net_position >= 0:
        action = "HOLD"
        quantity = 0
        status_label = "HEALTHY"
        reason = "Current inventory covers expected near-term demand. No immediate collection required."
    elif usable_now >= daily_avg_demand * lead_time_days:
        action = "PROCURE"
        quantity = math.ceil(abs(net_position) + safety_stock)
        status_label = "WATCH"
        reason = f"Procurement recommended to cover projected demand gap of {abs(int(net_position))} units over 7 days."
    else:
        action = "COLLECT"
        quantity = math.ceil(abs(net_position) + safety_stock)
        status_label = "CRITICAL"
        reason = f"Immediate collection required! Inventory deficit of {abs(int(net_position))} units expected within lead time window."

    # Top drivers (max 4, human readable)
    drivers = [
        f"7-day projected demand: {round(total_q50, 1)} units (q50 point estimate)",
        f"Usable available inventory: {usable_now} units",
        f"Safety stock buffer target: {safety_stock} units (alpha={safety_stock_alpha})",
        f"Net position: {'+' if net_position >= 0 else ''}{round(net_position, 1)} units over 7 days",
    ]

    return {
        "action": action,
        "quantity": quantity,
        "status": status_label,
        "reason_summary": reason,
        "drivers": drivers,
        "projected_gap": f"{'+' if net_position >= 0 else ''}{round(net_position, 1)} units",
        "horizon": "7 days",
        "inventory_surplus": f"{'+' if net_position >= 0 else ''}{round(net_position, 1)} above safety",
    }


def check_concordance(platelet_count: float, bleeding_status: bool) -> Tuple[bool, str]:
    """
    WHO guidelines concordance check for requisitions.
    - count < 20: CONCORDANT (prophylactic)
    - count < 50 with bleeding: CONCORDANT (therapeutic)
    - otherwise: FLAGGED
    """
    if platelet_count < 20.0:
        return True, "Request falls within WHO prophylactic threshold (<20 × 10⁹/L)."
    elif platelet_count < 50.0 and bleeding_status:
        return True, "Request falls within WHO therapeutic threshold (<50 × 10⁹/L with active bleeding)."
    else:
        return False, "Request falls outside WHO prophylactic (<20) and therapeutic (<50 with bleeding) thresholds. Review recommended."


def check_fifo_issuance(selected_unit_expiry: datetime.datetime, all_available_expiries: List[datetime.datetime], override_reason: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Validates FIFO order. If older units exist, override_reason is mandatory.
    Returns (is_valid, warning_or_error_message).
    """
    older_units = [exp for exp in all_available_expiries if exp < selected_unit_expiry]
    if older_units:
        if not override_reason or not override_reason.strip():
            return False, "FIFO override requires a non-empty reason. Older units exist in inventory."
        return True, f"FIFO override warning: {len(older_units)} older unit(s) exist in inventory."
    return True, None
