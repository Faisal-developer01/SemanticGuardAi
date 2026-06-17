# SemanticGuard AI — Backend

Production Flask backend for **SemanticGuard AI**, the AI-powered candidate
assessment integrity & fraud-detection platform operated by *Semantic Services Rwanda*.

## Architecture (Clean Architecture)

```
backend/
├── app/
│   ├── __init__.py        # application factory
│   ├── config.py          # env-driven configuration (dev/test/prod)
│   ├── extensions.py       # db, migrate, jwt, mail, socketio, limiter, cors
│   ├── security.py         # bcrypt password hashing + TOTP MFA helpers
│   ├── errors.py           # JSON error envelope + custom exceptions
│   ├── cli.py              # seed-roles / create-admin commands
│   ├── models/             # SQLAlchemy ORM models (domain layer)
│   ├── repositories/       # data-access layer (Repository pattern)   [Step 2]
│   ├── services/           # business logic (Service layer)            [Step 2]
│   ├── schemas/            # Marshmallow (de)serialization + validation [Step 2]
│   └── api/                # Flask blueprints (presentation layer)     [Step 2]
├── migrations/             # Alembic (via Flask-Migrate)
├── ai/                     # AI/ML worker + models                     [Step 5]
├── wsgi.py                 # Gunicorn / SocketIO entry point
└── celery_app.py           # Celery worker entry point
```

Layering: **api → services → repositories → models**. Each layer depends only
on the one below it.

## Prerequisites
- Python 3.11–3.12 (recommended for AI deps; 3.14 works for the API only)
- PostgreSQL 14+
- Redis 6+

## Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env   # then edit values
```

## Database & migrations

```powershell
# First time only (migrations/ already scaffolded):
flask --app wsgi db migrate -m "initial schema"
flask --app wsgi db upgrade

# Seed default roles/permissions and create an admin:
flask --app wsgi seed-roles
flask --app wsgi create-admin --email admin@semanticservices.rw --password "ChangeMe!23" --name "Administrator"
```

## Run (development)

```powershell
flask --app wsgi run --debug         # REST only
# or, with WebSocket support:
python wsgi.py
```

## Run (production)

```bash
gunicorn -k eventlet -w 1 -b 0.0.0.0:5000 wsgi:app
celery -A celery_app.celery worker --loglevel=info
```

## Implemented so far
- **Step 1 — Database models**: Users, Roles/Permissions, Candidate & Recruiter
  profiles, Assessments, Questions/TestCases, Sessions/Answers, IntegrityEvents,
  Alerts, Evidence, Notifications, AuditLogs, TokenBlocklist, SystemSettings.
- App factory, env config, security headers, JWT wiring, error handling,
  Alembic, Celery, Key Vault & App Insights integration hooks.

> Steps 2–7 (CRUD APIs, auth flows, frontend integration, AI modules,
> notifications, deployment) are delivered incrementally.
