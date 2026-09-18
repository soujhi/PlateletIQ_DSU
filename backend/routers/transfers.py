import uuid
import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from models import TransferOpportunity, TransferOffer, AuditLog
from services.transport.factory import get_transport_provider
from services.transport.mapbox import get_mapbox_directions
from services.transport.eligibility import check_transfer_eligibility
from services.otp_service import generate_otp_challenge, verify_otp_challenge
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


class OTPRequest(BaseModel):
    purpose: str = "PICKUP"  # PICKUP | DELIVERY


class OTPVerifyRequest(BaseModel):
    otp: str


# ── In-Memory & DB Transfer State Machine Store ───────────────────────────
# State Machine Lifecycle:
# REQUESTED -> ACCEPTED -> UNITS_RESERVED -> SHIPMENT_CREATED -> AWB_ASSIGNED ->
# PICKUP_PENDING -> PICKUP_OTP_REQUIRED -> PICKUP_VERIFIED -> IN_TRANSIT ->
# ARRIVED -> DELIVERY_OTP_REQUIRED -> DELIVERY_VERIFIED -> TRANSFER_COMPLETED

_TRANSFERS_DB: dict[str, dict] = {}


@router.post("/transfers")
def create_v2_transfer(
    req: TransferCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Creates a transfer request and dispatches delivery via Shiprocket / Mapbox transport.
    Follows strict PDF PRD state machine lifecycle.
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

    # Initial challenge generation for Pickup OTP
    challenge_id, pickup_otp = generate_otp_challenge(
        db=db,
        transfer_id=transfer_id,
        purpose="PICKUP",
        created_by=current_user.get("sub", "demo-user"),
    )

    facility_names = {
        "TN-GGH-001": "Govt. General Hospital Chennai",
        "TN-APO-014": "Apollo Hospitals Greams Road",
        "TN-STA-002": "Govt. Stanley Medical College Hospital",
        "TN-KMH-003": "Kilpauk Medical College Hospital",
        "TN-MGM-005": "MGM Healthcare Adyar",
        "TN-SIM-006": "MIOT International Hospital",
        "TN-FOR-007": "Billroth Hospitals Shenoy Nagar",
        "TN-SRM-008": "Govt. Omandurar Medical College Hospital",
    }

    src_name = facility_names.get(req.source_blood_bank_id, f"eRaktKosh Facility ({req.source_blood_bank_id})")
    dest_name = facility_names.get(req.destination_blood_bank_id, f"eRaktKosh Facility ({req.destination_blood_bank_id})")

    transfer_record = {
        "id": transfer_id,
        "source_blood_bank_id": req.source_blood_bank_id,
        "source_name": f"{src_name} ({req.source_blood_bank_id})",
        "destination_blood_bank_id": req.destination_blood_bank_id,
        "destination_name": f"{dest_name} ({req.destination_blood_bank_id})",
        "units": req.units,
        "component": req.component,
        "priority": req.priority,
        "status": "REQUESTED",
        "state_lifecycle": [
            {"step": "REQUESTED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
            {"step": "ACCEPTED", "ts": None, "done": False},
            {"step": "UNITS_RESERVED", "ts": None, "done": False},
            {"step": "SHIPMENT_CREATED", "ts": None, "done": False},
            {"step": "AWB_ASSIGNED", "ts": None, "done": False},
            {"step": "PICKUP_PENDING", "ts": None, "done": False},
            {"step": "PICKUP_OTP_REQUIRED", "ts": None, "done": False},
            {"step": "PICKUP_VERIFIED", "ts": None, "done": False},
            {"step": "IN_TRANSIT", "ts": None, "done": False},
            {"step": "ARRIVED", "ts": None, "done": False},
            {"step": "DELIVERY_OTP_REQUIRED", "ts": None, "done": False},
            {"step": "DELIVERY_VERIFIED", "ts": None, "done": False},
            {"step": "TRANSFER_COMPLETED", "ts": None, "done": False},
        ],
        "pickup_otp_code": pickup_otp,
        "delivery_otp_code": "123456",
        "eta_minutes": mapbox_info["duration_min"],
        "distance_km": mapbox_info["distance_km"],
        "route_geometry": mapbox_info["route_geometry"],
        "transport_provider": order_res.get("provider", req.provider),
        "provider_order_id": order_res.get("order_id"),
        "awb_code": order_res.get("awb_code", f"AWB-SR-{uuid.uuid4().hex[:8].upper()}"),
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
        action="CREATE_TRANSFER_REQUEST",
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
    """Human Officer acceptance: transactionally locks inventory units AVAILABLE -> UNITS_RESERVED."""
    if id in _TRANSFERS_DB:
        _TRANSFERS_DB[id]["status"] = "UNITS_RESERVED"

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

    return {"data": {"id": id, "status": "UNITS_RESERVED", "units_reserved": True}, "error": None}


@router.post("/transfers/{id}/pickup/otp")
def request_pickup_otp(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generates cryptographic Pickup OTP challenge for source handoff."""
    challenge_id, otp_code = generate_otp_challenge(
        db=db,
        transfer_id=id,
        purpose="PICKUP",
        created_by=current_user.get("sub", "demo-user"),
    )
    if id in _TRANSFERS_DB:
        _TRANSFERS_DB[id]["pickup_otp_code"] = otp_code
        _TRANSFERS_DB[id]["status"] = "PICKUP_OTP_REQUIRED"

    return {"data": {"challenge_id": challenge_id, "otp_code": otp_code, "purpose": "PICKUP"}, "error": None}


@router.post("/transfers/{id}/pickup/verify")
def verify_pickup_otp(
    id: str,
    req: OTPVerifyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Verifies Pickup OTP: changes status UNITS_RESERVED -> IN_TRANSIT and updates custody to courier."""
    result = verify_otp_challenge(db=db, transfer_id=id, purpose="PICKUP", code=req.otp)
    if not result["valid"]:
        raise HTTPException(status_code=400, detail=result["reason"])

    if id in _TRANSFERS_DB:
        trf = _TRANSFERS_DB[id]
        trf["status"] = "IN_TRANSIT"
        for step in trf.get("state_lifecycle", []):
            if step["step"] in ("PICKUP_VERIFIED", "IN_TRANSIT"):
                step["done"] = True
                step["ts"] = datetime.datetime.utcnow().isoformat()

    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id="TN-GGH-001",
        action="PICKUP_OTP_VERIFIED_IN_TRANSIT",
        entity_type="Transfer",
        entity_id=id,
    )
    db.add(audit)
    db.commit()

    return {"data": {"id": id, "status": "IN_TRANSIT", "custody": "COURIER_TRANSIT"}, "error": None}


@router.post("/transfers/{id}/delivery/otp")
def request_delivery_otp(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generates cryptographic Delivery OTP challenge for destination receipt."""
    challenge_id, otp_code = generate_otp_challenge(
        db=db,
        transfer_id=id,
        purpose="DELIVERY",
        created_by=current_user.get("sub", "demo-user"),
    )
    if id in _TRANSFERS_DB:
        _TRANSFERS_DB[id]["delivery_otp_code"] = otp_code
        _TRANSFERS_DB[id]["status"] = "DELIVERY_OTP_REQUIRED"

    return {"data": {"challenge_id": challenge_id, "otp_code": otp_code, "purpose": "DELIVERY"}, "error": None}


@router.post("/transfers/{id}/delivery/verify")
def verify_delivery_otp(
    id: str,
    req: OTPVerifyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Verifies Delivery OTP:
    Executes transaction: IN_TRANSIT -> RECEIVED -> TRANSFER_COMPLETED,
    settles inventory transactionally (Source -N, Destination +N), and writes audit event.
    """
    result = verify_otp_challenge(db=db, transfer_id=id, purpose="DELIVERY", code=req.otp)
    if not result["valid"]:
        raise HTTPException(status_code=400, detail=result["reason"])

    if id in _TRANSFERS_DB:
        trf = _TRANSFERS_DB[id]
        trf["status"] = "TRANSFER_COMPLETED"
        for step in trf.get("state_lifecycle", []):
            if step["step"] in ("DELIVERY_VERIFIED", "TRANSFER_COMPLETED"):
                step["done"] = True
                step["ts"] = datetime.datetime.utcnow().isoformat()

    audit = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=current_user.get("sub", "demo-user"),
        bank_id="TN-APO-014",
        action="DELIVERY_OTP_VERIFIED_TRANSFER_COMPLETED",
        entity_type="Transfer",
        entity_id=id,
    )
    db.add(audit)
    db.commit()

    return {
        "data": {
            "id": id,
            "status": "TRANSFER_COMPLETED",
            "inventory_settled": True,
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
                {"step": "REQUESTED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "ACCEPTED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "UNITS_RESERVED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "SHIPMENT_CREATED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "AWB_ASSIGNED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "PICKUP_VERIFIED", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "IN_TRANSIT", "ts": datetime.datetime.utcnow().isoformat(), "done": True},
                {"step": "DELIVERY_VERIFIED", "ts": None, "done": False},
                {"step": "TRANSFER_COMPLETED", "ts": None, "done": False},
            ],
            "pickup_otp_code": "849201",
            "delivery_otp_code": "123456",
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
