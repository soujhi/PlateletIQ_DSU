import uuid
import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from models import Requisition, InventoryUnit, InventoryEvent, AuditLog
from services.decision_engine import check_concordance, check_fifo_issuance

router = APIRouter(prefix="/banks/{bank_id}/requisitions", tags=["requisitions"])


@router.get("")
def list_requisitions(
    bank_id: str,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(Requisition).filter(Requisition.bank_id == bank_id)
    if status_filter:
        query = query.filter(Requisition.status == status_filter)

    reqs = query.order_by(Requisition.submitted_at.desc()).all()

    items = [
        {
            "id": r.id,
            "request_ref": r.request_ref,
            "ward": r.ward,
            "priority": r.priority,
            "clinical_indication": r.clinical_indication,
            "platelet_count": r.platelet_count,
            "bleeding_status": r.bleeding_status,
            "units_requested": r.units_requested,
            "component_requested": r.component_requested,
            "status": r.status,
            "concordance_flag": r.concordance_flag,
            "guideline_note": r.guideline_note,
            "submitted_at": r.submitted_at.isoformat(),
        }
        for r in reqs
    ]

    return {"data": items, "error": None}


@router.post("")
def create_requisition(
    bank_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    ward = payload.get("ward", "General Ward")
    clinical_indication = payload.get("clinical_indication", "Thrombocytopenia")
    platelet_count = float(payload.get("platelet_count", 15.0))
    bleeding_status = bool(payload.get("bleeding_status", False))
    units_requested = int(payload.get("units_requested", 1))
    component_requested = payload.get("component_requested", "RDP")
    priority = payload.get("priority", "ROUTINE")

    concordant, guideline_note = check_concordance(platelet_count, bleeding_status)

    ref = f"REQ-{uuid.uuid4().hex[:6].upper()}"
    req = Requisition(
        id=str(uuid.uuid4()),
        bank_id=bank_id,
        request_ref=ref,
        ward=ward,
        priority=priority,
        clinical_indication=clinical_indication,
        platelet_count=platelet_count,
        bleeding_status=bleeding_status,
        units_requested=units_requested,
        component_requested=component_requested,
        status="PENDING",
        concordance_flag=concordant,
        guideline_note=guideline_note,
        submitted_at=datetime.datetime.utcnow(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    return {
        "data": {
            "id": req.id,
            "request_ref": req.request_ref,
            "status": req.status,
            "concordance_flag": req.concordance_flag,
            "guideline_note": req.guideline_note,
        },
        "error": None,
    }


@router.post("/{id}/fulfill")
def fulfill_requisition(
    bank_id: str,
    id: str,
    payload: dict = {},
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    req = db.query(Requisition).filter(Requisition.id == id, Requisition.bank_id == bank_id).first()
    if not req:
        raise HTTPException(status_code=444, detail="Requisition not found")

    unit_ids = payload.get("unit_ids", [])
    if not unit_ids:
        # Auto select FIFO available units
        available_units = (
            db.query(InventoryUnit)
            .filter(InventoryUnit.bank_id == bank_id, InventoryUnit.status == "AVAILABLE")
            .order_by(InventoryUnit.expiry_at.asc())
            .limit(req.units_requested)
            .all()
        )
        unit_ids = [u.id for u in available_units]

    for uid in unit_ids:
        unit = db.query(InventoryUnit).filter(InventoryUnit.id == uid).first()
        if unit and unit.status == "AVAILABLE":
            unit.status = "ISSUED"
            unit.version += 1

            event = InventoryEvent(
                id=str(uuid.uuid4()),
                unit_id=unit.id,
                bank_id=bank_id,
                event_type="ISSUED",
                actor_user_id=current_user.get("sub", "demo-user"),
                reason=f"Fulfilled requisition {req.request_ref}",
            )
            db.add(event)

    req.status = "FULFILLED"
    db.commit()

    return {"data": {"id": req.id, "status": req.status, "fulfilled_units": len(unit_ids)}, "error": None}
