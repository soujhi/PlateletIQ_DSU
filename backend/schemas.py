from enum import Enum
from typing import Optional, List, Any
from pydantic import BaseModel, Field


class ActionType(str, Enum):
    HOLD = "HOLD"
    PROCURE = "PROCURE"
    COLLECT = "COLLECT"


class ProvenanceType(str, Enum):
    MODEL = "MODEL"
    SIMULATED = "SIMULATED"
    EXTERNAL = "EXTERNAL"
    DEMO = "DEMO"


class FreshnessState(str, Enum):
    CURRENT = "CURRENT"
    AGING = "AGING"
    STALE = "STALE"
    VERY_STALE = "VERY_STALE"


class UnitStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    RESERVED = "RESERVED"
    ISSUED = "ISSUED"
    EXPIRED = "EXPIRED"
    DISCARDED = "DISCARDED"


class APIResponse(BaseModel):
    data: Optional[Any] = None
    meta: Optional[dict] = Field(default_factory=dict)
    error: Optional[Any] = None


class InventorySummary(BaseModel):
    available: int
    expiring_today: int
    expiring_1d: int
    expiring_2d: int
    expiring_3d: int
    total_value_inr: int = 144000
    at_risk_value_inr: int = 27000
    coverage_days: float = 1.8
    provenance: ProvenanceType = ProvenanceType.DEMO


class InventoryUnitResponse(BaseModel):
    id: str
    bag_id: str
    component_type: str
    blood_group: str
    collection_at: str
    expiry_at: str
    status: str
    source_type: str


class ForecastRow(BaseModel):
    date: str
    horizon_day: int
    q50: float
    q67: float
    q90: float
    confidence_range: str = ""


class ForecastResponse(BaseModel):
    run_id: str
    status: str = "SUCCEEDED"
    model_version: str = "LASSO v1.4"
    history_days: int = 180
    forecast: List[ForecastRow]
    provenance: ProvenanceType = ProvenanceType.MODEL


class RecommendationResponse(BaseModel):
    id: str
    action: ActionType
    quantity: int
    reason_summary: str
    drivers: List[str]
    inventory_surplus: int = 41
    cost_impact_inr: int = 0
    provenance: ProvenanceType = ProvenanceType.MODEL


class AnalyticsResponse(BaseModel):
    mase: float = 0.734
    mape: float = 24.58
    mae: float = 5.303
    naive_mase: float = 0.993
    schilling_mase: float = 0.746
    wastage_simulated: float = 3.25
    wastage_baseline: float = 9.61
    shortage_simulated: float = 3.04
    shortage_baseline: float = 6.73
    annual_savings_inr: int = 720000
    provenance: ProvenanceType = ProvenanceType.SIMULATED


class DistrictSummary(BaseModel):
    district: str
    state: str
    rdp_units: int
    sdp_units: int
    hospitals: int
    freshness_state: str


class NetworkResponse(BaseModel):
    total_hospitals: int = 756
    sdp_pct: float = 4.7
    zero_sdp_districts: int = 23
    districts: List[DistrictSummary]
    provenance: ProvenanceType = ProvenanceType.EXTERNAL


class WasteAnalyticsResponse(BaseModel):
    current_wastage_pct: float = 3.25
    baseline: float = 9.61
    reduction_pct: float = 66.2
    monthly_savings_inr: int = 60000
    annual_savings_inr: int = 720000
    provenance: ProvenanceType = ProvenanceType.SIMULATED


class HealthResponse(BaseModel):
    status: str
    api: str
    database: str
    model: str
    eraktkosh: Optional[str] = "ok"
    environment: str
    timestamp: str
