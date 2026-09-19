"""
Google sign-in, then facility selection.

``POST /auth/google/verify`` (Google Identity Services one-tap / button) and
``GET /auth/google/callback`` (classic redirect flow) both end at the same
place: an **identity token** with no facility attached. The client then calls
``POST /auth/select-facility`` to get a facility-bound token.

``ALLOW_DEV_SIGNIN=1`` enables a passwordless local sign-in for two-laptop
testing without Google credentials. It is off unless explicitly set, and the
health endpoint reports when it is on.
"""

import datetime
import os
import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, get_current_user
from database import get_db
from models.bank import Bank, BankMembership

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

ALLOW_DEV_SIGNIN = os.getenv("ALLOW_DEV_SIGNIN", "0") == "1"


def _google_client_id() -> str:
    value = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    return "" if value in ("", "your_client_id_here") else value


def _google_client_secret() -> str:
    value = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    return "" if value in ("", "your_client_secret_here") else value


def _redirect_uri() -> str:
    return os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/auth/google/callback").strip()


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/")


def _identity_token(sub: str, email: str, name: str, picture: str = None) -> dict:
    """An authenticated identity with no facility bound yet."""
    claims = {
        "sub": sub,
        "email": email,
        "name": name or email,
        "picture": picture,
        "bank_id": None,
        "bank_name": None,
        "role": None,
    }
    return {
        "token": create_access_token(claims),
        "user": claims,
        "facility_required": True,
        "expires_in_minutes": ACCESS_TOKEN_EXPIRE_MINUTES,
    }


# ── Google ───────────────────────────────────────────────────────────────────

class GoogleTokenRequest(BaseModel):
    credential: str


@router.get("/google/start")
def google_start():
    """Where the browser should send the user to begin the redirect flow."""
    client_id = _google_client_id()
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured on this server (GOOGLE_CLIENT_ID is unset).",
        )
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={_redirect_uri()}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&prompt=select_account"
    )
    return {"data": {"redirect_url": url}, "error": None}


@router.post("/google/verify")
async def google_verify(req: GoogleTokenRequest):
    """
    Validate a Google Identity Services ID token.

    The token is checked against Google's tokeninfo endpoint and its ``aud``
    claim must match this server's client id — otherwise an ID token minted
    for a different application would be accepted here.
    """
    client_id = _google_client_id()
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured on this server (GOOGLE_CLIENT_ID is unset).",
        )

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            res = await client.get(GOOGLE_TOKENINFO_URL, params={"id_token": req.credential})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Google to verify sign-in: {exc}")

    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Google rejected this sign-in token.")

    claims = res.json()

    if claims.get("aud") != client_id:
        raise HTTPException(status_code=401, detail="This sign-in token was issued for a different application.")
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=401, detail="Unexpected token issuer.")
    if claims.get("email_verified") not in ("true", True):
        raise HTTPException(status_code=401, detail="This Google account has no verified email address.")

    return {
        "data": _identity_token(
            sub=claims["sub"],
            email=claims.get("email", ""),
            name=claims.get("name", ""),
            picture=claims.get("picture"),
        ),
        "error": None,
    }


@router.get("/google/callback")
async def google_callback(code: Optional[str] = None, error: Optional[str] = None):
    """Redirect-flow landing point. Exchanges the code, then bounces to the UI."""
    frontend = _frontend_url()

    if error:
        return Response(status_code=302, headers={"Location": f"{frontend}/?auth_error={error}"})

    client_id, client_secret = _google_client_id(), _google_client_secret()
    if not code or not client_id or not client_secret:
        return Response(
            status_code=302,
            headers={"Location": f"{frontend}/?auth_error=google_not_configured"},
        )

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            token_res = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": _redirect_uri(),
                    "grant_type": "authorization_code",
                },
            )
            if token_res.status_code != 200:
                return Response(
                    status_code=302,
                    headers={"Location": f"{frontend}/?auth_error=token_exchange_failed"},
                )

            access_token = token_res.json().get("access_token")
            user_res = await client.get(
                GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
            )
            if user_res.status_code != 200:
                return Response(
                    status_code=302,
                    headers={"Location": f"{frontend}/?auth_error=userinfo_failed"},
                )
    except httpx.HTTPError:
        return Response(status_code=302, headers={"Location": f"{frontend}/?auth_error=google_unreachable"})

    profile = user_res.json()
    issued = _identity_token(
        sub=profile["sub"],
        email=profile.get("email", ""),
        name=profile.get("name", ""),
        picture=profile.get("picture"),
    )
    return Response(status_code=302, headers={"Location": f"{frontend}/?token={issued['token']}"})


