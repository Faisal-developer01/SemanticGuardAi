"""Application-factory and live monitoring/signaling regressions."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

from app.extensions import socketio


def test_reinitializing_app_preserves_all_socket_handlers():
    script = """
from app import create_app
from app.extensions import socketio
first = create_app('testing')
expected = set(socketio.server.handlers['/'])
second = create_app('testing')
assert set(socketio.server.handlers.get('/', {})) == expected
client = socketio.test_client(second)
assert not client.is_connected(), 'Missing connect handler accepts anonymous sockets'
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).resolve().parents[1],
        env={**os.environ, "FLASK_ENV": "testing", "PROCTORING_SMS_ALERT_ENABLED": "false"},
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_importing_email_tasks_preserves_live_monitoring_connection():
    script = """
import threading
from flask_jwt_extended import create_access_token
from socketio import Client
from werkzeug.serving import make_server
from app import create_app
from app.extensions import db, socketio

app = create_app('testing')
with app.app_context():
    db.create_all()
    token = create_access_token(identity='monitor', additional_claims={'role': 'recruiter'})
live_server = socketio.server
http = make_server('127.0.0.1', 0, app, threaded=True)
thread = threading.Thread(target=http.serve_forever, daemon=True)
thread.start()
client = Client()
joined = threading.Event()
snapshot = threading.Event()
client.on('monitoring_joined', lambda data: joined.set())
client.on('monitoring_snapshot', lambda data: snapshot.set())
try:
    client.connect(f'http://127.0.0.1:{http.server_port}', auth={'token': token}, transports=['polling'])
    client.emit('join_monitoring', {})
    assert joined.wait(3) and snapshot.wait(3), 'Initial live monitoring did not join'
    joined.clear()
    snapshot.clear()
    with app.app_context():
        from app import tasks
    assert socketio.server is live_server, 'Email task import replaced the live Socket.IO server'
    assert tasks.celery.flask_app is app, 'Email tasks must reuse the requesting Flask app'
    client.emit('join_monitoring', {})
    assert joined.wait(3) and snapshot.wait(3), 'Email initialization broke the existing live connection'
finally:
    client.disconnect()
    http.shutdown()
    thread.join(timeout=3)
    http.server_close()
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).resolve().parents[1],
        env={**os.environ, "FLASK_ENV": "testing", "PROCTORING_SMS_ALERT_ENABLED": "false"},
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def _start(client, auth_header):
    recruiter_headers = auth_header(client, "recruiter@test.rw")
    assessment = client.post(
        "/api/v1/assessments", headers=recruiter_headers,
        json={"title": "Live signaling regression", "durationMinutes": 60},
    ).get_json()
    client.patch(
        f"/api/v1/assessments/{assessment['id']}/status",
        headers=recruiter_headers, json={"status": "active"},
    )
    candidate_headers = auth_header(client, "candidate@test.rw")
    started = client.post(
        "/api/v1/sessions", headers=candidate_headers,
        json={"assessmentId": assessment["id"]},
    )
    assert started.status_code == 201
    return started.get_json(), recruiter_headers, candidate_headers


def _socket(app, headers):
    return socketio.test_client(
        app, auth={"token": headers["Authorization"].removeprefix("Bearer ")},
    )


def _event(client, name):
    return next(event["args"][0] for event in client.get_received() if event["name"] == name)


def test_joining_monitoring_hydrates_already_active_sessions(
    app, client, recruiter, candidate, auth_header, monkeypatch,
):
    monkeypatch.setitem(app.config, "PROCTORING_SMS_ALERT_ENABLED", False)
    session, recruiter_headers, _ = _start(client, auth_header)
    monitor = _socket(app, recruiter_headers)
    try:
        monitor.emit("join_monitoring", {})
        events = monitor.get_received()
        assert any(event["name"] == "monitoring_joined" for event in events)
        snapshot = next(event["args"][0] for event in events if event["name"] == "monitoring_snapshot")
        assert [item["sessionId"] for item in snapshot["sessions"]] == [session["id"]]
        assert snapshot["sessions"][0]["status"] == "in_progress"
    finally:
        monitor.disconnect()


def test_submission_pushes_terminal_status_to_monitors(
    app, client, recruiter, candidate, auth_header, monkeypatch,
):
    monkeypatch.setitem(app.config, "PROCTORING_SMS_ALERT_ENABLED", False)
    session, recruiter_headers, candidate_headers = _start(client, auth_header)
    monitor = _socket(app, recruiter_headers)
    try:
        monitor.emit("join_monitoring", {})
        monitor.get_received()
        response = client.post(
            f"/api/v1/sessions/{session['id']}/submit", headers=candidate_headers,
        )
        assert response.status_code == 200
        update = _event(monitor, "session_update")
        assert update["sessionId"] == session["id"]
        assert update["status"] == "completed"
    finally:
        monitor.disconnect()


def test_real_signaling_handlers_relay_request_offer_answer_and_ice(
    app, client, recruiter, candidate, auth_header, monkeypatch,
):
    monkeypatch.setitem(app.config, "PROCTORING_SMS_ALERT_ENABLED", False)
    session, recruiter_headers, candidate_headers = _start(client, auth_header)
    monitor = _socket(app, recruiter_headers)
    publisher = _socket(app, candidate_headers)
    try:
        monitor.get_received()
        publisher.get_received()
        monitor.emit("webrtc_request", {"candidateId": str(candidate.id), "sessionId": session["id"]})
        request = _event(publisher, "webrtc_request")
        assert request["viewerId"] == str(recruiter.id)
        assert request["sessionId"] == session["id"]
        offer = {"type": "offer", "sdp": "unit-test-offer"}
        publisher.emit("webrtc_offer", {"viewerId": request["viewerId"], "sessionId": session["id"], "sdp": offer})
        received_offer = _event(monitor, "webrtc_offer")
        assert received_offer["candidateId"] == str(candidate.id)
        assert received_offer["sdp"] == offer
        answer = {"type": "answer", "sdp": "unit-test-answer"}
        monitor.emit("webrtc_answer", {"candidateId": str(candidate.id), "sdp": answer})
        assert _event(publisher, "webrtc_answer")["sdp"] == answer
        ice = {"candidate": "unit-test-ice"}
        monitor.emit("webrtc_ice", {"targetId": str(candidate.id), "candidate": ice})
        assert _event(publisher, "webrtc_ice")["fromId"] == str(recruiter.id)
        publisher.emit("webrtc_ice", {"targetId": str(recruiter.id), "candidate": ice})
        assert _event(monitor, "webrtc_ice")["fromId"] == str(candidate.id)
    finally:
        publisher.disconnect()
        monitor.disconnect()
