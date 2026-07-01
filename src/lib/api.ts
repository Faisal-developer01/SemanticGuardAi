/**
 * SemanticGuard AI — backend API client.
 *
 * Thin `fetch` wrapper (no extra deps) that talks to the Flask backend under
 * `/api/v1`. Handles JWT storage, automatic refresh-on-401, and exposes typed
 * helpers for the authentication + MFA flows used across the app.
 */
import type { UserRole } from '@/types/types';

const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/v1';

const ACCESS_KEY = 'sg_access_token';
const REFRESH_KEY = 'sg_refresh_token';

/* ─── Token storage ─────────────────────────────────────────────────────────── */

let accessToken: string | null = localStorage.getItem(ACCESS_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);

export function getAccessToken(): string | null {
  return accessToken;
}

export function setTokens(access: string | null, refresh?: string | null): void {
  accessToken = access;
  if (access) localStorage.setItem(ACCESS_KEY, access);
  else localStorage.removeItem(ACCESS_KEY);

  if (refresh !== undefined) {
    refreshToken = refresh;
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    else localStorage.removeItem(REFRESH_KEY);
  }
}

export function clearTokens(): void {
  setTokens(null, null);
}

/* ─── Error type ────────────────────────────────────────────────────────────── */

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/* ─── Core request ──────────────────────────────────────────────────────────── */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  /** internal: prevents infinite refresh loops */
  _retry?: boolean;
  /** use the refresh token instead of the access token for this request */
  useRefresh?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, useRefresh = false, _retry = false } = opts;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const bearer = useRefresh ? refreshToken : accessToken;
  if ((auth || useRefresh) && bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Transparent refresh on an expired access token.
  if (res.status === 401 && auth && !useRefresh && !_retry && refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...opts, _retry: true });
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    const message =
      (data as { message?: string })?.message ||
      (data as { error?: string })?.error ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const data = await request<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      useRefresh: true,
      _retry: true,
    });
    setTokens(data.accessToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

/* ─── Domain types ──────────────────────────────────────────────────────────── */

export interface ApiCandidateProfile {
  id: string;
  candidateCode: string;
  department?: string | null;
  position?: string | null;
  experienceYears: number;
  integrityScore: number;
  totalAssessments: number;
  passedAssessments: number;
  referencePhotoUrl?: string | null;
}

export interface ApiRecruiterProfile {
  id: string;
  recruiterCode: string;
  department?: string | null;
  totalAssessmentsCreated: number;
}

export interface ApiUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  status: string;
  avatarUrl?: string | null;
  mfaEnabled: boolean;
  mfaMethod: 'totp' | 'email';
  emailVerified: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  candidateProfile?: ApiCandidateProfile | null;
  recruiterProfile?: ApiRecruiterProfile | null;
}

export interface LoginTokens {
  mfaRequired: false;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export interface LoginMfaChallenge {
  mfaRequired: true;
  mfaMethod: 'totp' | 'email';
  userId: string;
}

export type LoginResponse = LoginTokens | LoginMfaChallenge;

export interface MfaSetupResponse {
  method: 'totp' | 'email';
  // TOTP only:
  secret?: string;
  otpauthUri?: string;
  qr?: string;
  // Email only:
  destination?: string;
  message?: string;
}

/* ─── Auth endpoints ────────────────────────────────────────────────────────── */

export const authApi = {
  login(email: string, password: string, mfaCode?: string) {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password, ...(mfaCode ? { mfaCode } : {}) },
    });
  },

  register(payload: {
    fullName: string;
    email: string;
    password: string;
    role?: UserRole;
    phone?: string;
    department?: string;
    position?: string;
  }) {
    return request<{ user: ApiUser; message: string }>('/auth/register', {
      method: 'POST',
      body: payload,
    });
  },

  me() {
    return request<{ user: ApiUser }>('/auth/me', { auth: true });
  },

  logout() {
    return request<{ message: string }>('/auth/logout', { method: 'POST', auth: true });
  },

  changePassword(currentPassword: string, newPassword: string) {
    return request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      auth: true,
      body: { currentPassword, newPassword },
    });
  },

  forgotPassword(email: string) {
    return request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  },

  // ─── MFA ───
  mfaSetup(method: 'totp' | 'email') {
    return request<MfaSetupResponse>('/auth/mfa/setup', {
      method: 'POST',
      auth: true,
      body: { method },
    });
  },

  mfaConfirm(code: string) {
    return request<{ message: string }>('/auth/mfa/confirm', {
      method: 'POST',
      auth: true,
      body: { code },
    });
  },

  mfaResend() {
    return request<MfaSetupResponse>('/auth/mfa/resend', { method: 'POST', auth: true });
  },

  mfaDisable(code: string) {
    return request<{ message: string }>('/auth/mfa/disable', {
      method: 'POST',
      auth: true,
      body: { code },
    });
  },
};

