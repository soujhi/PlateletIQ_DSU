import os
import time
import uuid
import requests
from typing import Dict, Any, Optional
from services.transport.base import TransportError

PORTER_API_KEY = os.getenv("PORTER_API_KEY", "")
PORTER_BASE_URL = os.getenv("PORTER_BASE_URL", "https://api.porter.in/v1")
TRANSPORT_MODE = os.getenv("TRANSPORT_MODE", "mock").lower()


class PorterProvider:
    """
    Production & Sandbox adapter for the Porter Logistics API (api.porter.in).
    Handles quotes, order creation with platelet cold-chain delivery instructions,
    order status tracking, and cancellation.
    """

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key or PORTER_API_KEY
        self.is_sandbox = (TRANSPORT_MODE == "mock") or not bool(self.api_key)

    def get_quote(
        self,
        pickup_lat: float,
        pickup_lng: float,
        drop_lat: float,
        drop_lng: float,
        customer_name: str = "Blood Bank",
        customer_mobile: str = "9876543210",
    ) -> Dict[str, Any]:
        """Fetch 2-wheeler quote and ETA from Porter API or sandbox mock."""
        if self.is_sandbox:
            return {
                "vehicle_type": "2 Wheeler (Porter)",
                "fare_inr": 145.0,
                "eta_minutes": 18,
                "provider": "porter_sandbox",
            }

        try:
            headers = {"Authorization": self.api_key, "Content-Type": "application/json"}
            payload = {
                "pickup_details": {"lat": pickup_lat, "lng": pickup_lng},
                "drop_details": {"lat": drop_lat, "lng": drop_lng},
                "customer": {
                    "name": customer_name,
                    "mobile": {"country_code": "+91", "number": customer_mobile},
                },
            }
            res = requests.post(f"{PORTER_BASE_URL}/get_quote", json=payload, headers=headers, timeout=8)
            if res.status_code == 200:
                data = res.json()
                vehicles = data.get("vehicles", [])
                if vehicles:
                    v = vehicles[0]
                    return {
                        "vehicle_type": v.get("type", "2 Wheeler"),
                        "fare_inr": v.get("fare", {}).get("value", 120.0),
                        "eta_minutes": v.get("eta", {}).get("value", 15),
                        "provider": "porter_api",
                    }
                raise TransportError("Porter returned 200 but no vehicles available", provider="porter", status_code=502)
            else:
                raise TransportError(f"Porter quote failed with HTTP {res.status_code}: {res.text}", provider="porter", status_code=502)
        except requests.RequestException as e:
            raise TransportError(f"Porter API network exception during get_quote: {str(e)}", provider="porter")

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
    ) -> Dict[str, Any]:
        """Dispatch delivery order on Porter with cold-chain 20–24 °C instructions."""
        request_id = f"PLT-{transfer_id[:8]}-{int(time.time())}"
        cold_chain_instructions = [
            "Medical cargo — perishable platelets.",
            "Keep upright at 20–24 °C room temperature.",
            "DO NOT REFRIGERATE or pack with ice.",
            f"Deliver within 90 minutes. Units count: {units_count}.",
        ]

        if self.is_sandbox:
            return {
                "order_id": f"PORTER-{uuid.uuid4().hex[:10].upper()}",
                "status": "DRIVER_ASSIGNED",
                "driver_name": "Senthil Nathan (Porter Partner)",
                "driver_mobile": "+91 94440 12345",
                "vehicle_number": "TN-07-CD-5678",
                "instructions": cold_chain_instructions,
                "provider": "porter_sandbox",
            }

        try:
            headers = {"Authorization": self.api_key, "Content-Type": "application/json"}
            payload = {
                "request_id": request_id,
                "pickup_details": {
                    "address": {"street_address": pickup_address, "lat": pickup_lat, "lng": pickup_lng},
                    "contact": {"name": pickup_name, "mobile": {"country_code": "+91", "number": pickup_mobile}},
                },
                "drop_details": {
                    "address": {"street_address": drop_address, "lat": drop_lat, "lng": drop_lng},
                    "contact": {"name": drop_name, "mobile": {"country_code": "+91", "number": drop_mobile}},
                },
                "delivery_instructions": {"instructions_list": cold_chain_instructions},
            }
            res = requests.post(f"{PORTER_BASE_URL}/orders/create", json=payload, headers=headers, timeout=8)
            if res.status_code in (200, 201):
                data = res.json()
                return {
                    "order_id": data.get("order_id", request_id),
                    "status": "DRIVER_ASSIGNED",
                    "driver_name": data.get("driver", {}).get("name", "Rajesh Kumar"),
                    "driver_mobile": data.get("driver", {}).get("mobile", "+919876501234"),
                    "vehicle_number": data.get("driver", {}).get("vehicle_number", "TN-01-AB-1234"),
                    "instructions": cold_chain_instructions,
                    "provider": "porter_api",
                }
            else:
                raise TransportError(f"Porter order creation failed with status {res.status_code}: {res.text}", provider="porter")
        except requests.RequestException as e:
            raise TransportError(f"Porter order creation network error: {str(e)}", provider="porter")

    def track_order(self, order_id: str) -> Dict[str, Any]:
        """Fetch live status and driver location for an order."""
        if self.is_sandbox:
            return {
                "order_id": order_id,
                "status": "IN_TRANSIT",
                "driver": {"name": "Senthil Nathan", "mobile": "+91 94440 12345", "vehicle": "TN-07-CD-5678"},
                "location": {"lat": 13.0715, "lng": 80.2585},
                "provider": "porter_sandbox",
            }

        try:
            headers = {"Authorization": self.api_key}
            res = requests.get(f"{PORTER_BASE_URL}/orders/{order_id}", headers=headers, timeout=8)
            if res.status_code == 200:
                data = res.json()
                return {
                    "order_id": order_id,
                    "status": data.get("status", "IN_TRANSIT"),
                    "driver": data.get("driver"),
                    "location": data.get("location"),
                    "provider": "porter_api",
                }
            else:
                raise TransportError(f"Porter track order failed with status {res.status_code}: {res.text}", provider="porter")
        except requests.RequestException as e:
            raise TransportError(f"Porter track network error: {str(e)}", provider="porter")

    def cancel_order(self, order_id: str, reason: str = "Transfer updated") -> Dict[str, Any]:
        """Cancel order on Porter."""
        if self.is_sandbox:
            return {"order_id": order_id, "status": "CANCELLED", "reason": reason}

        try:
            headers = {"Authorization": self.api_key, "Content-Type": "application/json"}
            res = requests.post(f"{PORTER_BASE_URL}/orders/{order_id}/cancel", json={"reason": reason}, headers=headers, timeout=8)
            if res.status_code == 200:
                return {"order_id": order_id, "status": "CANCELLED", "reason": reason}
            else:
                raise TransportError(f"Porter cancel order failed with status {res.status_code}: {res.text}", provider="porter")
        except requests.RequestException as e:
            raise TransportError(f"Porter cancel network error: {str(e)}", provider="porter")
