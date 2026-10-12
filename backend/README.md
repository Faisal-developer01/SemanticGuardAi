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

## Brevo SMTP (email delivery)

For local development, enter these values in `backend/.env` (not the frontend
`.env.local`). Copy `backend/.env.example` only if `backend/.env` does not already
exist; do not overwrite an existing configuration.

```dotenv
MAIL_SERVER=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=your-brevo-smtp-login
MAIL_PASSWORD=your-brevo-smtp-key
MAIL_DEFAULT_SENDER=SemanticGuard AI <your-verified-sender@example.com>
MAIL_SUPPRESS_SEND=false
EMAIL_DELIVERY_MODE=thread
```

Use the **SMTP login** and **SMTP key** shown in Brevo under **SMTP & API > SMTP**.
The SMTP key belongs in `MAIL_PASSWORD`; it is not a Brevo API key or your account
password. The address in `MAIL_DEFAULT_SENDER` must be verified in Brevo. Never
commit the real key or put it in a `VITE_*` variable.

For the deployed site, open Azure Portal > App Services > `semanticguardai-rw` >
Settings > Environment variables (Application settings), add the same settings,
save/apply, and restart the app. A local `.env` does not configure Azure. Any
separate Celery worker needs the same SMTP settings and a restart as well.

When a passing result is finalized (`grading_status=graded`), the app automatically
issues the certificate and offer letter and queues an email with PDF attachments
to the candidate's registered email address. Results awaiting processing or review
do not issue documents until finalized.
Existing certificates are not automatically resent just by changing SMTP settings.
Candidates can use the mail icon on their Certificates page to email an existing
document to their registered address. This action reports SMTP rejection instead
of claiming success, and does not issue a replacement certificate. SMTP acceptance
still does not guarantee inbox delivery.

Run locally from `backend` with `flask --app wsgi run --debug` so Flask loads the
local `.env`. Azure App Service defaults to `EMAIL_DELIVERY_MODE=thread` when
`WEBSITE_HOSTNAME` is present, so emails do not wait for a nonexistent Celery
worker. Explicitly set `EMAIL_DELIVERY_MODE=thread` for other single-process
deployments. Background threads are not durable across restarts. Deployments
with Redis and a running Celery worker can set `EMAIL_DELIVERY_MODE=celery`;
broker publishing failures fall back to a background thread. In Celery mode, a
broker can accept jobs without a worker running, leaving emails queued. Check
Brevo transactional logs and the recipient's spam folder for delivery status.

Registration OTP currently uses a separate SendGrid integration; these SMTP
settings configure certificate emails, email MFA, password resets and ordinary
email notifications, not the SendGrid registration OTP template.

### Retired messaging integration

Automated WhatsApp messaging, account verification, and delivery tracking have
been removed. Delete obsolete `WHATSAPP_*` settings and revoke unused provider
credentials in Azure/Meta separately; repository edits do not remove deployed
secrets. The historical database migration is retained for upgrade compatibility;
its legacy contact columns and delivery table are unused by the application.
