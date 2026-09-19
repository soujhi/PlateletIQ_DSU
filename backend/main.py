import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

import datetime
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from database import Base, SessionLocal, engine
from migrations import ensure_schema
from routers import (
    analytics_router,
    auth_router,
    camp_router,
    facilities_router,
    forecast_router,
    inventory_router,
    network_router,
    recommendation_router,
    requisitions_router,
    transfers_router,
    transport_router,
    webhooks_router,
)

API_PREFIX = "/api/v1"

app = FastAPI(
    title="PlateletIQ API",
    description=(
        "Platelet inventory, demand forecasting, and inter-facility transfer logistics "
        "for eRaktKosh-registered blood centres."
    ),
    version="3.0.0",
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    print(
        f"[{datetime.datetime.utcnow().isoformat()}] "
        f"{request.method} {request.url.path} -> {response.status_code} ({elapsed_ms}ms)"
    )
    return response


def _allowed_origins() -> list:
    """
    Browser origins allowed to call this API.

    Two-laptop testing runs the UI from another machine's LAN address, so set
    ALLOWED_ORIGINS to include it, e.g.
        ALLOWED_ORIGINS=http://localhost:5173,http://192.168.1.42:5173
    ALLOWED_ORIGIN_REGEX covers a whole private range in one entry, e.g.
        ALLOWED_ORIGIN_REGEX=http://192\\.168\\.1\\.\\d{1,3}:5173
    """
    configured = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX") or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(facilities_router, prefix=API_PREFIX)
app.include_router(inventory_router, prefix=API_PREFIX)
app.include_router(forecast_router, prefix=API_PREFIX)
app.include_router(recommendation_router, prefix=API_PREFIX)
app.include_router(requisitions_router, prefix=API_PREFIX)
app.include_router(transfers_router, prefix=API_PREFIX)
app.include_router(network_router, prefix=API_PREFIX)
app.include_router(analytics_router, prefix=API_PREFIX)
app.include_router(camp_router, prefix=API_PREFIX)
app.include_router(transport_router, prefix=API_PREFIX)
app.include_router(webhooks_router, prefix=API_PREFIX)


@app.on_event("startup")
def startup() -> None:
    """Bring the schema up to date, then make sure the registry is populated."""
    Base.metadata.create_all(bind=engine)
    ensure_schema(engine)

    db = SessionLocal()
    try:
        from services.config_service import init_default_config
        from services.facility_seed import mark_expired_units, seed_all_inventory, seed_facilities

        facilities = seed_facilities(db)
        inventory = seed_all_inventory(db)
        expired = mark_expired_units(db)
        init_default_config(db)

        print(
            f"Registry ready: {facilities['created']} facility/facilities created, "
            f"{facilities['refreshed']} refreshed; "
            f"{inventory['units_created']} unit(s) seeded across "
            f"{inventory['facilities_seeded']} facility/facilities; "
            f"{expired} expired unit(s) retired."
        )
    except Exception as exc:
        # A seeding failure must be visible, not silent — an empty registry
        # means the facility picker comes up blank.
        print(f"STARTUP ERROR while preparing the registry: {exc!r}")
        raise
    finally:
        db.close()


@app.get(f"{API_PREFIX}/health")
def health_check():
    """Dependency health, plus which integrations are actually configured."""
    checks = {}

    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        from models.bank import Bank

        checks["database"] = "ok"
        checks["facilities_registered"] = db.query(Bank).count()
        db.close()
    except Exception as exc:
        checks["database"] = f"error: {exc}"
        checks["facilities_registered"] = 0

    try:
        from routers.forecast import get_model

        get_model()
        checks["forecast_model"] = "ok"
    except Exception as exc:
        checks["forecast_model"] = f"unavailable: {exc}"

    transport_mode = os.getenv("TRANSPORT_MODE", "mock").lower()
    shiprocket_configured = bool(os.getenv("SHIPROCKET_EMAIL") and os.getenv("SHIPROCKET_PASSWORD"))

    integrations = {
        # Says plainly whether courier calls hit Shiprocket or the simulator.
        "courier": "shiprocket_live" if (transport_mode == "live" and shiprocket_configured) else "simulated",
        "courier_webhook": "enabled" if os.getenv("SHIPROCKET_WEBHOOK_TOKEN") else "disabled",
        "routing": "mapbox" if os.getenv("MAPBOX_ACCESS_TOKEN") else "osrm_public",
        "google_signin": "enabled" if os.getenv("GOOGLE_CLIENT_ID") else "not_configured",
        "dev_signin": "enabled" if os.getenv("ALLOW_DEV_SIGNIN") == "1" else "disabled",
        "jwt_secret": "configured" if os.getenv("JWT_SECRET") else "ephemeral",
        "otp_secret": "configured" if os.getenv("OTP_SECRET") else "ephemeral",
    }

    healthy = checks["database"] == "ok" and checks["facilities_registered"] > 0

    return {
        "status": "ok" if healthy else "degraded",
        "checks": checks,
        "integrations": integrations,
        "environment": os.getenv("APP_ENV", "development"),
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }
