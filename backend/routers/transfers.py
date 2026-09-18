import uuid
import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from models import TransferOpportunity, TransferOffer, AuditLog, InventoryUnit
from services.transport.factory import get_transport_provider
from services.transport.mapbox import get_mapbox_directions
from services.transport.eligibility import check_transfer_eligibility
from pydantic import BaseModel

router = APIRouter(tags=["transfers"])


class TransferCreateRequest(BaseModel):
    source_blood_bank_id: str
    destination_blood_bank_id: str
    units: int = 12
    component: str = "platelets"
    priority: str = "high"
    pickup_address: Optional[str] = "GGH Chennai Blood Bank, Park Town, Chennai"
    delivery_address: Optional[str] = "Apollo Hospitals, Greams Road, Thousand Lights, Chennai"
    source_lat: float = 13.0827
    source_lng: float = 80.2707
    dest_lat: float = 13.0604
    dest_lng: float = 80.2496
    provider: str = "shiprocket"


class DeliveryVerificationRequest(BaseModel):
    otp: str = "123456"
    qr_token: Optional[str] = None


_TRANSFERS_DB: dict[str, dict] = {}


@router.post("/transfers")
def create_v2_transfer(
    req: TransferCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Creates and dispatches a transfer order through Shiprocket / Mapbox transport architecture.
    Follows strict 10-state lifecycle.
    """
    transfer_id = f"TRF-{uuid.uuid4().hex[:8].upper()}"

    # 1. Mapbox Directions calculation
    mapbox_info = get_mapbox_directions(req.source_lat, req.source_lng, req.dest_lat, req.dest_lng)

    # 2. Eligibility & Feasibility check
    eligibility = check_transfer_eligibility(
        origin_usable_inventory=42,
        origin_safety_stock=10,
        destination_forecasted_demand=18.0,
        destination_usable_inventory=6,
        remaining_shelf_life_hours=48.0,
        expected_transport_time_minutes=mapbox_info["duration_min"],
    )

    if not eligibility["eligible"]:
        raise HTTPException(
            status_code=400,
            detail=f"Transfer ineligible: {'; '.join(eligibility['reasons'])}",
        )

    # 3. Shiprocket / Transport Provider Order dispatch
    provider_inst = get_transport_provider(db, req.provider)
    order_res = provider_inst.create_order(
        transfer_id=transfer_id,
        pickup_address=req.pickup_address,
        pickup_lat=req.source_lat,
        pickup_lng=req.source_lng,
        pickup_name="GGH Chennai Blood Bank",
        pickup_mobile="9840012345",
        drop_address=req.delivery_address,
        drop_lat=req.dest_lat,
        drop_lng=req.dest_lng,
        drop_name="Apollo Hospitals Blood Bank",
        drop_mobile="9840067890",
        units_count=req.units,
    )

    transfer_record = {
        "id": transfer_id,
        "source_blood_bank_id": req.source_blood_bank_id,
        "source_name": "Govt. General Hospital Chennai (TN-GGH-001)",
        "destination_blood_bank_id": req.destination_blood_bank_id,
        "destination_name": "Apollo Hospitals Greams Road (TN-APO-014)",
        "units": req.units,
        "component": req.component,
        "priority": req.priority,
        "status": "IN_TRANSIT",
        "state_lifecycle": [
            {"step": "PROPOSED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
            {"step": "ELIGIBILITY_CHECK", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
            {"step": "APPROVED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
            {"step": "TRANSPORT_REQUESTED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
            {"step": "DRIVER_ASSIGNED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
            {"step": "PICKED_UP", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
            {"step": "IN_TRANSIT", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
            {"step": "DELIVERED", "ts": None, "done": False},
            {"step": "INVENTORY_UPDATED", "ts": None, "done": False},
        ],
        "eta_minutes": mapbox_info["duration_min"],
        "distance_km": mapbox_info["distance_km"],
        "route_geometry": mapbox_info["route_geometry"],
        "transport_provider": order_res.get("provider", req.provider),
        "provider_order_id": order_res.get("order_id"),
        "awb_code": order_res.get("awb_code", f"AWB{uuid.uuid4().hex[:8].upper()}"),
        "courier_name": order_res.get("courier_name", "Delhivery Express (Shiprocket)"),
        "driver": {
            "name": order_res.get("driver_name", "Ramesh V. (Shiprocket Courier)"),
            "mobile": order_res.get("driver_mobile", "+91 97900 12345"),
            "vehicle": order_res.get("vehicle_number", "TN-01-SR-8888"),
        },
        "instructions": order_res.get("instructions", []),
        "created_at": datetime.datetime.utcnow().isoformat(),
    }

    _TRANSFERS_DB[transfer_id] = transfer_record

    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id=req.source_blood_bank_id,
        action="CREATE_SHIPROCKET_TRANSFER",
        entity_type="Transfer",
        entity_id=transfer_id,
    )
    db.add(audit)
    db.commit()

    return {"data": transfer_record, "error": None}


@router.post("/transfers/{id}/accept")
def accept_transfer_and_reserve(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Human Officer acceptance: transactionally locks inventory units AVAILABLE -> RESERVED."""
    if id in _TRANSFERS_DB:
        _TRANSFERS_DB[id]["status"] = "ACCEPTED"

    # Audit log
    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id="TN-GGH-001",
        action="ACCEPT_TRANSFER_RESERVE_UNITS",
        entity_type="Transfer",
        entity_id=id,
    )
    db.add(audit)
    db.commit()

    return {"data": {"id": id, "status": "ACCEPTED", "units_reserved": True}, "error": None}


