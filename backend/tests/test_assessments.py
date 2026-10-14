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


def test_update_coding_question_replaces_test_cases(client, recruiter, auth_header):
    headers = auth_header(client, "recruiter@test.rw")
    assessment_id = _create_assessment(client, headers).get_json()["id"]
    created = client.post(
        f"/api/v1/assessments/{assessment_id}/questions", headers=headers,
        json={
            "text": "Add two values", "type": "coding", "marks": 5,
            "entryPoint": "add", "languages": ["javascript"],
            "starterCodes": {"javascript": "function add(a, b) {}"},
            "testCases": [{"args": [1, 2], "expectedOutput": "3", "hidden": False}],
        },
    )
    assert created.status_code == 201
    question_id = created.get_json()["id"]
    response = client.put(f"/api/v1/questions/{question_id}", headers=headers, json={
        "text": "Multiply two values", "type": "coding", "marks": 8,
        "entryPoint": "multiply", "languages": ["javascript"],
        "starterCodes": {"javascript": "function multiply(a, b) {}"},
        "testCases": [
            {"args": [2, 3], "expectedOutput": "6", "hidden": False, "order": 1},
            {"args": [4, 5], "expectedOutput": "20", "hidden": True, "order": 2},
        ],
    })
    assert response.status_code == 200
    stored = client.get(f"/api/v1/assessments/{assessment_id}/questions", headers=headers).get_json()[0]
    assert stored["text"] == "Multiply two values"
    assert stored["marks"] == 8
    assert stored["entryPoint"] == "multiply"
    assert [case["expectedOutput"] for case in stored["testCases"]] == ["6", "20"]
    assert stored["testCases"][1]["hidden"] is True


def test_question_options_full_edit_and_delete(client, recruiter, candidate, auth_header):
    headers = auth_header(client, "recruiter@test.rw")
    assessment_id = _create_assessment(client, headers).get_json()["id"]
    created = client.post(f"/api/v1/assessments/{assessment_id}/questions", headers=headers, json={
        "text": "Which Git command creates a branch?", "type": "multiple_choice", "marks": 5,
        "options": [{"text": "git branch", "isCorrect": True}, {"text": "git create", "isCorrect": False}],
    })
    question_id = created.get_json()["id"]
    edited = client.put(f"/api/v1/questions/{question_id}", headers=headers, json={
        "text": "Which command creates and switches to a branch?", "marks": 8,
        "difficulty": "hard", "required": False,
        "options": [
            {"text": "git branch feature-login", "isCorrect": False},
            {"text": "git switch -c feature-login", "isCorrect": True, "explanation": "Creates and switches."},
            {"text": "git new feature-login", "isCorrect": False},
        ],
    })
    assert edited.status_code == 200
    stored = client.get(f"/api/v1/assessments/{assessment_id}/questions", headers=headers).get_json()[0]
    assert len(stored["options"]) == 3
    assert stored["options"][1]["text"] == "git switch -c feature-login"
    assert stored["options"][1]["isCorrect"] is True
    assert stored["options"][1]["explanation"] == "Creates and switches."
    assert stored["marks"] == 8
    assert stored["difficulty"] == "hard"
    assert stored["required"] is False
    candidate_headers = auth_header(client, "candidate@test.rw")
    public = client.get(f"/api/v1/assessments/{assessment_id}/questions", headers=candidate_headers).get_json()[0]
    assert public["correctAnswer"] is None
    assert all("isCorrect" not in option and "explanation" not in option for option in public["options"])
    assert client.put(f"/api/v1/questions/{question_id}", headers=candidate_headers, json={"text": "Tampered"}).status_code == 403
    assert client.delete(f"/api/v1/questions/{question_id}", headers=headers).status_code == 200
    assert client.get(f"/api/v1/assessments/{assessment_id}/questions", headers=headers).get_json() == []


def test_question_answers_edit_without_leaking_to_candidates(client, recruiter, candidate, auth_header):
    headers = auth_header(client, "recruiter@test.rw")
    candidate_headers = auth_header(client, "candidate@test.rw")
    assessment_id = _create_assessment(client, headers).get_json()["id"]
    for question_type, answer in [("true_false", "False"), ("short_answer", "Model answer")]:
        created = client.post(f"/api/v1/assessments/{assessment_id}/questions", headers=headers, json={
            "text": "Initial prompt", "type": question_type, "correctAnswer": answer,
        })
        question_id = created.get_json()["id"]
        assert created.get_json()["correctAnswer"] == answer
        edited = client.put(f"/api/v1/questions/{question_id}", headers=headers, json={
            "text": "Updated prompt", "correctAnswer": "True" if question_type == "true_false" else "Updated model",
        })
        assert edited.status_code == 200
        assert edited.get_json()["correctAnswer"] != answer
    public = client.get(f"/api/v1/assessments/{assessment_id}/questions", headers=candidate_headers).get_json()
    assert all(question["correctAnswer"] is None for question in public)


