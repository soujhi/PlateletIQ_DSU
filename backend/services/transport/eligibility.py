import math
from typing import List, Dict, Any
from services.transport.mapbox import get_mapbox_matrix


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
    shelf_life_hours: float = 36.0,
    abo_substitute_penalty: float = 0.85,
) -> List[Dict[str, Any]]:
    """
    Uses Mapbox Matrix API to evaluate multiple candidate receiving blood banks in a single call,
    scoring each candidate by operational feasibility, travel time, and deficit urgency.
    """
    if not candidates:
        return []

    # Mapbox Matrix call across all candidate coordinates
    origins = [(origin_lat, origin_lng)]
    destinations = [(c["lat"], c["lng"]) for c in candidates]
    matrix_res = get_mapbox_matrix(origins, destinations)

    durations_row = matrix_res["durations_min"][0] if matrix_res.get("durations_min") else [30.0] * len(candidates)
    distances_row = matrix_res["distances_km"][0] if matrix_res.get("distances_km") else [10.0] * len(candidates)

    scored_candidates = []
    for idx, cand in enumerate(candidates):
        eta_min = durations_row[idx]
        dist_km = distances_row[idx]

        eligibility = check_transfer_eligibility(
            origin_usable_inventory=origin_usable,
            origin_safety_stock=origin_safety,
            destination_forecasted_demand=cand.get("forecast_demand", 10.0),
            destination_usable_inventory=cand.get("usable_inventory", 0),
            remaining_shelf_life_hours=shelf_life_hours,
            expected_transport_time_minutes=eta_min,
        )

        if not eligibility["eligible"]:
            cand_score = 0.0
        else:
            # Score formula: (Need * Quantity * Group_Compat) - (Distance Penalty * Travel_Time / 120)
            need_term = min(cand.get("forecast_demand", 10.0), eligibility["transferable_units"])
            time_penalty = (eta_min / 120.0) * 0.15
            compat_weight = 1.0 if cand.get("blood_group_match", True) else abo_substitute_penalty
            cand_score = round(max(0.01, (need_term * compat_weight) - time_penalty), 3)

        scored_candidates.append(
            {
                "blood_bank_id": cand.get("id"),
                "hospital_name": cand.get("name"),
                "hospital_code": cand.get("code"),
                "lat": cand.get("lat"),
                "lng": cand.get("lng"),
                "distance_km": dist_km,
                "eta_minutes": eta_min,
                "score": cand_score,
                "eligible": eligibility["eligible"],
                "recommended_units": eligibility["recommended_units"],
                "reasons": eligibility["reasons"],
            }
        )

    # Sort candidates by score descending
    scored_candidates.sort(key=lambda x: x["score"], reverse=True)
    return scored_candidates
