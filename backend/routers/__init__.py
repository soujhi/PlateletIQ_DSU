from routers.auth import router as auth_router
from routers.inventory import router as inventory_router
from routers.forecast import router as forecast_router
from routers.recommendation import router as recommendation_router
from routers.requisitions import router as requisitions_router
from routers.transfers import router as transfers_router
from routers.network import router as network_router
from routers.analytics import router as analytics_router
from routers.camp import router as camp_router
from routers.transport import transport_router

__all__ = [
    "auth_router",
    "inventory_router",
    "forecast_router",
    "recommendation_router",
    "requisitions_router",
    "transfers_router",
    "network_router",
    "analytics_router",
    "camp_router",
    "transport_router",
]

