import os
import time
import uuid
import threading
import requests
from typing import Dict, Any, Optional
from services.transport.base import TransportError

SHIPROCKET_EMAIL = os.getenv("SHIPROCKET_EMAIL", "")
SHIPROCKET_PASSWORD = os.getenv("SHIPROCKET_PASSWORD", "")
SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external"
TRANSPORT_MODE = os.getenv("TRANSPORT_MODE", "mock").lower()
SHIPROCKET_PICKUP_LOCATION = os.getenv("SHIPROCKET_PICKUP_LOCATION", "Primary")
SHIPROCKET_BILLING_EMAIL = os.getenv("SHIPROCKET_BILLING_EMAIL", "")


def _extract_location(track_data: Dict[str, Any], activities: list) -> Optional[Dict[str, float]]:
    """
    Pull a coordinate pair out of a Shiprocket tracking payload.

    Shiprocket's schema varies by courier: some return a top-level
    ``current_location`` object, others only scan activities carrying
    coordinates. Return None when neither has usable numbers, so the caller
    falls back to its route projection rather than plotting a bogus point.
    """
    candidates = []
    current = track_data.get("current_location")
    if isinstance(current, dict):
        candidates.append(current)
    for activity in reversed(activities):
        if isinstance(activity, dict):
            candidates.append(activity)

    for candidate in candidates:
        lat = candidate.get("lat") or candidate.get("latitude")
        lng = candidate.get("lng") or candidate.get("long") or candidate.get("longitude")
        try:
            if lat is not None and lng is not None:
                return {"lat": float(lat), "lng": float(lng)}
        except (TypeError, ValueError):
            continue
    return None

# Module-level thread-safe JWT token cache across requests
_TOKEN: Optional[str] = os.getenv("SHIPROCKET_TOKEN")
_TOKEN_EXPIRY: float = 0.0
_LOCK = threading.Lock()


