"""
Minimal URL config. This project has no traditional views/pages on the
backend — the frontend is a separate React app, and the backend's only
job is WebSocket signaling (see matchmaking/routing.py). We keep a tiny
health-check endpoint so it's easy to confirm the server is up.
"""

from django.http import JsonResponse
from django.urls import path


def health(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("health/", health),
]
