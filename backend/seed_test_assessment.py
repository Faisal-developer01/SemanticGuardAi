"""Seed a single empty QA assessment for verifying the Manage Questions flow.

Usage:
    python seed_test_assessment.py [recruiter_email]

Creates one active, empty assessment owned by the given recruiter (default:
ziada@gmail.com) so you can open Manage Questions, select it, and confirm that
"Add Question -> Save Question" works end to end.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.extensions import db
from app.models import User
from app.models.assessment import Assessment
from app.models.enums import AssessmentStatus

TITLE = "QA – Manage Questions Test"


def now() -> datetime:
    return datetime.now(timezone.utc)


def main() -> int:
    email = sys.argv[1] if len(sys.argv) > 1 else "ziada@gmail.com"
    app = create_app()
    with app.app_context():
        rec = User.query.filter_by(email=email).first()
        if not rec:
            print(f"ERROR: recruiter '{email}' not found.")
            return 1

        existing = Assessment.query.filter_by(recruiter_id=rec.id, title=TITLE).first()
        if existing:
            print(f"Test assessment already exists: {existing.id} ({TITLE})")
            return 0

        assessment = Assessment(
            title=TITLE,
            description="Empty assessment created for verifying the Add Question / Save Question flow.",
            position="QA Tester",
            recruiter_id=rec.id,
            duration_minutes=30,
            start_time=now(),
            end_time=now() + timedelta(days=7),
            status=AssessmentStatus.active,
            risk_threshold=60.0,
            pass_mark=50.0,
            shuffle_questions=False,
        )
        db.session.add(assessment)
        db.session.commit()
        print(f"Created test assessment {assessment.id} for {email}")
        print(f"  Title: {TITLE}")
        print("  Open Manage Questions, select it, then Add Question -> Save.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
