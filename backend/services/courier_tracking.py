"""
Where is the shipment right now?

Live mode (``TRANSPORT_MODE=live`` with Shiprocket credentials) asks the
courier API and stores whatever position it returns. Webhook deliveries write
into the same fields, so the freshest of the two wins.

When no live courier is attached — the usual case for an intra-city medical
courier that has no consumer tracking feed, and always the case in mock mode —
we advance the marker along the *real* road polyline returned by the routing
service, using elapsed time against the routed ETA. That is a projection, not
a GPS fix, and every response says so via ``location_source`` so the UI can
label it honestly rather than passing it off as telemetry.
"""

import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from models.transfer import Transfer
from services.routing import point_at_fraction

# How stale a courier-reported fix may be before we stop calling it live.
LIVE_FIX_MAX_AGE_SECONDS = 180


def _progress_fraction(transfer: Transfer, now: datetime.datetime) -> float:
    """How far along the route the shipment should be, by elapsed time."""
    if not transfer.dispatched_at:
        return 0.0
    eta_minutes = transfer.eta_minutes or 20.0
    if eta_minutes <= 0:
        return 1.0
    elapsed_minutes = (now - transfer.dispatched_at).total_seconds() / 60.0
    return max(0.0, min(1.0, elapsed_minutes / eta_minutes))


def projected_position(transfer: Transfer, now: Optional[datetime.datetime] = None) -> Dict[str, Any]:
    """Position projected onto the routed polyline from elapsed transit time."""
    now = now or datetime.datetime.utcnow()
    geometry = transfer.route_geometry
    if not geometry:
        return {}
    fraction = _progress_fraction(transfer, now)
    point = point_at_fraction(geometry, fraction)
    if not point:
        return {}
    point["progress"] = round(fraction, 4)
    return point


def remaining_minutes(transfer: Transfer, now: Optional[datetime.datetime] = None) -> Optional[float]:
    now = now or datetime.datetime.utcnow()
    if transfer.status == "TRANSFER_COMPLETED":
        return 0.0
    if not transfer.dispatched_at or transfer.eta_minutes is None:
        return transfer.eta_minutes
    elapsed = (now - transfer.dispatched_at).total_seconds() / 60.0
    return round(max(0.0, transfer.eta_minutes - elapsed), 1)


def resolve_location(
    transfer: Transfer,
    origin: Optional[Dict[str, float]] = None,
    destination: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Current location plus the rule that produced it.

    ``location_source`` is one of:
      ``courier_live``       — a courier fix newer than LIVE_FIX_MAX_AGE_SECONDS
      ``courier_last_known`` — a courier fix, but a stale one
      ``route_projection``   — interpolated along the routed polyline
      ``origin`` / ``destination`` — parked at an endpoint, pre-pickup or post-delivery
      ``unavailable``        — no route and no fix to work from
    """
    now = datetime.datetime.utcnow()

    if transfer.status == "TRANSFER_COMPLETED":
        return {
            "lat": (destination or {}).get("lat"),
            "lng": (destination or {}).get("lng"),
            "location_source": "destination",
            "progress": 1.0,
            "fix_age_seconds": None,
        }

    if transfer.status not in ("IN_TRANSIT", "ARRIVED", "DELIVERY_OTP_REQUIRED"):
        return {
            "lat": (origin or {}).get("lat"),
            "lng": (origin or {}).get("lng"),
            "location_source": "origin",
            "progress": 0.0,
            "fix_age_seconds": None,
        }

    # A courier-reported fix always beats a projection.
    if (
        transfer.last_location_source == "shiprocket"
        and transfer.last_lat is not None
        and transfer.last_lng is not None
        and transfer.last_location_at is not None
    ):
        age = (now - transfer.last_location_at).total_seconds()
        return {
            "lat": transfer.last_lat,
            "lng": transfer.last_lng,
            "location_source": "courier_live" if age <= LIVE_FIX_MAX_AGE_SECONDS else "courier_last_known",
            "progress": round(_progress_fraction(transfer, now), 4),
            "fix_age_seconds": round(age),
        }

    point = projected_position(transfer, now)
    if not point:
        return {"lat": None, "lng": None, "location_source": "unavailable", "progress": None, "fix_age_seconds": None}

    return {
        "lat": point["lat"],
        "lng": point["lng"],
        "location_source": "route_projection",
        "progress": point["progress"],
        "fix_age_seconds": 0,
    }


def record_courier_fix(
    db: Session,
    transfer: Transfer,
    lat: float,
    lng: float,
    source: str = "shiprocket",
    occurred_at: Optional[datetime.datetime] = None,
) -> None:
    """Persist a position reported by the courier API or a webhook."""
    transfer.last_lat = lat
    transfer.last_lng = lng
    transfer.last_location_at = occurred_at or datetime.datetime.utcnow()
    transfer.last_location_source = source
    transfer.touch()
    db.commit()
