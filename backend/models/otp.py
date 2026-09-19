import datetime
from sqlalchemy import Column, String, Integer, DateTime
from database import Base


class OTPChallenge(Base):
    """
    A one-time code issued by the SENDING facility.

    Only the plaintext is handed back to the issuer, once, at generation time;
    the database holds only an HMAC-SHA256 digest. ``issued_by_bank_id`` and
    ``verifier_bank_id`` are what let the API refuse a verification attempt
    from the wrong side of the transfer.
    """

    __tablename__ = "otp_challenges"

    id = Column(String, primary_key=True, index=True)
    transfer_id = Column(String, index=True, nullable=False)
    shipment_id = Column(String, index=True, nullable=True)
    purpose = Column(String, nullable=False)  # RELEASE | PICKUP | DELIVERY
    code_hash = Column(String, nullable=False)
    issued_by_bank_id = Column(String, nullable=True)   # who generated it (sender)
    verifier_bank_id = Column(String, nullable=True)    # who is allowed to enter it
    expires_at = Column(DateTime, nullable=False)
    max_attempts = Column(Integer, default=3)
    attempt_count = Column(Integer, default=0)
    used_at = Column(DateTime, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
