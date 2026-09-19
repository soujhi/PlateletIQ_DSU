"""
Facility registry endpoints.

The facility picker, the transfer counterparty dropdowns, and the network map
all read from here, so no screen carries a hard-coded hospital list.
"""

import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models.bank import Bank
from models.inventory import InventoryUnit
from services.routing import haversine_km

router = APIRouter(tags=["facilities"])


def _stock_snapshot(db: Session, bank_id: str) -> Dict[str, Any]:
    """Usable / reserved counts per component for one facility."""
    now = datetime.datetime.utcnow()
    rows = db.query(InventoryUnit).filter(InventoryUnit.bank_id == bank_id).all()

    snapshot = {
        "SDP": {"available": 0, "reserved": 0, "expiring_24h": 0},
        "RDP": {"available": 0, "reserved": 0, "expiring_24h": 0},
    }
    for unit in rows:
        bucket = snapshot.setdefault(
            unit.component_type, {"available": 0, "reserved": 0, "expiring_24h": 0}
        )
        if unit.status == "AVAILABLE" and unit.expiry_at > now:
            bucket["available"] += 1
            if unit.expiry_at <= now + datetime.timedelta(hours=24):
                bucket["expiring_24h"] += 1
        elif unit.status == "RESERVED":
            bucket["reserved"] += 1

    return snapshot


@router.get("/facilities")
def list_facilities(
    include_stock: bool = Query(True, description="Attach each facility's live platelet counts."),
    near: Optional[str] = Query(None, description="Facility id to sort by road-distance proximity."),
    db: Session = Depends(get_db),
):
    """
    Every registered facility, with coordinates and (optionally) live stock.

    This endpoint is deliberately unauthenticated: the facility picker is shown
    before a session is bound to a facility. It exposes only registry data —
    public eRaktKosh identifiers, addresses, and aggregate counts — never units,
    patients, or transfer contents.
    """
    banks = db.query(Bank).filter(Bank.active.is_(True)).order_by(Bank.name.asc()).all()

    origin = None
    if near:
        origin = db.query(Bank).filter(Bank.id == near).first()

    payload: List[Dict[str, Any]] = []
    for bank in banks:
        entry = bank.as_dict()
        if include_stock:
            entry["stock"] = _stock_snapshot(db, bank.id)
        if origin and origin.id != bank.id and None not in (
            origin.latitude, origin.longitude, bank.latitude, bank.longitude
        ):
            entry["straight_line_km"] = haversine_km(
                origin.latitude, origin.longitude, bank.latitude, bank.longitude
            )
        payload.append(entry)

    if origin:
        payload.sort(key=lambda f: f.get("straight_line_km", float("inf")))

    return {"data": payload, "meta": {"count": len(payload), "city": "Chennai"}, "error": None}


@router.get("/facilities/{facility_id}")
def get_facility(facility_id: str, db: Session = Depends(get_db)):
    bank = db.query(Bank).filter(Bank.id == facility_id).first()
    if not bank:
        raise HTTPException(status_code=404, detail=f"Facility {facility_id} is not in the registry.")
    entry = bank.as_dict()
    entry["stock"] = _stock_snapshot(db, bank.id)
    return {"data": entry, "error": None}


@router.get("/facilities/{facility_id}/counterparties")
def list_counterparties(
    facility_id: str,
    component_type: str = Query("SDP"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Who this facility could transfer with, nearest first.

    Each row carries the counterparty's usable stock of ``component_type`` and
    how many of those units expire within 24 hours, which is what makes one a
    sensible target for a shortage pull versus a wastage push.
    """
    origin = db.query(Bank).filter(Bank.id == facility_id).first()
    if not origin:
        raise HTTPException(status_code=404, detail=f"Facility {facility_id} is not in the registry.")

    rows = []
    for bank in db.query(Bank).filter(Bank.active.is_(True), Bank.id != facility_id).all():
        stock = _stock_snapshot(db, bank.id).get(component_type, {})
        distance = None
        if None not in (origin.latitude, origin.longitude, bank.latitude, bank.longitude):
            distance = haversine_km(origin.latitude, origin.longitude, bank.latitude, bank.longitude)
        entry = bank.as_dict()
        entry.update(
            {
                "straight_line_km": distance,
                "available_units": stock.get("available", 0),
                "expiring_24h": stock.get("expiring_24h", 0),
                "component_type": component_type,
            }
        )
        rows.append(entry)

    rows.sort(key=lambda r: (r["straight_line_km"] is None, r["straight_line_km"]))
    return {"data": rows, "meta": {"origin": origin.as_dict(), "count": len(rows)}, "error": None}
