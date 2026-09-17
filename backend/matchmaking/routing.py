"""
Maps the WebSocket URL the frontend connects to (ws://.../ws/matchmaking/)
to the consumer that handles matchmaking + signaling.
"""

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r"^ws/matchmaking/$", consumers.MatchmakingConsumer.as_asgi()),
]