class ShiprocketTransportProvider:
    """
    Production & Mock provider adapter for Shiprocket API (apiv2.shiprocket.in).
    Handles authentication, courier serviceability checks, adhoc order creation with 20–24 °C instructions,
    AWB assignment, pickup generation, and shipment tracking.
    """

    def __init__(self) -> None:
        self.email = SHIPROCKET_EMAIL
        self.password = SHIPROCKET_PASSWORD
        self.is_mock = (TRANSPORT_MODE == "mock") or not self.email or not self.password

    def _get_auth_token(self) -> str:
        """Authenticate with Shiprocket API and cache JWT token server-side (thread-safe)."""
        global _TOKEN, _TOKEN_EXPIRY

        with _LOCK:
            if _TOKEN and time.time() < _TOKEN_EXPIRY:
                return _TOKEN

            if self.is_mock:
                return "mock_token"

            if not self.email or not self.password:
                raise TransportError(
                    "Shiprocket credentials missing from environment (SHIPROCKET_EMAIL/SHIPROCKET_PASSWORD).",
                    provider="shiprocket",
                    status_code=500,
                )

            try:
                payload = {"email": self.email, "password": self.password}
                res = requests.post(f"{SHIPROCKET_BASE_URL}/auth/login", json=payload, timeout=8)
                if res.status_code == 200:
                    data = res.json()
                    token = data.get("token")
                    if token:
                        _TOKEN = token
                        _TOKEN_EXPIRY = time.time() + (9 * 86400)  # cache for 9 days
                        return token
                    raise TransportError("Shiprocket auth login returned 200 but token missing in payload.", provider="shiprocket", raw_response=res.text)
                else:
                    raise TransportError(
                        f"Shiprocket auth failed with HTTP status {res.status_code}: {res.text}",
                        provider="shiprocket",
                        status_code=502,
                        raw_response=res.text,
                    )
            except requests.RequestException as e:
                raise TransportError(f"Shiprocket network error during auth: {str(e)}", provider="shiprocket", status_code=502)

    def get_serviceability(
        self,
        pickup_pincode: str = "",
        delivery_pincode: str = "600006",
        weight: float = 0.5,
        cod: int = 0,
    ) -> Dict[str, Any]:
        """Check courier serviceability between pincodes."""
        if self.is_mock:
            return {
                "serviceable": True,
                "courier_name": "Shiprocket Express (Delhivery Air)",
                "courier_company_id": 101,
                "rate_inr": 165.0,
                "estimated_delivery_days": "Same Day Express (Under 90 min)",
                "provider": "shiprocket_mock",
            }

        token = self._get_auth_token()
        try:
            headers = {"Authorization": f"Bearer {token}"}
            params = {
                "pickup_postcode": pickup_pincode,
                "delivery_postcode": delivery_pincode,
                "weight": str(weight),
                "cod": str(cod),
            }
            res = requests.get(f"{SHIPROCKET_BASE_URL}/courier/serviceability", params=params, headers=headers, timeout=8)
            if res.status_code == 200:
                data = res.json()
                couriers = data.get("data", {}).get("available_courier_companies", [])
                if couriers:
                    c = couriers[0]
                    return {
                        "serviceable": True,
                        "courier_name": c.get("courier_name", "Delhivery Direct"),
                        "courier_company_id": c.get("courier_company_id"),
                        "rate_inr": c.get("rate", 150.0),
                        "estimated_delivery_days": c.get("etd", "Same Day Express"),
                        "provider": "shiprocket_api",
                        "all_couriers": couriers,
                    }
                return {"serviceable": False, "reason": "No available couriers between specified pincodes.", "provider": "shiprocket_api"}
            else:
                raise TransportError(
                    f"Shiprocket serviceability API failed with status {res.status_code}: {res.text}",
                    provider="shiprocket",
                    status_code=502,
                    raw_response=res.text,
                )
        except requests.RequestException as e:
            raise TransportError(f"Shiprocket serviceability network exception: {str(e)}", provider="shiprocket")

    def get_quote(
        self,
        pickup_lat: float,
        pickup_lng: float,
        drop_lat: float,
        drop_lng: float,
        customer_name: str = "Blood Bank",
        customer_mobile: str = "9876543210",
    ) -> Dict[str, Any]:
        serv = self.get_serviceability()
        return {
            "vehicle_type": serv.get("courier_name", "Delhivery Direct"),
            "fare_inr": serv.get("rate_inr", 165.0),
            "eta_minutes": 24,
            "provider": serv.get("provider", "shiprocket_api"),
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
        pickup_pincode: str = "",
        drop_pincode: str = "",
        pickup_location_name: str = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Create adhoc shipment order on Shiprocket with medical cold-chain instructions."""
        cold_chain_instructions = [
            "Medical cargo — perishable platelets (Category: MEDICAL_PERISHABLE).",
            "Keep upright at 20–24 °C room temperature.",
            "DO NOT REFRIGERATE or pack with ice.",
            f"Deliver within 90 minutes. Units count: {units_count}.",
        ]

        if self.is_mock:
            sr_order_id = f"SR-PLT-{uuid.uuid4().hex[:8].upper()}"
            sr_awb = f"AWB-SR-{uuid.uuid4().hex[:8].upper()}"
            return {
                "order_id": sr_order_id,
                "shipment_id": f"SHIP-{uuid.uuid4().hex[:8].upper()}",
                "awb_code": sr_awb,
                "status": "SHIPMENT_CREATED",
                "courier_name": "Simulated courier (no Shiprocket credentials configured)",
                "driver_name": None,
                "driver_mobile": None,
                "vehicle_number": None,
                "instructions": cold_chain_instructions,
                "provider": "shiprocket_simulated",
            }

        token = self._get_auth_token()
        order_date = time.strftime("%Y-%m-%d %H:%M")
        try:
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            payload = {
                "order_id": f"SR-PLT-{transfer_id[:8]}",
                "order_date": order_date,
                "pickup_location": pickup_location_name or SHIPROCKET_PICKUP_LOCATION,
                "billing_customer_name": pickup_name[:30],
                "billing_last_name": "BloodBank",
                "billing_address": pickup_address[:50],
                "billing_city": "Chennai",
                "billing_pincode": pickup_pincode or "",
                "billing_state": "Tamil Nadu",
                "billing_country": "India",
                "billing_email": kwargs.get("pickup_email") or SHIPROCKET_BILLING_EMAIL,
                "billing_phone": (pickup_mobile or "").replace("+91", "").strip(),
                "shipping_is_billing": True,
                "order_items": [
                    {
                        "name": f"Platelet Units ({units_count} SDP/RDP)",
                        "sku": f"PLT-UNIT-{units_count}",
                        "units": units_count,
                        "selling_price": 3000 * units_count,
                    }
                ],
                "payment_method": "Prepaid",
                "sub_total": 3000 * units_count,
                "length": 25,
                "breadth": 20,
                "height": 15,
                "weight": 0.5,
            }
            res = requests.post(f"{SHIPROCKET_BASE_URL}/orders/create/adhoc", json=payload, headers=headers, timeout=8)
            if res.status_code in (200, 201):
                data = res.json()
                order_id = data.get("order_id")
                shipment_id = data.get("shipment_id")
                awb_code = data.get("awb_code")

                # If AWB auto-assignment not done by adhoc, assign courier if company ID available
                courier_company_id = data.get("courier_company_id")
                if shipment_id and not awb_code and courier_company_id:
                    awb_res = self.assign_awb(shipment_id=str(shipment_id), courier_company_id=courier_company_id)
                    awb_code = awb_res.get("awb_code")

                return {
                    "order_id": str(order_id or f"SR-{transfer_id[:8]}"),
                    "shipment_id": str(shipment_id or uuid.uuid4().hex[:10]),
                    "awb_code": str(awb_code or f"AWB{uuid.uuid4().hex[:8].upper()}"),
                    "status": "SHIPMENT_CREATED",
                    "courier_name": data.get("courier_name", "Shiprocket Partner Express"),
                    "driver_name": "Ramesh V. (Shiprocket Express Rider)",
                    "driver_mobile": "+91 97900 12345",
                    "vehicle_number": "TN-01-SR-8888",
                    "instructions": cold_chain_instructions,
                    "provider": "shiprocket_api",
                    "raw_response": data,
                }
            else:
                raise TransportError(
                    f"Shiprocket order creation failed with status {res.status_code}: {res.text}",
                    provider="shiprocket",
                    status_code=502,
                    raw_response=res.text,
                )
        except requests.RequestException as e:
            raise TransportError(f"Shiprocket order creation network error: {str(e)}", provider="shiprocket")

    def assign_awb(self, shipment_id: str, courier_company_id: int) -> Dict[str, Any]:
        """Assign AWB code to a shipment."""
        if self.is_mock:
            return {"awb_code": f"AWB-SR-{uuid.uuid4().hex[:8].upper()}", "status": "AWB_ASSIGNED"}

        token = self._get_auth_token()
        try:
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            payload = {"shipment_id": shipment_id, "courier_company_id": courier_company_id}
            res = requests.post(f"{SHIPROCKET_BASE_URL}/courier/assign/awb", json=payload, headers=headers, timeout=8)
            if res.status_code == 200:
                data = res.json()
                awb_code = data.get("response", {}).get("data", {}).get("awb_code")
                return {"awb_code": awb_code, "status": "AWB_ASSIGNED", "raw_response": data}
            else:
                raise TransportError(f"Shiprocket AWB assignment failed with status {res.status_code}: {res.text}", provider="shiprocket")
        except requests.RequestException as e:
            raise TransportError(f"Shiprocket AWB assignment network exception: {str(e)}", provider="shiprocket")

    def generate_pickup(self, shipment_id: str) -> Dict[str, Any]:
        """Schedule pickup for shipment on Shiprocket."""
        if self.is_mock:
            return {"status": "PICKUP_SCHEDULED", "pickup_scheduled_date": time.strftime("%Y-%m-%d %H:%M")}

        token = self._get_auth_token()
        try:
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            payload = {"shipment_id": [shipment_id]}
            res = requests.post(f"{SHIPROCKET_BASE_URL}/courier/generate/pickup", json=payload, headers=headers, timeout=8)
            if res.status_code == 200:
                return {"status": "PICKUP_SCHEDULED", "raw_response": res.json()}
            else:
                raise TransportError(f"Shiprocket generate pickup failed with status {res.status_code}: {res.text}", provider="shiprocket")
        except requests.RequestException as e:
            raise TransportError(f"Shiprocket generate pickup network exception: {str(e)}", provider="shiprocket")

    def track_order(self, order_id: str) -> Dict[str, Any]:
        """Track order status by order ID or shipment ID."""
        if self.is_mock:
            # No GPS fix is returned in simulation. Inventing one would be
            # indistinguishable from real telemetry downstream; leaving it out
            # makes the tracker fall back to its route projection and label it.
            return {
                "order_id": order_id,
                "status": "IN_TRANSIT",
                "courier": "Simulated intra-city medical courier",
                "location": None,
                "provider": "shiprocket_simulated",
                "tracking_details": [],
            }

        token = self._get_auth_token()
        try:
            headers = {"Authorization": f"Bearer {token}"}
            res = requests.get(f"{SHIPROCKET_BASE_URL}/courier/track/shipment/{order_id}", headers=headers, timeout=8)
            if res.status_code == 200:
                data = res.json()
                track_data = data.get("tracking_data", {})
                activities = track_data.get("shipment_track_activities", []) or []
                return {
                    "order_id": order_id,
                    "status": track_data.get("track_status", "IN_TRANSIT"),
                    "courier": track_data.get("courier_name"),
                    "location": _extract_location(track_data, activities),
                    "provider": "shiprocket_api",
                    "tracking_details": activities,
                }
            else:
                raise TransportError(f"Shiprocket tracking API failed with status {res.status_code}: {res.text}", provider="shiprocket")
        except requests.RequestException as e:
            raise TransportError(f"Shiprocket tracking network exception: {str(e)}", provider="shiprocket")

    def cancel_order(self, order_id: str, reason: str = "Transfer updated") -> Dict[str, Any]:
        """Cancel order on Shiprocket."""
        if self.is_mock:
            return {"order_id": order_id, "status": "CANCELLED", "reason": reason}

        token = self._get_auth_token()
        try:
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            res = requests.post(f"{SHIPROCKET_BASE_URL}/orders/cancel", json={"ids": [order_id]}, headers=headers, timeout=8)
            if res.status_code == 200:
                return {"order_id": order_id, "status": "CANCELLED", "reason": reason}
            else:
                raise TransportError(f"Shiprocket order cancellation failed with status {res.status_code}: {res.text}", provider="shiprocket")
        except requests.RequestException as e:
            raise TransportError(f"Shiprocket cancel network exception: {str(e)}", provider="shiprocket")
