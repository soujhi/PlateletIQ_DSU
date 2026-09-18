import hashlib
import json
import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models.shipment import Shipment, TrackingEvent
from models.audit import AuditLog

webhooks_router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@webhooks_router.post("/shiprocket")
async def shiprocket_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Shiprocket tracking webhook listener with payload hash deduplication (Section 13 & 14).
    Normalizes provider status updates and persists immutable TrackingEvent logs.
    """
    body = await request.body()
    payload_hash = hashlib.sha256(body).hexdigest()

    try:
        data = json.loads(body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    shipment_id = data.get("shipment_id") or data.get("order_id")
    provider_event_id = data.get("event_id") or f"EVT-{payload_hash[:12]}"
    status = data.get("current_status") or data.get("status") or "IN_TRANSIT"
    description = data.get("scans", [{}])[-1].get("location_name") if data.get("scans") else data.get("activity")

    # Payload deduplication check
    existing = db.query(TrackingEvent).filter(TrackingEvent.provider_event_id == provider_event_id).first()
    if existing:
        return {"status": "ok", "deduplicated": True, "message": "Event already processed."}

    # Find matching shipment
    shipment = None
    if shipment_id:
        shipment = (
            db.query(Shipment)
            .filter(
                (Shipment.provider_shipment_id == str(shipment_id))
                | (Shipment.provider_order_id == str(shipment_id))
                | (Shipment.awb_code == str(shipment_id))
            )
            .first()
        )

    # Persist normalized tracking event
    evt = TrackingEvent(
        id=f"TRK-{hashlib.md5(f'{provider_event_id}:{datetime.datetime.utcnow().isoformat()}'.encode()).hexdigest()[:8]}",
        shipment_id=shipment.id if shipment else str(shipment_id or "UNKNOWN"),
        provider="shiprocket",
        provider_event_id=provider_event_id,
        status=status.upper(),
        description=description or f"Shiprocket status update: {status}",
        latitude=float(data.get("lat")) if data.get("lat") else None,
        longitude=float(data.get("lng")) if data.get("lng") else None,
        location_name=data.get("current_location"),
        event_timestamp=datetime.datetime.utcnow(),
        received_at=datetime.datetime.utcnow(),
        raw_payload_hash=payload_hash,
    )
    db.add(evt)

    if shipment:
        shipment.status = status.upper()
        if status.upper() in ("PICKED UP", "IN_TRANSIT"):
            shipment.picked_up_at = datetime.datetime.utcnow()
        elif status.upper() in ("DELIVERED", "COMPLETED"):
            shipment.delivered_at = datetime.datetime.utcnow()

    db.commit()

    return {"status": "ok", "deduplicated": False, "event_id": evt.id}
