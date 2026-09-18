import uuid
import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from models import InventoryUnit, InventoryEvent, AuditLog
from services.decision_engine import check_fifo_issuance

router = APIRouter(prefix="/banks/{bank_id}/inventory", tags=["inventory"])


@router.get("/summary")
def get_inventory_summary(bank_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    now = datetime.datetime.utcnow()
    units = db.query(InventoryUnit).filter(InventoryUnit.bank_id == bank_id, InventoryUnit.status == "AVAILABLE").all()

    available = len(units)
    expiring_today = 0
    expiring_1d = 0
    expiring_2d = 0
    expiring_3d = 0

    for u in units:
        hours_left = (u.expiry_at - now).total_seconds() / 3600.0
        if hours_left <= 24:
            expiring_today += 1
        elif hours_left <= 48:
            expiring_1d += 1
        elif hours_left <= 72:
            expiring_2d += 1
        elif hours_left <= 96:
            expiring_3d += 1

    return {
        "data": {
            "available": available,
            "expiring_today": expiring_today,
            "expiring_1d": expiring_1d,
            "expiring_2d": expiring_2d,
            "expiring_3d": expiring_3d,
            "stale_external": 0,
            "last_sync": now.isoformat(),
        },
        "error": None,
    }


@router.get("/units")
def list_inventory_units(
    bank_id: str,
    status_filter: Optional[str] = Query(None, alias="status"),
    component_type: Optional[str] = None,
    blood_group: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(InventoryUnit).filter(InventoryUnit.bank_id == bank_id)
    if status_filter:
        query = query.filter(InventoryUnit.status == status_filter)
    if component_type:
        query = query.filter(InventoryUnit.component_type == component_type)
    if blood_group:
        query = query.filter(InventoryUnit.blood_group == blood_group)

    total = query.count()
    # Sort default FIFO by expiry_at ASC
    units = query.order_by(InventoryUnit.expiry_at.asc()).offset((page - 1) * limit).limit(limit).all()

    items = [
        {
            "id": u.id,
            "bag_id": u.bag_id,
            "component_type": u.component_type,
            "blood_group": u.blood_group,
            "collection_at": u.collection_at.isoformat(),
            "expiry_at": u.expiry_at.isoformat(),
            "status": u.status,
            "source_type": u.source_type,
            "version": u.version,
        }
        for u in units
    ]

    return {
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
        },
        "error": None,
    }


@router.post("/units")
def register_unit(
    bank_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    bag_id = payload.get("bag_id")
    if not bag_id:
        raise HTTPException(status_code=422, detail="bag_id is required")

    existing = db.query(InventoryUnit).filter(InventoryUnit.bag_id == bag_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Unit with bag_id '{bag_id}' already exists")

    collection_at = datetime.datetime.fromisoformat(payload.get("collection_at")) if payload.get("collection_at") else datetime.datetime.utcnow()
    expiry_at = datetime.datetime.fromisoformat(payload.get("expiry_at")) if payload.get("expiry_at") else collection_at + datetime.timedelta(days=5)

    unit = InventoryUnit(
        id=str(uuid.uuid4()),
        bank_id=bank_id,
        bag_id=bag_id,
        component_type=payload.get("component_type", "RDP"),
        blood_group=payload.get("blood_group", "O+"),
        collection_at=collection_at,
        expiry_at=expiry_at,
        status="AVAILABLE",
        source_type="OPERATIONAL",
    )
    db.add(unit)

    # Event + Audit
    event = InventoryEvent(
        id=str(uuid.uuid4()),
        unit_id=unit.id,
        bank_id=bank_id,
        event_type="REGISTERED",
        actor_user_id=current_user.get("sub", "demo-user"),
    )
    db.add(event)

    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id=bank_id,
        action="REGISTER_UNIT",
        entity_type="InventoryUnit",
        entity_id=unit.id,
    )
    db.add(audit)

    db.commit()
    db.refresh(unit)

    return {"data": {"id": unit.id, "bag_id": unit.bag_id, "status": unit.status}, "error": None}


@router.post("/units/{unit_id}/issue")
def issue_unit(
    bank_id: str,
    unit_id: str,
    payload: dict = {},
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    unit = db.query(InventoryUnit).filter(InventoryUnit.id == unit_id, InventoryUnit.bank_id == bank_id).first()
    if not unit:
        raise HTTPException(status_code=444, detail="Unit not found")
    if unit.status != "AVAILABLE":
        raise HTTPException(status_code=409, detail=f"Unit is in '{unit.status}' status, cannot issue")

    # FIFO Check
    all_available = db.query(InventoryUnit).filter(
        InventoryUnit.bank_id == bank_id,
        InventoryUnit.status == "AVAILABLE",
        InventoryUnit.id != unit_id
    ).all()
    all_expiries = [u.expiry_at for u in all_available]

    override_reason = payload.get("override_reason")
    is_valid, warning_msg = check_fifo_issuance(unit.expiry_at, all_expiries, override_reason)
    if not is_valid:
        raise HTTPException(status_code=422, detail=warning_msg)

    unit.status = "ISSUED"
    unit.version += 1

    event = InventoryEvent(
        id=str(uuid.uuid4()),
        unit_id=unit.id,
        bank_id=bank_id,
        event_type="ISSUED",
        actor_user_id=current_user.get("sub", "demo-user"),
        reason=override_reason,
    )
    db.add(event)

    db.commit()

    return {
        "data": {
            "id": unit.id,
            "bag_id": unit.bag_id,
            "status": unit.status,
            "fifo_warning": warning_msg,
        },
        "error": None,
    }


@router.post("/units/{unit_id}/dispose")
def dispose_unit(
    bank_id: str,
    unit_id: str,
    payload: dict = {},
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    unit = db.query(InventoryUnit).filter(InventoryUnit.id == unit_id, InventoryUnit.bank_id == bank_id).first()
    if not unit:
        raise HTTPException(status_code=444, detail="Unit not found")

    pathway = payload.get("pathway", "DISCARD")
    reason = payload.get("reason", "Expired or damaged")

    unit.status = "DISCARDED" if pathway == "DISCARD" else "NON_CLINICAL"
    unit.version += 1

    event = InventoryEvent(
        id=str(uuid.uuid4()),
        unit_id=unit.id,
        bank_id=bank_id,
        event_type="DISCARDED",
        actor_user_id=current_user.get("sub", "demo-user"),
        reason=reason,
    )
    db.add(event)

    db.commit()

    return {"data": {"id": unit.id, "status": unit.status}, "error": None}
