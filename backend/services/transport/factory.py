from typing import Any, Dict
from services.transport.base import TransportProvider
from services.transport.internal import InternalFleetProvider
from services.transport.porter import PorterProvider
from services.transport.beckn import BecknLogisticsProvider
from services.transport.shiprocket import ShiprocketTransportProvider
from services.config_service import get_config

_PROVIDER_INSTANCES: Dict[str, TransportProvider] = {}


def get_transport_provider(db_session: Any = None, provider_name: str = "") -> TransportProvider:
    """
    Factory function resolving the active TransportProvider singleton based on:
    1. Explicit provider_name parameter
    2. Database config key 'TRANSPORT_PROVIDER'
    3. Default fallback to 'shiprocket'
    """
    name = provider_name
    if not name and db_session:
        name = get_config(db_session, "TRANSPORT_PROVIDER")
    if not name:
        name = "shiprocket"

    name = name.lower()
    if name not in _PROVIDER_INSTANCES:
        if name == "shiprocket":
            _PROVIDER_INSTANCES[name] = ShiprocketTransportProvider()
        elif name == "internal":
            _PROVIDER_INSTANCES[name] = InternalFleetProvider()
        elif name == "beckn":
            _PROVIDER_INSTANCES[name] = BecknLogisticsProvider()
        else:  # default porter
            _PROVIDER_INSTANCES[name] = PorterProvider()

    return _PROVIDER_INSTANCES[name]
