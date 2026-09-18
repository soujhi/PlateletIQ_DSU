import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
import httpx
from auth import get_current_user, create_access_token, DEMO_USER

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleTokenRequest(BaseModel):
    credential: Optional[str] = None
    code: Optional[str] = None


@router.get("/google/start")
def google_start():
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/auth/google/callback").strip()

    if client_id and client_id != "your_client_id_here":
        url = (
            f"https://accounts.google.com/o/oauth2/v2/auth?"
            f"client_id={client_id}&"
            f"redirect_uri={redirect_uri}&"
            f"response_type=code&"
            f"scope=openid%20email%20profile"
        )
        return {"data": {"redirect_url": url}, "error": None}

    return {"data": {"redirect_url": "/api/v1/auth/google/callback?code=demo-code"}, "error": None}


@router.post("/google/verify")
async def google_verify(req: GoogleTokenRequest):
    if req.credential:
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={req.credential}")
                if res.status_code == 200:
                    data = res.json()
                    user_info = {
                        "sub": data.get("sub"),
                        "email": data.get("email"),
                        "name": data.get("name", data.get("email")),
                        "picture": data.get("picture"),
                        "role": "OFFICER",
                        "bank_id": "TN-GGH-001",
                        "bank_name": "Govt. General Hospital Chennai",
                    }
                    token = create_access_token(user_info)
                    return {"data": {"token": token, "user": user_info}, "error": None}
        except Exception:
            pass

    token = create_access_token(DEMO_USER)
    return {"data": {"token": token, "user": DEMO_USER}, "error": None}


@router.get("/google/callback")
async def google_callback(code: Optional[str] = None):
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/auth/google/callback").strip()

    if code and code != "demo-code" and client_id and client_secret:
        try:
            async with httpx.AsyncClient() as client:
                token_res = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": code,
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    },
                )
                if token_res.status_code == 200:
                    tokens = token_res.json()
                    access_token = tokens.get("access_token")

                    user_res = await client.get(
                        "https://www.googleapis.com/oauth2/v3/userinfo",
                        headers={"Authorization": f"Bearer {access_token}"},
                    )
                    if user_res.status_code == 200:
                        data = user_res.json()
                        user_info = {
                            "sub": data.get("sub"),
                            "email": data.get("email"),
                            "name": data.get("name"),
                            "picture": data.get("picture"),
                            "role": "OFFICER",
                            "bank_id": "TN-GGH-001",
                            "bank_name": "Govt. General Hospital Chennai",
                        }
                        token = create_access_token(user_info)
                        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").strip()
                        return Response(
                            status_code=302,
                            headers={"Location": f"{frontend_url}/?token={token}"},
                        )
        except Exception:
            pass

    token = create_access_token(DEMO_USER)
    return {
        "data": {
            "token": token,
            "user": DEMO_USER,
        },
        "error": None,
    }


@router.post("/logout")
def logout(response: Response):
    return {"data": {"message": "Logged out successfully"}, "error": None}


class BankSwitchRequest(BaseModel):
    bank_id: str


@router.get("/hospitals")
def get_eraktkosh_hospitals():
    """Returns curated list of eRaktKosh registered Chennai & regional hospitals."""
    hospitals = [
        {"id": "TN-GGH-001", "code": "30090", "name": "Govt. General Hospital Chennai", "city": "Chennai", "district": "603", "state": "Tamil Nadu", "tier": "Government", "latitude": 13.0827, "longitude": 80.2707, "sdp_units": 48, "rdp_units": 140},
        {"id": "TN-APO-014", "code": "30099", "name": "Apollo Hospitals Greams Road", "city": "Chennai", "district": "603", "state": "Tamil Nadu", "tier": "Private Tertiary", "latitude": 13.0604, "longitude": 80.2496, "sdp_units": 14, "rdp_units": 42},
        {"id": "TN-STA-002", "code": "30091", "name": "Govt. Stanley Medical College Hospital", "city": "Chennai", "district": "603", "state": "Tamil Nadu", "tier": "Government", "latitude": 13.1042, "longitude": 80.2872, "sdp_units": 19, "rdp_units": 85},
        {"id": "TN-KMH-003", "code": "30092", "name": "Kilpauk Medical College Hospital", "city": "Chennai", "district": "603", "state": "Tamil Nadu", "tier": "Government", "latitude": 13.0789, "longitude": 80.2428, "sdp_units": 8, "rdp_units": 36},
        {"id": "TN-MGM-005", "code": "30269", "name": "MGM Healthcare Adyar", "city": "Chennai", "district": "603", "state": "Tamil Nadu", "tier": "Private Specialty", "latitude": 13.0084, "longitude": 80.2571, "sdp_units": 22, "rdp_units": 60},
        {"id": "TN-SIM-006", "code": "30173", "name": "MIOT International Hospital", "city": "Chennai", "district": "603", "state": "Tamil Nadu", "tier": "Private Multi-Specialty", "latitude": 13.0232, "longitude": 80.1873, "sdp_units": 16, "rdp_units": 50},
        {"id": "TN-FOR-007", "code": "30301", "name": "Billroth Hospitals Shenoy Nagar", "city": "Chennai", "district": "603", "state": "Tamil Nadu", "tier": "Private Tertiary", "latitude": 13.0772, "longitude": 80.2268, "sdp_units": 11, "rdp_units": 30},
        {"id": "TN-SRM-008", "code": "33125", "name": "Govt. Omandurar Medical College Hospital", "city": "Chennai", "district": "603", "state": "Tamil Nadu", "tier": "Government Super-Specialty", "latitude": 13.0678, "longitude": 80.2745, "sdp_units": 25, "rdp_units": 90},
    ]
    return {"data": hospitals, "error": None}


@router.post("/switch-bank")
def switch_bank(req: BankSwitchRequest):
    bank_id = req.bank_id
    bank_names = {
        "TN-GGH-001": "Govt. General Hospital Chennai",
        "TN-APO-014": "Apollo Hospitals Greams Road",
        "TN-STA-002": "Govt. Stanley Medical College Hospital",
        "TN-KMH-003": "Kilpauk Medical College Hospital",
        "TN-MGM-005": "MGM Healthcare Adyar",
        "TN-SIM-006": "MIOT International Hospital",
        "TN-FOR-007": "Billroth Hospitals Shenoy Nagar",
        "TN-SRM-008": "Govt. Omandurar Medical College Hospital",
    }
    bank_name = bank_names.get(bank_id, f"eRaktKosh Facility ({bank_id})")
    user_info = {
        "sub": f"officer-{bank_id.lower()}",
        "email": f"officer@{bank_id.lower().replace('-', '')}.eraktkosh.in",
        "name": f"Transfusion Officer ({bank_name})",
        "role": "OFFICER",
        "bank_id": bank_id,
        "bank_name": bank_name,
    }
    token = create_access_token(user_info)
    return {"data": {"token": token, "user": user_info}, "error": None}


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "data": current_user,
        "error": None,
    }


