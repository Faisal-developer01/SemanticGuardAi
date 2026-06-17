"""Assessment & session CRUD tests (Step 2)."""
from __future__ import annotations


def _create_assessment(client, headers):
    return client.post(
        "/api/v1/assessments",
        headers=headers,
        json={"title": "Backend Screening", "position": "Backend Engineer", "durationMinutes": 60},
    )


def test_recruiter_creates_assessment(client, recruiter, auth_header):
    headers = auth_header(client, "recruiter@test.rw")
    resp = _create_assessment(client, headers)
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["title"] == "Backend Screening"
    assert body["status"] == "draft"


def test_candidate_cannot_create_assessment(client, candidate, auth_header):
    headers = auth_header(client, "candidate@test.rw")
    assert _create_assessment(client, headers).status_code == 403


def test_assessment_pagination(client, recruiter, auth_header):
    headers = auth_header(client, "recruiter@test.rw")
    for _ in range(3):
        _create_assessment(client, headers)
    resp = client.get("/api/v1/assessments?perPage=2", headers=headers)
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["meta"]["total"] == 3
    assert len(payload["items"]) == 2
    assert payload["meta"]["pages"] == 2


def test_add_question_and_status_change(client, recruiter, auth_header):
    headers = auth_header(client, "recruiter@test.rw")
    aid = _create_assessment(client, headers).get_json()["id"]

    q = client.post(
        f"/api/v1/assessments/{aid}/questions",
        headers=headers,
        json={
            "text": "What is 2+2?",
            "type": "multiple_choice",
            "options": ["3", "4", "5"],
            "correctAnswer": "4",
            "marks": 5,
        },
    )
    assert q.status_code == 201

    status = client.patch(
        f"/api/v1/assessments/{aid}/status", headers=headers, json={"status": "active"}
    )
    assert status.status_code == 200
    assert status.get_json()["status"] == "active"


def test_full_session_flow(client, recruiter, candidate, auth_header):
    rec_headers = auth_header(client, "recruiter@test.rw")
    aid = _create_assessment(client, rec_headers).get_json()["id"]
    client.post(
        f"/api/v1/assessments/{aid}/questions",
        headers=rec_headers,
        json={"text": "2+2?", "type": "multiple_choice", "options": ["3", "4"], "correctAnswer": "4", "marks": 10},
    )
    client.patch(f"/api/v1/assessments/{aid}/status", headers=rec_headers, json={"status": "active"})

    cand_headers = auth_header(client, "candidate@test.rw")
    start = client.post("/api/v1/sessions", headers=cand_headers, json={"assessmentId": aid})
    assert start.status_code == 201
    sid = start.get_json()["id"]

    qid = client.get(f"/api/v1/assessments/{aid}/questions", headers=cand_headers).get_json()[0]["id"]
    ans = client.post(
        f"/api/v1/sessions/{sid}/answers", headers=cand_headers,
        json={"questionId": qid, "response": "4"},
    )
    assert ans.status_code == 200

    # A monitoring event raises the risk score.
    ev = client.post(
        f"/api/v1/sessions/{sid}/events", headers=cand_headers,
        json={"type": "phone_detected", "confidence": 0.9},
    )
    assert ev.status_code == 200
    assert ev.get_json()["alert"] is not None

    submit = client.post(f"/api/v1/sessions/{sid}/submit", headers=cand_headers)
    assert submit.status_code == 200
    result = submit.get_json()
    assert result["score"] == 10.0
    assert result["passed"] is True
    assert result["riskScore"] > 0
