import os
import math
import requests
from typing import List, Dict, Any, Tuple

MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN", "")
DIRECTIONS_API_URL = "https://api.mapbox.com/directions/v5/mapbox/driving-traffic"
MATRIX_API_URL = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving"


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Haversine distance in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


def get_fallback_route(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float) -> Dict[str, Any]:
    """Fallback offline estimation when Mapbox API key is absent."""
    dist_km = haversine_distance(origin_lat, origin_lng, dest_lat, dest_lng)
    # Estimate urban driving speed ~25 km/h in Chennai
    duration_min = round((dist_km / 25.0) * 60 + 5, 1)  # +5 min traffic overhead

    geojson_route = {
        "type": "LineString",
        "coordinates": [
            [origin_lng, origin_lat],
            [(origin_lng + dest_lng) / 2, (origin_lat + dest_lat) / 2],
            [dest_lng, dest_lat],
        ],
    }

    return {
        "distance_km": dist_km,
        "duration_min": duration_min,
        "route_geometry": geojson_route,
        "provider": "fallback_haversine",
    }


def get_mapbox_directions(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float) -> Dict[str, Any]:
    """
    Fetch route, ETA, and distance using Mapbox Directions API.
    Docs: https://docs.mapbox.com/api/navigation/directions/
    """
    if not MAPBOX_ACCESS_TOKEN:
        return get_fallback_route(origin_lat, origin_lng, dest_lat, dest_lng)

    try:
        url = f"{DIRECTIONS_API_URL}/{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
        params = {
            "access_token": MAPBOX_ACCESS_TOKEN,
            "geometries": "geojson",
            "overview": "full",
            "steps": "false",
        }
        res = requests.get(url, params=params, timeout=5)
        if res.status_code == 200:
            data = res.json()
            if data.get("routes"):
                route = data["routes"][0]
                return {
                    "distance_km": round(route["distance"] / 1000.0, 2),
                    "duration_min": round(route["duration"] / 60.0, 1),
                    "route_geometry": route["geometry"],
                    "provider": "mapbox_directions",
                }
    except Exception as e:
        print(f"Mapbox Directions API notice: {e}")

    return get_fallback_route(origin_lat, origin_lng, dest_lat, dest_lng)


def get_mapbox_matrix(origins: List[Tuple[float, float]], destinations: List[Tuple[float, float]]) -> Dict[str, Any]:
    """
    Fetch multi-destination travel matrix using Mapbox Matrix API.
    Docs: https://docs.mapbox.com/api/navigation/matrix/
    """
    if not MAPBOX_ACCESS_TOKEN:
        # Fallback matrix using Haversine
        durations = []
        distances = []
        for o_lat, o_lng in origins:
            dur_row = []
            dist_row = []
            for d_lat, d_lng in destinations:
                res = get_fallback_route(o_lat, o_lng, d_lat, d_lng)
                dur_row.append(res["duration_min"])
                dist_row.append(res["distance_km"])
            durations.append(dur_row)
            distances.append(dist_row)
        return {"durations_min": durations, "distances_km": distances, "provider": "fallback_matrix"}

    all_coords = origins + destinations
    coord_str = ";".join([f"{lng},{lat}" for lat, lng in all_coords])
    sources = ";".join([str(i) for i in range(len(origins))])
    dest_indices = ";".join([str(len(origins) + j) for j in range(len(destinations))])

    try:
        url = f"{MATRIX_API_URL}/{coord_str}"
        params = {
            "access_token": MAPBOX_ACCESS_TOKEN,
            "sources": sources,
            "destinations": dest_indices,
            "annotations": "duration,distance",
        }
        res = requests.get(url, params=params, timeout=5)
        if res.status_code == 200:
            data = res.json()
            durations_min = [
                [round(d / 60.0, 1) if d is not None else 999.0 for d in row]
                for row in data.get("durations", [])
            ]
            distances_km = [
                [round(dist / 1000.0, 2) if dist is not None else 999.0 for dist in row]
                for row in data.get("distances", [])
            ]
            return {
                "durations_min": durations_min,
                "distances_km": distances_km,
                "provider": "mapbox_matrix",
            }
    except Exception as e:
        print(f"Mapbox Matrix API notice: {e}")

    # Fallback on network/API failure
    durations = []
    distances = []
    for o_lat, o_lng in origins:
        dur_row = []
        dist_row = []
        for d_lat, d_lng in destinations:
            res = get_fallback_route(o_lat, o_lng, d_lat, d_lng)
            dur_row.append(res["duration_min"])
            dist_row.append(res["distance_km"])
        durations.append(dur_row)
        distances.append(dist_row)
    return {"durations_min": durations, "distances_km": distances, "provider": "fallback_matrix"}
