# SemanticGuard AI

**AI-Powered Candidate Fraud & Online Assessment Integrity System**

SemanticGuard AI is a web-based assessment integrity platform built for **Semantic Services Rwanda** to detect and deter candidate fraud during online recruitment assessments. It fuses five complementary AI monitoring signals into a single, transparent integrity score (0–100) per candidate, giving recruiters defensible, real-time insight into assessment sessions while keeping a human in the loop for every decision.

> This repository contains the **front-end web application** (React + TypeScript + Vite) with a white-and-blue design system. A full product and technical proposal is available in [docs/SemanticGuard-AI-Proposal.md](docs/SemanticGuard-AI-Proposal.md).

## Key Capabilities

- **Face recognition & continuous identity verification** — confirms the enrolled candidate (and only that candidate) is present throughout the assessment.
- **Object (mobile phone) detection** — flags prohibited devices in the candidate's camera view.
- **Eye-gaze tracking & head-pose estimation** — detects sustained off-screen attention.
- **Browser activity monitoring** — logs tab switching and loss of assessment-window focus.
- **Composite risk-scoring engine** — fuses all signals into one explainable integrity score with a visible breakdown.
- **Multi-channel alerts** — escalates high-risk events across dashboard, email, and SMS (Africa's Talking gateway).
- **Evidence & audit logging** — produces timestamped, tamper-evident records for hiring-integrity reviews.

## User Roles

| Role | Responsibilities |
|---|---|
| **Candidate** | Register and log in, enrol facial identity, take monitored assessments, view results. |
| **Recruiter / Evaluator** | Create assessments, monitor live sessions, receive fraud alerts, review integrity reports, evaluate candidates. |
| **Administrator** | Manage users and roles, configure AI detection, manage system settings, review audit logs and reports. |

## Tech Stack

- **Framework:** React 19 + TypeScript
- **Build tool:** Vite
- **Styling:** Tailwind CSS (white + blue design system)
- **Routing:** React Router

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Type-check the project
npm run check

# Build for production
npm run build
```

## Live monitoring video

Candidate webcam video travels directly to the recruiter over WebRTC; Socket.IO
only carries offer/answer/ICE signaling. A connected Socket.IO badge does not
guarantee a working media connection. The candidate must grant camera access
during face verification and keep the assessment open with monitoring enabled.
Camera access requires HTTPS in production (localhost is allowed in development).
The grid and selected-candidate detail panel share one peer connection per session.
The Connected badge is shown only after the server acknowledges the monitoring
room subscription. Joining or reconnecting receives a database-backed active
session snapshot; candidate-start and heartbeat events update the grid immediately.
Completed/terminated sessions are removed rather than left as camera placeholders.
Socket.IO application handlers are explicitly rebound for each Flask application
initialization so repeated app-factory calls cannot leave a connected but inert
signaling server.
Email-task initialization reuses the requesting Flask app rather than creating
another app inside the web process, which would replace the live Socket.IO
server and disconnect monitoring/signaling from its existing clients. Standalone
Celery workers still create their own Flask app.
The native-threaded WSGI deployment always initializes Socket.IO in threading
mode. Legacy `SOCKETIO_ASYNC_MODE=eventlet` overrides are logged and ignored:
eventlet background handlers cannot reliably run on native gthread request
threads, even when the transport handshake succeeds.

Public STUN is configured by default. For networks that block direct peer-to-peer
media, configure a real TURN relay using `VITE_TURN_URL`, `VITE_TURN_USERNAME`, and
`VITE_TURN_CREDENTIAL` **when building the frontend**. Azure App Service runtime
settings cannot change an already-built Vite bundle. The Azure deploy workflow
reads the URL from the GitHub Actions repository variable `VITE_TURN_URL` and the
username/credential from repository secrets of the same names. Docker builds can
pass these as build arguments. These credentials are visible to browser clients;
use relay-scoped credentials suitable for that exposure, not Azure account keys.

To verify with real cameras, keep Live Monitoring open, then start an assessment
in a separate candidate browser. Video should appear without refreshing; opening
or closing Candidate Details must not interrupt the grid feed. Repeat across the
actual candidate/recruiter networks to verify the relay. Browser console messages
prefixed `[WebRTC]` show signaling, track receipt, and peer connection states;
`[Camera]` reports preview playback failures. Failed negotiations retry
automatically without repeatedly resetting an in-progress connection.

Run the focused signaling/media lifecycle regressions with
`node --test scripts/test-realtime.cjs`. Test doubles are confined to that test
harness; the application only publishes the candidate's actual webcam stream.

## Alert recording playback

The AI Alert Panel's Recording action plays the session's captured screen-share
segments in capture order, with automatic advancement enabled by default.
Prefetching and refreshing the clip list do not interrupt the current video.
The modal checks for newly uploaded segments every five seconds, including the
final segment flushed when a violation terminates an attempt. Playback starts
muted so browser autoplay policies do not hide otherwise valid recordings; use
the audio toggle to unmute.

Candidate recording starts with the newly created session ID. Non-empty final
clips are retained, submission waits for pending clip uploads, and capture/upload
failures are reported to the candidate. The recording covers the screen surface
the candidate agreed to share, up to submission or termination; it is not a
reconstruction of activity that was never recorded.

Azure startup defaults local evidence storage to `/home/data/evidence`, outside
the replaceable deployment package. An explicitly configured
`STORAGE_LOCAL_PATH` is preserved; it should also point to persistent storage.
Azure Blob Storage remains supported via the existing storage configuration.
Older files already lost from temporary deployment directories cannot be
recreated; the reviewer sees an explicit missing-file error instead of an
endless loading spinner.

Backend recording regressions: from `backend`, run
`python -m pytest tests/test_evidence.py -q`. The frontend media regressions above
also cover recording prefetch, final-clip discovery, upload flushing, and errors.
Realtime backend regressions: `python -m pytest tests/test_realtime.py -q`, covering
repeated app initialization, authenticated subscriptions, reconnect snapshots,
session completion, and the full request/offer/answer/ICE signaling route. A real
HTTP long-polling regression also verifies that importing email tasks preserves
the running server and an existing monitoring subscription.

## Project Structure

```
src/
  components/   Reusable UI, layout, and shared components
  contexts/     Auth and theme providers
  data/         Mock data driving the demo experience
  pages/        Candidate, recruiter, and admin views
  routes.tsx    Application route definitions
  types/        Shared TypeScript types
docs/           Product & technical proposal and supporting assets
```

## Documentation

The complete product and technical proposal — including the system architecture, AI detection design, methodology, work plan, and the Semantic Services Rwanda case study — is available in [docs/SemanticGuard-AI-Proposal.md](docs/SemanticGuard-AI-Proposal.md). A formatted Word version can be regenerated with:

```bash
py tasks/build_docx.py
```

---

© Semantic Services Rwanda — SemanticGuard AI.