/* ─── Pagination helpers ────────────────────────────────────────────────────── */

export interface PageMeta {
  total: number;
  page: number;
  per_page: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface PageQuery {
  page?: number;
  perPage?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  [key: string]: string | number | undefined;
}

type QueryValue = string | number | boolean | undefined | null;

function qs(params?: Record<string, QueryValue>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value));
  }
  const out = sp.toString();
  return out ? `?${out}` : '';
}

/* ─── Domain types ──────────────────────────────────────────────────────────── */

export interface ApiAssessment {
  id: string;
  title: string;
  description?: string | null;
  position?: string | null;
  recruiterId: string;
  durationMinutes: number;
  startTime?: string | null;
  endTime?: string | null;
  status: 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled';
  riskThreshold: number;
  passMark: number;
  shuffleQuestions: boolean;
  monitorFaceDetection: boolean;
  monitorEyeTracking: boolean;
  monitorPhoneDetection: boolean;
  monitorTabSwitch: boolean;
  monitorAudioDetection: boolean;
  monitorSuspiciousMovement: boolean;
  totalQuestions: number;
  createdAt: string;
}

export interface ApiTestCase {
  id: string;
  args?: unknown[] | null;
  expectedOutput?: string | null;
  display?: string | null;
  hidden?: boolean;
  order?: number;
}

export interface ApiQuestionOption {
  id?: string;
  text: string;
  isCorrect?: boolean;
  explanation?: string | null;
  order?: number;
}

export interface ApiQuestion {
  id: string;
  assessmentId: string;
  text: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'coding';
  marks: number;
  order: number;
  difficulty?: string | null;
  required?: boolean | null;
  options?: ApiQuestionOption[] | null;
  language?: string | null;
  languages?: string[] | null;
  entryPoint?: string | null;
  starterCode?: string | null;
  starterCodes?: Record<string, string> | null;
  testCases?: ApiTestCase[] | null;
}

/** Payload for creating/updating a question. Test cases are created server-side, so `id` is optional on input. */
export type QuestionInput = { text: string; type: string } & Partial<
  Omit<ApiQuestion, 'text' | 'type' | 'testCases'>
> & {
  testCases?: Array<Omit<ApiTestCase, 'id'> & { id?: string }>;
};

export interface ApiSession {
  id: string;
  assessmentId: string;
  assessmentTitle?: string | null;
  candidateId: string;
  candidateName?: string | null;
  candidateEmail?: string | null;
  startedAt?: string | null;
  submittedAt?: string | null;
  status: 'in_progress' | 'completed' | 'abandoned' | 'flagged';
  score?: number | null;
  maxScore: number;
  percentage?: number | null;
  passed?: boolean | null;
  gradingStatus?: 'graded' | 'processing' | 'under_review' | null;
  integrityScore: number;
  riskScore: number;
  riskLevel?: 'low' | 'medium' | 'high' | null;
  tabSwitchCount: number;
  lookingAwayCount: number;
  faceNotDetectedCount: number;
  liveStatus?: Record<string, unknown> | null;
  monitoringEnabled?: boolean;
  deviceFingerprint?: string | null;
  deviceInfo?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}


export interface ApiAlert {
  id: string;
  sessionId: string;
  assessmentId: string;
  candidateId: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description?: string | null;
  riskScore: number;
  occurredAt: string;
  reviewed: boolean;
  reviewedAt?: string | null;
  resolutionNote?: string | null;
}

export interface RiskFactor {
  type: string;
  label: string;
  count: number;
  contribution: number;
  avgConfidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  lastOccurredAt?: string | null;
}

export interface RiskTimelineEvent {
  id: string;
  type: string | null;
  label: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  riskDelta: number;
  confidence: number;
  occurredAt: string | null;
  payload?: Record<string, unknown> | null;
}

