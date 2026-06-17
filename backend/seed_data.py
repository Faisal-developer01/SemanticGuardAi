"""Seed sample assessments, questions, and sessions into the database."""
from __future__ import annotations

import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta, timezone
from app import create_app
from app.extensions import db
from app.models import User
from app.models.assessment import Assessment
from app.models.question import Question, TestCase
from app.models.session import AssessmentSession
from app.models.enums import (
    AssessmentStatus, QuestionType, SessionStatus, RiskLevel,
)

app = create_app()

def now():
    return datetime.now(timezone.utc)

with app.app_context():
    rec = User.query.filter_by(email="sarah.williams@semanticservices.rw").first()
    if not rec:
        print("ERROR: Recruiter user not found. Run seed-roles first.")
        sys.exit(1)

    existing = Assessment.query.filter_by(recruiter_id=rec.id).count()
    if existing > 0:
        print(f"Already have {existing} assessments for recruiter. Skipping seed.")
        sys.exit(0)

    # ─── Assessment 1: Software Engineer Technical ──────────────────────────
    a1 = Assessment(
        title="Senior Software Engineer – Technical Assessment",
        description="Comprehensive technical assessment for senior software engineering candidates. Covers data structures, algorithms, system design, and practical coding.",
        position="Senior Software Engineer",
        recruiter_id=rec.id,
        duration_minutes=90,
        start_time=now() - timedelta(days=1),
        end_time=now() + timedelta(days=14),
        status=AssessmentStatus.active,
        risk_threshold=60.0,
        pass_mark=50.0,
        shuffle_questions=True,
        monitor_face_detection=True,
        monitor_eye_tracking=True,
        monitor_phone_detection=True,
        monitor_tab_switch=True,
        monitor_audio_detection=False,
        monitor_suspicious_movement=True,
    )
    db.session.add(a1)
    db.session.flush()

    q1_questions = [
        Question(assessment_id=a1.id, text="What is the time complexity of binary search?",
                 type=QuestionType.multiple_choice, marks=5, order=1,
                 options=["O(n)", "O(log n)", "O(n log n)", "O(1)"],
                 correct_answer="O(log n)"),
        Question(assessment_id=a1.id, text="A stack follows LIFO (Last In, First Out) order.",
                 type=QuestionType.true_false, marks=3, order=2,
                 correct_answer="True"),
        Question(assessment_id=a1.id, text="Explain the difference between a process and a thread.",
                 type=QuestionType.short_answer, marks=8, order=3,
                 correct_answer="A process is an independent execution unit with its own memory space, while a thread is a lightweight unit within a process sharing the same memory."),
        Question(assessment_id=a1.id, text="Which data structure uses FIFO ordering?",
                 type=QuestionType.multiple_choice, marks=5, order=4,
                 options=["Stack", "Queue", "Tree", "Graph"],
                 correct_answer="Queue"),
        Question(assessment_id=a1.id, text="REST APIs must always use JSON for data exchange.",
                 type=QuestionType.true_false, marks=3, order=5,
                 correct_answer="False"),
        Question(assessment_id=a1.id, text="Describe the CAP theorem and its significance in distributed systems.",
                 type=QuestionType.short_answer, marks=10, order=6,
                 correct_answer="CAP theorem states that a distributed system can only guarantee two of three properties: Consistency, Availability, and Partition tolerance."),
    ]
    db.session.add_all(q1_questions)
    db.session.flush()

    # Coding question — sumEven (matches the in-browser code editor UI)
    sum_even = Question(
        assessment_id=a1.id,
        text="Implement a function `sumEven(nums)` that returns the sum of all even numbers in the array `nums`. Choose your preferred language.",
        type=QuestionType.coding,
        marks=10,
        order=7,
        entry_point="sumEven",
        languages=["javascript", "python", "java"],
        starter_codes={
            "javascript": "function sumEven(nums) {\n  // your code\n}",
            "python": "def sumEven(nums):\n    # your code\n    pass",
            "java": "class Solution {\n    public int sumEven(int[] nums) {\n        // your code\n        return 0;\n    }\n}",
        },
    )
    db.session.add(sum_even)
    db.session.flush()
    db.session.add_all([
        TestCase(question_id=sum_even.id, order=1, args=[[1, 2, 3, 4, 5, 6]],
                 expected_output="12", display="sumEven([1,2,3,4,5,6]) -> 12", hidden=False),
        TestCase(question_id=sum_even.id, order=2, args=[[2, 4, 6, 8]],
                 expected_output="20", display="sumEven([2,4,6,8]) -> 20", hidden=False),
        TestCase(question_id=sum_even.id, order=3, args=[[1, 3, 5, 7]],
                 expected_output="0", display="sumEven([1,3,5,7]) -> 0", hidden=True),
    ])

    # ─── Assessment 2: Data Analyst Screening ───────────────────────────────
    a2 = Assessment(
        title="Data Analyst – Screening Assessment",
        description="Screening assessment for data analyst candidates focusing on SQL, statistics, and data visualization skills.",
        position="Data Analyst",
        recruiter_id=rec.id,
        duration_minutes=60,
        start_time=now(),
        end_time=now() + timedelta(days=7),
        status=AssessmentStatus.active,
        risk_threshold=55.0,
        pass_mark=60.0,
        shuffle_questions=True,
        monitor_face_detection=True,
        monitor_eye_tracking=True,
        monitor_phone_detection=True,
        monitor_tab_switch=True,
        monitor_audio_detection=False,
        monitor_suspicious_movement=True,
    )
    db.session.add(a2)
    db.session.flush()

    q2_questions = [
        Question(assessment_id=a2.id, text="Which SQL clause is used to filter rows after grouping?",
                 type=QuestionType.multiple_choice, marks=4, order=1,
                 options=["WHERE", "HAVING", "GROUP BY", "ORDER BY"],
                 correct_answer="HAVING"),
        Question(assessment_id=a2.id, text="The median is always equal to the mean in a normal distribution.",
                 type=QuestionType.true_false, marks=3, order=2,
                 correct_answer="True"),
        Question(assessment_id=a2.id, text="What is the difference between INNER JOIN and LEFT JOIN?",
                 type=QuestionType.short_answer, marks=8, order=3,
                 correct_answer="INNER JOIN returns only matching rows from both tables, while LEFT JOIN returns all rows from the left table and matched rows from the right."),
        Question(assessment_id=a2.id, text="Which chart type is best for showing trends over time?",
                 type=QuestionType.multiple_choice, marks=4, order=4,
                 options=["Pie Chart", "Bar Chart", "Line Chart", "Scatter Plot"],
                 correct_answer="Line Chart"),
    ]
    db.session.add_all(q2_questions)

    # ─── Assessment 3: UX Designer (Draft) ──────────────────────────────────
    a3 = Assessment(
        title="UX/UI Designer – Portfolio & Skills Assessment",
        description="Evaluates design thinking, prototyping skills, and understanding of user-centered design principles.",
        position="UX/UI Designer",
        recruiter_id=rec.id,
        duration_minutes=45,
        start_time=now() + timedelta(days=3),
        end_time=now() + timedelta(days=17),
        status=AssessmentStatus.upcoming,
        risk_threshold=50.0,
        pass_mark=55.0,
        shuffle_questions=False,
        monitor_face_detection=True,
        monitor_eye_tracking=False,
        monitor_phone_detection=True,
        monitor_tab_switch=True,
        monitor_audio_detection=False,
        monitor_suspicious_movement=False,
    )
    db.session.add(a3)
    db.session.flush()

    q3_questions = [
        Question(assessment_id=a3.id, text="What is the primary goal of a heuristic evaluation?",
                 type=QuestionType.multiple_choice, marks=5, order=1,
                 options=["Find usability problems", "Test performance", "Write documentation", "Build prototypes"],
                 correct_answer="Find usability problems"),
        Question(assessment_id=a3.id, text="Wireframes should always be high-fidelity.",
                 type=QuestionType.true_false, marks=3, order=2,
                 correct_answer="False"),
        Question(assessment_id=a3.id, text="Describe the double diamond design process.",
                 type=QuestionType.short_answer, marks=10, order=3,
                 correct_answer="The double diamond consists of four phases: Discover (research), Define (synthesis), Develop (ideation), and Deliver (implementation)."),
    ]
    db.session.add_all(q3_questions)

    # ─── Assessment 4: Completed Assessment ─────────────────────────────────
    a4 = Assessment(
        title="Junior Developer – Python Fundamentals",
        description="Basic Python programming assessment covering syntax, data types, functions, and OOP concepts.",
        position="Junior Developer",
        recruiter_id=rec.id,
        duration_minutes=45,
        start_time=now() - timedelta(days=14),
        end_time=now() - timedelta(days=7),
        status=AssessmentStatus.completed,
        risk_threshold=65.0,
        pass_mark=50.0,
        shuffle_questions=True,
        monitor_face_detection=True,
        monitor_eye_tracking=True,
        monitor_phone_detection=True,
        monitor_tab_switch=True,
        monitor_audio_detection=False,
        monitor_suspicious_movement=True,
    )
    db.session.add(a4)
    db.session.flush()

    q4_questions = [
        Question(assessment_id=a4.id, text="What is the output of: print(type([]))?",
                 type=QuestionType.multiple_choice, marks=3, order=1,
                 options=["<class 'list'>", "<class 'tuple'>", "<class 'dict'>", "<class 'set'>"],
                 correct_answer="<class 'list'>"),
        Question(assessment_id=a4.id, text="Python is a statically typed language.",
                 type=QuestionType.true_false, marks=2, order=2,
                 correct_answer="False"),
        Question(assessment_id=a4.id, text="Explain list comprehensions in Python with an example.",
                 type=QuestionType.short_answer, marks=6, order=3,
                 correct_answer="List comprehensions provide a concise way to create lists. Example: [x**2 for x in range(10)] creates a list of squares."),
    ]
    db.session.add_all(q4_questions)

    # ─── Create sample sessions for completed assessment ────────────────────
    candidates = User.query.filter(User.role_name == "candidate").limit(3).all()
    for i, cand in enumerate(candidates):
        session = AssessmentSession(
            assessment_id=a4.id,
            candidate_id=cand.id,
            started_at=now() - timedelta(days=10, hours=i),
            submitted_at=now() - timedelta(days=10, hours=i) + timedelta(minutes=35 + i * 5),
            status=SessionStatus.completed,
            score=round(7 + i * 1.5, 1),
            max_score=11.0,
            percentage=round((7 + i * 1.5) / 11.0 * 100, 1),
            passed=(7 + i * 1.5) / 11.0 * 100 >= 50,
            integrity_score=round(85 - i * 10, 1),
            risk_score=round(15 + i * 10, 1),
            risk_level=RiskLevel.low if i == 0 else (RiskLevel.medium if i == 1 else RiskLevel.high),
            tab_switch_count=i * 2,
            looking_away_count=i * 3,
            face_not_detected_count=i,
        )
        db.session.add(session)

    db.session.commit()
    print(f"Seeded 4 assessments with questions and {len(candidates)} sample sessions.")
    print(f"  - Assessment 1 (active): {a1.title} ({len(q1_questions) + 1} questions incl. sumEven coding)")
    print(f"  - Assessment 2 (active): {a2.title} ({len(q2_questions)} questions)")
    print(f"  - Assessment 3 (upcoming): {a3.title} ({len(q3_questions)} questions)")
    print(f"  - Assessment 4 (completed): {a4.title} ({len(q4_questions)} questions)")
