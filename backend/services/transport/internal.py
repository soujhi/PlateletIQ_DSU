import uuid
from typing import Dict, Any


class InternalFleetProvider:
    """Internal hospital runner & driver dispatch provider."""

    def get_quote(
        self,
        pickup_lat: float,
        pickup_lng: float,
        drop_lat: float,
        drop_lng: float,
        customer_name: str = "Blood Bank",
        customer_mobile: str = "9876543210",
    ) -> Dict[str, Any]:
        return {
            "vehicle_type": "Hospital Runner / Bike",
            "fare_inr": 0.0,
            "eta_minutes": 15,
            "provider": "internal_fleet",
        }

    def create_order(
        self,
        transfer_id: str,
        pickup_address: str,
        pickup_lat: float,
        pickup_lng: float,
        pickup_name: str,
        pickup_mobile: str,
        drop_address: str,
        drop_lat: float,
        drop_lng: float,
        drop_name: str,
        drop_mobile: str,
        units_count: int = 1,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        order_id = f"INT-{uuid.uuid4().hex[:8].upper()}"
        instructions = [
            "Internal Hospital Runner Transfer.",
            "Keep upright at 20–24 °C room temperature.",
            "Verify donor/blood bank custody handoff upon pickup.",
        ]
        return {
            "order_id": order_id,
            "status": "DRIVER_ASSIGNED",
            "driver_name": "Karthik (GGH Runner)",
            "driver_mobile": "+91 98400 54321",
            "vehicle_number": "TN-01-RUNNER-04",
            "instructions": instructions,
            "provider": "internal_fleet",
        }

    def track_order(self, order_id: str) -> Dict[str, Any]:
        return {
            "order_id": order_id,
            "status": "IN_TRANSIT",
            # An internal runner has no telemetry feed; the tracker projects
            # the position along the route and labels it as a projection.
            "location": None,
            "provider": "internal_fleet",
        }

    def cancel_order(self, order_id: str, reason: str = "Transfer updated") -> Dict[str, Any]:
        return {"order_id": order_id, "status": "CANCELLED", "reason": reason}