export interface RiskBreakdown {
  sessionId: string;
  candidateId: string;
  candidateName: string;
  assessmentId: string;
  assessmentTitle: string;
  status: string | null;
  passed?: boolean | null;
  percentage?: number | null;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  integrityScore: number;
  riskThreshold?: number | null;
  totalEvents: number;
  tabSwitchCount: number;
  lookingAwayCount: number;
  faceNotDetectedCount: number;
  flagged: boolean;
  startedAt?: string | null;
  submittedAt?: string | null;
  factors: RiskFactor[];
  timeline: RiskTimelineEvent[];
}

export interface ApiEvidence {
  id: string;
  sessionId: string;
  alertId?: string | null;
  type: 'screenshot' | 'snapshot' | 'video' | 'audio' | 'document';
  url?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  capturedAt?: string | null;
  createdAt: string;
}

export type CodeVerdict = 'clean' | 'review' | 'likely_copy' | 'likely_ai_generated';

export interface CodeAnalysis {
  language?: string | null;
  codeLength: number;
  similarity: {
    score: number;
    percent: number;
    matchedCandidateId?: string | null;
    matchedCandidateName?: string | null;
  };
  ai: { score: number; reasons: string[] };
  keystroke?: Record<string, number> | null;
  verdict: CodeVerdict;
}

export interface CodeIntegrityItem {
  questionId: string;
  questionText: string;
  language?: string | null;
  answered: boolean;
  analysis: CodeAnalysis | null;
}

export interface ApiLiveSession {
  id: string;
  sessionId: string;
  candidateId: string;
  candidateName: string;
  assessmentId: string;
  assessmentTitle: string;
  status: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  integrityScore: number;
  tabSwitches: number;
  lookingAwayCount: number;
  faceNotDetectedCount: number;
  alertCount: number;
  isFlagged: boolean;
  liveStatus?: Record<string, unknown> | null;
}

export interface ApiNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert' | 'success';
  read: boolean;
  link?: string | null;
  createdAt: string;
}

export interface ApiAuditLog {
  id: string;
  userId?: string | null;
  userName?: string | null;
  userRole?: UserRole | null;
  action: string;
  resource?: string | null;
  status: 'success' | 'failure' | 'warning';
  ipAddress?: string | null;
  details?: string | null;
  createdAt: string;
}

/* ─── User management (admin) ───────────────────────────────────────────────── */

export const usersApi = {
  list(params?: PageQuery & { role?: UserRole; status?: string }) {
    return request<Paginated<ApiUser>>(`/users${qs(params)}`, { auth: true });
  },
  get(id: string) {
    return request<ApiUser>(`/users/${id}`, { auth: true });
  },
  create(payload: {
    fullName: string;
    email: string;
    password: string;
    role?: UserRole;
    phone?: string;
    department?: string;
    position?: string;
  }) {
    return request<ApiUser>('/users', { method: 'POST', auth: true, body: payload });
  },
  update(id: string, payload: Partial<{ fullName: string; phone: string; avatarUrl: string; status: string }>) {
    return request<ApiUser>(`/users/${id}`, { method: 'PUT', auth: true, body: payload });
  },
  setStatus(id: string, status: string) {
    return request<ApiUser>(`/users/${id}/status`, { method: 'PATCH', auth: true, body: { status } });
  },
  remove(id: string) {
    return request<{ message: string }>(`/users/${id}`, { method: 'DELETE', auth: true });
  },
};

/* ─── Assessments + nested questions ────────────────────────────────────────── */

export const assessmentsApi = {
  list(params?: PageQuery & { status?: string }) {
    return request<Paginated<ApiAssessment>>(`/assessments${qs(params)}`, { auth: true });
  },
  get(id: string) {
    return request<ApiAssessment>(`/assessments/${id}`, { auth: true });
  },
  create(payload: Partial<ApiAssessment> & { title: string }) {
    return request<ApiAssessment>('/assessments', { method: 'POST', auth: true, body: payload });
  },
  update(id: string, payload: Partial<ApiAssessment>) {
    return request<ApiAssessment>(`/assessments/${id}`, { method: 'PUT', auth: true, body: payload });
  },
  changeStatus(id: string, status: string) {
    return request<ApiAssessment>(`/assessments/${id}/status`, {
      method: 'PATCH',
      auth: true,
      body: { status },
    });
  },
  remove(id: string) {
    return request<{ message: string }>(`/assessments/${id}`, { method: 'DELETE', auth: true });
  },
  questions(assessmentId: string) {
    return request<ApiQuestion[]>(`/assessments/${assessmentId}/questions`, { auth: true });
  },
  addQuestion(assessmentId: string, payload: QuestionInput) {
    return request<ApiQuestion>(`/assessments/${assessmentId}/questions`, {
      method: 'POST',
      auth: true,
      body: payload,
    });
  },
};

