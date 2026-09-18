import os
import time
import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from database import engine, Base, SessionLocal
from routers import (
    auth_router,
    inventory_router,
    forecast_router,
    recommendation_router,
    requisitions_router,
    transfers_router,
    network_router,
    analytics_router,
    camp_router,
    transport_router,
)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PlateletIQ API",
    description="Backend API for PlateletIQ Blood Bank Inventory & Demand Forecasting Platform",
    version="2.0.0",
)

# Request duration logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = round((time.time() - start_time) * 1000, 2)
    print(f"[{datetime.datetime.utcnow().isoformat()}] {request.method} {request.url.path} - {response.status_code} ({duration}ms)")
    return response

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all routers under /api/v1
API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(inventory_router, prefix=API_PREFIX)
app.include_router(forecast_router, prefix=API_PREFIX)
app.include_router(recommendation_router, prefix=API_PREFIX)
app.include_router(requisitions_router, prefix=API_PREFIX)
app.include_router(transfers_router, prefix=API_PREFIX)
app.include_router(network_router, prefix=API_PREFIX)
app.include_router(analytics_router, prefix=API_PREFIX)
app.include_router(camp_router, prefix=API_PREFIX)
app.include_router(transport_router, prefix=API_PREFIX)


from sqlalchemy import text

@app.get(f"{API_PREFIX}/health")
def health_check():
    db_status = "ok"
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception as e:
        db_status = f"error: {str(e)}"

    model_status = "ok"
    try:
        from routers.forecast import get_model
        get_model()
    except Exception:
        model_status = "error"

    eraktkosh_status = "ok"
    try:
        eraktkosh_path = os.path.join(os.path.dirname(__file__), "eraktkosh.db")
        if not os.path.exists(eraktkosh_path):
            eraktkosh_status = "missing"
    except Exception:
        eraktkosh_status = "error"

    is_healthy = db_status == "ok" and model_status == "ok"

    return {
        "status": "ok" if is_healthy else "degraded",
        "api": "ok",
        "database": db_status,
        "model": model_status,
        "eraktkosh": eraktkosh_status,
        "environment": os.getenv("APP_ENV", "development"),
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }


@app.on_event("startup")
def startup_event():
    # Automatically seed demo bank, inventory, and system config if fresh
    try:
        from seed import seed_demo_data
        from services.config_service import init_default_config
        db = SessionLocal()
        seed_demo_data(db)
        init_default_config(db)
        db.close()
    except Exception as e:
        print(f"Startup seed notice: {e}")


