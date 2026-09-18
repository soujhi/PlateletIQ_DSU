import os
import uuid
import hmac
import hashlib
import datetime
import random
from typing import Tuple, Dict, Any, Optional
from sqlalchemy.orm import Session
from models.otp import OTPChallenge

OTP_SECRET = os.getenv("OTP_SECRET", "plateletiq_production_secret_key_2026_x99")
OTP_EXPIRY_SECONDS = int(os.getenv("OTP_EXPIRY_SECONDS", "600"))  # 10 minutes
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "3"))


def _hash_otp(code: str) -> str:
    """Compute HMAC-SHA256 hash of plaintext OTP using server secret."""
    secret_bytes = OTP_SECRET.encode("utf-8")
    code_bytes = code.strip().encode("utf-8")
    return hmac.new(secret_bytes, code_bytes, hashlib.sha256).hexdigest()


def generate_otp_challenge(
    db: Session,
    transfer_id: str,
    purpose: str,  # RELEASE | PICKUP | DELIVERY
    shipment_id: Optional[str] = None,
    created_by: str = "system",
) -> Tuple[str, str]:
    """
    Generates a secure 6-digit OTP, stores its HMAC-SHA256 hash in database,
    and returns (challenge_id, plaintext_code). Plaintext code is ONLY returned to caller
    for initial transmission and is NEVER stored in database.
    Enforces a strict rate limit of max 3 challenges per hour per transfer.
    """
    purpose_upper = purpose.upper()
    if purpose_upper not in ("RELEASE", "PICKUP", "DELIVERY"):
        raise ValueError("OTP purpose must be one of 'RELEASE', 'PICKUP', or 'DELIVERY'.")

    now = datetime.datetime.utcnow()
    one_hour_ago = now - datetime.timedelta(hours=1)

    # 1. Enforce Rate Limit: max 3 challenges generated per hour per transfer
    recent_count = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.transfer_id == transfer_id,
            OTPChallenge.created_at >= one_hour_ago,
        )
        .count()
    )
    if recent_count >= 3:
        raise ValueError("OTP rate limit exceeded: Maximum 3 OTP challenges per hour allowed per transfer.")

    # 2. Invalidate any existing active challenges for this transfer & purpose
    existing = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.transfer_id == transfer_id,
            OTPChallenge.purpose == purpose_upper,
            OTPChallenge.used_at.is_(None),
        )
        .all()
    )
    for old in existing:
        old.used_at = now

    plaintext_code = f"{random.randint(100000, 999999)}"
    code_hash = _hash_otp(plaintext_code)
    expires_at = now + datetime.timedelta(seconds=OTP_EXPIRY_SECONDS)

    challenge = OTPChallenge(
        id=f"OTP-{uuid.uuid4().hex[:8].upper()}",
        transfer_id=transfer_id,
        shipment_id=shipment_id,
        purpose=purpose_upper,
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
    Verifies a plaintext OTP code against stored HMAC-SHA256 hash using timing-safe compare_digest.
    Enforces expiration, attempt counter, and single-use invalidation.
    Returns {"valid": bool, "reason": str}.
    """
    now = datetime.datetime.utcnow()
    purpose_upper = purpose.upper()

    challenge = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.transfer_id == transfer_id,
            OTPChallenge.purpose == purpose_upper,
            OTPChallenge.used_at.is_(None),
        )
        .order_by(OTPChallenge.created_at.desc())
        .first()
    )

    if not challenge:
        return {"valid": False, "reason": f"No active {purpose_upper} OTP challenge found for transfer."}

    if challenge.used_at is not None:
        return {"valid": False, "reason": "OTP has already been used."}

    if now > challenge.expires_at:
        return {"valid": False, "reason": "OTP has expired. Please request a new OTP code."}

    if challenge.attempt_count >= challenge.max_attempts:
        return {"valid": False, "reason": f"Maximum OTP attempts ({challenge.max_attempts}) exceeded. Challenge locked."}

    # Increment attempt counter transactionally
    challenge.attempt_count += 1
    db.commit()

    attempt_hash = _hash_otp(code)
    # Timing-safe cryptographic comparison
    if not hmac.compare_digest(attempt_hash, challenge.code_hash):
        remaining = challenge.max_attempts - challenge.attempt_count
        return {
            "valid": False,
            "reason": f"Invalid OTP code. {remaining} attempt(s) remaining.",
        }

    # Mark OTP as successfully used
    challenge.used_at = now
    db.commit()

    return {"valid": True, "reason": f"{purpose_upper} OTP verified successfully."}
