import json
import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from models import Recommendation, AuditLog, InventoryUnit
from services.decision_engine import evaluate_decision

router = APIRouter(prefix="/banks/{bank_id}", tags=["recommendation"])


@router.get("/recommendation/current")
def get_current_recommendation(bank_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    rec = (
        db.query(Recommendation)
        .filter(Recommendation.bank_id == bank_id, Recommendation.status == "ACTIVE")
        .order_by(Recommendation.created_at.desc())
        .first()
    )

    if not rec:
        # Evaluate dynamically using current inventory
        units = db.query(InventoryUnit).filter(InventoryUnit.bank_id == bank_id).all()
        unit_dicts = [{"expiry_at": u.expiry_at, "status": u.status} for u in units]

        # Standard 7-day forecast mock
        q50_base = [21.0, 24.0, 29.0, 27.0, 25.0, 20.0, 31.0]
        forecast_days = [
            {"date": (datetime.date.today() + datetime.timedelta(days=i)).isoformat(), "q50": q50_base[i], "q67": q50_base[i] * 1.18, "q90": q50_base[i] * 1.40}
            for i in range(7)
        ]

        dec = evaluate_decision(forecast_days, unit_dicts)
        return {
            "data": {
                "id": "rec-demo-001",
                "action": dec["action"],
                "quantity": dec["quantity"],
                "status": dec["status"],
                "reason_summary": dec["reason_summary"],
                "drivers": dec["drivers"],
                "projected_gap": dec["projected_gap"],
                "horizon": dec["horizon"],
                "inventory_surplus": dec["inventory_surplus"],
                "model_version": "LASSO v1.4",
                "generated_at": datetime.datetime.utcnow().isoformat(),
            },
            "error": None,
        }

    drivers = json.loads(rec.drivers_json) if rec.drivers_json else []
    return {
        "data": {
            "id": rec.id,
            "action": rec.action,
            "quantity": rec.quantity,
            "status": rec.status,
            "reason_summary": rec.reason_summary,
            "drivers": drivers,
            "projected_gap": "+41 units",
            "horizon": "7 days",
            "inventory_surplus": "+41 above safety",
            "model_version": "LASSO v1.4",
            "generated_at": rec.created_at.isoformat(),
        },
        "error": None,
    }


@router.post("/recommendations/{id}/confirm")
def confirm_recommendation(
    bank_id: str,
    id: str,
    idempotency_key: str = Header(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rec = db.query(Recommendation).filter(Recommendation.id == id, Recommendation.bank_id == bank_id).first()
    if rec and rec.status == "CONFIRMED":
        raise HTTPException(status_code=409, detail="Recommendation already confirmed by another user")

    if rec:
        rec.status = "CONFIRMED"

    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id=bank_id,
        action="CONFIRM_RECOMMENDATION",
        entity_type="Recommendation",
        entity_id=id,
    )
    db.add(audit)
    db.commit()

    return {"data": {"id": id, "status": "CONFIRMED"}, "error": None}


@router.post("/recommendations/{id}/adjust")
def adjust_recommendation(
    bank_id: str,
    id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    reason = payload.get("reason")
    if not reason or not reason.strip():
        raise HTTPException(status_code=422, detail="Reason is mandatory for adjusting recommendation")

    quantity = payload.get("quantity", 0)

    rec = db.query(Recommendation).filter(Recommendation.id == id, Recommendation.bank_id == bank_id).first()
    if rec:
        rec.status = "ADJUSTED"
        rec.quantity = quantity

    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id=bank_id,
        action="ADJUST_RECOMMENDATION",
        entity_type="Recommendation",
        entity_id=id,
        after_json=json.dumps({"quantity": quantity, "reason": reason}),
    )
    db.add(audit)
    db.commit()

    return {"data": {"id": id, "status": "ADJUSTED", "quantity": quantity}, "error": None}
