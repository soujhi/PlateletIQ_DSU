"""
Resolves the courier adapter for a transfer.

An unknown provider name is an error, not a silent substitution. Quietly
falling back to a different courier would book a real shipment with the wrong
integration and report a status nobody can act on.
"""

from typing import Any, Dict, Tuple

from services.transport.base import TransportError, TransportProvider
from services.transport.beckn import BecknLogisticsProvider
from services.transport.internal import InternalFleetProvider
from services.transport.porter import PorterProvider
from services.transport.shiprocket import ShiprocketTransportProvider
from services.config_service import get_config

DEFAULT_PROVIDER = "shiprocket"

_BUILDERS = {
    "shiprocket": ShiprocketTransportProvider,
    "internal": InternalFleetProvider,
    "beckn": BecknLogisticsProvider,
    "porter": PorterProvider,
}

_INSTANCES: Dict[str, TransportProvider] = {}


def resolve_provider_name(db_session: Any = None, provider_name: str = "") -> str:
    """
    Canonical provider key for a request.

    Accepts the decorated names adapters report about themselves
    (``shiprocket_api``, ``shiprocket_simulated``, ``porter_sandbox``, …) so a
    value round-tripped through a stored transfer still resolves to the same
    adapter it was booked with.
    """
    name = (provider_name or "").strip().lower()

    if not name and db_session is not None:
        name = (get_config(db_session, "TRANSPORT_PROVIDER") or "").strip().lower()

    if not name:
        return DEFAULT_PROVIDER

    if name in _BUILDERS:
        return name

    for key in _BUILDERS:
        if name.startswith(key):
            return key

    raise TransportError(
        f"Unknown transport provider '{provider_name}'. Known providers: {', '.join(sorted(_BUILDERS))}.",
        provider=name,
        status_code=400,
    )


def get_transport_provider(db_session: Any = None, provider_name: str = "") -> TransportProvider:
    key = resolve_provider_name(db_session, provider_name)
    if key not in _INSTANCES:
        _INSTANCES[key] = _BUILDERS[key]()
    return _INSTANCES[key]


def get_named_provider(db_session: Any = None, provider_name: str = "") -> Tuple[str, TransportProvider]:
    """The adapter together with the canonical key it should be stored under."""
    key = resolve_provider_name(db_session, provider_name)
    if key not in _INSTANCES:
        _INSTANCES[key] = _BUILDERS[key]()
    return key, _INSTANCES[key]
