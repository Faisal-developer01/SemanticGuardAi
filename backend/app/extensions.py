"""Shared Flask extension singletons.

Instantiated here without an app, then bound in the application factory via
``init_app``. This avoids circular imports across the package.
"""
from __future__ import annotations

from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail
from flask_migrate import Migrate
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Project-wide declarative base for all ORM models."""


db = SQLAlchemy(model_class=Base)
migrate = Migrate()
jwt = JWTManager()
cors = CORS()
mail = Mail()
socketio = SocketIO()
limiter = Limiter(key_func=get_remote_address)
