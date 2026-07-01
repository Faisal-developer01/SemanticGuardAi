"""Risk engine: integrity-score calculation, event aggregation, thresholds, alerts."""
from __future__ import annotations

from datetime import datetime, timezone

from app.models.enums import AlertSeverity, AlertType, RiskLevel
from app.repositories import alerts, integrity_events, sessions

# Base risk weight added to a session's risk score per event type.
EVENT_WEIGHTS: dict[AlertType, float] = {
    AlertType.identity_mismatch: 30.0,
    AlertType.multiple_faces: 25.0,
    AlertType.phone_detected: 22.0,
    AlertType.object_detected: 15.0,
    AlertType.face_not_detected: 12.0,
    AlertType.looking_away: 8.0,
    AlertType.suspicious_movement: 7.0,
    AlertType.audio_detected: 6.0,
    AlertType.tab_switch: 10.0,
    AlertType.browser_unfocused: 5.0,
}

SEVERITY_MULTIPLIER = {
    AlertSeverity.low: 0.6,
    AlertSeverity.medium: 1.0,
    AlertSeverity.high: 1.5,
    AlertSeverity.critical: 2.0,
}

# Event types that always raise a reviewable alert.
ALERTABLE = {
    AlertType.identity_mismatch,
    AlertType.multiple_faces,
    AlertType.phone_detected,
    AlertType.object_detected,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _level_for(score: float) -> RiskLevel:
    if score >= 60:
        return RiskLevel.high
    if score >= 30:
        return RiskLevel.medium
    return RiskLevel.low


def severity_for(event_type: AlertType, confidence: float) -> AlertSeverity:
    if event_type in ALERTABLE:
        return AlertSeverity.critical if confidence >= 0.85 else AlertSeverity.high
    if confidence >= 0.8:
        return AlertSeverity.high
    if confidence >= 0.5:
        return AlertSeverity.medium
    return AlertSeverity.low


def record_event(session, event_type: AlertType, *, confidence: float = 0.0,
                 severity: AlertSeverity | None = None, occurred_at: datetime | None = None,
                 payload: dict | None = None):
    """Persist an integrity event, update the session risk score, and raise an
    alert when warranted. Returns ``(event, alert_or_none)``."""
    occurred = occurred_at or _now()
    severity = severity or severity_for(event_type, confidence)
    weight = EVENT_WEIGHTS.get(event_type, 5.0)
    risk_delta = round(weight * SEVERITY_MULTIPLIER[severity] * max(confidence, 0.5), 2)

    event = integrity_events.create(
        session_id=session.id, type=event_type, severity=severity, confidence=confidence,
        risk_delta=risk_delta, occurred_at=occurred, payload=payload, processed=True, commit=False,
    )

    # Update per-type counters.
    if event_type == AlertType.tab_switch:
        session.tab_switch_count += 1
    elif event_type == AlertType.looking_away:
        session.looking_away_count += 1
    elif event_type == AlertType.face_not_detected:
        session.face_not_detected_count += 1

    session.risk_score = min(100.0, round(session.risk_score + risk_delta, 2))
    session.integrity_score = max(0.0, round(100.0 - session.risk_score, 2))
    session.risk_level = _level_for(session.risk_score)

    alert = None
    if event_type in ALERTABLE or severity in (AlertSeverity.high, AlertSeverity.critical):
        alert = alerts.create(
            session_id=session.id, assessment_id=session.assessment_id,
            candidate_id=session.candidate_id, type=event_type, severity=severity,
            description=_describe(event_type, confidence), risk_score=session.risk_score,
            occurred_at=occurred, commit=False,
        )

    sessions.session.commit()
    return event, alert


def _describe(event_type: AlertType, confidence: float) -> str:
    pct = int(confidence * 100)
    labels = {
        AlertType.multiple_faces: "Multiple faces detected in frame",
        AlertType.phone_detected: "Mobile phone detected",
        AlertType.object_detected: "Prohibited object detected",
        AlertType.identity_mismatch: "Face does not match candidate identity",
        AlertType.looking_away: "Candidate repeatedly looking away from screen",
        AlertType.face_not_detected: "No face detected in frame",
        AlertType.tab_switch: "Candidate switched browser tab/window",
        AlertType.audio_detected: "Background voice/audio detected",
        AlertType.suspicious_movement: "Suspicious movement detected",
        AlertType.browser_unfocused: "Assessment window lost focus",
    }
    base = labels.get(event_type, event_type.value.replace("_", " ").title())
    return f"{base} (confidence {pct}%)"


def recompute(session) -> None:
    """Recalculate the session risk score from all its events (idempotent)."""
    total = sum(e.risk_delta for e in integrity_events.for_session(session.id).all())
    session.risk_score = min(100.0, round(total, 2))
    session.integrity_score = max(0.0, round(100.0 - session.risk_score, 2))
    session.risk_level = _level_for(session.risk_score)
    sessions.session.commit()


# ─── AI explainability: per-type risk contribution breakdown ─────────────────

# Short, recruiter-facing labels for each detectable signal.
FACTOR_LABELS: dict[AlertType, str] = {
    AlertType.identity_mismatch: "Identity Mismatch",
    AlertType.multiple_faces: "Multiple Faces",
    AlertType.phone_detected: "Phone Detection",
    AlertType.object_detected: "Prohibited Object",
    AlertType.face_not_detected: "No Face Detected",
    AlertType.looking_away: "Looking Away",
    AlertType.suspicious_movement: "Suspicious Movement",
    AlertType.audio_detected: "Background Voice",
    AlertType.tab_switch: "Tab Switching",
    AlertType.browser_unfocused: "Browser Unfocused",
    AlertType.devtools_open: "Developer Tools",
    AlertType.keyboard_shortcut: "Blocked Shortcut",
    AlertType.clipboard_attempt: "Clipboard Attempt",
    AlertType.multiple_tabs: "Duplicate Tab",
}

_SEVERITY_RANK = {
    AlertSeverity.low: 0,
    AlertSeverity.medium: 1,
    AlertSeverity.high: 2,
    AlertSeverity.critical: 3,
}


def _factor_label(event_type: AlertType) -> str:
    return FACTOR_LABELS.get(event_type, event_type.value.replace("_", " ").title())


def breakdown(session, *, timeline_limit: int = 200) -> dict:
    """Explain a session's risk score as weighted per-signal contributions.

    Returns the aggregated ``factors`` (each signal's total contribution to the
    risk score, sorted highest first) plus a chronological ``timeline`` of raw
    events for session replay. This backs the AI Explainability Dashboard.
    """
    events = list(integrity_events.for_session(session.id).all())

    agg: dict[str, dict] = {}
    for e in events:
        etype = e.type
        key = etype.value if etype else "unknown"
        entry = agg.get(key)
        if entry is None:
            entry = {
                "type": key,
                "label": _factor_label(etype) if etype else key,
                "count": 0,
                "contribution": 0.0,
                "_confidence_sum": 0.0,
                "severity": AlertSeverity.low,
                "lastOccurredAt": None,
            }
            agg[key] = entry
        entry["count"] += 1
        entry["contribution"] += e.risk_delta or 0.0
        entry["_confidence_sum"] += e.confidence or 0.0
        if e.severity and _SEVERITY_RANK[e.severity] > _SEVERITY_RANK[entry["severity"]]:
            entry["severity"] = e.severity
        if e.occurred_at and (entry["lastOccurredAt"] is None or e.occurred_at > entry["lastOccurredAt"]):
            entry["lastOccurredAt"] = e.occurred_at

    factors = []
    for entry in agg.values():
        count = entry["count"] or 1
        factors.append({
            "type": entry["type"],
            "label": entry["label"],
            "count": entry["count"],
            "contribution": round(entry["contribution"], 1),
            "avgConfidence": round(entry["_confidence_sum"] / count, 2),
            "severity": entry["severity"].value,
            "lastOccurredAt": entry["lastOccurredAt"].isoformat() if entry["lastOccurredAt"] else None,
        })
    factors.sort(key=lambda f: f["contribution"], reverse=True)

    ordered = sorted(events, key=lambda e: e.occurred_at or _now(), reverse=True)[:timeline_limit]
    timeline = [
        {
            "id": str(e.id),
            "type": e.type.value if e.type else None,
            "label": _factor_label(e.type) if e.type else None,
            "severity": e.severity.value if e.severity else None,
            "riskDelta": round(e.risk_delta or 0.0, 1),
            "confidence": round(e.confidence or 0.0, 2),
            "occurredAt": e.occurred_at.isoformat() if e.occurred_at else None,
            "payload": e.payload,
        }
        for e in ordered
    ]

    return {
        "sessionId": str(session.id),
        "riskScore": round(session.risk_score or 0.0, 1),
        "riskLevel": session.risk_level.value if session.risk_level else "low",
        "integrityScore": round(session.integrity_score if session.integrity_score is not None else 100.0, 1),
        "totalEvents": len(events),
        "factors": factors,
        "timeline": timeline,
    }
