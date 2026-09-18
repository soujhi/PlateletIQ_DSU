import datetime
from sqlalchemy import Column, String, Integer, DateTime, Boolean
from database import Base


class OTPChallenge(Base):
    __tablename__ = "otp_challenges"

    id = Column(String, primary_key=True, index=True)
    transfer_id = Column(String, index=True, nullable=False)
    shipment_id = Column(String, index=True, nullable=True)
    purpose = Column(String, nullable=False)  # PICKUP | DELIVERY
    code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    max_attempts = Column(Integer, default=3)
    attempt_count = Column(Integer, default=0)
    used_at = Column(DateTime, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