export const questionsApi = {
  update(id: string, payload: Partial<ApiQuestion>) {
    return request<ApiQuestion>(`/questions/${id}`, { method: 'PUT', auth: true, body: payload });
  },
  remove(id: string) {
    return request<{ message: string }>(`/questions/${id}`, { method: 'DELETE', auth: true });
  },
};

/* ─── Assessment sessions ───────────────────────────────────────────────────── */

export const sessionsApi = {
  list(params?: PageQuery & { assessmentId?: string }) {
    return request<Paginated<ApiSession>>(`/sessions${qs(params)}`, { auth: true });
  },
  get(id: string) {
    return request<ApiSession>(`/sessions/${id}`, { auth: true });
  },
  start(assessmentId: string, device?: { fingerprint?: string; info?: Record<string, unknown> }) {
    return request<ApiSession>('/sessions', {
      method: 'POST',
      auth: true,
      body: { assessmentId, deviceFingerprint: device?.fingerprint, deviceInfo: device?.info },
    });
  },
  saveAnswer(
    id: string,
    questionId: string,
    response?: string,
    selectedLanguage?: string,
    keystrokeStats?: Record<string, unknown>,
  ) {
    return request<{ message: string }>(`/sessions/${id}/answers`, {
      method: 'POST',
      auth: true,
      body: { questionId, response, selectedLanguage, keystrokeStats },
    });
  },
  submit(id: string) {
    return request<ApiSession>(`/sessions/${id}/submit`, { method: 'POST', auth: true });
  },
  ingestEvent(
    id: string,
    payload: { type: string; severity?: string; confidence?: number; occurredAt?: string; payload?: Record<string, unknown> },
  ) {
    return request<{ session: ApiSession; alert: ApiAlert | null }>(`/sessions/${id}/events`, {
      method: 'POST',
      auth: true,
      body: payload,
    });
  },
  alerts(id: string) {
    return request<ApiAlert[]>(`/sessions/${id}/alerts`, { auth: true });
  },
  riskBreakdown(id: string) {
    return request<RiskBreakdown>(`/sessions/${id}/risk-breakdown`, { auth: true });
  },
  codeIntegrity(id: string) {
    return request<CodeIntegrityItem[]>(`/sessions/${id}/code-integrity`, { auth: true });
  },
  live() {
    return request<ApiLiveSession[]>('/sessions/live', { auth: true });
  },
  heartbeat(id: string, status: Record<string, unknown>) {
    return request<{ message: string }>(`/sessions/${id}/status`, {
      method: 'POST',
      auth: true,
      body: { status },
    });
  },
  toggleMonitoring(id: string, enabled: boolean) {
    return request<ApiSession>(`/sessions/${id}/monitoring`, {
      method: 'POST',
      auth: true,
      body: { enabled },
    });
  },
};


/* ─── Alerts (recruiter) ────────────────────────────────────────────────────── */

export const alertsApi = {
  list(params?: PageQuery & { reviewed?: 'true' | 'false'; severity?: string }) {
    return request<Paginated<ApiAlert>>(`/alerts${qs(params)}`, { auth: true });
  },
  get(id: string) {
    return request<ApiAlert>(`/alerts/${id}`, { auth: true });
  },
  review(id: string, resolutionNote?: string) {
    return request<ApiAlert>(`/alerts/${id}/review`, {
      method: 'POST',
      auth: true,
      body: { resolutionNote },
    });
  },
};

/* ─── Evidence (proctoring media) ───────────────────────────────────────────── */

