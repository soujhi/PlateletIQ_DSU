import datetime
from sqlalchemy import Column, String, DateTime, Integer, Float, ForeignKey
from database import Base


class TransferOpportunity(Base):
    __tablename__ = "transfer_opportunities"

    id = Column(String, primary_key=True)
    source_bank_id = Column(String, nullable=False)
    source_bank_name = Column(String, nullable=True)
    destination_bank_id = Column(String, ForeignKey("banks.id"), nullable=False)
    component_type = Column(String, default="SDP")
    potential_quantity = Column(Integer, nullable=False)
    source_freshness_hours = Column(Float, default=12.0)
    destination_risk_score = Column(Float, default=0.5)
    expiry_window_hours = Column(Float, default=72.0)
    status = Column(String, default="OPEN")  # OPEN | REVIEWED | OFFERED | EXPIRED | CLOSED
    reason_summary = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class TransferOffer(Base):
    __tablename__ = "transfer_offers"

    id = Column(String, primary_key=True)
    opportunity_id = Column(String, ForeignKey("transfer_opportunities.id"), nullable=False)
    source_bank_id = Column(String, nullable=False)
    destination_bank_id = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    status = Column(String, default="PENDING")  # PENDING | ACCEPTED | DECLINED | COMPLETED | CANCELLED
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
