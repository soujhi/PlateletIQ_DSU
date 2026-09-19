"""
Session tokens.

Sign-in happens in two steps, and the JWT reflects which one you are at:

  1. **Identity** — Google returns who you are. The token carries ``sub``,
     ``email``, ``name`` and **no** ``bank_id``.
  2. **Facility** — you pick which registered facility you are on duty at.
     A fresh token is issued carrying ``bank_id`` and ``bank_name``.

Every transfer endpoint reads ``bank_id`` off the token, so a session that has
not chosen a facility simply cannot act on stock. There is no ambient default
facility: an unbound token gets a 403 telling it to choose one.
"""

import datetime
import os
import secrets
from typing import Optional

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 12)))

SECRET_KEY = os.getenv("JWT_SECRET", "")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_hex(32)
    print(
        "WARNING: JWT_SECRET is not set. A random per-process secret was generated, "
        "so every session is invalidated on restart. Set JWT_SECRET in .env."
    )

security = HTTPBearer(auto_error=False)


def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    payload = data.copy()
    payload["exp"] = datetime.datetime.utcnow() + (
        expires_delta or datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> dict:
    """The signed-in user. Rejects a missing, malformed, or expired token."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return decode_access_token(credentials.credentials)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Session is not valid: {exc}. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_facility(current_user: dict = Depends(get_current_user)) -> dict:
    """Like ``get_current_user``, but insists a facility has been chosen."""
    if not current_user.get("bank_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No facility selected for this session. Choose a facility to continue.",
        )
    return current_user
