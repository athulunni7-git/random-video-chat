"""
Django settings for the random-video-chat backend.

This is intentionally minimal: no database-backed apps for users/profiles,
since this project stores no persistent user data. Django Channels turns
this into an ASGI app so it can handle WebSocket connections alongside
(or instead of) regular HTTP views.
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Security -----------------------------------------------------------
# Replace with a real secret in production (env var), and set DEBUG=False.
SECRET_KEY = "dev-only-secret-key-change-me"
DEBUG = True
ALLOWED_HOSTS = ["*"]  # Tighten this in production.

# --- Applications ---------------------------------------------------------
INSTALLED_APPS = [
    "daphne",
    "django.contrib.staticfiles",
    "channels",
    "corsheaders",
    "matchmaking",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

# --- ASGI / Channels ------------------------------------------------------
# ASGI_APPLICATION points Channels/Daphne at the app defined in asgi.py,
# which routes HTTP to Django as normal and WebSockets to our consumer.
ASGI_APPLICATION = "config.asgi.application"

# In-memory channel layer: fine for a single-process dev server, since the
# matchmaking queue itself is also just an in-memory Python list (see
# matchmaking/consumers.py). For a multi-process/multi-machine production
# deployment you would switch this to channels_redis so all workers share
# the same layer, and move the waiting queue into Redis too.
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

# --- CORS -------------------------------------------------------------
# Allows the Vite dev server (default port 5173) to talk to this backend.
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
CORS_ALLOW_ALL_ORIGINS = DEBUG  # Convenience for local dev only.

# --- Misc -------------------------------------------------------------
# No database is configured/needed: this project stores no user data.
DATABASES = {}

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
