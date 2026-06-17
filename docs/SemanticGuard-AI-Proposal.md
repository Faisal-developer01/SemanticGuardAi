# Semantic Services Rwanda

## AI & Recruitment Technology Division
## Product & Technical Proposal

---

# AI-Powered Candidate Fraud & Online Assessment Integrity System

A Product and Technical Proposal prepared for
Semantic Services Rwanda, outlining the design and
delivery of an AI-powered integrity platform for
online recruitment and candidate assessment

**Prepared By**

| | |
|---|---|
| **Name:** | Shingiro Faisal |
| **Role:** | Software Engineer |
| **Phone No:** | 0787947046 |
| **Email:** | faisalshingiro10@gmail.com |
| **Date:** | January 2026 |

---

<div style="page-break-after: always;"></div>

# TABLE OF CONTENTS

- [ABSTRACT](#abstract)
- [INTRODUCTION](#introduction)
  - [Background](#background)
  - [Problem Statement](#problem-statement)
  - [Project Justification](#project-justification)
  - [Objectives](#objectives)
  - [Scope](#scope)
- [LITERATURE REVIEW](#literature-review)
- [PROPOSED SOLUTION](#proposed-solution)
- [METHODOLOGY](#methodology)
- [WORK PLAN AND TIMELINE](#work-plan-and-timeline)
- [EXPECTED OUTCOMES](#expected-outcomes)
- [CONCLUSION](#conclusion)
- [REFERENCES](#references)
- [APPENDICES](#appendices)
- [PART I: AS-IS PROCESS MODEL](#part-i)
- [PART II: PROBLEMS WITH THE CURRENT SYSTEM](#part-ii)

---

# LIST OF FIGURES

- **Figure 1:** System Architecture
- **Figure 2:** Use-Case Diagram
- **Figure 3:** Entity–Relationship Diagram
- **Figure 4:** Assessment-Monitoring Sequence Diagram
- **Figure 5:** Work Breakdown Structure
- **Figure 6:** Authentication and Security Flow
- **Figure 7:** Gantt Chart

---

# LIST OF TABLES

- **Table 1:** Risk-Score Notification Escalation Thresholds

---

<div style="page-break-after: always;"></div>

# ABSTRACT

The AI-Powered Candidate Fraud & Online Assessment Integrity System (SemanticGuard AI) is an intelligent, web-based assessment integrity platform designed to detect and deter candidate fraud in computer-based and remote recruitment assessments. The rapid shift toward online hiring and remote talent screening has outpaced the capacity of traditional human proctoring, which cannot reliably supervise many candidates at once or detect the brief, subtle behaviors through which assessment fraud typically occurs. Existing online proctoring solutions tend to address only a single channel of cheating, operate as opaque "black boxes," depend on costly continuous cloud processing, and rarely consolidate their findings into transparent, defensible evidence. These limitations leave organizations exposed to widespread, undetected fraud that undermines the fairness of their hiring decisions and the credibility of the talent they select.

To address this gap, the proposed system integrates five complementary artificial-intelligence monitoring modules — face recognition and continuous identity verification, object (mobile phone) detection, eye-gaze tracking, head-pose estimation, and browser activity monitoring — into a single platform, and fuses their outputs through a weighted risk-scoring engine into a transparent integrity score (0–100) for each candidate. The system is delivered as a multi-role web application built with React and TypeScript on the front end, a Flask (Python) backend exposing a secure REST API, and a PostgreSQL database, with security enforced through JWT-based authentication, role-based authorization, encryption, and comprehensive audit logging. Detected risk is escalated through a proportionate, multi-channel notification subsystem — in-dashboard alerts, email, and SMS delivered through the Africa's Talking gateway — so that recruiters and evaluators are reached even when they are away from the monitoring dashboard. It is developed using the Agile (Scrum) methodology over a sixteen-week, six-phase plan, and validated through a multi-layered testing strategy using standard metrics such as Precision, Recall, F1-score, confusion matrices, and user acceptance testing.

The expected outcomes include a fully functional integrity-monitoring platform that increases the proportion of fraudulent behavior detected, reduces the manual burden on recruiters and evaluators, delivers real-time alerts that enable timely intervention, and produces detailed, timestamped evidence and audit reports suitable for formal hiring-integrity reviews. By combining multi-signal detection with transparency, proportionality, and a human-in-the-loop design that augments rather than replaces human judgment, SemanticGuard AI aims to provide an accurate, affordable, and trustworthy means of safeguarding the integrity and fairness of online recruitment assessment.

---

<div style="page-break-after: always;"></div>

# INTRODUCTION

## Background

Fair and reliable assessment is the cornerstone upon which the credibility of any hiring process rests. The scores, rankings, and pass decisions produced by a recruitment assessment are, in essence, formal guarantees that a candidate has genuinely demonstrated a defined body of knowledge and skills. When the integrity of an assessment is compromised, the value of those guarantees collapses, eroding trust in the hiring process and devaluing the genuine achievements of honest candidates. For this reason, safeguarding the integrity of assessments has always been a central concern of employers, recruitment agencies, and talent-acquisition teams worldwide.

Over the past decade, the landscape of recruitment assessment has changed dramatically. The rapid adoption of remote-hiring platforms, the global disruption caused by the COVID-19 pandemic, and the growing demand for flexible, distributed work have pushed assessments out of the tightly controlled physical assessment center and onto candidates' personal computers and mobile devices. While this transition has expanded access to opportunity and improved convenience for both employers and applicants, it has simultaneously widened the opportunities for assessment fraud. In a traditional, supervised assessment room, a single proctor can visually supervise dozens of candidates; in a remote or computer-based setting, that human oversight is either absent, severely diluted, or limited to a small video thumbnail that an evaluator cannot realistically monitor for every candidate at once.

The methods used to commit fraud have also evolved in sophistication. Candidates may impersonate one another, consult a hidden smartphone, open unauthorized browser tabs or applications, receive whispered or written assistance from a person outside the camera's view, or repeatedly glance at concealed notes. Many of these behaviors are brief, subtle, and easy to disguise, making them extremely difficult for a human observer to detect reliably, particularly across many simultaneous candidates and over the full duration of a lengthy assessment. Traditional proctoring, whether in person or through basic video conferencing, simply does not scale to meet this challenge, and it is inherently vulnerable to fatigue, distraction, and human error.

In parallel with these challenges, the field of artificial intelligence (AI) — and in particular computer vision and machine learning — has matured to the point where many tasks that once required constant human attention can now be automated with high accuracy and in real time. Modern face recognition algorithms can verify a person's identity from a single camera frame; object detection models can locate a mobile phone within a video stream in milliseconds; gaze estimation and head-pose estimation techniques can infer where a person is looking and how their head is oriented; and browser-level monitoring can detect when a candidate navigates away from the assessment window. Individually, each of these capabilities addresses one narrow avenue of fraud. Combined and orchestrated within a single, coherent system, they offer the possibility of continuous, objective, and tireless supervision that augments — rather than replaces — the human evaluator.

Despite the availability of these technologies, many organizations still rely on fragmented, manual, or partially automated approaches to assessment security. Commercial online proctoring tools exist, but they are frequently expensive, closed and proprietary, heavily dependent on continuous cloud processing, and often limited to a single detection modality such as identity verification or tab-switch logging. Few solutions integrate multiple AI detection signals into a unified, explainable integrity assessment that recruiters can act upon with confidence. There remains a clear need for a system that brings these capabilities together, presents their findings transparently, and respects the operational realities of cost, privacy, and ease of use.

The proposed AI-Powered Candidate Fraud & Online Assessment Integrity System, referred to throughout this proposal as SemanticGuard AI, is designed to address precisely this gap. It is a web-based assessment integrity platform that combines five complementary AI monitoring modules — face recognition, object (mobile phone) detection, eye-gaze tracking, head-pose estimation, and browser activity monitoring — into a single risk-scoring engine. By fusing these independent signals into one transparent integrity metric, supported by detailed evidence logs and real-time alerts, the system aims to give recruiters and hiring-integrity officers a practical, scalable, and trustworthy tool for protecting the fairness and credibility of their assessments.

## Problem Statement

The central problem this project addresses is that existing assessment supervision methods cannot reliably detect candidate fraud in computer-based and remote recruitment assessments at scale, leaving organizations exposed to widespread, undetected cheating that undermines the validity of their hiring decisions.

In conventional proctoring, a human supervisor must continuously watch every candidate for the entire duration of an assessment. This is cognitively impossible to do well: attention naturally drifts, a single proctor cannot simultaneously observe many candidates, and the most common fraudulent behaviors — a quick glance at a hidden phone, a brief look off-screen, a moment of whispered help, or the silent opening of another browser tab — are deliberately short and unobtrusive. In remote settings the difficulty is compounded, because the proctor often sees only a small, low-resolution video feed, has no view of the candidate's surroundings, and cannot inspect what is happening on the candidate's screen. As a result, a large proportion of fraudulent behavior goes entirely unnoticed.

The root cause of this problem is the absence of an integrated, automated supervision system that can monitor multiple independent channels of evidence at once, continuously, and objectively. The avenues of fraud are diverse — identity, physical devices, visual attention, head movement, and on-screen activity — and no single detection technique can cover them all. A face-only verification system cannot detect a hidden phone; a tab-switch logger cannot detect an impersonator or a person feeding answers from off-camera. Where automated tools do exist, they typically address only one of these channels, operate as opaque "black boxes" that flag candidates without explaining why, depend on costly continuous cloud processing, and rarely consolidate their outputs into a single, interpretable measure of risk that a recruiter can review and justify.

The consequences of this gap are serious and far-reaching. Honest candidates are unfairly disadvantaged when fraudulent applicants obtain undeserved scores and advance in the hiring process. Organizations make hiring decisions whose validity cannot be defended, exposing them to costly mis-hires and reputational damage. Recruiters lack credible, evidence-backed grounds on which to disqualify or challenge a suspicious result, so even suspected fraud frequently goes unchallenged. Over time, the perception that "everyone cheats and no one is caught" corrodes trust in the assessment process, discourages genuine candidates, and weakens the value of the assessment as a selection tool. Without an intelligent, multi-signal, evidence-producing system that continuously supervises assessments and presents its findings transparently, organizations remain unable to uphold the integrity on which fair and effective hiring depends.

## Project Justification

Addressing assessment fraud is not a peripheral concern but a matter of fundamental importance to the mission of any organization that hires on merit. The assessment results an organization relies upon are only meaningful if they reliably certify genuine competence. Every instance of undetected fraud directly devalues those results, harms honest candidates, and ultimately damages the teams, projects, and clients that depend on the competence of the people who are hired. Acting decisively to protect assessment integrity is therefore essential to preserving the value that a fair recruitment process provides.

This project is timely because three forces have converged to make a solution both necessary and feasible. First, the shift toward computer-based and remote assessment — accelerated by the pandemic and now a permanent feature of modern hiring — has dramatically increased the opportunity and incidence of fraud, while simultaneously weakening traditional human proctoring. Second, the AI technologies required to automate reliable, real-time supervision — face recognition, object detection, gaze and head-pose estimation — have matured and become accessible through well-supported open-source libraries, making it practical for an organization to deploy them without prohibitive cost. Third, employers and talent-acquisition teams are placing ever greater emphasis on demonstrable, evidence-based hiring integrity, creating strong demand for tools that not only detect fraud but document it defensibly.

The proposed system aligns directly with these needs and the expectations of its users. Recruiters want to focus on evaluating talent rather than straining to watch dozens of video feeds; they need a tool that does the watching for them and surfaces only the moments that warrant attention. Hiring-integrity officers need solid, well-documented evidence — timestamped logs, captured frames, and a clear rationale — before they can act on a suspected case. Candidates, for their part, benefit from a fairer assessment environment in which genuine effort is properly rewarded and is not undermined by applicants who cheat with impunity. SemanticGuard AI is designed to serve all three groups simultaneously.

The system delivers tangible, measurable benefits. It provides continuous, automated monitoring across five independent channels of evidence, dramatically increasing the proportion of fraudulent behavior that is detected. It consolidates these signals into a single, transparent integrity risk score (0–100) per candidate, so that recruiters can instantly identify which sessions require review rather than examining every recording manually. It generates detailed, timestamped evidence and audit logs that give hiring-integrity officers a defensible basis for any fraud-related decision. And it issues real-time alerts during the assessment, enabling immediate intervention rather than after-the-fact discovery. By reducing the manual burden on evaluators while increasing both the coverage and the credibility of detection, the system offers a clear and practical return on the organization's investment.

The broader, longer-term benefits extend well beyond any single assessment. By restoring confidence in the validity of remote and computer-based assessment, the system enables organizations to expand flexible and distributed hiring without sacrificing rigor. It strengthens the organization's reputation for fair selection and supports its compliance and audit requirements. Most importantly, by making fraud substantially more likely to be detected, it reshapes candidate behavior — deterring dishonesty, reaffirming the value of genuine effort, and protecting the worth of the assessment for every honest applicant. These outcomes justify both the development effort and the technological approach adopted in this project.

## Objectives

### General Objective

To design and develop an AI-powered, web-based assessment integrity system that integrates face recognition, object detection, eye-gaze tracking, head-pose estimation, and browser activity monitoring into a unified risk-scoring engine, in order to detect candidate fraud and assessment cheating accurately, continuously, and transparently in computer-based recruitment assessments.

### Specific Objectives

1. To implement a face recognition and identity verification module that authenticates each candidate and detects impersonation throughout the assessment. This objective develops a computer-vision component that captures and verifies the candidate's facial identity at the start of each session and continuously confirms, during the assessment, that the enrolled candidate — and no substitute or additional person — is present in front of the camera. It must operate reliably under realistic variations in lighting, camera quality, and head movement, and flag any mismatch or the appearance of an unrecognized or additional face.
2. To develop an object detection module capable of identifying unauthorized mobile phones and similar devices within the candidate's camera view in real time. This objective implements a deep-learning object-detection component that continuously scans the video stream for the presence of mobile phones and comparable prohibited devices. It must detect such objects quickly and with high precision while minimizing false alarms caused by everyday permitted items, and record each detection as time-stamped evidence.
3. To build eye-gaze tracking and head-pose estimation modules that monitor the candidate's visual attention and detect sustained off-screen behavior. This objective creates two complementary components: one that estimates the direction of the candidate's gaze and another that estimates the orientation of the head. Together they identify when a candidate repeatedly or persistently looks away from the screen — a strong behavioral indicator of consulting external material or receiving assistance — while tolerating the brief, natural movements typical of honest test-taking.
4. To implement a browser activity monitoring module that detects tab switching, loss of window focus, and attempts to access external on-screen resources. This objective develops a client-side monitoring component that observes the assessment window's focus state and reports every instance in which the candidate navigates away from the assessment, opens another tab or application, or otherwise attempts to access unauthorized on-screen resources, logging each event with a precise timestamp.
5. To design a risk-scoring engine, a secure recruiter dashboard, and a multi-channel notification subsystem that fuse all detection signals into a single integrity metric, deliver proportionate real-time alerts, and produce auditable evidence reports. This objective integrates the outputs of all monitoring modules into a composite 0–100 integrity risk score for each candidate, presents this information to recruiters through an interactive dashboard with live alerts, and generates detailed, timestamped reports and audit logs. It further implements a proportionate, threshold-based notification engine that escalates alerts across multiple channels — in-dashboard notifications, email, and SMS delivered through the Africa's Talking gateway — so that a recruiter who is offline or away from the dashboard is still reached promptly when a high-risk event occurs. The component must enforce strong security through JWT-based authentication, data encryption, and comprehensive audit logging so that its findings are both trustworthy and defensible.

## Scope

The scope of this project defines precisely which components will be developed and which elements lie outside the project boundaries. The goal is to deliver a functional, web-based assessment integrity platform that combines multiple AI monitoring techniques into a single, usable system for recruiters, candidates, and administrators. To ensure clarity and feasibility within the available time, the scope is divided into what the project will include and what it will not include.

### The project will include:

- **Multi-role web application (React + TypeScript):** A responsive web platform providing distinct, role-appropriate interfaces for candidates (registration, identity enrolment, taking monitored assessments), recruiters (creating assessments, live monitoring, reviewing integrity reports, evaluating candidates), and administrators (user management, system settings, audit oversight).
- **Face recognition and identity verification:** Biometric enrolment of each candidate and continuous verification during the assessment to confirm the candidate's identity and detect impersonation or the presence of additional people.
- **Object (mobile phone) detection:** Real-time detection of prohibited mobile devices within the candidate's camera view, with each detection captured as time-stamped evidence.
- **Eye-gaze tracking and head-pose estimation:** Continuous monitoring of the candidate's visual attention and head orientation to identify sustained off-screen behavior indicative of fraud.
- **Browser activity monitoring:** Detection and logging of tab switching, loss of assessment-window focus, and attempts to access external on-screen resources during the assessment.
- **Risk-scoring engine:** A component that fuses the outputs of all monitoring modules into a single composite integrity risk score (0–100) for each candidate, with configurable weighting of the contributing signals.
- **Real-time recruiter dashboard and alerting:** An interactive dashboard that displays live monitoring status and integrity scores and raises real-time alerts to recruiters when high-risk behavior is detected during an assessment.
- **Multi-channel, threshold-based notifications:** A proportionate notification subsystem that escalates alerts according to the candidate's risk score across in-dashboard notifications, email, and SMS delivered through the Africa's Talking gateway, ensuring that recruiters are reached even when they are offline or away from the monitoring dashboard.
- **Evidence, reporting, and audit logging:** Generation of detailed, timestamped integrity reports and comprehensive audit logs that provide a defensible record of detected events for hiring-integrity reviews.
- **Security and data protection:** JWT-based authentication and authorization, encryption of sensitive data, and audit logging, backed by a PostgreSQL database and a Flask (Python) backend.

### The project will not include:

- **A formal disciplinary or adjudication system:** The system flags and documents suspected fraud and supplies the supporting evidence, but it does not adjudicate cases, impose penalties, or replace the organization's hiring-decision procedures. The final decision always rests with the responsible human authority.
- **Fully autonomous decision-making without human review:** The system is designed to assist, not replace, human judgment. It will not automatically void assessments or reject candidates on the basis of its scores alone; all high-risk findings are intended for review by a recruiter or hiring-integrity officer.
- **A complete applicant tracking or talent-management system:** The platform focuses on assessment integrity and the monitored assessment experience. It is not intended to provide the full functionality of an applicant tracking system (ATS) — such as job-posting management, interview scheduling, or offer workflows — although it could integrate with such systems in future work.
- **Specialized or hardware-based proctoring equipment:** Monitoring relies on a standard webcam and web browser on the candidate's computer. The project will not require or support dedicated proctoring hardware, secondary cameras, biometric scanners, or lock-down operating-system kernels beyond standard browser-level controls.
- **Detection of advanced collusion conducted entirely off-device:** The system monitors the candidate, their immediate camera view, and their browser activity. It cannot detect sophisticated collusion that leaves no observable trace within these channels — for example, an inaudible earpiece relaying answers with no visible device and no off-screen gaze. Such adaptation strategies are acknowledged as a limitation rather than a deliverable.

# LITERATURE REVIEW

## Introduction

Assessment integrity and the automated supervision of online assessments have become increasingly prominent areas of study at the intersection of recruitment technology, computer vision, and machine learning. As assessment has migrated from the controlled physical assessment center toward computer-based and remote settings, researchers and software vendors alike have explored a wide range of technologies intended to deter and detect fraudulent behavior. These efforts span biometric identity verification, object detection, gaze and head-pose analysis, behavioral analytics, and browser-level activity monitoring, as well as the commercial online proctoring platforms that attempt to combine some of these techniques into deployable products.

This review examines the principal strands of existing work that are relevant to the proposed SemanticGuard AI system. It is organized thematically: it first considers the broader problem of online proctoring and assessment integrity, then surveys each of the core enabling technologies — face recognition, object detection, eye-gaze tracking, head-pose estimation, and browser activity monitoring — before turning to the multi-signal fusion and risk-scoring approaches that attempt to combine them. The review then critically identifies the gaps that persist across this body of work and explains, in the concluding summary, how the proposed system is positioned to address them. Throughout, the emphasis is not merely on what each technology can do in isolation, but on how well existing solutions integrate these capabilities into a coherent, transparent, and operationally practical whole.

## Review of Existing Works

### Online Proctoring and Assessment Integrity

The growth of remote assessment, accelerated sharply by the COVID-19 pandemic, prompted widespread adoption of online proctoring and, with it, a surge of interest in automated supervision. Researchers have documented both the scale of the integrity challenge in online assessment and the limitations of the responses to it. Studies of remote assessment integrity consistently report that opportunities for misconduct increase when supervision moves online, and that participants perceive remote assessments as easier to cheat in than supervised ones (Bilen & Matros, 2021). A substantial body of work also examines the trade-offs of proctoring itself, noting that heavy-handed surveillance raises significant concerns about privacy, anxiety, equity, and trust (Coghlan, Miller, & Paterson, 2021). This literature establishes both the necessity of effective detection and the importance of designing systems that are transparent and proportionate — a tension the present project takes seriously by emphasizing human-in-the-loop review and explainable, evidence-based scoring rather than fully automated judgment.

### Face Recognition and Identity Verification

Face recognition is the most mature of the enabling technologies and the one most directly applicable to candidate authentication. The field was transformed by deep convolutional neural networks, beginning with architectures such as those of Krizhevsky, Sutskever, and Hinton (2012) and the deep residual networks of He, Zhang, Ren, and Sun (2016), which dramatically improved image classification and, by extension, facial feature extraction. Purpose-built recognition systems such as FaceNet, which learns a compact embedding in which distances correspond to face similarity (Schroff, Kalenichenko, & Philbin, 2015), and large-margin approaches such as ArcFace (Deng, Guo, Xue, & Zafeiriou, 2019), have pushed verification accuracy on standard benchmarks beyond human-level performance. In the proctoring context, these techniques are used to confirm a candidate's identity at log-in and, in more advanced systems, to verify continuously that the enrolled person remains present. Nevertheless, the literature notes recurring practical difficulties — degraded accuracy under poor lighting, low-cost webcams, extreme head angles, and occlusions — and raises well-documented concerns about demographic bias in some recognition models, all of which a deployable system must accommodate.

### Object Detection for Prohibited Devices

Detecting unauthorized objects, particularly mobile phones, depends on general-purpose object-detection models. The field has advanced rapidly from region-based detectors such as Faster R-CNN (Ren, He, Girshick, & Sun, 2015) to single-stage detectors that prioritize speed, most notably the You Only Look Once (YOLO) family introduced by Redmon, Divvala, Girshick, and Farhadi (2016) and refined through numerous subsequent versions. Single-stage detectors are especially attractive for proctoring because they operate in real time on streaming video, allowing a phone that appears briefly in frame to be detected and logged immediately. Studies applying these detectors to assessment monitoring report high precision for clearly visible devices but also highlight characteristic failure modes: phones that are partially concealed, held below the camera's field of view, or confused with similar rectangular objects, and the risk of false positives from permitted items. These observations motivate treating object detection as one signal among several rather than as a standalone verdict.

### Eye-Gaze Tracking

Eye-gaze estimation seeks to infer where a person is looking, which is a powerful behavioral cue for detecting attention directed away from the assessment screen. Classical approaches relied on dedicated infrared hardware, but appearance-based methods using ordinary webcams have become practical through deep learning; influential work such as the large-scale MPIIGaze study demonstrated robust appearance-based gaze estimation in unconstrained settings (Zhang, Sugano, Fritz, & Bulling, 2015). Widely used open-source toolkits, including MediaPipe Face Mesh (Lugaresi et al., 2019), provide real-time facial-landmark and iris tracking that can be used to approximate gaze direction without specialized equipment. In proctoring research, sustained or repeated off-screen gaze is treated as an indicator of consulting external materials. The literature cautions, however, that webcam-based gaze estimates are noisier than hardware-based ones and that brief, natural eye movements are normal during honest test-taking, so robust systems must rely on patterns over time rather than isolated glances.

### Head-Pose Estimation

Head-pose estimation, which determines the orientation of the head in terms of yaw, pitch, and roll, complements gaze tracking and is often more robust under low-resolution conditions. Landmark-based methods estimate pose from detected facial points, while direct regression approaches such as HopeNet predict pose angles from the image without intermediate landmarks (Ruiz, Chong, & Rehg, 2018). Toolkits like OpenFace (Baltrušaitis, Robinson, & Morency, 2016) provide integrated facial-behavior analysis, including head-pose estimation, that has been applied in attention-monitoring research. Within assessment supervision, persistent turning of the head away from the screen is interpreted as a sign of looking at concealed notes or receiving assistance. Because head pose and gaze capture overlapping but distinct information, combining the two is widely recommended to improve the reliability of attention monitoring — an approach the proposed system adopts.

### Browser Activity Monitoring

Beyond the camera, a significant avenue of fraud in computer-based assessments is the use of other on-screen resources — additional browser tabs, search engines, messaging applications, or stored notes. The web platform itself provides mechanisms to observe this behavior: the Page Visibility API and window focus and blur events allow a web application to detect when the assessment window loses focus or the candidate switches to another tab or application. "Lockdown browser" approaches attempt to prevent such navigation outright, but research and practical experience show that these can be circumvented, are intrusive, and may conflict with candidates' device policies. A lighter-weight, detection-and-logging approach records focus-loss and tab-switch events with timestamps, providing evidence of off-task behavior without seizing control of the candidate's machine. This forms a valuable, low-cost signal that is independent of, and complementary to, the camera-based modules.

### Multi-Signal Fusion and Risk Scoring

A recurring theme in the literature is that no single modality is sufficient on its own; each can be evaded or can misfire in isolation. Consequently, researchers have proposed multi-modal proctoring frameworks that combine several detection signals. An influential example is the automated online exam proctoring system of Atoum, Chen, Liu, Hsu, and Liu (2017), which fused multiple visual and audio cues to estimate cheating. Subsequent multi-modal studies have continued to demonstrate that integrating complementary signals yields more reliable detection than any individual technique. However, much of this work fuses signals through opaque models that output a single flag or probability without an interpretable account of which behaviors drove the result, limiting their usefulness for organizations that must justify decisions. The notion of aggregating heterogeneous indicators into a single, transparent, weighted risk score — interpretable by a non-technical recruiter and backed by the underlying evidence — is comparatively underexplored, and it is precisely the approach the proposed system develops.

### Commercial Online Proctoring Platforms

Alongside scholarly research, a number of commercial proctoring platforms have emerged, including services that offer automated and "live" remote proctoring. These products typically provide identity verification, video recording, and some automated flagging of suspicious behavior. While they demonstrate market demand and real-world viability, independent analyses and organizational experience reveal common shortcomings: they are frequently expensive and licensed per-assessment or per-candidate, they depend on continuous cloud processing and the transmission of sensitive video off-site, they often function as proprietary "black boxes" whose flagging logic is not transparent, and they vary considerably in how well they consolidate multiple signals into actionable, explainable evidence. These characteristics limit their accessibility for many organizations and reinforce the case for an integrated, transparent, and self-controllable alternative.

## Identification of Gaps in Existing Literature

Despite considerable progress across the individual technologies, several gaps persist when the goal is a practical, trustworthy, enterprise-ready assessment integrity system:

1. **Fragmentation across single-modality solutions.** Most existing tools and studies address only one channel of fraud — identity, devices, gaze, head pose, or browser activity — in isolation. Few solutions integrate all of these complementary signals into one coherent system, leaving obvious avenues of fraud uncovered by any given tool.
2. **Lack of transparent, explainable risk assessment.** Where multiple signals are fused, the result is frequently an opaque score or flag that does not explain why a candidate was flagged. Organizations that must defend hiring-integrity decisions need an interpretable, evidence-linked rationale, which most current systems do not adequately provide.
3. **Heavy dependence on costly, cloud-based, proprietary platforms.** Many capable solutions are commercial, expensive, and reliant on continuous cloud processing and off-site transmission of sensitive video. This raises cost, privacy, and data-sovereignty barriers that place effective proctoring out of reach for many organizations.
4. **Insufficient real-time, actionable alerting for evaluators.** A great deal of work focuses on post-hoc review of recordings rather than on giving a recruiter immediate, prioritized alerts during the assessment, when timely intervention is still possible. Moreover, where alerting does exist it is typically confined to the proctoring dashboard, so an evaluator who is supervising another session, attending to a different task, or otherwise away from the screen receives no timely notification — a gap that out-of-band channels such as email and SMS are well placed to close.
5. **Weak consolidation of defensible evidence and audit trails.** Detection is often emphasized over documentation. Comprehensive, timestamped, tamper-evident evidence and audit logs — essential for any formal integrity process — are frequently incomplete or absent.
6. **Limited attention to security and privacy of the integrity system itself.** The literature concentrates on detecting candidate behavior but pays comparatively little attention to securing the proctoring platform's own data through robust authentication, encryption, and audit logging, even though this data is highly sensitive.
7. **Robustness under realistic, low-cost conditions.** Many reported results are obtained under favorable laboratory conditions. Maintaining acceptable accuracy with ordinary webcams, variable lighting, and modest hardware — the reality for most candidates — remains an under-addressed practical challenge.

## Summary

The reviewed literature confirms that the foundational technologies required for automated assessment supervision — deep-learning face recognition, real-time object detection, webcam-based gaze and head-pose estimation, and browser-level activity monitoring — are individually mature and well validated. Multi-modal proctoring research further establishes that combining complementary signals produces more reliable detection than any single technique. At the same time, the body of work reveals persistent and important shortcomings: existing solutions are fragmented across single modalities, often opaque in how they reach their conclusions, frequently expensive and cloud-dependent, weak in real-time alerting and defensible evidence generation, and inconsistent in securing their own sensitive data.

The proposed SemanticGuard AI system is positioned to address these gaps directly. It integrates all five complementary detection modalities — face recognition, object (phone) detection, eye-gaze tracking, head-pose estimation, and browser activity monitoring — into a single platform, and fuses their outputs into a transparent, weighted integrity risk score that is explained by the underlying, timestamped evidence. It is built on an accessible open technology stack (React and TypeScript on the front end, a Flask/Python back end, and a PostgreSQL database), provides recruiters with real-time alerts and an interactive dashboard for immediate intervention, generates comprehensive evidence and audit reports suitable for formal proceedings, and secures its own data through JWT-based authentication, encryption, and audit logging. By systematically filling the technological gap in signal integration, the methodological gap in transparency and explainability, and the practical gaps in cost, alerting, evidence, and security, the system seeks to deliver assessment integrity monitoring that is not only accurate but also trustworthy, affordable, and enterprise-deployable.

# PROPOSED SOLUTION

## Overview of the Solution

The proposed solution is SemanticGuard AI, a web-based assessment integrity platform designed to detect candidate fraud and assessment cheating in computer-based recruitment assessments by continuously monitoring candidates across five complementary channels of evidence and consolidating the results into a single, transparent integrity assessment. Rather than relying on a single detection technique — which, as the literature review established, can always be evaded or can misfire in isolation — the system orchestrates face recognition, object (mobile phone) detection, eye-gaze tracking, head-pose estimation, and browser activity monitoring within one coherent application, and fuses their outputs through a weighted risk-scoring engine into a 0–100 integrity score for every candidate.

The platform is delivered as a multi-role web application. Candidates register, enrol their facial identity, and take assessments whose integrity is monitored in real time. Recruiters create and configure assessments, watch live monitoring dashboards, receive immediate alerts when high-risk behavior is detected, review detailed post-assessment integrity reports, and evaluate candidates on a credible basis. Administrators manage users and roles, configure system-wide settings and scoring weights, and oversee the audit logs that record all significant actions. By serving these three roles within a single system, SemanticGuard AI covers the full assessment lifecycle, from enrolment and authentication, through monitored assessment, to evidence-backed evaluation.

The core methodology integrates three conceptual layers of intelligence. First, perception: a set of AI modules processes the candidate's webcam video and browser activity to produce discrete, time-stamped detection events (for example, "unrecognized face," "phone detected," "sustained off-screen gaze," "head turned away," or "assessment window lost focus"). Second, fusion: the risk-scoring engine aggregates these heterogeneous events over time, applying configurable weights to compute a composite integrity score that reflects both the severity and the frequency of detected behaviors. Third, presentation and accountability: the system surfaces this information to recruiters through real-time dashboards and, where the configured risk thresholds are crossed, escalates it through a proportionate multi-channel notification subsystem — in-dashboard alerts, email, and SMS delivered through the Africa's Talking gateway — and preserves every event as detailed evidence and tamper-evident audit logs suitable for formal hiring-integrity reviews.

Crucially, the solution is designed around the principle of human-in-the-loop decision-making. SemanticGuard AI does not autonomously reject candidates or void assessments; it detects, quantifies, explains, and documents suspicious behavior, leaving the final judgment to the responsible recruiter or hiring-integrity officer. This design directly answers the transparency and proportionality concerns raised in the literature, while the use of an accessible open technology stack — React with TypeScript on the front end, a Flask (Python) back end, and a PostgreSQL database, secured with JWT authentication, encryption, and audit logging — addresses the cost, control, and data-security gaps that limit many existing commercial platforms.

## System Design

### High-Level System Architecture

The system architecture is organized into five integrated layers that cooperate to deliver continuous monitoring, transparent risk assessment, and secure record-keeping. The Client (Presentation) Layer is the React + TypeScript single-page application that renders the role-specific interfaces and, during an assessment, captures the candidate's webcam stream and browser-activity events. The AI Detection Layer hosts the five monitoring modules that transform raw video and browser signals into discrete detection events. The Application (Backend) Layer, implemented in Flask, exposes a secure REST API that coordinates authentication, assessment management, ingestion of detection events, the risk-scoring engine, and a multi-channel notification service that dispatches dashboard, email, and SMS alerts (the latter through the Africa's Talking gateway). The Data Layer, built on PostgreSQL, persistently stores users, assessments, sessions, detection events, integrity scores, notifications, and audit logs. Finally, the cross-cutting Security Layer enforces JWT-based authentication and role-based authorization, encrypts sensitive data, and records every significant action in the audit log.

Detection processing is designed to favor candidate privacy and bandwidth efficiency: lightweight perception (such as facial-landmark, gaze, and focus tracking) runs in the browser on the client, emitting only compact, structured detection events and selective evidence frames to the backend, rather than streaming continuous raw video to the cloud. The backend validates and stores these events, recomputes the running integrity score, and — when the configured risk thresholds are exceeded — escalates the alert through the appropriate channel, from an in-dashboard notification to an email or an SMS sent via the Africa's Talking gateway, so that the responsible recruiter is reached promptly even when offline.

**Figure 1: System Architecture**

### Use-Case Model

The use-case model captures the principal interactions between the system's actors — Candidate, Recruiter, Administrator, and the autonomous AI Monitoring Engine — and the system. It clarifies the functional boundaries of the platform and the responsibilities of each role.

**Figure 2: Use-Case Diagram**

### Data Model (Entity–Relationship Diagram)

The data model defines the persistent structures that underpin the system. The central entities are users, the assessments they take or create, the monitored sessions, the detection events produced during those sessions, the resulting integrity scores, and the alerts, evidence, and audit records that ensure accountability.

**Figure 3: Entity–Relationship Diagram**

### Behavioral Model (Sequence Diagram)

The following sequence diagram describes the central scenario — a candidate taking a monitored assessment — showing how the client, AI modules, backend, risk-scoring engine, database, and recruiter dashboard interact in real time.

**Figure 4: Assessment-Monitoring Sequence Diagram**

### Notification and Escalation Policy

A central design principle of the notification subsystem is proportionality: recruiters must be alerted to genuine concerns without being overwhelmed by trivial or routine events. Issuing an SMS for every minor detection would quickly desensitize evaluators and defeat the purpose of the alert. The system therefore escalates notifications across progressively more intrusive channels in direct proportion to the candidate's composite integrity risk score, as defined in Table 1. Low-risk activity is silently logged for the audit trail; moderate risk surfaces only within the live dashboard; high risk additionally triggers an email; and only critical risk reaches the recruiter by SMS through the Africa's Talking gateway, guaranteeing that the most serious events are received even when the recruiter is offline or away from the screen.

**Table 1: Risk-Score Notification Escalation Thresholds**

| Risk Score | Action |
|---|---|
| 0–40 | Log only (recorded in the audit trail; no active notification) |
| 41–70 | Dashboard alert |
| 71–85 | Dashboard alert + Email notification |
| 86–100 | Dashboard alert + Email + SMS (via Africa's Talking) |

These thresholds are configurable by the administrator, allowing the organization to tune the sensitivity of each channel to the stakes of a particular assessment and to its tolerance for false alarms. Every dispatched notification — regardless of channel — is recorded with its delivery status, providing a complete and defensible account of who was alerted, through which channel, and when.

## Key Features of the Proposed Solution

### Core Features

- **AI Face Recognition & Continuous Identity Verification:** Enrols each candidate's facial identity at registration and verifies, throughout the assessment, that the genuine candidate — and only that candidate — is present, flagging impersonation or the appearance of additional people.
- **Object (Mobile Phone) Detection:** Continuously scans the webcam stream for prohibited mobile devices using a real-time object-detection model, capturing each detection as time-stamped evidence.
- **Eye-Gaze Tracking:** Estimates the candidate's gaze direction and flags sustained or repeated off-screen attention that is indicative of consulting external material.
- **Head-Pose Estimation:** Tracks head orientation (yaw, pitch, roll) and detects persistent turning away from the screen, complementing gaze tracking for robust attention monitoring.
- **Browser Activity Monitoring:** Detects and logs tab switching, loss of assessment-window focus, and attempts to access external on-screen resources, with precise timestamps.
- **Composite Risk-Scoring Engine:** Fuses all detection signals into a single, transparent integrity risk score (0–100) per candidate, with configurable weighting of each contributing signal.
- **Real-Time Recruiter Dashboard & Alerts:** Presents live monitoring status and integrity scores and raises immediate alerts when high-risk behavior is detected, enabling timely intervention.
- **Multi-Channel, Threshold-Based Notifications:** Escalates alerts proportionately to the candidate's risk score across in-dashboard notifications, email, and SMS delivered through the Africa's Talking gateway, ensuring that recruiters are reached even when offline while avoiding alert fatigue from low-risk events.
- **Evidence, Reporting & Audit Logging:** Produces detailed, timestamped integrity reports and tamper-evident audit logs that provide a defensible basis for hiring-integrity reviews.
- **Role-Based Multi-User Platform:** Provides distinct, secure interfaces for candidates, recruiters, and administrators, each scoped to its appropriate responsibilities.
- **Security by Design:** Enforces JWT-based authentication and authorization, encryption of sensitive data, and comprehensive audit logging across the platform.

### Innovative & Differentiating Features

- **Transparent, Explainable Integrity Score:** Unlike opaque "black-box" proctoring tools, every risk score is broken down into the specific events and weights that produced it, so recruiters can see why a candidate was flagged and justify any subsequent decision.
- **Five-Signal Fusion in a Single Platform:** The integration of face, object, gaze, head-pose, and browser signals into one coherent system — rather than separate single-purpose tools — closes the avenues of fraud that fragmented solutions leave open.
- **Privacy-Conscious, Bandwidth-Efficient Monitoring:** Lightweight detection runs in the browser and transmits only compact detection events and selective evidence frames, reducing the privacy exposure and cost associated with streaming continuous raw video to the cloud.
- **Configurable Scoring Policy:** Administrators can adjust the weight and sensitivity of each signal to suit different assessment types and organizational risk tolerances, allowing the system to be tuned rather than imposed as a fixed black box.
- **Human-in-the-Loop by Design:** The system deliberately augments rather than replaces human judgment, detecting and documenting suspicious behavior while leaving final decisions to a responsible human authority — directly addressing the fairness and proportionality concerns raised in the literature.

# METHODOLOGY

## Development Approach

This project will adopt the Agile software development methodology, specifically the Scrum framework, because the nature of an AI-driven, multi-module web application demands an iterative, feedback-driven process rather than a rigid, linear one. SemanticGuard AI combines several independent yet interacting components — five AI detection modules, a risk-scoring engine, a multi-role web interface, and a secure backend — whose requirements and performance characteristics can only be fully understood through repeated experimentation and testing. Agile is well suited to this reality because it embraces evolving requirements, encourages continuous refinement, and delivers the system incrementally in working increments rather than as a single large release at the end.

The development will be organized into a series of short, time-boxed sprints, each lasting approximately two weeks and each producing a tangible, testable increment of functionality. Early sprints will establish the foundational architecture — authentication, the database schema, and the basic assessment workflow — while subsequent sprints will progressively add and refine the detection modules (face recognition, object detection, gaze tracking, head-pose estimation, and browser monitoring), the risk-scoring engine, and the recruiter dashboard. This incremental approach is particularly valuable for the AI components, where accuracy is achieved not in a single attempt but through repeated cycles of integration, measurement, and tuning. For example, calibrating the gaze and head-pose thresholds to flag genuine fraud while tolerating natural movement requires several iterations of testing against realistic scenarios.

The Scrum framework provides the structure to manage this iterative work. The product requirements will be expressed as a product backlog of prioritized user stories (for instance, "As a recruiter, I want to receive a real-time alert when a candidate's risk score exceeds a threshold so that I can intervene"). At the start of each sprint, the highest-priority items are selected into a sprint backlog; at the end, a sprint review evaluates the increment against its acceptance criteria, and a sprint retrospective identifies process improvements for the next cycle. Brief regular check-ins keep the work visible and surface obstacles early. This rhythm of plan–build–review–adapt reduces risk, shortens feedback loops, and ensures that each successive version of the system grows measurably more accurate, more usable, and more closely aligned with the project objectives.

Agile also supports the parallel development that this project requires. Because the front end, backend, AI modules, and database are loosely coupled through well-defined REST interfaces, work can proceed on several components concurrently and be integrated continuously. Continuous integration practices — frequent merging, automated testing, and incremental deployment to a test environment — will be used to catch integration problems early and keep the system in a continuously working state. In combination, these practices make Agile/Scrum the most appropriate methodology for delivering a reliable, well-tested assessment integrity platform within the constraints of this product development effort.

## Tools and Technologies

The tools and technologies for this project have been selected on the basis of performance, reliability, community support, suitability for AI-enabled web applications, and alignment with the prescribed technology stack. They are grouped below by category.

### 1. Programming Languages

- **Python** — used for the backend application logic and for the AI/computer-vision components, owing to its mature machine-learning and image-processing ecosystem.
- **TypeScript / JavaScript** — used for the front-end single-page application, providing static typing and improved maintainability over plain JavaScript.
- **SQL** — used for defining and querying the relational database.

### 2. Frameworks and Libraries

- **React** — the front-end library used to build the responsive, component-based user interfaces for candidates, recruiters, and administrators.
- **Flask (Python)** — the lightweight backend web framework used to implement the secure REST API, authentication, assessment management, and the risk-scoring engine.
- **Computer-vision and machine-learning libraries** — used to implement the detection modules, including:
  - OpenCV for image and video frame processing;
  - MediaPipe for real-time facial-landmark, iris, and head/face mesh tracking that underpins gaze and head-pose estimation;
  - a deep-learning face-recognition library (for example, a FaceNet/ArcFace-based embedding model) for identity enrolment and verification;
  - a YOLO-family object-detection model for real-time mobile-phone detection.
- **Browser platform APIs** — the Page Visibility API and window focus/blur events used to implement browser-activity monitoring on the client.

### 3. Databases

- **PostgreSQL** — the primary relational database used to store users, assessments, questions, sessions, detection events, integrity scores, alerts, evidence metadata, and audit logs, chosen for its reliability, strong support for structured relational data, and robust security features.

### 4. Security Technologies

- **JSON Web Tokens (JWT)** — for stateless authentication and role-based authorization.
- **Encryption** — for protecting sensitive data in transit (HTTPS/TLS) and at rest (hashing of credentials and encryption of sensitive records).
- **Audit logging** — for recording all significant actions to support accountability and hiring-integrity reviews.

### 5. External Integrations and Notifications

- **Africa's Talking SMS API** — the SMS gateway used to deliver critical, high-risk alerts to recruiters' mobile phones, ensuring out-of-band reach when they are offline or away from the dashboard.
- **SMTP email service** — used to deliver email notifications for high-risk events and to issue integrity reports.
- **`africastalking` Python SDK** — the official client library used by the Flask backend to integrate with the Africa's Talking gateway.

### 6. Development, Design, and Collaboration Tools

- **Visual Studio Code** — the primary integrated development environment.
- **Git and GitHub** — for version control, collaboration, and continuous integration.
- **Figma** — for UI/UX design and prototyping of the interfaces.
- **Postman** — for designing and testing the REST API endpoints.

## Data Collection

The data required for this project falls into several categories, each obtained through appropriate and ethically sound methods.

### 1. Types of Data Needed

- **Facial image / enrolment data** — reference facial images (and the derived numerical face embeddings) used to enrol and subsequently verify each candidate's identity.
- **Object-detection training/validation data** — labelled images containing mobile phones and similar devices, used to validate the phone-detection module.
- **Gaze and head-pose reference data** — video samples capturing a range of looking directions and head orientations, used to calibrate and validate the attention-monitoring thresholds.
- **Behavioral / event data** — the detection events, browser-activity logs, and integrity scores generated by the system during assessments.
- **User and assessment data** — user profiles (name, role, credentials), assessment definitions, and questions.

### 2. Data Collection Methods

- **Publicly available datasets** — established, openly licensed datasets will be used to validate the AI modules, including face-recognition benchmarks for the identity module, object-detection datasets (such as the COCO dataset, which includes a "cell phone" category) for the phone-detection module, and gaze datasets (such as MPIIGaze) for the attention modules.
- **Controlled primary collection** — with informed consent, a small set of volunteer participants will record short, scripted assessment scenarios (both honest behavior and simulated fraudulent actions such as glancing off-screen or showing a phone) in order to calibrate and test the detection thresholds under realistic webcam conditions.
- **System-generated data** — once operational in a test environment, the system itself produces detection events, scores, and logs that are used for integration and performance testing.

### 3. Data Sources

- Open, peer-reviewed computer-vision datasets for faces, objects, and gaze.
- Volunteer participants who provide consented recordings for calibration and testing.
- The application's own runtime logs and database during testing.

### 4. Ethical Considerations and Data Handling

Because the system processes biometric and behavioral data, data collection will adhere strictly to ethical and privacy principles. Participation in primary data collection will be voluntary and based on informed consent; participants will be informed of the purpose and able to withdraw. All personal data will be stored securely, with credentials hashed and sensitive records encrypted, access restricted through role-based authorization, and biometric data limited to the minimum necessary (storing compact embeddings rather than raw images where possible). Data collected for calibration and testing will be used solely for this project and handled in line with the organization's data-protection requirements. Formal consent and approval documentation are included in the Appendices.

## Testing and Validation

Testing and validation are essential to confirm that SemanticGuard AI satisfies its functional and non-functional requirements and that, in particular, its AI detection is accurate and dependable. A multi-layered testing strategy will be applied across the AI modules, the backend API, and the web application.

### 1. Testing Strategy

- **Unit Testing** — verifies individual components in isolation, such as backend API functions, the risk-scoring calculations, individual UI components, and the detection-module subroutines.
- **Integration Testing** — verifies that the components cooperate correctly: that the client correctly transmits detection events, that the Flask API ingests them and updates scores, that threshold breaches trigger the correct notification channel (dashboard, email, or Africa's Talking SMS), and that the database and dashboard reflect the results consistently.
- **System Testing** — verifies the complete end-to-end assessment workflow, from candidate enrolment and authentication through monitored assessment to report generation, under realistic conditions.
- **Performance Testing** — assesses responsiveness and resource usage, including the latency of in-browser detection, the speed of phone detection on a video frame, API response times under concurrent sessions, and the timeliness of real-time alerts.
- **Security Testing** — validates authentication and authorization (JWT and role-based access), confirms that sensitive data is encrypted, and checks that audit logging captures all significant actions.

### 2. Validation of Results

The accuracy of the AI detection modules will be validated quantitatively using standard classification and detection metrics:

- **Precision, Recall, and F1-score** — to measure how reliably each module identifies genuine violations while avoiding false alarms.
- **Confusion Matrix** — to analyze the distribution of true positives, false positives, true negatives, and false negatives for each detection type.
- **Detection accuracy and mean Average Precision (mAP)** — for the object-detection (phone) module.
- **Threshold calibration analysis** — for the gaze and head-pose modules, comparing flagged events against ground-truth scripted behavior to balance sensitivity against false alarms.
- **Risk-score validation** — comparing the composite integrity scores produced for honest versus simulated-fraud sessions to confirm that the fused score meaningfully separates the two.

In addition, User Acceptance Testing (UAT) will be conducted with representative users (candidates and recruiters) to confirm that the system is usable, that alerts and reports are clear and actionable, and that the platform meets stakeholder expectations.

### 3. Testing Tools and Frameworks

- **PyTest / unittest** — for backend and AI-module testing in Python.
- **Postman / Newman** — for API endpoint testing and automation.
- **Jest and React Testing Library** — for front-end component and unit testing.
- **Manual and scripted scenario testing** — using the consented volunteer recordings to validate detection behavior under realistic assessment conditions.

# WORK PLAN AND TIMELINE

## Tasks and Milestones

The execution of this project will be organized using a Work Breakdown Structure (WBS) and guided by the SMART criteria — ensuring that every task and milestone is Specific, Measurable, Achievable, Relevant, and Time-bound. The WBS decomposes the overall project into manageable phases, each with clearly defined tasks, deliverables, and milestones, so that progress can be tracked objectively and responsibilities remain unambiguous. The work is divided into six major phases, described below and summarized in Figure 5.

### 1. Project Initiation

Purpose: Establish the foundation and boundaries of the project.

Tasks:

- Define the overall project scope, goals, deliverables, and constraints.
- Identify stakeholders (candidates, recruiters, administrators, hiring-integrity officers) and success criteria.
- Confirm the technology stack and development environment.

Milestone: Scope Document Approved — formal agreement on the project's boundaries and objectives.

### 2. Requirements Gathering and Analysis

Purpose: Capture and validate all functional, non-functional, and AI-specific requirements.

Tasks:

- Conduct a needs assessment and review of existing proctoring approaches.
- Document functional requirements (monitoring, scoring, alerting, reporting) and non-functional requirements (performance, security, usability, privacy).
- Identify AI-specific requirements, including target detection accuracy, datasets, and performance thresholds.

Milestone: Requirements Document Finalized — the validated foundation for system design.

### 3. System and AI Solution Design

Purpose: Produce the complete technical blueprint for the system.

Tasks:

- Design the system architecture (front-end structure, backend services, REST API, database schema).
- Design the AI pipeline (face recognition, object detection, gaze tracking, head-pose estimation, browser monitoring) and the risk-scoring fusion logic.
- Produce UML models (use-case, entity–relationship, and sequence diagrams) and UI/UX prototypes.

Milestone: Design Approved — a complete, stakeholder-endorsed technical blueprint.

### 4. Development and Integration

Purpose: Build, integrate, and incrementally refine the system components.

Tasks:

- **Front-End Development** — build the candidate, recruiter, and administrator interfaces, the assessment-taking screen with webcam capture, and the live monitoring dashboard (React + TypeScript).
- **Back-End Development** — implement authentication, assessment and session management, the detection-event ingestion API, the risk-scoring engine, the multi-channel notification service (dashboard, email, and Africa's Talking SMS), alerting, and audit logging (Flask + PostgreSQL).
- **AI Module Development** — integrate and calibrate the five detection modules; validate each against its performance threshold.
- Integrate the components through the REST API and verify end-to-end behavior.

Milestones:

- AI Modules Validated — each module meets its minimum accuracy and latency requirements.
- System Modules Completed — core components integrated and deployed to the test environment.

### 5. Authentication and Security Implementation

Purpose: Secure user access and protect sensitive assessment and biometric data.

Tasks:

- Implement JWT-based authentication and role-based authorization.
- Apply encryption for data in transit (HTTPS/TLS) and at rest (credential hashing, encryption of sensitive records).
- Implement comprehensive audit logging of all significant actions.

Milestone: Security Verified — authentication, authorization, encryption, and audit logging confirmed through security testing. The end-to-end authentication and security flow is illustrated below.

### 6. Testing, Validation, and Deployment

Purpose: Confirm the system meets its requirements and prepare it for use.

Tasks:

- Conduct unit, integration, system, performance, and security testing.
- Validate AI accuracy using Precision, Recall, F1-score, confusion matrices, and threshold-calibration analysis.
- Conduct User Acceptance Testing (UAT) and finalize documentation.

Milestone: System Deployed and Documented — a validated system with complete documentation and final report.

**Figure 5: Work Breakdown Structure**

## Authentication and Security Flow (System-Level)

To guarantee secure and controlled access, the system enforces a structured authentication and authorization flow built around JSON Web Tokens and role-based access control. The flow ensures that every request is authenticated, that users can only perform actions permitted by their role, and that sensitive sessions remain protected throughout the assessment.

Key steps:

1. **Credential submission** — the user submits their credentials through the React client over an encrypted HTTPS connection.
2. **Verification** — the Flask backend verifies the credentials against the hashed values stored in PostgreSQL.
3. **Token issuance** — upon successful verification, the backend issues a short-lived JWT access token and a longer-lived refresh token, each encoding the user's identity and role.
4. **Authorized requests** — the client attaches the access token to every subsequent API request; the backend validates the token's signature and expiry and enforces role-based access control (RBAC) before serving the request.
5. **Token refresh** — when the access token expires, the refresh mechanism securely issues a new access token without requiring the user to log in again.
6. **Audit logging** — every authentication event and significant action is recorded in the audit log for accountability.

**Figure 6: Authentication and Security Flow**

## Timeline (Gantt Chart)

The project is planned over a 16-week schedule, with the six phases sequenced to allow overlap where the Agile approach permits parallel work — notably during development, where front-end, back-end, and AI work proceed concurrently, and where security implementation and testing are interleaved with development. The timeline below (Figure 7) maps each phase onto the project calendar.

**Figure 7: Gantt Chart**

# EXPECTED OUTCOMES

## Expected Deliverables

Upon successful completion, the project is expected to produce a set of concrete deliverables that together demonstrate a working, well-documented, and verifiable assessment integrity system. These deliverables comprise both the software itself and the supporting artefacts required to understand, operate, evaluate, and maintain it. The anticipated final deliverables are as follows:

1. **A Fully Functional Assessment Integrity Web Application** — A complete, operational SemanticGuard AI platform implementing all core features defined in the scope. This includes the three role-based interfaces (candidate, recruiter, administrator), the monitored assessment-taking experience with webcam capture, the live monitoring dashboard with real-time alerts, and the integrity reporting views — built with React and TypeScript on the front end and Flask (Python) on the back end.
2. **Five Integrated AI Detection Modules** — Working implementations of the face recognition / identity verification, object (mobile phone) detection, eye-gaze tracking, head-pose estimation, and browser activity monitoring modules, each integrated into the assessment workflow and producing time-stamped detection events.
3. **A Composite Risk-Scoring Engine** — A functioning fusion component that aggregates the outputs of all detection modules into a single, transparent 0–100 integrity score per candidate, with a visible breakdown of the contributing signals and configurable weighting.
4. **A Multi-Channel Notification Subsystem** — A working, threshold-based notification engine that escalates alerts across the dashboard, email, and SMS (delivered through the Africa's Talking gateway) in proportion to the candidate's risk score, with configurable thresholds and a recorded delivery status for every notification.
5. **Database Implementation and Schema** — A fully designed and implemented PostgreSQL database, including the entity–relationship model and the physical schema (users, assessments, questions, sessions, detection events, integrity scores, alerts, notifications, evidence, and audit logs) with appropriate relationships, constraints, and indexing.
6. **Security Implementation** — A complete security layer providing JWT-based authentication, role-based authorization, encryption of sensitive data in transit and at rest, and comprehensive audit logging, verified through security testing.
7. **Evidence, Reporting, and Audit Outputs** — The capability to generate detailed, timestamped integrity reports and tamper-evident audit logs that provide a defensible evidentiary basis for hiring-integrity reviews.
8. **System Documentation** — Detailed documentation describing the system design and architecture, data flows, REST API reference, database schema, a user manual for each role, an installation/deployment guide, and a developer guide to support maintenance and future extension.
9. **Testing and Validation Reports** — A set of test cases and results covering unit, integration, system, performance, and security testing, together with bug reports and validation checklists demonstrating that the system meets its requirements.
10. **AI/Analytics Evaluation Report** — A report describing the evaluation of the AI detection modules, including the datasets used, the metrics obtained (Precision, Recall, F1-score, confusion matrices, mAP for object detection, and threshold-calibration analysis for the attention modules), and an interpretation of the results.
11. **Final Product Report and Stakeholder Presentation** — A complete product report and an accompanying presentation summarizing the objectives, background research, methodology, design, implementation, results, and recommendations.

## Potential Limitations

Despite careful planning and a rigorous methodology, the project is subject to a number of constraints and limitations that may affect its performance, accuracy, or scope. Acknowledging these limitations transparently is essential to setting realistic expectations and to identifying directions for future improvement.

1. **Variable Webcam and Environmental Conditions** — The accuracy of the camera-based modules (face recognition, object detection, gaze, and head pose) depends on the quality of the candidate's webcam and on environmental factors such as lighting, background, and camera angle. Poor lighting, low-resolution cameras, or unusual positioning may reduce detection accuracy and increase false positives or negatives.
2. **Risk of False Positives and False Negatives** — No AI detection system is perfect. Natural behaviors — such as briefly looking away to think, or an authorized object resembling a phone — may occasionally be misclassified, while a well-disguised violation may go undetected. This is the primary reason the system is designed for human review rather than autonomous decision-making.
3. **Dataset Quality and Diversity** — The performance of the AI models is bounded by the quality, size, and diversity of the datasets used for validation and calibration. Limited representation of certain appearances, devices, or behaviors may affect generalization and could introduce bias, requiring ongoing dataset improvement.
4. **Dependence on the Candidate's Device and Connectivity** — Because lightweight detection runs in the candidate's browser, system behavior depends on the candidate's hardware capacity and a stable internet connection. Low-powered devices may experience reduced in-browser detection performance, and unstable connectivity may delay the transmission of events and alerts.
5. **Detection Limited to Observable Channels** — The system monitors the candidate, their immediate camera view, and their browser activity. It cannot detect sophisticated fraud that leaves no trace within these channels — for example, an inaudible earpiece relaying answers with no visible device and no off-screen gaze.
6. **Scalability Constraints** — The initial version is designed and optimized for small-to-medium-scale deployment. Supporting very large numbers of concurrent assessments may require additional infrastructure, optimization, and load balancing beyond the current scope.
7. **Privacy, Consent, and Acceptance** — Because the system processes biometric and behavioral data, its deployment depends on appropriate consent, privacy safeguards, and user acceptance. Some users may be uncomfortable with monitoring, which could affect adoption and requires careful communication and ethical handling.
8. **Time and Resource Constraints** — As an initial product development effort carried out by a small engineering team within a fixed timeline, the depth of optimization, the breadth of testing, and the scale of real-world trials are necessarily bounded. Certain advanced enhancements are therefore positioned as future work rather than deliverables.

# CONCLUSION

## Importance of the Project

The AI-Powered Candidate Fraud & Online Assessment Integrity System addresses a problem that strikes at the very foundation of fair hiring: the integrity of the assessments on which selection decisions, and therefore organizational credibility, depend. As assessment has moved decisively toward computer-based and remote formats, the traditional safeguards of in-person proctoring have become inadequate, leaving organizations exposed to widespread and largely undetected candidate fraud. Each instance of undetected fraud devalues the assessments an organization relies upon, disadvantages honest candidates, and erodes the trust that teams and clients place in the competence of those who are hired. This project matters because it confronts that erosion directly, restoring the conditions under which an assessment result can once again be treated as a credible measure of genuine competence.

The significance of the project extends beyond the detection of individual violations. By integrating five complementary AI monitoring techniques into a single, transparent platform, SemanticGuard AI demonstrates a practical and affordable alternative to the fragmented, opaque, and costly proctoring solutions that currently dominate the field. Its emphasis on explainable risk scoring, defensible evidence, and human-in-the-loop decision-making responds directly to the fairness and privacy concerns that have accompanied the rise of online proctoring. In doing so, the project not only protects assessment integrity but does so in a way that is proportionate, accountable, and respectful of the candidates it monitors. More broadly, by making fraud substantially more likely to be detected, the system serves as a deterrent that reaffirms the value of honest effort and helps cultivate a fairer, more trustworthy recruitment process.

## Summary of the Plan

The project follows a structured plan organized around the Agile (Scrum) methodology and executed over a sixteen-week timeline divided into six phases: project initiation, requirements gathering and analysis, system and AI solution design, development and integration, authentication and security implementation, and testing, validation, and deployment. The architectural foundation comprises five integrated layers — a React and TypeScript presentation layer; an AI detection layer hosting the five monitoring modules; a Flask application layer exposing a secure REST API and the risk-scoring engine; a PostgreSQL data layer; and a cross-cutting security layer enforcing JWT authentication, role-based authorization, encryption, and audit logging.

The development phase exploits the loose coupling of these components to pursue parallel workstreams, with front-end, back-end, and AI development proceeding concurrently and integrated continuously through well-defined interfaces. The five detection modules — face recognition, object detection, eye-gaze tracking, head-pose estimation, and browser activity monitoring — are developed and calibrated iteratively, their outputs fused by the risk-scoring engine into a single, transparent integrity score. Throughout, work is validated against clear, measurable milestones — scope approval, requirements finalization, design approval, AI validation, security verification, and final deployment — and supported by a multi-layered testing strategy spanning unit, integration, system, performance, and security testing, complemented by quantitative AI evaluation and user acceptance testing. Data collection relies on established public datasets together with consented volunteer recordings, handled under strict ethical and privacy safeguards.

## Expected Outcomes

Upon successful completion, the project will deliver a fully functional, well-documented assessment integrity platform capable of monitoring computer-based recruitment assessments across five independent channels of evidence and consolidating its findings into a single, explainable integrity score for each candidate. The primary technical outcomes include the operational web application with its three role-based interfaces, the five integrated AI detection modules, the composite risk-scoring engine, the secured PostgreSQL data layer, and the evidence, reporting, and audit-logging facilities that give recruiters and hiring-integrity officers a defensible basis for action. These are accompanied by comprehensive documentation, testing and validation reports, an AI evaluation report, and the final product report and presentation.

From the perspective of impact, the system is expected to substantially increase the proportion of fraudulent behavior that is detected while reducing the manual burden on evaluators, to provide recruiters with timely, actionable alerts during assessments — delivered through the dashboard and, for high-risk events, escalated by email and SMS so that even an offline recruiter is reached — rather than after the fact, and to supply credible, timestamped evidence that strengthens the organization's ability to uphold hiring integrity. By combining technological capability with transparency, proportionality, and respect for privacy, the project aspires to make trustworthy assessment supervision both accessible and enterprise-deployable. In the longer term, the platform establishes a foundation that can be extended — through richer datasets, additional detection signals, and integration with applicant tracking and talent-management systems — positioning it as a sustainable contribution to the ongoing effort to protect the integrity and fairness of online recruitment assessment.

# REFERENCES

- Atoum, Y., Chen, L., Liu, A. X., Hsu, S. D. H., & Liu, X. (2017). Automated online exam proctoring. IEEE Transactions on Multimedia, 19(7), 1609–1624. https://doi.org/10.1109/TMM.2017.2656064
- Baltrušaitis, T., Robinson, P., & Morency, L.-P. (2016). OpenFace: An open source facial behavior analysis toolkit. 2016 IEEE Winter Conference on Applications of Computer Vision (WACV), 1–10. https://doi.org/10.1109/WACV.2016.7477553
- Bilen, E., & Matros, A. (2021). Online cheating amid COVID-19. Journal of Economic Behavior & Organization, 182, 196–211. https://doi.org/10.1016/j.jebo.2020.12.004
- Coghlan, S., Miller, T., & Paterson, J. (2021). Good proctor or "big brother"? Ethics of online exam supervision technologies. Philosophy & Technology, 34(4), 1581–1606. https://doi.org/10.1007/s13347-021-00476-1
- Deng, J., Guo, J., Xue, N., & Zafeiriou, S. (2019). ArcFace: Additive angular margin loss for deep face recognition. 2019 IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR), 4685–4694. https://doi.org/10.1109/CVPR.2019.00482
- He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep residual learning for image recognition. 2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR), 770–778. https://doi.org/10.1109/CVPR.2016.90
- Krizhevsky, A., Sutskever, I., & Hinton, G. E. (2012). ImageNet classification with deep convolutional neural networks. Advances in Neural Information Processing Systems, 25, 1097–1105.
- Lugaresi, C., Tang, J., Nash, H., McClanahan, C., Uboweja, E., Hays, M., Zhang, F., Chang, C.-L., Yong, M. G., Lee, J., Chang, W.-T., Hua, W., Georg, M., & Grundmann, M. (2019). MediaPipe: A framework for building perception pipelines. arXiv. https://doi.org/10.48550/arXiv.1906.08172
- Redmon, J., Divvala, S., Girshick, R., & Farhadi, A. (2016). You only look once: Unified, real-time object detection. 2016 IEEE Conference on Computer Vision and Pattern Recognition (CVPR), 779–788. https://doi.org/10.1109/CVPR.2016.91
- Ren, S., He, K., Girshick, R., & Sun, J. (2015). Faster R-CNN: Towards real-time object detection with region proposal networks. Advances in Neural Information Processing Systems, 28, 91–99.
- Ruiz, N., Chong, E., & Rehg, J. M. (2018). Fine-grained head pose estimation without keypoints. 2018 IEEE/CVF Conference on Computer Vision and Pattern Recognition Workshops (CVPRW), 2074–2083. https://doi.org/10.1109/CVPRW.2018.00281
- Schroff, F., Kalenichenko, D., & Philbin, J. (2015). FaceNet: A unified embedding for face recognition and clustering. 2015 IEEE Conference on Computer Vision and Pattern Recognition (CVPR), 815–823. https://doi.org/10.1109/CVPR.2015.7298682
- Zhang, X., Sugano, Y., Fritz, M., & Bulling, A. (2015). Appearance-based gaze estimation in the wild. 2015 IEEE Conference on Computer Vision and Pattern Recognition (CVPR), 4511–4520. https://doi.org/10.1109/CVPR.2015.7299081

# APPENDICES

## Appendix A: Case-Study Organization Approval Letter

# PART I

## AS-IS PROCESS MODEL

### Introduction

This part presents the current ("as-is") assessment-supervision process within the case-study context of Semantic Services Rwanda, the organization adopted for this project. It describes the organization, the way recruitment assessments are presently conducted and supervised, the shortcomings of that process, and the conclusions that motivate the proposed SemanticGuard AI system. The purpose is to establish a clear, evidence-based picture of the existing situation before introducing the proposed solution.

### Historical Background / Case-Study Introduction

Semantic Services Rwanda is a private software company specializing in artificial intelligence, spatial computing, and innovative Software-as-a-Service (SaaS) solutions, while also empowering young Rwandan software developers through structured training and recruitment programs. The company develops innovative software solutions that leverage artificial intelligence, spatial computing, mixed reality, virtual reality, and augmented reality to enhance business operations and digital transformation. Its SaaS products are designed to make business processes more tangible, improve employee performance, and integrate seamlessly across industries such as IT, tourism, recruitment, finance, training, and gaming. The company is supported by its parent organization, tfSemanticServices GmbH in Germany, ensuring access to advanced technology and research.

A defining activity of the organization is its Young Professional Program (YPP) — a five-year initiative designed to recruit and train early-career Rwandan software developers in spatial computing and IT. The program provides structured recruitment, hands-on training and mentorship, real-world project experience, and job placement for top-performing candidates. The YPP partners with organizations such as the University of Rwanda, INES Ruhengeri, and Carnegie Mellon University Africa to source and develop talent, aiming to cultivate the next generation of technology leaders in Rwanda.

Because the YPP and the company's wider recruitment and certification activities depend heavily on assessing candidates — frequently through computer-based assessments, coding challenges, and remotely supervised recruitment tests — the integrity of those assessments is of direct operational importance to Semantic Services Rwanda. This makes the organization a representative and relevant case study for an assessment-integrity system, and it is in this context that the current supervision process is examined below.

### Overview of the Business Model

Within the case-study context, the assessment process is a core component of both the company's recruitment pipeline and its talent-selection model. Candidates sit structured assessments to demonstrate competence; results inform selection within the YPP, certification, and eventual job placement. At present, these assessments are supervised through a combination of manual, in-person proctoring and basic remote tools (video calls and conventional online test platforms). Supervision relies on a human evaluator watching candidates either physically or through a small video feed, with no automated, continuous monitoring of identity, attention, devices, or on-screen activity, and no consolidated, evidence-backed measure of assessment integrity.

### Problems with the Current Process

The existing supervision process exhibits several systematic weaknesses:

1. **Limited supervisory capacity.** A single evaluator cannot reliably observe many candidates simultaneously, particularly in remote settings where only a small video thumbnail is visible.
2. **Undetected, short-duration violations.** The most common forms of fraud — a brief glance at a hidden phone, a quick look off-screen, or silently opening another tab — are easily missed by a fatigued or distracted human observer.
3. **No identity assurance during the assessment.** Beyond an initial check, there is no continuous verification that the enrolled candidate — and only that candidate — remains present.
4. **Fragmented or absent evidence.** When fraud is suspected, there is rarely a consolidated, timestamped evidentiary record on which a defensible decision can be based.
5. **Delayed, after-the-fact response.** Concerns are typically raised only after the assessment, by which time timely intervention is no longer possible, and an offline supervisor receives no out-of-band alert.

### Conclusion

The as-is analysis confirms that the current, predominantly manual supervision process at the case-study organization cannot reliably guarantee the integrity of computer-based assessments at scale. It is constrained by human capacity, blind to brief violations, weak in identity assurance and evidence, and unable to alert supervisors in real time. These shortcomings directly justify the proposed SemanticGuard AI system, which automates continuous, multi-signal monitoring, consolidates the results into a transparent integrity score, and escalates high-risk events through multi-channel notifications.

# PART II

## PROBLEMS WITH THE CURRENT SYSTEM

### Introduction

Building on the as-is process model, this part analyzes the specific deficiencies of the current assessment-supervision approach at the case-study organization. The analysis is organized around the recognized dimensions of system evaluation — performance, information, economics, control and security, efficiency, and service — to provide a structured and comprehensive account of why the existing approach is inadequate and why an automated solution is required.

### System-Centered Analysis

**Performance.** Manual proctoring does not scale: a single evaluator's effective attention is divided across all candidates, so the probability of detecting any given violation falls sharply as the number of candidates rises. In remote settings, low-resolution video and network latency further degrade the evaluator's ability to observe candidates in real time, and there is no mechanism to monitor the candidate's screen or surroundings continuously.

**Information.** The current process produces little usable information. Suspicions are subjective and rarely documented; there is no structured, timestamped record of detection events, no objective measure of risk per candidate, and no consolidated report. Consequently, decisions about suspected fraud rest on weak, contestable evidence.

**Economics.** Relying on additional human proctors to improve coverage is costly and still ineffective, while commercial proctoring platforms are expensive, typically licensed per-assessment or per-candidate, and depend on continuous cloud processing. The organization therefore faces a poor cost-to-effectiveness ratio under every existing option.

**Control and Security.** There is no continuous identity assurance, leaving the process vulnerable to impersonation, and no tamper-evident audit trail of supervisory actions or detected events. Sensitive candidate data, where captured, is not consistently protected through authentication, authorization, encryption, and logging.

**Efficiency.** Evaluators expend substantial effort watching candidates who behave honestly, with no tooling to direct their attention only to genuinely suspicious sessions. Post-assessment review of recordings, where it occurs at all, is slow and labour-intensive.

**Service.** The current approach offers no real-time alerting, no proportionate escalation to reach an offline supervisor, and no defensible evidence package for any subsequent integrity reviews — leaving both honest candidates and the organization poorly served.

This system-centered analysis reinforces the conclusion of Part I: the existing supervision approach is deficient across every major evaluation dimension. The proposed SemanticGuard AI system is designed specifically to remedy these deficiencies through continuous multi-signal monitoring, transparent risk scoring, secure and auditable record-keeping, and proportionate multi-channel alerting.
