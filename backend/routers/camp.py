from fastapi import APIRouter, Depends
from auth import get_current_user

router = APIRouter(prefix="/banks/{bank_id}/camps", tags=["camps"])


@router.get("/seasonal")
def get_seasonal_camp_data(bank_id: str, current_user: dict = Depends(get_current_user)):
    return {
        "data": {
            "peak_month": "October",
            "november_index": 1.83,
            "peak_trough_ratio": 12.4,
            "planning_range": "3,240–4,120",
            "bangladesh_correlation": 0.970,
            "sri_lanka_correlation": -0.228,
            "provenance": "WHO xMart API · India monthly series 2018–2026",
        },
        "error": None,
    }
