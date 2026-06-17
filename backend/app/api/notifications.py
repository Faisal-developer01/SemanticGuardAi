"""Notifications API."""
from __future__ import annotations

from flask import Blueprint
from flask_jwt_extended import jwt_required

from app.api.helpers import ok, paginated, pagination_args
from app.repositories import notifications as notif_repo
from app.schemas import NotificationSchema
from app.services.rbac import current_user

bp = Blueprint("notifications", __name__)
_schema = NotificationSchema()


@bp.get("")
@jwt_required()
def list_notifications():
    user = current_user()
    args = pagination_args()
    page = notif_repo.paginate(**args, query=notif_repo.for_user(user.id))
    return paginated(page, _schema.dump)


@bp.get("/unread-count")
@jwt_required()
def unread_count():
    return ok({"count": notif_repo.unread_count(current_user().id)})


@bp.post("/<uuid:notification_id>/read")
@jwt_required()
def mark_read(notification_id):
    user = current_user()
    notif = notif_repo.get_or_404(str(notification_id))
    if str(notif.user_id) != str(user.id):
        from app.errors import ForbiddenError

        raise ForbiddenError("Not your notification")
    notif.read = True
    notif_repo.session.commit()
    return ok(_schema.dump(notif))


@bp.post("/read-all")
@jwt_required()
def mark_all_read():
    count = notif_repo.mark_all_read(current_user().id)
    return ok({"updated": count})
