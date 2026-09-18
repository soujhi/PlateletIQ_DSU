import asyncio
import datetime
from database import SessionLocal
from routers.forecast import trigger_forecast_run


async def run_nightly_forecast():
    """Runs scheduled daily forecast update for demo bank."""
    print(f"[{datetime.datetime.utcnow().isoformat()}] Starting scheduled forecast run...")
    db = SessionLocal()
    try:
        trigger_forecast_run(bank_id="TN-GGH-001", db=db, current_user={"sub": "system-scheduler"})
        print("Scheduled forecast run completed successfully.")
    except Exception as e:
        print(f"Scheduled forecast run error: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(run_nightly_forecast())
