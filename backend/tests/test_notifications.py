"""Real-time notification tests (Step 6).

Verifies that an integrity alert raised during a session creates a persisted
notification for the recruiter who owns the assessment, and that the
notifications API exposes it with an accurate unread count.
"""
from __future__ import annotations


def _active_assessment_with_question(client, rec_headers):
    aid = client.post(
        "/api/v1/assessments",
        headers=rec_headers,
        json={"title": "Proctored Screening", "position": "Engineer", "durationMinutes": 30},
    ).get_json()["id"]
    client.post(
        f"/api/v1/assessments/{aid}/questions",
        headers=rec_headers,
        json={"text": "2+2?", "type": "multiple_choice", "options": ["3", "4"], "correctAnswer": "4", "marks": 10},
    )
    client.patch(f"/api/v1/assessments/{aid}/status", headers=rec_headers, json={"status": "active"})
    return aid


def test_alert_creates_recruiter_notification(client, recruiter, candidate, auth_header):
    rec_headers = auth_header(client, "recruiter@test.rw")
    aid = _active_assessment_with_question(client, rec_headers)

    cand_headers = auth_header(client, "candidate@test.rw")
    sid = client.post("/api/v1/sessions", headers=cand_headers, json={"assessmentId": aid}).get_json()["id"]

    # Recruiter starts with no notifications.
    assert client.get("/api/v1/notifications/unread-count", headers=rec_headers).get_json()["count"] == 0

    # A high-confidence phone detection raises an alert -> recruiter notification.
    ev = client.post(
        f"/api/v1/sessions/{sid}/events", headers=cand_headers,
        json={"type": "phone_detected", "confidence": 0.95},
    )
    assert ev.status_code == 200
    assert ev.get_json()["alert"] is not None

    count = client.get("/api/v1/notifications/unread-count", headers=rec_headers).get_json()["count"]
    assert count == 1

    listing = client.get("/api/v1/notifications", headers=rec_headers).get_json()
    assert listing["meta"]["total"] == 1
    notif = listing["items"][0]
    assert notif["type"] == "alert"
    assert "Candidate User" in notif["message"]
    assert notif["read"] is False
    assert notif["link"] == "/recruiter/monitoring"


def test_candidate_does_not_receive_recruiter_alert(client, recruiter, candidate, auth_header):
    rec_headers = auth_header(client, "recruiter@test.rw")
    aid = _active_assessment_with_question(client, rec_headers)

    cand_headers = auth_header(client, "candidate@test.rw")
    sid = client.post("/api/v1/sessions", headers=cand_headers, json={"assessmentId": aid}).get_json()["id"]
    client.post(
        f"/api/v1/sessions/{sid}/events", headers=cand_headers,
        json={"type": "phone_detected", "confidence": 0.95},
    )

    # The alert notification belongs to the recruiter, not the candidate.
    assert client.get("/api/v1/notifications/unread-count", headers=cand_headers).get_json()["count"] == 0
