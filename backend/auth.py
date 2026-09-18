import os
import datetime
from typing import Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

SECRET_KEY = os.getenv("JWT_SECRET", "plateletiq-demo-secret-key-3day-hackathon-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

security = HTTPBearer(auto_error=False)

DEMO_USER = {
    "sub": "demo-user-001",
    "email": "demo@plateletiq.dev",
    "name": "Demo Officer",
    "role": "OFFICER",
    "bank_id": "TN-GGH-001",
    "bank_name": "Govt. General Hospital Chennai",
}


def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)):
    if not credentials:
        # Fallback to demo user if APP_ENV == demo or token omitted in demo mode
        app_env = os.getenv("APP_ENV", "demo")
        if app_env.lower() in ["demo", "development", "dev"]:
            return DEMO_USER
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        # In demo mode, fallback gracefully if token fails
        app_env = os.getenv("APP_ENV", "demo")
        if app_env.lower() in ["demo", "development", "dev"]:
            return DEMO_USER
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
