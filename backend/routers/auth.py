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


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "data": current_user,
        "error": None,
    }
