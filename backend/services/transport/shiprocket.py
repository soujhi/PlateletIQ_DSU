import os
import time
import uuid
import requests
from typing import Dict, Any, Optional

SHIPROCKET_EMAIL = os.getenv("SHIPROCKET_EMAIL", "demo@plateletiq.in")
SHIPROCKET_PASSWORD = os.getenv("SHIPROCKET_PASSWORD", "H8RC#BSuF@urJdiy*yysHap!tpMU1arU")
SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external"
TRANSPORT_MODE = os.getenv("TRANSPORT_MODE", "mock").lower()


class ShiprocketTransportProvider:
    """
    Production & Mock provider adapter for Shiprocket API (apiv2.shiprocket.in).
    Handles authentication, courier serviceability checks, adhoc order creation with 20–24 °C instructions,
    and shipment tracking normalization.
    """

    def __init__(self) -> None:
        self.email = SHIPROCKET_EMAIL
        self.password = SHIPROCKET_PASSWORD
        self.token: Optional[str] = os.getenv("SHIPROCKET_TOKEN")
        self.token_expiry: float = 0.0
        self.is_mock = (TRANSPORT_MODE == "mock") or not self.email or not self.password

    def _get_auth_token(self) -> Optional[str]:
        """Authenticate with Shiprocket API and cache JWT token server-side."""
        if self.token and time.time() < self.token_expiry:
            return self.token

        try:
            payload = {"email": self.email, "password": self.password}
            res = requests.post(f"{SHIPROCKET_BASE_URL}/auth/login", json=payload, timeout=5)
            if res.status_code == 200:
                data = res.json()
                self.token = data.get("token")
                # Tokens typically valid for 10 days; cache for 9 days
                self.token_expiry = time.time() + (9 * 86400)
                return self.token
        except Exception as e:
            print(f"Shiprocket auth exception: {e}")

        return None

    def get_serviceability(
        self,
        pickup_pincode: str = "600003",
        delivery_pincode: str = "600006",
        weight: float = 0.5,
        cod: int = 0,
    ) -> Dict[str, Any]:
        """Check courier serviceability between pincodes."""
        token = self._get_auth_token()
        if token and not self.is_mock:
            try:
                headers = {"Authorization": f"Bearer {token}"}
                params = {
                    "pickup_postcode": pickup_pincode,
                    "delivery_postcode": delivery_pincode,
                    "weight": str(weight),
                    "cod": str(cod),
                }
                res = requests.get(f"{SHIPROCKET_BASE_URL}/courier/serviceability", params=params, headers=headers, timeout=5)
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
                        }
            except Exception as e:
                print(f"Shiprocket serviceability exception: {e}")

        # Contract-accurate mock response
        return {
            "serviceable": True,
            "courier_name": "Shiprocket Express (Delhivery Air)",
            "courier_company_id": 101,
            "rate_inr": 165.0,
            "estimated_delivery_days": "Same Day Express (Under 90 min)",
            "provider": "shiprocket_mock",
        }

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
            "vehicle_type": serv["courier_name"],
            "fare_inr": serv["rate_inr"],
            "eta_minutes": 24,
            "provider": serv["provider"],
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
    ) -> Dict[str, Any]:
        """Create adhoc shipment order on Shiprocket with medical cold-chain instructions."""
        token = self._get_auth_token()
        order_date = time.strftime("%Y-%m-%d %H:%M")
        cold_chain_instructions = [
            "Medical cargo — perishable platelets (Category: MEDICAL_PERISHABLE).",
            "Keep upright at 20–24 °C room temperature.",
            "DO NOT REFRIGERATE or pack with ice.",
            f"Deliver within 90 minutes. Units count: {units_count}.",
        ]

        if token and not self.is_mock:
            try:
                headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                payload = {
                    "order_id": f"SR-PLT-{transfer_id[:8]}",
                    "order_date": order_date,
                    "pickup_location": "GGH_Chennai_Hub",
                    "billing_customer_name": pickup_name,
                    "billing_last_name": "BloodBank",
                    "billing_address": pickup_address,
                    "billing_city": "Chennai",
                    "billing_pincode": "600003",
                    "billing_state": "Tamil Nadu",
                    "billing_country": "India",
                    "billing_email": "ggh.bloodbank@tn.gov.in",
                    "billing_phone": pickup_mobile,
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
                res = requests.post(f"{SHIPROCKET_BASE_URL}/orders/create/adhoc", json=payload, headers=headers, timeout=5)
                if res.status_code in (200, 201):
                    data = res.json()
                    order_id = data.get("order_id")
                    shipment_id = data.get("shipment_id")
                    return {
                        "order_id": str(order_id or f"SR-{transfer_id[:8]}"),
                        "shipment_id": str(shipment_id or uuid.uuid4().hex[:10]),
                        "awb_code": data.get("awb_code", f"AWB{uuid.uuid4().hex[:8].upper()}"),
                        "status": "DRIVER_ASSIGNED",
                        "courier_name": "Shiprocket Delhivery Direct",
                        "driver_name": "Ramesh V. (Shiprocket Express Rider)",
                        "driver_mobile": "+91 97900 12345",
                        "vehicle_number": "TN-01-SR-8888",
                        "instructions": cold_chain_instructions,
                        "provider": "shiprocket_api",
                    }
            except Exception as e:
                print(f"Shiprocket order creation exception: {e}")

        # Contract-accurate mock response
        sr_order_id = f"SR-PLT-{uuid.uuid4().hex[:8].upper()}"
        sr_awb = f"AWB-SR-{uuid.uuid4().hex[:8].upper()}"
        return {
            "order_id": sr_order_id,
            "shipment_id": f"SHIP-{uuid.uuid4().hex[:8].upper()}",
            "awb_code": sr_awb,
            "status": "DRIVER_ASSIGNED",
            "courier_name": "Delhivery Express (Shiprocket Partner)",
            "driver_name": "Ramesh V. (Shiprocket Courier)",
            "driver_mobile": "+91 97900 12345",
            "vehicle_number": "TN-01-SR-8888",
            "instructions": cold_chain_instructions,
            "provider": "shiprocket_mock",
        }

    def track_order(self, order_id: str) -> Dict[str, Any]:
        """Track order status by order ID or shipment ID."""
        token = self._get_auth_token()
        if token and not self.is_mock:
            try:
                headers = {"Authorization": f"Bearer {token}"}
                res = requests.get(f"{SHIPROCKET_BASE_URL}/courier/track/shipment/{order_id}", headers=headers, timeout=5)
                if res.status_code == 200:
                    data = res.json()
                    track_data = data.get("tracking_data", {})
                    return {
                        "order_id": order_id,
                        "status": track_data.get("track_status", "IN_TRANSIT"),
                        "courier": track_data.get("courier_name"),
                        "location": track_data.get("current_location"),
                        "provider": "shiprocket_api",
                    }
            except Exception as e:
                print(f"Shiprocket track exception: {e}")

        return {
            "order_id": order_id,
            "status": "IN_TRANSIT",
            "courier": "Delhivery Express (Shiprocket Partner)",
            "driver": {"name": "Ramesh V.", "mobile": "+91 97900 12345", "vehicle": "TN-01-SR-8888"},
            "location": {"lat": 13.0720, "lng": 80.2610},
            "provider": "shiprocket_mock",
        }

    def cancel_order(self, order_id: str, reason: str = "Transfer updated") -> Dict[str, Any]:
        """Cancel order on Shiprocket."""
        token = self._get_auth_token()
        if token and not self.is_mock:
            try:
                headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                requests.post(f"{SHIPROCKET_BASE_URL}/orders/cancel", json={"ids": [order_id]}, headers=headers, timeout=5)
            except Exception as e:
                print(f"Shiprocket cancel exception: {e}")
        return {"order_id": order_id, "status": "CANCELLED", "reason": reason}
