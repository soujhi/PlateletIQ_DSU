import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base


class InventoryUnit(Base):
    __tablename__ = "inventory_units"

    id = Column(String, primary_key=True)
    bank_id = Column(String, ForeignKey("banks.id"), nullable=False)
    bag_id = Column(String, unique=True, nullable=False)
    component_type = Column(String, default="RDP")  # RDP | SDP | UNKNOWN
    blood_group = Column(String, nullable=False)  # A+, A-, B+, B-, AB+, AB-, O+, O-
    collection_at = Column(DateTime, nullable=False)
    expiry_at = Column(DateTime, nullable=False)
    status = Column(String, default="AVAILABLE")  # AVAILABLE | RESERVED | ISSUED | EXPIRED | DISCARDED | TRANSFER_PENDING | TRANSFERRED_OUT | NON_CLINICAL
    source_type = Column(String, default="SEEDED")  # OPERATIONAL | SEEDED
    version = Column(Integer, default=1)

    events = relationship("InventoryEvent", back_populates="unit")


class InventoryEvent(Base):
    __tablename__ = "inventory_events"

    id = Column(String, primary_key=True)
    unit_id = Column(String, ForeignKey("inventory_units.id"), nullable=False)
    bank_id = Column(String, ForeignKey("banks.id"), nullable=False)
    event_type = Column(String, nullable=False)  # REGISTERED | ISSUED | DISCARDED | TRANSFERRED | RESERVED | EXPIRED
    actor_user_id = Column(String, nullable=False)
    occurred_at = Column(DateTime, default=datetime.datetime.utcnow)
    reason = Column(String, nullable=True)
    metadata_json = Column(Text, nullable=True)

    unit = relationship("InventoryUnit", back_populates="events")
