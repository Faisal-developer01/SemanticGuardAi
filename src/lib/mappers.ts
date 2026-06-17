/**
 * Mappers — translate backend API DTOs (`Api*`) into the frontend UI types used
 * by the existing page components. Keeps pages largely unchanged while swapping
 * mock data for live data.
 */
import type {
  ApiAssessment,
  ApiAlert,
  ApiAuditLog,
  ApiLiveSession,
  ApiNotification,
  ApiQuestion,
  ApiSession,
  ApiTestCase,
  ApiUser,
} from '@/lib/api';
import type {
  AIAlert,
  AIMonitoringStatus,
  Assessment,
  AssessmentStatus,
  AuditLog,
  CodingLanguage,
  CodingTestCase,
  LiveCandidate,
  Notification,
  Question,
  QuestionType,
  AssessmentSession,
  RiskLevel,
  UserRole,
} from '@/types/types';

/* ─── Notifications ─────────────────────────────────────────────────────────── */

export function mapNotification(n: ApiNotification, userId = ''): Notification {
  return {
    id: n.id,
    userId,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.read,
    timestamp: n.createdAt,
  };
}

/* ─── Audit logs ────────────────────────────────────────────────────────────── */

export function mapAuditLog(a: ApiAuditLog): AuditLog {
  return {
    id: a.id,
    timestamp: a.createdAt,
    userId: a.userId ?? '',
    userName: a.userName ?? 'System',
    userRole: (a.userRole ?? 'admin') as UserRole,
    action: a.action,
    resource: a.resource ?? '',
    ipAddress: a.ipAddress ?? '',
    status: a.status,
    details: a.details ?? '',
  };
}

/* ─── Assessments ───────────────────────────────────────────────────────────── */

function mapStatus(status: ApiAssessment['status']): AssessmentStatus {
  return status === 'draft' ? 'upcoming' : status;
}

export function mapAssessment(a: ApiAssessment, recruiterName = ''): Assessment {
  return {
    id: a.id,
    title: a.title,
    position: a.position ?? '',
    recruiterId: a.recruiterId,
    recruiterName,
    duration: a.durationMinutes,
    startTime: a.startTime ?? '',
    endTime: a.endTime ?? '',
    status: mapStatus(a.status),
    totalQuestions: a.totalQuestions,
    totalCandidates: 0,
    aiMonitoring: {
      faceDetection: a.monitorFaceDetection,
      eyeTracking: a.monitorEyeTracking,
      phoneDetection: a.monitorPhoneDetection,
      tabSwitchDetection: a.monitorTabSwitch,
      audioDetection: a.monitorAudioDetection,
      suspiciousMovement: a.monitorSuspiciousMovement,
    },
    riskThreshold: a.riskThreshold,
  };
}

/* ─── Questions ─────────────────────────────────────────────────────────────── */

function mapTestCase(tc: ApiTestCase): CodingTestCase {
  return {
    id: tc.id,
    args: tc.args ?? [],
    expectedOutput: tc.expectedOutput ?? '',
    display: tc.display ?? undefined,
    hidden: tc.hidden,
  };
}

export function mapQuestion(q: ApiQuestion): Question {
  return {
    id: q.id,
    assessmentId: q.assessmentId,
    text: q.text,
    type: q.type as QuestionType,
    options: q.options ?? undefined,
    marks: q.marks,
    order: q.order,
    language: (q.language as CodingLanguage) ?? undefined,
    languages: (q.languages as CodingLanguage[]) ?? undefined,
    entryPoint: q.entryPoint ?? undefined,
    starterCode: q.starterCode ?? undefined,
    starterCodes: (q.starterCodes as Partial<Record<CodingLanguage, string>>) ?? undefined,
    testCases: q.testCases ? q.testCases.map(mapTestCase) : undefined,
  };
}

/* ─── Alerts ────────────────────────────────────────────────────────────────── */