def test_coding_partial_update_preserves_cases_and_empty_list_clears_them(client, recruiter, candidate, auth_header):
    headers = auth_header(client, "recruiter@test.rw")
    assessment_id = _create_assessment(client, headers).get_json()["id"]
    created = client.post(f"/api/v1/assessments/{assessment_id}/questions", headers=headers, json={
        "text": "Coding prompt", "type": "coding",
        "testCases": [
            {"args": [1], "expectedOutput": "1", "hidden": False},
            {"args": [2], "expectedOutput": "2", "hidden": True},
        ],
    })
    question_id = created.get_json()["id"]
    edited = client.put(f"/api/v1/questions/{question_id}", headers=headers, json={"text": "Updated coding prompt"})
    assert len(edited.get_json()["testCases"]) == 2
    public = client.get(f"/api/v1/assessments/{assessment_id}/questions", headers=auth_header(client, "candidate@test.rw")).get_json()[0]
    assert len(public["testCases"]) == 1
    assert public["testCases"][0]["hidden"] is False
    cleared = client.put(f"/api/v1/questions/{question_id}", headers=headers, json={"testCases": []})
    assert cleared.status_code == 200
    assert cleared.get_json()["testCases"] == []


def test_question_type_change_clears_obsolete_fields(client, recruiter, auth_header):
    headers = auth_header(client, "recruiter@test.rw")
    assessment_id = _create_assessment(client, headers).get_json()["id"]
    created = client.post(f"/api/v1/assessments/{assessment_id}/questions", headers=headers, json={
        "text": "Coding prompt", "type": "coding", "entryPoint": "solve",
        "starterCodes": {"javascript": "function solve() {}"},
        "languages": ["javascript"], "testCases": [{"args": [], "expectedOutput": "1"}],
    })
    question_id = created.get_json()["id"]
    changed = client.put(f"/api/v1/questions/{question_id}", headers=headers, json={
        "type": "multiple_choice", "options": [{"text": "One", "isCorrect": True}, {"text": "Two"}],
    })
    assert changed.status_code == 200
    assert changed.get_json()["testCases"] == []
    assert changed.get_json()["entryPoint"] is None
    assert changed.get_json()["starterCodes"] is None
    changed = client.put(f"/api/v1/questions/{question_id}", headers=headers, json={
        "type": "short_answer", "correctAnswer": "Model answer",
    })
    assert changed.status_code == 200
    assert changed.get_json()["options"] is None
    assert changed.get_json()["correctAnswer"] == "Model answer"


def test_starting_session_emits_candidate_started_to_monitor(
    client, recruiter, candidate, auth_header, app
):
    from app.extensions import socketio

    recruiter_headers = auth_header(client, "recruiter@test.rw")
    assessment_id = _create_assessment(client, recruiter_headers).get_json()["id"]
    client.patch(
        f"/api/v1/assessments/{assessment_id}/status",
        headers=recruiter_headers,
        json={"status": "active"},
    )

    recruiter_token = recruiter_headers["Authorization"].removeprefix("Bearer ")
    monitor = socketio.test_client(app, auth={"token": recruiter_token})
    monitor.emit("join_monitoring", {})

    candidate_headers = auth_header(client, "candidate@test.rw")
    started = client.post(
        "/api/v1/sessions",
        headers=candidate_headers,
        json={"assessmentId": assessment_id},
    )
    assert started.status_code == 201
    session = started.get_json()
    assert session["candidateId"] == str(candidate.id)
    assert session["candidateCode"] == candidate.candidate_profile.candidate_code
    retrieved = client.get(f"/api/v1/sessions/{session['id']}", headers=candidate_headers)
    assert retrieved.get_json()["candidateCode"] == candidate.candidate_profile.candidate_code
    listed = client.get("/api/v1/sessions", headers=recruiter_headers).get_json()
    assert listed["items"][0]["candidateCode"] == candidate.candidate_profile.candidate_code

    events = monitor.get_received()
    payload = next(
        event["args"][0] for event in events if event["name"] == "candidate_started"
    )
    assert payload["candidateId"] == str(candidate.id)
    assert payload["sessionId"] == session["id"]
    assert payload["assessmentId"] == assessment_id
    assert payload["candidateName"] == candidate.full_name
    assert payload["status"] == "in_progress"

    candidate_token = candidate_headers["Authorization"].removeprefix("Bearer ")
    candidate_socket = socketio.test_client(app, auth={"token": candidate_token})
    candidate_socket.emit("join_session", {"sessionId": session["id"]})
    joined = candidate_socket.get_received()
    assert any(event["name"] == "session_joined" for event in joined)
    candidate_socket.disconnect()
    monitor.disconnect()


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
