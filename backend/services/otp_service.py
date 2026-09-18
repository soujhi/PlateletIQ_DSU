import os
import uuid
import hashlib
import datetime
import random
from typing import Tuple, Dict, Any, Optional
from sqlalchemy.orm import Session
from models.otp import OTPChallenge

OTP_SECRET = os.getenv("OTP_SECRET", "plateletiq_secret_otp_key_2026")
OTP_EXPIRY_SECONDS = int(os.getenv("OTP_EXPIRY_SECONDS", "600"))  # 10 minutes
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "3"))


def _hash_otp(code: str) -> str:
    """Compute SHA-256 hash of plaintext OTP combined with server secret."""
    combined = f"{code}:{OTP_SECRET}".encode("utf-8")
    return hashlib.sha256(combined).hexdigest()


def generate_otp_challenge(
    db: Session,
    transfer_id: str,
    purpose: str,  # PICKUP | DELIVERY
    shipment_id: Optional[str] = None,
    created_by: str = "system",
) -> Tuple[str, str]:
    """
    Generates a secure 6-digit OTP, stores its SHA-256 hash in database,
    and returns (challenge_id, plaintext_code). Plaintext code is ONLY returned to caller
    for initial transmission and is NEVER stored in database.
    """
    if purpose not in ("PICKUP", "DELIVERY"):
        raise ValueError("OTP purpose must be either 'PICKUP' or 'DELIVERY'.")

    # Invalidate any existing active challenges for this transfer & purpose
    existing = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.transfer_id == transfer_id,
            OTPChallenge.purpose == purpose,
            OTPChallenge.used_at.is_(None),
        )
        .all()
    )
    now = datetime.datetime.utcnow()
    for old in existing:
        old.used_at = now

    plaintext_code = f"{random.randint(100000, 999999)}"
    code_hash = _hash_otp(plaintext_code)
    expires_at = now + datetime.timedelta(seconds=OTP_EXPIRY_SECONDS)

    challenge = OTPChallenge(
        id=f"OTP-{uuid.uuid4().hex[:8].upper()}",
        transfer_id=transfer_id,
        shipment_id=shipment_id,
        purpose=purpose,
        code_hash=code_hash,
        expires_at=expires_at,
        max_attempts=OTP_MAX_ATTEMPTS,
        attempt_count=0,
        used_at=None,
        created_by=created_by,
        created_at=now,
    )
    db.add(challenge)
    db.commit()

    return challenge.id, plaintext_code


def verify_otp_challenge(
    db: Session,
    transfer_id: str,
    purpose: str,
    code: str,
) -> Dict[str, Any]:
    """
    Verifies a plaintext OTP code against stored SHA-256 hash.
    Enforces expiration, attempt counter, and single-use invalidation.
    Returns {"valid": bool, "reason": str}.
    """
    now = datetime.datetime.utcnow()
    challenge = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.transfer_id == transfer_id,
            OTPChallenge.purpose == purpose,
            OTPChallenge.used_at.is_(None),
        )
        .order_by(OTPChallenge.created_at.desc())
        .first()
    )

    if not challenge:
        return {"valid": False, "reason": f"No active {purpose} OTP challenge found for transfer."}

    if challenge.used_at is not None:
        return {"valid": False, "reason": "OTP has already been used."}

    if now > challenge.expires_at:
        return {"valid": False, "reason": "OTP has expired. Please request a new OTP code."}

    if challenge.attempt_count >= challenge.max_attempts:
        return {"valid": False, "reason": f"Maximum OTP attempts ({challenge.max_attempts}) exceeded. Challenge locked."}

    # Increment attempt counter
    challenge.attempt_count += 1
    db.commit()

    attempt_hash = _hash_otp(code.strip())
    if attempt_hash != challenge.code_hash:
        remaining = challenge.max_attempts - challenge.attempt_count
        return {
            "valid": False,
            "reason": f"Invalid OTP code. {remaining} attempt(s) remaining.",
        }

    # Mark OTP as successfully used
    challenge.used_at = now
    db.commit()

    return {"valid": True, "reason": "OTP verified successfully."}
