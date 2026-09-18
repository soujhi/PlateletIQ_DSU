from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from services.transport.factory import get_transport_provider
from services.transport.shiprocket import ShiprocketTransportProvider
from services.transport.mapbox import get_mapbox_directions, get_mapbox_matrix
from services.config_service import get_config, SystemConfig
from pydantic import BaseModel
from typing import Optional

transport_router = APIRouter(tags=["Transport"])


class QuoteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    destination_lat: float
    destination_lng: float
    provider: str = "shiprocket"


class ServiceabilityRequest(BaseModel):
    pickup_pincode: str = "600003"
    delivery_pincode: str = "600006"
    weight_kg: float = 0.5


class ProviderSetRequest(BaseModel):
    provider: str


@transport_router.get("/transport/providers")
def list_transport_providers(db: Session = Depends(get_db)):
    current_provider = get_config(db, "TRANSPORT_PROVIDER")
    return {
        "active_provider": current_provider or "shiprocket",
        "available_providers": [
            {
                "id": "shiprocket",
                "name": "Shiprocket Logistics API",
                "description": "Multi-courier express dispatch (Delhivery / Bluedart) with 20–24 °C instructions",
                "status": "active" if current_provider in ("shiprocket", "") else "available",
            },
            {
                "id": "porter",
                "name": "Porter Logistics API",
                "description": "City-wide 2-wheeler express medical dispatch with 20–24 °C instructions",
                "status": "active" if current_provider == "porter" else "available",
            },
            {
                "id": "internal",
                "name": "Internal Hospital Fleet",
                "description": "Hospital runners & local drivers with phone GPS tracking",
                "status": "active" if current_provider == "internal" else "available",
            },
            {
                "id": "beckn",
                "name": "ONDC / Beckn Logistics BAP",
                "description": "Open network logistics protocol adapter (BAP -> BPP)",
                "status": "active" if current_provider == "beckn" else "available",
            },
        ],
    }


@transport_router.post("/transport/set-provider")
def set_active_transport_provider(req: ProviderSetRequest, db: Session = Depends(get_db)):
    if req.provider not in ("shiprocket", "porter", "internal", "beckn"):
        raise HTTPException(status_code=400, detail="Invalid provider. Must be one of: shiprocket, porter, internal, beckn")

    cfg = db.query(SystemConfig).filter(SystemConfig.key == "TRANSPORT_PROVIDER").first()
    if not cfg:
        cfg = SystemConfig(key="TRANSPORT_PROVIDER", value=req.provider, unit="enum", description="Active transport provider")
        db.add(cfg)
    else:
        cfg.value = req.provider
    db.commit()

    return {"status": "ok", "active_provider": req.provider}


@transport_router.post("/transport/serviceability")
def check_shiprocket_serviceability(req: ServiceabilityRequest):
    sr = ShiprocketTransportProvider()
    return sr.get_serviceability(
        pickup_pincode=req.pickup_pincode,
        delivery_pincode=req.delivery_pincode,
        weight=req.weight_kg,
    )


@transport_router.post("/transport/quote")
def get_transport_quote(req: QuoteRequest, db: Session = Depends(get_db)):
    provider = get_transport_provider(db, req.provider)
    quote = provider.get_quote(
        pickup_lat=req.origin_lat,
        pickup_lng=req.origin_lng,
        drop_lat=req.destination_lat,
        drop_lng=req.destination_lng,
    )
    mapbox_info = get_mapbox_directions(req.origin_lat, req.origin_lng, req.destination_lat, req.destination_lng)
    return {
        "quote": quote,
        "mapbox_route": mapbox_info,
    }
