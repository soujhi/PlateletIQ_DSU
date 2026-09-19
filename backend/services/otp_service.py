"""
Handover OTPs.

Every OTP in a transfer is **issued by the sending facility** and **entered by
a different party**:

  ``PICKUP``   — issued by the sender, read out to the rider at the door. The
                 sender confirms it on their own console, which is what
                 releases custody to the courier.
  ``DELIVERY`` — issued by the sender at dispatch and carried to the receiver
                 out of band. Only the **receiving** facility can verify it,
                 which is what settles the units onto their ledger.
  ``RELEASE``  — optional second-officer approval on the sending side.

The plaintext is returned exactly once, to the issuer. The database stores only
an HMAC-SHA256 digest keyed with ``OTP_SECRET``, so a database read cannot
reveal a live code. ``verifier_bank_id`` is checked on every attempt, so a
facility cannot verify an OTP that was not addressed to it — that check is what
makes the two-console handshake meaningful rather than decorative.
"""

import datetime
import hashlib
import hmac
import os
import secrets
import uuid
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from models.otp import OTPChallenge

OTP_SECRET = os.getenv("OTP_SECRET", "")
OTP_LENGTH = int(os.getenv("OTP_LENGTH", "6"))
OTP_EXPIRY_SECONDS = int(os.getenv("OTP_EXPIRY_SECONDS", "1800"))  # 30 minutes
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
OTP_MAX_PER_HOUR = int(os.getenv("OTP_MAX_PER_HOUR", "8"))

VALID_PURPOSES = ("RELEASE", "PICKUP", "DELIVERY")

if not OTP_SECRET:
    # Without a stable secret across restarts, previously issued codes stop
    # verifying. Generate one so development still works, but say so loudly.
    OTP_SECRET = secrets.token_hex(32)
    print(
        "WARNING: OTP_SECRET is not set. A random per-process secret was generated, "
        "so OTPs issued before a restart will no longer verify. Set OTP_SECRET in .env."
    )


class OTPError(Exception):
    """Raised when an OTP cannot be issued (rate limit, bad purpose)."""


def _digest(code: str) -> str:
    return hmac.new(OTP_SECRET.encode("utf-8"), code.strip().encode("utf-8"), hashlib.sha256).hexdigest()


def _random_code() -> str:
    """Uniform random digits from the CSPRNG (``random`` is not safe here)."""
    return "".join(str(secrets.randbelow(10)) for _ in range(OTP_LENGTH))


def generate_otp_challenge(
    db: Session,
    transfer_id: str,
    purpose: str,
    issued_by_bank_id: str,
    verifier_bank_id: str,
    shipment_id: Optional[str] = None,
    created_by: str = "system",
) -> Tuple[str, str, datetime.datetime]:
    """
    Issue a code for ``transfer_id``.

    Returns ``(challenge_id, plaintext_code, expires_at)``. The plaintext is
    never persisted and never returned again.
    """
    purpose = purpose.upper()
    if purpose not in VALID_PURPOSES:
        raise OTPError(f"OTP purpose must be one of {', '.join(VALID_PURPOSES)}.")

    now = datetime.datetime.utcnow()

    recent = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.transfer_id == transfer_id,
            OTPChallenge.created_at >= now - datetime.timedelta(hours=1),
        )
        .count()
    )
    if recent >= OTP_MAX_PER_HOUR:
        raise OTPError(
            f"OTP rate limit reached: at most {OTP_MAX_PER_HOUR} codes per hour per transfer."
        )

    # Re-issuing supersedes any live code for the same purpose.
    superseded = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.transfer_id == transfer_id,
            OTPChallenge.purpose == purpose,
            OTPChallenge.used_at.is_(None),
        )
        .all()
    )
    for challenge in superseded:
        challenge.used_at = now

    code = _random_code()
    challenge = OTPChallenge(
        id=f"OTP-{uuid.uuid4().hex[:10].upper()}",
        transfer_id=transfer_id,
        shipment_id=shipment_id,
        purpose=purpose,
        code_hash=_digest(code),
        issued_by_bank_id=issued_by_bank_id,
        verifier_bank_id=verifier_bank_id,
        expires_at=now + datetime.timedelta(seconds=OTP_EXPIRY_SECONDS),
        max_attempts=OTP_MAX_ATTEMPTS,
        attempt_count=0,
        created_by=created_by,
        created_at=now,
    )
    db.add(challenge)
    db.commit()

    return challenge.id, code, challenge.expires_at


def verify_otp_challenge(
    db: Session,
    transfer_id: str,
    purpose: str,
    code: str,
    verifying_bank_id: str,
) -> Dict[str, Any]:
    """
    Check ``code`` against the live challenge for ``(transfer_id, purpose)``.

    Returns ``{"valid": bool, "reason": str, "attempts_remaining": int|None}``.
    A wrong-facility attempt is rejected without burning an attempt, so one
    console cannot lock another console out.
    """
    now = datetime.datetime.utcnow()
    purpose = purpose.upper()

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
        return {
            "valid": False,
            "reason": f"No active {purpose} code for this transfer. Ask the sending facility to issue one.",
            "attempts_remaining": None,
        }

    if challenge.verifier_bank_id and challenge.verifier_bank_id != verifying_bank_id:
        return {
            "valid": False,
            "reason": f"This {purpose} code can only be entered by facility {challenge.verifier_bank_id}.",
            "attempts_remaining": None,
        }

    if now > challenge.expires_at:
        return {
            "valid": False,
            "reason": "This code has expired. Ask the sending facility to issue a new one.",
            "attempts_remaining": 0,
        }

    if challenge.attempt_count >= challenge.max_attempts:
        return {
            "valid": False,
            "reason": f"Locked after {challenge.max_attempts} failed attempts. A new code must be issued.",
            "attempts_remaining": 0,
        }

    challenge.attempt_count += 1
    db.commit()

    if not hmac.compare_digest(_digest(code), challenge.code_hash):
        remaining = challenge.max_attempts - challenge.attempt_count
        return {
            "valid": False,
            "reason": f"Incorrect code. {remaining} attempt(s) remaining.",
            "attempts_remaining": remaining,
        }

    challenge.used_at = now
    db.commit()
    return {"valid": True, "reason": f"{purpose} code verified.", "attempts_remaining": None}


def get_active_challenge(db: Session, transfer_id: str, purpose: str) -> Optional[OTPChallenge]:
    """Metadata for the live challenge — never the code itself."""
    return (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.transfer_id == transfer_id,
            OTPChallenge.purpose == purpose.upper(),
            OTPChallenge.used_at.is_(None),
        )
        .order_by(OTPChallenge.created_at.desc())
        .first()
    )