export function mapAlert(a: ApiAlert): AIAlert {
  return {
    id: a.id,
    assessmentId: a.assessmentId,
    assessmentTitle: '',
    candidateId: a.candidateId,
    candidateName: '',
    type: a.type as AIAlert['type'],
    severity: a.severity,
    timestamp: a.occurredAt,
    description: a.description ?? '',
    reviewed: a.reviewed,
    riskScore: a.riskScore,
  };
}

/* ─── Sessions ──────────────────────────────────────────────────────────────── */

function mapSessionStatus(status: ApiSession['status']): AssessmentSession['status'] {
  if (status === 'flagged') return 'completed';
  return status;
}

export function mapSession(s: ApiSession): AssessmentSession {
  return {
    id: s.id,
    assessmentId: s.assessmentId,
    assessmentTitle: '',
    candidateId: s.candidateId,
    candidateName: '',
    startTime: s.startedAt ?? '',
    endTime: s.submittedAt ?? undefined,
    status: mapSessionStatus(s.status),
    score: s.score ?? undefined,
    maxScore: s.maxScore,
    percentage: s.percentage ?? undefined,
    integrityScore: s.integrityScore,
    riskScore: s.riskScore,
    riskLevel: (s.riskLevel ?? 'low') as RiskLevel,
    alerts: [],
    tabSwitches: s.tabSwitchCount,
    lookingAwayCount: s.lookingAwayCount,
    faceNotDetectedCount: s.faceNotDetectedCount,
  };
}

/* ─── Live monitoring ───────────────────────────────────────────────────────── */

const DEFAULT_STATUS: AIMonitoringStatus = {
  faceDetected: false,
  faceVerified: false,
  facesCount: 0,
  eyeGaze: 'unknown',
  headPose: 'normal',
  phoneDetected: false,
  audioDetected: false,
  suspiciousMovement: false,
  browserFocused: true,
  tabSwitches: 0,
  riskScore: 0,
  riskLevel: 'low',
};

export function mapLiveSession(s: ApiLiveSession): LiveCandidate {
  const live = (s.liveStatus ?? null) as Partial<AIMonitoringStatus> | null;
  const status: AIMonitoringStatus = {
    ...DEFAULT_STATUS,
    ...(live ?? {}),
    // Authoritative server-side aggregates always win over the last heartbeat.
    tabSwitches: s.tabSwitches,
    riskScore: s.riskScore,
    riskLevel: s.riskLevel,
  };
  return {
    id: s.sessionId,
    sessionId: s.sessionId,
    name: s.candidateName,
    candidateId: s.candidateId,
    assessmentId: s.assessmentId,
    assessmentTitle: s.assessmentTitle,
    status,
    isFlagged: s.isFlagged,
    alertCount: s.alertCount,
  };
}

/* ─── Users ─────────────────────────────────────────────────────────────────── */

export interface UiUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive' | 'suspended';
  mfaEnabled: boolean;
  createdAt: string;
  lastLogin: string;
  department: string;
  position: string;
  integrityScore: number;
  totalAssessments: number;
  passedAssessments: number;
}

export function mapUser(u: ApiUser): UiUser {
  const cp = u.candidateProfile ?? null;
  const rp = u.recruiterProfile ?? null;
  const status = (['active', 'inactive', 'suspended'].includes(u.status) ? u.status : 'inactive') as
    | 'active'
    | 'inactive'
    | 'suspended';
  return {
    id: u.id,
    name: u.fullName,
    email: u.email,
    role: u.role,
    status,
    mfaEnabled: u.mfaEnabled,
    createdAt: u.createdAt ?? '',
    lastLogin: u.lastLoginAt ?? '',
    department: cp?.department ?? rp?.department ?? '',
    position: cp?.position ?? '',
    integrityScore: cp?.integrityScore ?? 0,
    totalAssessments: cp?.totalAssessments ?? 0,
    passedAssessments: cp?.passedAssessments ?? 0,
  };
}
