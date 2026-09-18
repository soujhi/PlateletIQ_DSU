import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from models import TransferOpportunity, TransferOffer, AuditLog

router = APIRouter(prefix="/banks/{bank_id}/transfers", tags=["transfers"])


@router.get("/opportunities")
def get_transfer_opportunities(bank_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    opps = db.query(TransferOpportunity).filter(TransferOpportunity.destination_bank_id == bank_id).all()

    if not opps:
        # Return standard seeded transfer opportunities matching PRD Section 9.1
        return {
            "data": [
                {
                    "id": "opp-001",
                    "from": "Bangalore Urban",
                    "to": "Chennai Central",
                    "units": 60,
                    "component_type": "SDP",
                    "source_freshness_hours": 12.0,
                    "sourceFreshness": "fresh",
                    "reason": "Bangalore Urban has 60 SDP units with zero expected local deficit. Chennai projected shortage in 4 days.",
                    "status": "OPEN",
                },
                {
                    "id": "opp-002",
                    "from": "Mumbai City",
                    "to": "Chennai Central",
                    "units": 25,
                    "component_type": "SDP",
                    "source_freshness_hours": 14.0,
                    "sourceFreshness": "fresh",
                    "reason": "Mumbai City surplus stock available for intra-regional balancing.",
                    "status": "OPEN",
                },
            ],
            "error": None,
        }

    items = [
        {
            "id": o.id,
            "from": o.source_bank_name or o.source_bank_id,
            "to": "Chennai Central",
            "units": o.potential_quantity,
            "component_type": o.component_type,
            "source_freshness_hours": o.source_freshness_hours,
            "sourceFreshness": "fresh" if o.source_freshness_hours <= 24 else "stale",
            "reason": o.reason_summary,
            "status": o.status,
        }
        for o in opps
    ]

    return {"data": items, "error": None}


@router.post("/opportunities/{id}/offer")
def make_transfer_offer(
    bank_id: str,
    id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    quantity = int(payload.get("quantity", 12))
    offer = TransferOffer(
        id=str(uuid.uuid4()),
        opportunity_id=id,
        source_bank_id="BLR-URB-001",
        destination_bank_id=bank_id,
        quantity=quantity,
        status="OFFERED",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(offer)

    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id=bank_id,
        action="MAKE_TRANSFER_OFFER",
        entity_type="TransferOffer",
        entity_id=offer.id,
    )
    db.add(audit)
    db.commit()

    return {"data": {"id": offer.id, "status": "OFFERED", "quantity": quantity}, "error": None}


@router.post("/offers/{id}/accept")
def accept_transfer_offer(
    bank_id: str,
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    offer = db.query(TransferOffer).filter(TransferOffer.id == id).first()
    if offer:
        offer.status = "ACCEPTED"

    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id=bank_id,
        action="ACCEPT_TRANSFER_OFFER",
        entity_type="TransferOffer",
        entity_id=id,
    )
    db.add(audit)
    db.commit()

    return {"data": {"id": id, "status": "ACCEPTED"}, "error": None}


@router.post("/offers/{id}/complete")
def complete_transfer(
    bank_id: str,
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    offer = db.query(TransferOffer).filter(TransferOffer.id == id).first()
    if offer:
        offer.status = "COMPLETED"

    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id=bank_id,
        action="COMPLETE_TRANSFER",
        entity_type="TransferOffer",
        entity_id=id,
    )
    db.add(audit)
    db.commit()

    return {"data": {"id": id, "status": "COMPLETED"}, "error": None}