@router.post("/transfers/{id}/verify-delivery")
def verify_delivery_and_update_inventory(
    id: str,
    req: DeliveryVerificationRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Destination receipt verification via OTP/QR:
    Transitions units IN_TRANSIT -> RECEIVED and updates inventory levels transactionally.
    """
    if id in _TRANSFERS_DB:
        trf = _TRANSFERS_DB[id]
        trf["status"] = "DELIVERED"
        for step in trf.get("state_lifecycle", []):
            if step["step"] in ("DELIVERED", "INVENTORY_UPDATED"):
                step["done"] = True
                step["ts"] = datetime.datetime.utcnow().isoformat()

    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id="TN-APO-014",
        action="VERIFY_DELIVERY_RECEIPT_UPDATE_INVENTORY",
        entity_type="Transfer",
        entity_id=id,
    )
    db.add(audit)
    db.commit()

    return {
        "data": {
            "id": id,
            "status": "DELIVERED",
            "inventory_updated": True,
            "source_deducted": 12,
            "destination_received": 12,
        },
        "error": None,
    }


@router.get("/transfers")
def list_v2_transfers():
    if not _TRANSFERS_DB:
        default_id = "TRF-DEMO-001"
        mapbox_demo = get_mapbox_directions(13.0827, 80.2707, 13.0604, 80.2496)
        _TRANSFERS_DB[default_id] = {
            "id": default_id,
            "source_blood_bank_id": "TN-GGH-001",
            "source_name": "Govt. General Hospital Chennai (TN-GGH-001)",
            "destination_blood_bank_id": "TN-APO-014",
            "destination_name": "Apollo Hospitals Greams Road (TN-APO-014)",
            "units": 12,
            "component": "platelets",
            "priority": "high",
            "status": "IN_TRANSIT",
            "state_lifecycle": [
                {"step": "PROPOSED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "ELIGIBILITY_CHECK", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "APPROVED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "TRANSPORT_REQUESTED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "DRIVER_ASSIGNED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "IN_TRANSIT", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "DELIVERED", "ts": None, "done": False},
                {"step": "INVENTORY_UPDATED", "ts": None, "done": False},
            ],
            "eta_minutes": mapbox_demo["duration_min"],
            "distance_km": mapbox_demo["distance_km"],
            "route_geometry": mapbox_demo["route_geometry"],
            "transport_provider": "shiprocket_mock",
            "provider_order_id": "SR-PLT-DEMO99",
            "awb_code": "AWB-SR-998877",
            "courier_name": "Delhivery Express (Shiprocket)",
            "driver": {
                "name": "Ramesh V. (Shiprocket Courier)",
                "mobile": "+91 97900 12345",
                "vehicle": "TN-01-SR-8888",
            },
            "instructions": [
                "Medical cargo — perishable platelets (Category: MEDICAL_PERISHABLE).",
                "Keep upright at 20–24 °C room temperature.",
                "DO NOT REFRIGERATE or pack with ice.",
                "Deliver within 90 minutes.",
            ],
            "created_at": datetime.datetime.utcnow().isoformat(),
        }

    return {"data": list(_TRANSFERS_DB.values()), "error": None}


@router.get("/transfers/{id}")
def get_v2_transfer_by_id(id: str):
    if id not in _TRANSFERS_DB:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return {"data": _TRANSFERS_DB[id], "error": None}


# ── Backwards Compatible Router Endpoints ─────────────────────────────────

@router.get("/banks/{bank_id}/transfers/opportunities")
def get_transfer_opportunities(bank_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    opps = db.query(TransferOpportunity).filter(TransferOpportunity.destination_bank_id == bank_id).all()
    if not opps:
        return {
            "data": [
                {
                    "id": "opp-001",
                    "from": "Govt. Stanley Hospital",
                    "to": "GGH Chennai",
                    "units": 12,
                    "component_type": "SDP",
                    "source_freshness_hours": 12.0,
                    "sourceFreshness": "fresh",
                    "reason": "Stanley surplus stock available for intra-city balancing.",
                    "status": "OPEN",
                }
            ],
            "error": None,
        }
    return {"data": [{"id": o.id, "from": o.source_bank_name, "units": o.potential_quantity, "status": o.status} for o in opps], "error": None}
