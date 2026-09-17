"""
ASGI config for the random-video-chat backend.

ProtocolTypeRouter inspects each incoming connection: normal HTTP requests
go to Django's usual ASGI handler, while WebSocket connections are routed
through matchmaking/routing.py to our MatchmakingConsumer.
"""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# django_asgi_app must be created before importing anything that touches
# Django models/apps (Channels routing does not here, but this ordering
# is the documented-safe pattern).
django_asgi_app = get_asgi_application()

from matchmaking.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": URLRouter(websocket_urlpatterns),
    }
)
