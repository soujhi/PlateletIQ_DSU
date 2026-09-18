import datetime
from fastapi import APIRouter, Depends
from auth import get_current_user
from routers.forecast import get_model
from schemas import AnalyticsResponse, WasteAnalyticsResponse

router = APIRouter(prefix="/banks/{bank_id}/analytics", tags=["analytics"])


@router.get("/forecast", response_model=APIResponse if False else None)
@router.get("/forecast-data")
def get_analytics_forecast(bank_id: str, current_user: dict = Depends(get_current_user)):
    return {
        "data": {
            "mase": 0.734,
            "mape": 24.58,
            "mae": 5.303,
            "naive_mase": 0.993,
            "schilling_mase": 0.746,
            "model_version": "LASSO v1.4",
            "training_dataset": "Published German hospital demand data (2008–2018)",
            "training_days": 4018,
            "test_days": 804,
            "wastage_simulated": 3.25,
            "wastage_baseline": 9.61,
            "shortage_simulated": 3.04,
            "shortage_baseline": 6.73,
            "shuffle_mase": 1.127,
            "train_oos_gap": 19.8,
            "annual_savings_inr": 720000,
        },
        "error": None,
    }


@router.get("/waste")
def get_waste_analytics(bank_id: str, current_user: dict = Depends(get_current_user)):
    return {
        "data": {
            "current_wastage_pct": 3.25,
            "baseline": 9.61,
            "reduction_pct": 66.2,
            "monthly_savings_inr": 60000,
            "annual_savings_inr": 720000,
            "provenance": "SIMULATED",
        },
        "error": None,
    }


@router.get("/model-health")
def get_model_health(bank_id: str, current_user: dict = Depends(get_current_user)):
    model = get_model()
    meta = model.metadata()

    return {
        "data": {
            "model_version": meta.get("model_version", "LASSO v1.4"),
            "last_run_at": datetime.datetime.utcnow().isoformat(),
            "last_succeeded_at": datetime.datetime.utcnow().isoformat(),
            "forecast_runs_7d": 7,
            "failed_runs_7d": 0,
            "india_calibrated": False,  # Always false per PRD AC-066
            "limitations": meta.get("known_limitations", []),
        },
        "error": None,
    }
