import datetime
from sqlalchemy import Column, String, Float, Integer, DateTime, Text
from database import Base


class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(String, primary_key=True, index=True)
    transfer_id = Column(String, index=True, nullable=False)
    provider = Column(String, nullable=False, default="shiprocket")
    provider_order_id = Column(String, index=True, nullable=True)
    provider_shipment_id = Column(String, index=True, nullable=True)
    awb_code = Column(String, index=True, nullable=True)
    courier_name = Column(String, nullable=True)
    status = Column(String, nullable=False, default="DELIVERY_CREATED")
    source_hospital_id = Column(String, nullable=False)
    destination_hospital_id = Column(String, nullable=False)
    distance_km = Column(Float, nullable=True)
    estimated_minutes = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    picked_up_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)


class TrackingEvent(Base):
    __tablename__ = "tracking_events"

    id = Column(String, primary_key=True, index=True)
    shipment_id = Column(String, index=True, nullable=False)
    provider = Column(String, nullable=False, default="shiprocket")
    provider_event_id = Column(String, unique=True, index=True, nullable=True)
    status = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_name = Column(String, nullable=True)
    event_timestamp = Column(DateTime, nullable=False)
    received_at = Column(DateTime, default=datetime.datetime.utcnow)
    raw_payload_hash = Column(String, nullable=True)
