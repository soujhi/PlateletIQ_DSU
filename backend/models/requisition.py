import datetime
from sqlalchemy import Column, String, DateTime, Integer, Float, Boolean, ForeignKey, Text
from database import Base


class Requisition(Base):
    __tablename__ = "requisitions"

    id = Column(String, primary_key=True)
    bank_id = Column(String, ForeignKey("banks.id"), nullable=False)
    request_ref = Column(String, unique=True, nullable=False)
    ward = Column(String, nullable=False)
    priority = Column(String, default="ROUTINE")  # ROUTINE | URGENT | EMERGENCY
    clinical_indication = Column(String, nullable=False)
    platelet_count = Column(Float, nullable=False)
    bleeding_status = Column(Boolean, default=False)
    units_requested = Column(Integer, default=1)
    component_requested = Column(String, default="RDP")  # RDP | SDP
    status = Column(String, default="PENDING")  # PENDING | FULFILLED | PARTIALLY_FULFILLED | CANCELLED
    concordance_flag = Column(Boolean, default=True)
    guideline_note = Column(Text, nullable=True)
    submitted_at = Column(DateTime, default=datetime.datetime.utcnow)
