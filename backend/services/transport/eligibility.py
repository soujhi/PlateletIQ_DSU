import math
from typing import List, Dict, Any
from services.transport.mapbox import get_mapbox_matrix

# PRD Section 11 — ABO Compatibility Matrix for Platelets
ABO_COMPATIBILITY_MATRIX: Dict[str, List[str]] = {
    "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
    "O+": ["O+", "A+", "B+", "AB+"],
    "A-": ["A-", "A+", "AB-", "AB+"],
    "A+": ["A+", "AB+"],
    "B-": ["B-", "B+", "AB-", "AB+"],
    "B+": ["B+", "AB+"],
    "AB-": ["AB-", "AB+"],
    "AB+": ["AB+"],
}


class RoutingError(Exception):
    """Raised when routing calculation or candidate scoring fails."""

    def __init__(self, message: str, provider: str = "mapbox"):
        super().__init__(message)
        self.message = message
        self.provider = provider


def check_transfer_eligibility(
    origin_usable_inventory: int,
    origin_safety_stock: int,
    destination_forecasted_demand: float,
    destination_usable_inventory: int,
    remaining_shelf_life_hours: float,
    expected_transport_time_minutes: float,
    handling_buffer_minutes: float = 20.0,
    min_residual_life_minutes: float = 360.0,
) -> Dict[str, Any]:
    """
    Evaluates whether a proposed platelet transfer between origin and destination is operationally feasible.
    """
    transferable_units = max(0, origin_usable_inventory - origin_safety_stock)
    destination_need = max(0.0, destination_forecasted_demand - float(destination_usable_inventory))

    remaining_shelf_life_minutes = remaining_shelf_life_hours * 60.0
    total_transit_overhead_minutes = expected_transport_time_minutes + handling_buffer_minutes
    arrival_residual_minutes = remaining_shelf_life_minutes - total_transit_overhead_minutes

    reasons = []
    if transferable_units <= 0:
        reasons.append(f"Origin has no transferable surplus (Usable: {origin_usable_inventory}, Safety: {origin_safety_stock}).")
    if destination_need <= 0:
        reasons.append("Destination has no projected demand deficit.")
    if arrival_residual_minutes < min_residual_life_minutes:
        reasons.append(
            f"Insufficient residual life upon arrival ({round(arrival_residual_minutes/60, 1)}h < {round(min_residual_life_minutes/60, 1)}h required)."
        )
    if expected_transport_time_minutes > 120.0:
        reasons.append(f"Transit duration exceeds 120 min maximum agitation window ({round(expected_transport_time_minutes, 1)} min).")

    is_eligible = len(reasons) == 0

    return {
        "eligible": is_eligible,
        "transferable_units": int(transferable_units),
        "destination_need": round(destination_need, 1),
        "recommended_units": int(min(transferable_units, math.ceil(destination_need))),
        "expected_transport_time_min": round(expected_transport_time_minutes, 1),
        "arrival_residual_hours": round(arrival_residual_minutes / 60.0, 1),
        "reasons": reasons,
    }


def score_candidate_destinations(
    origin_lat: float,
    origin_lng: float,
    origin_usable: int,
    origin_safety: int,
    candidates: List[Dict[str, Any]],
    origin_blood_group: str = "O+",
    shelf_life_hours: float = 36.0,
    abo_substitute_penalty: float = 0.85,
) -> List[Dict[str, Any]]:
    """
    Uses Mapbox Matrix API to evaluate multiple candidate receiving blood banks in a single call,
    scoring each candidate by operational feasibility, travel time, ABO compatibility, and deficit urgency.
    Requires forecast_demand in each candidate object; candidates missing forecast_demand are excluded.
    Returns eta_source: 'mapbox_matrix' | 'haversine_estimate'.
    """
    if not candidates:
        return []

    # Filter out candidates missing forecast_demand
    valid_candidates = []
    for cand in candidates:
        if "forecast_demand" not in cand or cand["forecast_demand"] is None:
            continue
        valid_candidates.append(cand)

    if not valid_candidates:
        return []

    # Mapbox Matrix call across all candidate coordinates
    origins = [(origin_lat, origin_lng)]
    destinations = [(c["lat"], c["lng"]) for c in valid_candidates]

    try:
        matrix_res = get_mapbox_matrix(origins, destinations)
    except Exception as e:
        raise RoutingError(f"Mapbox matrix computation failed: {str(e)}")

    provider_source = matrix_res.get("provider", "fallback_matrix")
    eta_source = "mapbox_matrix" if provider_source == "mapbox_matrix" else "haversine_estimate"

    durations_row = matrix_res.get("durations_min", [[]])[0] if matrix_res.get("durations_min") else []
    distances_row = matrix_res.get("distances_km", [[]])[0] if matrix_res.get("distances_km") else []

    if len(durations_row) < len(valid_candidates):
        raise RoutingError(f"Matrix API returned incomplete duration rows ({len(durations_row)} for {len(valid_candidates)} candidates)")

    scored_candidates = []
    for idx, cand in enumerate(valid_candidates):
        eta_min = durations_row[idx]
        dist_km = distances_row[idx]
        forecast_demand = float(cand["forecast_demand"])
        dest_usable = cand.get("usable_inventory", 0)
        cand_bg = cand.get("blood_group", "O+")

        # ABO compatibility check (P2-3)
        exact_match = (cand_bg == origin_blood_group)
        is_compatible = cand_bg in ABO_COMPATIBILITY_MATRIX.get(origin_blood_group, [origin_blood_group])
        if not is_compatible and not exact_match:
            compat_weight = 0.0
        elif exact_match:
            compat_weight = 1.0
        else:
            compat_weight = abo_substitute_penalty

        # Feasibility check (P2-4 consumption window)
        eligibility = check_transfer_eligibility(
            origin_usable_inventory=origin_usable,
            origin_safety_stock=origin_safety,
            destination_forecasted_demand=forecast_demand,
            destination_usable_inventory=dest_usable,
            remaining_shelf_life_hours=shelf_life_hours,
            expected_transport_time_minutes=eta_min,
        )

        if not eligibility["eligible"] or compat_weight == 0.0:
            cand_score = 0.0
            if compat_weight == 0.0:
                eligibility["reasons"].append(f"Incompatible ABO blood group ({origin_blood_group} to {cand_bg}).")
        else:
            # Urgency term (P2-2): urgency factor higher when destination has greater relative deficit
            urgency = max(0.0, 1.0 - (float(dest_usable) / max(1.0, forecast_demand)))
            need_term = min(forecast_demand, eligibility["transferable_units"])
            time_penalty = (eta_min / 120.0) * 0.15

            # Candidate Score Formula: (Need * ABO_Weight * (1 + 0.5 * Urgency)) - Time_Penalty
            cand_score = round(max(0.01, (need_term * compat_weight * (1.0 + 0.5 * urgency)) - time_penalty), 3)

        scored_candidates.append(
            {
                "blood_bank_id": cand.get("id"),
                "hospital_name": cand.get("name"),
                "hospital_code": cand.get("code"),
                "lat": cand.get("lat"),
                "lng": cand.get("lng"),
                "distance_km": dist_km,
                "eta_minutes": eta_min,
                "eta_source": eta_source,
                "score": cand_score,
                "eligible": eligibility["eligible"] and (compat_weight > 0.0),
                "recommended_units": eligibility["recommended_units"],
                "reasons": eligibility["reasons"],
            }
        )

    # Sort candidates by score descending
    scored_candidates.sort(key=lambda x: x["score"], reverse=True)
    return scored_candidates