async function uploadEvidenceRequest(
  sessionId: string,
  form: FormData,
  retried = false,
): Promise<ApiEvidence> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/evidence`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: form,
  });
  if (res.status === 401 && !retried && refreshToken) {
    if (await tryRefresh()) return uploadEvidenceRequest(sessionId, form, true);
  }
  if (!res.ok) throw new ApiError('Evidence upload failed', res.status);
  return res.json();
}

async function fetchEvidenceBlob(id: string, retried = false): Promise<Blob> {
  const res = await fetch(`${API_BASE}/evidence/${id}/download?inline=1`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (res.status === 401 && !retried && refreshToken) {
    if (await tryRefresh()) return fetchEvidenceBlob(id, true);
  }
  if (!res.ok) throw new ApiError('Failed to load evidence', res.status);
  return res.blob();
}

export const evidenceApi = {
  upload(sessionId: string, blob: Blob, type: ApiEvidence['type'], capturedAt?: string) {
    const form = new FormData();
    const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'mp4' : 'bin';
    form.append('file', blob, `${type}-${Date.now()}.${ext}`);
    form.append('type', type);
    if (capturedAt) form.append('capturedAt', capturedAt);
    return uploadEvidenceRequest(sessionId, form);
  },
  list(sessionId: string) {
    return request<ApiEvidence[]>(`/sessions/${sessionId}/evidence`, { auth: true });
  },
  fetchBlob(id: string) {
    return fetchEvidenceBlob(id);
  },
  async objectUrl(id: string): Promise<string> {
    return URL.createObjectURL(await fetchEvidenceBlob(id));
  },
};

/* ─── Notifications ─────────────────────────────────────────────────────────── */

export const notificationsApi = {
  list(params?: PageQuery) {
    return request<Paginated<ApiNotification>>(`/notifications${qs(params)}`, { auth: true });
  },
  unreadCount() {
    return request<{ count: number }>('/notifications/unread-count', { auth: true });
  },
  markRead(id: string) {
    return request<ApiNotification>(`/notifications/${id}/read`, { method: 'POST', auth: true });
  },
  markAllRead() {
    return request<{ updated: number }>('/notifications/read-all', { method: 'POST', auth: true });
  },
};

/* ─── Audit logs (admin) ────────────────────────────────────────────────────── */

export const auditApi = {
  list(params?: PageQuery & { action?: string }) {
    return request<Paginated<ApiAuditLog>>(`/audit-logs${qs(params)}`, { auth: true });
  },
};

/* ─── Certificates & offer letters ──────────────────────────────────────────── */

export type CredentialType = 'certificate' | 'offer_letter';

export interface ApiCredential {
  id: string;
  type: CredentialType;
  number: string;
  verificationToken: string;
  candidateId: string;
  assessmentId?: string | null;
  sessionId?: string | null;
  candidateName: string;
  title: string;
  position?: string | null;
  department?: string | null;
  integrityScore?: number | null;
  score?: number | null;
  percentage?: number | null;
  body?: string | null;
  issuedAt: string;
  revoked: boolean;
  createdAt: string;
}

export interface CredentialVerification {
  valid: boolean;
  type?: CredentialType;
  number?: string;
  candidateName?: string;
  title?: string;
  position?: string | null;
  integrityScore?: number | null;
  issuedAt?: string | null;
  revoked: boolean;
  issuer: string;
}

async function fetchPdfBlob(id: string, retried = false): Promise<Blob> {
  const res = await fetch(`${API_BASE}/certificates/${id}/download`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (res.status === 401 && !retried && refreshToken) {
    if (await tryRefresh()) return fetchPdfBlob(id, true);
  }
  if (!res.ok) throw new ApiError('Failed to download document', res.status);
  return res.blob();
}

export const certificatesApi = {
  list(params?: PageQuery & { type?: CredentialType; candidateId?: string; assessmentId?: string }) {
    return request<Paginated<ApiCredential>>(`/certificates${qs(params)}`, { auth: true });
  },
  get(id: string) {
    return request<ApiCredential>(`/certificates/${id}`, { auth: true });
  },
  verify(token: string) {
    return request<CredentialVerification>(`/certificates/verify/${encodeURIComponent(token)}`);
  },
  fetchPdf(id: string) {
    return fetchPdfBlob(id);
  },
  async download(id: string, filename: string): Promise<void> {
    const blob = await fetchPdfBlob(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  issue(payload: { sessionId: string; type: CredentialType; position?: string; body?: string }) {
    return request<ApiCredential>('/certificates', { method: 'POST', auth: true, body: payload });
  },
  revoke(id: string, reason?: string) {
    return request<ApiCredential>(`/certificates/${id}/revoke`, { method: 'POST', auth: true, body: { reason } });
  },
};

/* ─── System settings (admin) ───────────────────────────────────────────────── */

export const settingsApi = {
  list() {
    return request<Record<string, unknown>>('/settings', { auth: true });
  },
  set(key: string, value: unknown, description?: string) {
    return request<{ key: string; value: unknown }>(`/settings/${key}`, {
      method: 'PUT',
      auth: true,
      body: { value, description },
    });
  },
};

export { request };