# ── Development sign-in (off by default) ─────────────────────────────────────

class DevSignInRequest(BaseModel):
    email: str
    name: Optional[str] = None


@router.post("/dev-signin")
def dev_signin(req: DevSignInRequest):
    """
    Passwordless sign-in for local two-laptop testing.

    Returns an identity token exactly like Google does, so the facility
    selection step that follows is identical. Requires ``ALLOW_DEV_SIGNIN=1``.
    """
    if not ALLOW_DEV_SIGNIN:
        raise HTTPException(
            status_code=404,
            detail="Development sign-in is disabled. Set ALLOW_DEV_SIGNIN=1 to enable it.",
        )
    email = req.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")

    return {
        "data": _identity_token(
            sub=f"dev:{email}",
            email=email,
            name=req.name or email.split("@")[0].replace(".", " ").title(),
        ),
        "error": None,
    }


# ── Facility binding ─────────────────────────────────────────────────────────

class SelectFacilityRequest(BaseModel):
    facility_id: str
    role: str = "OFFICER"


@router.post("/select-facility")
def select_facility(
    req: SelectFacilityRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Bind this session to a registered facility and re-issue the token.

    The membership is recorded so the same user lands on the same facility next
    time, and so an audit trail exists for who acted on whose stock.
    """
    facility = db.query(Bank).filter(Bank.id == req.facility_id, Bank.active.is_(True)).first()
    if not facility:
        raise HTTPException(
            status_code=404, detail=f"Facility {req.facility_id} is not in the registry."
        )

    role = req.role.upper()
    if role not in ("TECHNICIAN", "OFFICER", "COMMITTEE", "ADMIN"):
        raise HTTPException(status_code=400, detail="Unknown role.")

    user_id = current_user["sub"]
    membership = (
        db.query(BankMembership)
        .filter(BankMembership.user_id == user_id, BankMembership.bank_id == facility.id)
        .first()
    )
    if membership:
        membership.role = role
        membership.active = True
    else:
        db.add(
            BankMembership(
                id=str(uuid.uuid4()),
                user_id=user_id,
                email=current_user.get("email"),
                bank_id=facility.id,
                role=role,
                active=True,
            )
        )
    db.commit()

    claims = {
        "sub": user_id,
        "email": current_user.get("email"),
        "name": current_user.get("name"),
        "picture": current_user.get("picture"),
        "bank_id": facility.id,
        "bank_name": facility.name,
        "role": role,
    }
    return {
        "data": {
            "token": create_access_token(claims),
            "user": claims,
            "facility": facility.as_dict(),
            "facility_required": False,
        },
        "error": None,
    }


@router.get("/memberships")
def my_memberships(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Facilities this user has signed in at before, most useful first."""
    rows = (
        db.query(BankMembership, Bank)
        .join(Bank, Bank.id == BankMembership.bank_id)
        .filter(BankMembership.user_id == current_user["sub"], BankMembership.active.is_(True))
        .all()
    )
    return {
        "data": [
            {"role": membership.role, "facility": bank.as_dict()} for membership, bank in rows
        ],
        "error": None,
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "data": {**current_user, "facility_required": not current_user.get("bank_id")},
        "error": None,
    }


@router.post("/logout")
def logout():
    """Tokens are stateless; the client discards it. Here for symmetry."""
    return {"data": {"message": "Signed out."}, "error": None}


@router.get("/config")
def auth_config():
    """What sign-in methods this server actually has configured."""
    return {
        "data": {
            "google_client_id": _google_client_id() or None,
            "google_enabled": bool(_google_client_id()),
            "dev_signin_enabled": ALLOW_DEV_SIGNIN,
        },
        "error": None,
    }
