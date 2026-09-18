from typing import Any
from services.transport.base import TransportProvider
from services.transport.internal import InternalFleetProvider
from services.transport.porter import PorterProvider
from services.transport.beckn import BecknLogisticsProvider
from services.config_service import get_config


def get_transport_provider(db_session: Any = None, provider_name: str = "") -> TransportProvider:
    """
    Factory function resolving the active TransportProvider based on:
    1. Explicit provider_name parameter
    2. Database config key 'TRANSPORT_PROVIDER'
    3. Default fallback to 'porter'
    """
    name = provider_name
    if not name and db_session:
        name = get_config(db_session, "TRANSPORT_PROVIDER")
    if not name:
        name = "porter"

    name = name.lower()
    if name == "internal":
        return InternalFleetProvider()
    elif name == "beckn":
        return BecknLogisticsProvider()
    else: # default porter
        return PorterProvider()
