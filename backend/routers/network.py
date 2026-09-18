from fastapi import APIRouter, Depends
from auth import get_current_user
from services.eraktkosh import load_network_summary, load_district_summaries

router = APIRouter(prefix="/network", tags=["network"])


@router.get("")
def get_network(current_user: dict = Depends(get_current_user)):
    summary = load_network_summary()
    districts = load_district_summaries()

    return {
        "data": {
            "summary": summary,
            "districts": districts,
        },
        "error": None,
    }


@router.get("/risks")
def get_network_risks(current_user: dict = Depends(get_current_user)):
    districts = load_district_summaries()
    # Filter out VERY_STALE districts for transfer suggestions per PRD AC-044
    viable = [d for d in districts if d.get("freshness_state") != "VERY_STALE"]
    surplus = [d for d in viable if d.get("sdp_units", 0) > 20]
    shortage = [d for d in viable if d.get("sdp_units", 0) == 0]

    return {
        "data": {
            "surplus_districts": surplus,
            "shortage_districts": shortage,
        },
        "error": None,
    }
