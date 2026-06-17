"""Celery application bound to the Flask app context.

Run workers with:
    celery -A celery_app.celery worker --loglevel=info
    celery -A celery_app.celery beat --loglevel=info
"""
from __future__ import annotations

import os

from celery import Celery

from app import create_app


def make_celery() -> Celery:
    flask_app = create_app(os.getenv("FLASK_ENV"))
    celery = Celery(
        flask_app.import_name,
        broker=flask_app.config["CELERY_BROKER_URL"],
        backend=flask_app.config["CELERY_RESULT_BACKEND"],
        include=["app.tasks"],
    )
    celery.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
    )

    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with flask_app.app_context():
                return self.run(*args, **kwargs)

    celery.Task = ContextTask
    celery.flask_app = flask_app
    return celery


celery = make_celery()
