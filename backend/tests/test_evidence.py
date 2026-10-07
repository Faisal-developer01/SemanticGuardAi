"""Recording evidence ordering, availability, and authenticated downloads."""
from __future__ import annotations

from io import BytesIO
import os
from pathlib import Path
import subprocess
import sys

import pytest

from app.services import storage_service


@pytest.mark.parametrize("azure,configured,expected", [
    (True, None, "/home/data/evidence"),
    (True, "/home/custom-evidence", "/home/custom-evidence"),
    (False, None, "./var/uploads"),
])
def test_recording_storage_defaults_are_persistent_on_azure(azure, configured, expected):
    env = {**os.environ}
    env.pop("STORAGE_LOCAL_PATH", None)
    env.pop("WEBSITE_HOSTNAME", None)
    if azure:
        env["WEBSITE_HOSTNAME"] = "recording-regression.azurewebsites.net"
    if configured:
        env["STORAGE_LOCAL_PATH"] = configured
    result = subprocess.run(
        [
            sys.executable, "-c",
            "import dotenv; dotenv.load_dotenv = lambda: None; "
            "from app.config import BaseConfig; print(BaseConfig.STORAGE_LOCAL_PATH)",
        ],
        cwd=Path(__file__).resolve().parents[1],
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == expected


def _session(client, auth_header):
    recruiter_headers = auth_header(client, "recruiter@test.rw")
    assessment = client.post(
        "/api/v1/assessments",
        headers=recruiter_headers,
        json={"title": "Recorded assessment", "durationMinutes": 60},
    ).get_json()
    client.patch(
        f"/api/v1/assessments/{assessment['id']}/status",
        headers=recruiter_headers,
        json={"status": "active"},
    )
    candidate_headers = auth_header(client, "candidate@test.rw")
    session = client.post(
        "/api/v1/sessions",
        headers=candidate_headers,
        json={"assessmentId": assessment["id"]},
    ).get_json()
    return session["id"], candidate_headers, recruiter_headers


def _upload(client, session_id, headers, captured_at, content=b"recorded-media"):
    return client.post(
        f"/api/v1/sessions/{session_id}/evidence",
        headers=headers,
        data={
            "file": (BytesIO(content), "recording.webm", "video/webm"),
            "type": "video",
            "capturedAt": captured_at,
        },
    )


@pytest.fixture(autouse=True)
def local_storage(app, tmp_path):
    original_provider = app.config["STORAGE_PROVIDER"]
    original_path = app.config["STORAGE_LOCAL_PATH"]
    app.config.update(STORAGE_PROVIDER="local", STORAGE_LOCAL_PATH=str(tmp_path))
    yield
    app.config.update(STORAGE_PROVIDER=original_provider, STORAGE_LOCAL_PATH=original_path)


def test_recordings_are_returned_in_capture_order(client, recruiter, candidate, auth_header):
    session_id, candidate_headers, recruiter_headers = _session(client, auth_header)
    later = _upload(client, session_id, candidate_headers, "2026-10-07T12:00:30Z")
    earlier = _upload(client, session_id, candidate_headers, "2026-10-07T12:00:00Z")
    assert later.status_code == earlier.status_code == 201

    response = client.get(f"/api/v1/sessions/{session_id}/evidence", headers=recruiter_headers)
    assert response.status_code == 200
    assert [clip["id"] for clip in response.get_json()] == [
        earlier.get_json()["id"], later.get_json()["id"],
    ]


def test_final_clip_can_upload_after_violation_submission(client, recruiter, candidate, auth_header):
    session_id, candidate_headers, recruiter_headers = _session(client, auth_header)
    submitted = client.post(f"/api/v1/sessions/{session_id}/submit", headers=candidate_headers)
    assert submitted.status_code == 200
    content = b"final-violation-segment"
    uploaded = _upload(
        client, session_id, candidate_headers, "2026-10-07T12:00:00Z", content,
    )
    assert uploaded.status_code == 201
    evidence_id = uploaded.get_json()["id"]
    response = client.get(
        f"/api/v1/evidence/{evidence_id}/download?inline=1", headers=recruiter_headers,
    )
    assert response.status_code == 200
    assert response.data == content
    assert response.mimetype == "video/webm"


def test_missing_recording_returns_explicit_not_found(
    client, recruiter, candidate, auth_header, monkeypatch,
):
    session_id, candidate_headers, recruiter_headers = _session(client, auth_header)
    uploaded = _upload(client, session_id, candidate_headers, "2026-10-07T12:00:00Z")
    assert uploaded.status_code == 201

    def missing(_key):
        raise FileNotFoundError("recording no longer exists")

    monkeypatch.setattr(storage_service, "read", missing)
    response = client.get(
        f"/api/v1/evidence/{uploaded.get_json()['id']}/download?inline=1",
        headers=recruiter_headers,
    )
    assert response.status_code == 404
    assert "no longer available" in response.get_json()["message"]


def test_download_requires_authentication(client, recruiter, candidate, auth_header):
    session_id, candidate_headers, _ = _session(client, auth_header)
    uploaded = _upload(client, session_id, candidate_headers, "2026-10-07T12:00:00Z")
    response = client.get(f"/api/v1/evidence/{uploaded.get_json()['id']}/download")
    assert response.status_code == 401


def test_missing_azure_blob_has_the_same_storage_error(monkeypatch):
    from azure.core.exceptions import ResourceNotFoundError

    class MissingBlob:
        def download_blob(self):
            raise ResourceNotFoundError("Blob not found")

    monkeypatch.setattr(storage_service, "_blob_client", lambda _key: MissingBlob())
    with pytest.raises(FileNotFoundError):
        storage_service._read_azure("missing-recording.webm")
