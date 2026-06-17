"""WSGI / SocketIO entry point for Gunicorn & local dev."""
from __future__ import annotations

import os

from app import create_app
from app.extensions import socketio

app = create_app(os.getenv("FLASK_ENV"))

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=app.debug, allow_unsafe_werkzeug=True)
