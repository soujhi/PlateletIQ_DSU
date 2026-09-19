import uuid
from typing import Dict, Any


class BecknLogisticsProvider:
    """ONDC Beckn Logistics BAP protocol adapter."""

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
            "vehicle_type": "ONDC Logistics BPP (Two-Wheeler)",
            "fare_inr": 130.0,
            "eta_minutes": 20,
            "provider": "beckn_ondc",
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
        order_id = f"BECKN-{uuid.uuid4().hex[:8].upper()}"
        instructions = [
            "ONDC Beckn Medical Parcel (Category: MEDICAL_PERISHABLE).",
            "Temperature: 20-24C, Handling: NO_REFRIGERATION.",
        ]
        return {
            "order_id": order_id,
            "status": "DRIVER_ASSIGNED",
            "driver_name": "Ramesh (ONDC Logistics Partner)",
            "driver_mobile": "+91 97900 87654",
            "vehicle_number": "TN-09-ONDC-99",
            "instructions": instructions,
            "provider": "beckn_ondc",
        }

    def track_order(self, order_id: str) -> Dict[str, Any]:
        return {
            "order_id": order_id,
            "status": "IN_TRANSIT",
            # No /on_track callback has been wired yet, so no fix is claimed.
            "location": None,
            "provider": "beckn_ondc",
        }

    def cancel_order(self, order_id: str, reason: str = "Transfer updated") -> Dict[str, Any]:
        return {"order_id": order_id, "status": "CANCELLED", "reason": reason}
