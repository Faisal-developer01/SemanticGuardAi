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

export interface ApiQuestion {
  id: string;
  assessmentId: string;
  text: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'coding';
  marks: number;
  order: number;
  options?: string[] | null;
  language?: string | null;
  languages?: string[] | null;
  entryPoint?: string | null;
  starterCode?: string | null;
  starterCodes?: Record<string, string> | null;
  testCases?: ApiTestCase[] | null;
}

export interface ApiSession {
  id: string;
  assessmentId: string;
  candidateId: string;
  startedAt?: string | null;
  submittedAt?: string | null;
  status: 'in_progress' | 'completed' | 'abandoned' | 'flagged';
  score?: number | null;
  maxScore: number;
  percentage?: number | null;
  passed?: boolean | null;
  integrityScore: number;
  riskScore: number;
  riskLevel?: 'low' | 'medium' | 'high' | null;
  tabSwitchCount: number;
  lookingAwayCount: number;
  faceNotDetectedCount: number;
  liveStatus?: Record<string, unknown> | null;
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
  addQuestion(assessmentId: string, payload: { text: string; type: string } & Partial<Omit<ApiQuestion, 'text' | 'type'>>) {
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
  start(assessmentId: string) {
    return request<ApiSession>('/sessions', { method: 'POST', auth: true, body: { assessmentId } });
  },
  saveAnswer(id: string, questionId: string, response?: string, selectedLanguage?: string) {
    return request<{ message: string }>(`/sessions/${id}/answers`, {
      method: 'POST',
      auth: true,
      body: { questionId, response, selectedLanguage },
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
