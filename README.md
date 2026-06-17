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
