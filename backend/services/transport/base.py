from typing import Protocol, Dict, Any, Optional


class TransportProvider(Protocol):
    """
    Unified TransportProvider interface for PlateletIQ V2.
    Supports Internal Fleet, Porter API, and ONDC/Beckn BAP implementations.
    """

    def get_quote(
        self,
        pickup_lat: float,
        pickup_lng: float,
        drop_lat: float,
        drop_lng: float,
        customer_name: str = "Blood Bank",
        customer_mobile: str = "9876543210",
    ) -> Dict[str, Any]:
        ...

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
        ...

    def track_order(self, order_id: str) -> Dict[str, Any]:
        ...

    def cancel_order(self, order_id: str, reason: str = "Transfer updated") -> Dict[str, Any]:
        ...
