import os
from typing import Any, Dict
from sqlalchemy.orm import Session
from models.config import SystemConfig

DEFAULT_CONFIG: Dict[str, Dict[str, Any]] = {
    "AT_RISK_H": {"value": "48", "unit": "hours", "description": "At-risk pool entry window"},
    "MIN_RESIDUAL_MIN": {"value": "360", "unit": "minutes", "description": "Minimum usable life on arrival"},
    "HANDLING_MIN": {"value": "20", "unit": "minutes", "description": "Pack-out and receive overhead"},
    "URGENCY_TAU": {"value": "12", "unit": "hours", "description": "Urgency decay constant"},
    "ABO_SUBSTITUTE_PENALTY": {"value": "0.85", "unit": "ratio", "description": "Preference for exact blood group"},
    "COMPONENT_SUB_PENALTY": {"value": "0.80", "unit": "ratio", "description": "RDP/SDP substitution penalty"},
    "SDP_RDP_RATIO": {"value": "5", "unit": "units", "description": "Therapeutic equivalence ratio"},
    "TRANSPORT_WEIGHT": {"value": "0.15", "unit": "ratio", "description": "Distance penalty factor"},
    "MAX_ROUTE_MIN": {"value": "120", "unit": "minutes", "description": "Route normalization ceiling"},
    "MAX_HOPS": {"value": "2", "unit": "count", "description": "Maximum transfers per unit"},
    "HOLD_MINUTES": {"value": "10", "unit": "minutes", "description": "Reservation hold window"},
    "TEMP_MIN_C": {"value": "20", "unit": "°C", "description": "Minimum transport temperature"},
    "TEMP_MAX_C": {"value": "24", "unit": "°C", "description": "Maximum transport temperature"},
    "MAX_AGITATION_OFF_MIN": {"value": "1440", "unit": "minutes", "description": "Regulatory transport window without agitation"},
    "CREDIT_TTL_DAYS": {"value": "90", "unit": "days", "description": "Credit balance expiry"},
    "UNIT_COST_INR": {"value": "3000", "unit": "₹", "description": "Wastage unit valuation"},
    "TRANSPORT_PROVIDER": {"value": "porter", "unit": "enum", "description": "Active provider: porter | internal | beckn"},
    "DEMO_MODE": {"value": "true", "unit": "bool", "description": "Enables simulation clock"},
}


def get_config(db: Session, key: str) -> str:
    """Retrieve runtime config string from database or environment fallback."""
    cfg = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if cfg:
        return cfg.value
    env_val = os.getenv(key)
    if env_val is not None:
        return env_val
    if key in DEFAULT_CONFIG:
        return DEFAULT_CONFIG[key]["value"]
    return ""


def get_config_int(db: Session, key: str, default: int = 0) -> int:
    try:
        return int(get_config(db, key))
    except (ValueError, TypeError):
        return default


def get_config_float(db: Session, key: str, default: float = 0.0) -> float:
    try:
        return float(get_config(db, key))
    except (ValueError, TypeError):
        return default


def get_config_bool(db: Session, key: str, default: bool = False) -> bool:
    val = get_config(db, key).lower()
    return val in ("true", "1", "yes", "on")


def init_default_config(db: Session) -> None:
    """Seed system_config table with default settings if missing."""
    for key, data in DEFAULT_CONFIG.items():
        existing = db.query(SystemConfig).filter(SystemConfig.key == key).first()
        if not existing:
            cfg = SystemConfig(
                key=key,
                value=data["value"],
                unit=data["unit"],
                description=data["description"],
                updated_by="system",
            )
            db.add(cfg)
    db.commit()
