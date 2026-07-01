import React, { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { assessmentsApi, sessionsApi, alertsApi } from '@/lib/api';
import type { ApiAlert, ApiSession } from '@/lib/api';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { FileText, Download, ShieldAlert, Filter, Search, Loader2 } from 'lucide-react';
import {
  generateIntegrityReport,
  type CandidateReportData,
  type Classification,
} from '@/lib/reportPdf';

/* ─── Violation taxonomy ────────────────────────────────────────────────────── */

const VIOLATION_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Violation Types' },
  { value: 'tab_switch', label: 'Switched Tab During Assessment' },
  { value: 'phone_detected', label: 'Used Mobile Phone / Device' },
  { value: 'looking_away', label: 'Eye Gaze Anomalies' },
  { value: 'suspicious_movement', label: 'Head Pose / Suspicious Movement' },
  { value: 'object_detected', label: 'Object Detection Alerts' },
  { value: 'multiple_faces', label: 'Multiple Faces Detected' },
  { value: 'identity_mismatch', label: 'Face Mismatch / Identity Failure' },
  { value: 'face_not_detected', label: 'Face Not Detected' },
  { value: 'audio_detected', label: 'Suspicious Audio Activity' },
];

const RISK_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Risk Levels' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const VIOLATION_LABEL: Record<string, string> = {
  tab_switch: 'Tab Switch',
  phone_detected: 'Phone / Device Detected',
  looking_away: 'Eye Gaze Deviation',
  suspicious_movement: 'Suspicious Movement',
  object_detected: 'Object Detected',
  multiple_faces: 'Multiple Faces',
  identity_mismatch: 'Identity Mismatch',
  face_not_detected: 'Face Not Detected',
  audio_detected: 'Audio Detected',
  browser_unfocused: 'Browser Unfocused',
};

function prettyType(t: string): string {
  return VIOLATION_LABEL[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function safeDate(value: string | null | undefined, fmt = 'dd MMM yyyy, HH:mm'): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, fmt);
}

/* ─── Risk classification ───────────────────────────────────────────────────── */

function classify(riskScore: number, flagged: boolean): Classification {
  if (flagged || riskScore >= 70) return 'High Risk';
  if (riskScore >= 40) return 'Suspicious';
  return 'Clean';
}

function statusLabel(riskScore: number, flagged: boolean): 'Clean' | 'Suspicious' | 'Flagged' {
  if (flagged) return 'Flagged';
  if (riskScore >= 40) return 'Suspicious';
  return 'Clean';
}

function riskLevelOf(riskScore: number): 'low' | 'medium' | 'high' {
  if (riskScore >= 70) return 'high';
  if (riskScore >= 40) return 'medium';
  return 'low';
}

/* ─── Row model ─────────────────────────────────────────────────────────────── */

interface ViolationRecord {
  timestamp: string;
  type: string;
  description: string;
  severity: string;
}

interface CandidateRow {
  sessionId: string;
  candidateId: string;
  name: string;
  email: string;
  assessmentId: string;
  assessmentTitle: string;
  date: string;
  riskScore: number;
  integrityScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  flagged: boolean;
  status: 'Clean' | 'Suspicious' | 'Flagged';
  classification: Classification;
  violations: ViolationRecord[];
  types: Set<string>;
}

/* ─── Deterministic AI analysis (derived from real violation data) ──────────── */

function buildAnalysis(row: CandidateRow): { summary: string; conclusion: string; recommendation: string } {
  const counts = row.violations.reduce<Record<string, number>>((acc, v) => {
    acc[v.type] = (acc[v.type] ?? 0) + 1;
    return acc;
  }, {});
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${prettyType(t).toLowerCase()} ${n === 1 ? 'event' : 'events'}`);

  const summary = row.violations.length === 0
    ? "No integrity violations were detected during this candidate's assessment session. Behavioral monitoring (face, gaze, device and tab-focus tracking) remained within expected parameters throughout the assessment."
    : `SemanticGuard AI recorded ${row.violations.length} integrity ${row.violations.length === 1 ? 'event' : 'events'} during this assessment, comprising ${breakdown.join(', ')}. The aggregate behavioral risk score reached ${Math.round(row.riskScore)} with a measured integrity score of ${Math.round(row.integrityScore)}.`;

  let conclusion: string;
  let recommendation: string;
  if (row.classification === 'High Risk') {
    conclusion = 'The volume and severity of detected events indicate a high probability of assessment-integrity compromise.';
    recommendation = 'Manual review of session evidence is strongly recommended before advancing this candidate. Consider invalidating the result or scheduling a supervised re-assessment.';
  } else if (row.classification === 'Suspicious') {
    conclusion = 'Detected behaviors are inconsistent enough to warrant additional scrutiny, though not conclusively fraudulent.';
    recommendation = 'Review the flagged events and corroborating evidence. A follow-up or proctored re-assessment may be appropriate before a hiring decision.';
  } else {
    conclusion = 'Monitoring signals are consistent with a legitimate, unaided assessment attempt.';
    recommendation = 'No integrity-based action is required. This candidate may proceed through the standard evaluation pipeline.';
  }

  return { summary, conclusion, recommendation };
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

const RecruiterReports: React.FC = () => {
  const { user } = useAuth();

  const { data: assessmentsData } = useAsync(() => assessmentsApi.list({ perPage: 200 }), []);
  const { data: sessionsData } = useAsync(() => sessionsApi.list({ perPage: 500 }), []);
  const { data: alertsData } = useAsync(() => alertsApi.list({ perPage: 1000 }), []);

  const [assessmentId, setAssessmentId] = useState('all');
  const [violationType, setViolationType] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  // Recruiter's own assessments only.
  const myAssessments = useMemo(
    () => (assessmentsData?.items ?? []).filter((a) => a.recruiterId === user?.id),
    [assessmentsData, user?.id],
  );
  const myIds = useMemo(() => new Set(myAssessments.map((a) => a.id)), [myAssessments]);
  const titleOf = (id: string) => myAssessments.find((a) => a.id === id)?.title ?? '';

  // Build candidate rows from real session + alert data.
  const rows: CandidateRow[] = useMemo(() => {
    const sessions = (sessionsData?.items ?? []).filter((s: ApiSession) => myIds.has(s.assessmentId));
    const alerts = (alertsData?.items ?? []).filter((a: ApiAlert) => myIds.has(a.assessmentId));
    const alertsBySession = alerts.reduce<Record<string, ApiAlert[]>>((acc, a) => {
      (acc[a.sessionId] ??= []).push(a);
      return acc;
    }, {});

    return sessions.map((s: ApiSession): CandidateRow => {
      const sessionAlerts = alertsBySession[s.id] ?? [];
      const violations: ViolationRecord[] = sessionAlerts
        .slice()
        .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
        .map((a) => ({
          timestamp: safeDate(a.occurredAt, 'dd MMM HH:mm:ss'),
          type: a.type,
          description: a.description ?? '',
          severity: a.severity,
        }));
      const flagged = s.status === 'flagged';
      const riskScore = s.riskScore ?? 0;
      const name = s.candidateName?.trim() || s.candidateEmail || `Candidate ${s.candidateId.slice(0, 8)}`;
      return {
        sessionId: s.id,
        candidateId: s.candidateId,
        name,
        email: s.candidateEmail ?? '',
        assessmentId: s.assessmentId,
        assessmentTitle: s.assessmentTitle || titleOf(s.assessmentId),
        date: safeDate(s.startedAt ?? s.createdAt),
        riskScore,
        integrityScore: s.integrityScore ?? 100,
        riskLevel: (s.riskLevel as 'low' | 'medium' | 'high') ?? riskLevelOf(riskScore),
        flagged,
        status: statusLabel(riskScore, flagged),
        classification: classify(riskScore, flagged),
        violations,
        types: new Set(sessionAlerts.map((a) => a.type)),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsData, alertsData, myIds]);

  // Apply filters.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (assessmentId !== 'all' && r.assessmentId !== assessmentId) return false;
      if (violationType !== 'all' && !r.types.has(violationType)) return false;
      if (riskFilter !== 'all' && r.riskLevel !== riskFilter) return false;
      if (flaggedOnly && !r.flagged) return false;
      if (q && !(r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, assessmentId, violationType, riskFilter, flaggedOnly, search]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.sessionId));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r) => next.delete(r.sessionId));
      else filtered.forEach((r) => next.add(r.sessionId));
      return next;
    });

  // Summary stats (real, filter-aware).
  const totalCandidates = filtered.length;
  const flaggedCount = filtered.filter((r) => r.flagged).length;
  const highRisk = filtered.filter((r) => r.classification === 'High Risk').length;
  const totalViolations = filtered.reduce((a, r) => a + r.violations.length, 0);

  const handleGenerate = async () => {
    const chosen = filtered.filter((r) => selected.has(r.sessionId));
    if (chosen.length === 0) {
      toast.error('Select at least one candidate to generate a report.');
      return;
    }
    setGenerating(true);
    try {
      const payload: CandidateReportData[] = chosen.map((r) => {
        // When filtering by a violation type, scope the PDF detail to that type.
        const violations = violationType === 'all'
          ? r.violations
          : r.violations.filter((v) => v.type === violationType);
        const analysis = buildAnalysis({ ...r, violations });
        return {
          name: r.name,
          email: r.email,
          candidateId: r.candidateId,
          assessmentTitle: r.assessmentTitle,
          assessmentDate: r.date,
          riskScore: r.riskScore,
          integrityScore: r.integrityScore,
          classification: r.classification,
          totalViolations: violations.length,
          violations,
          aiSummary: analysis.summary,
          conclusion: analysis.conclusion,
          recommendation: analysis.recommendation,
        };
      });
      const stamp = format(new Date(), 'yyyyMMdd-HHmm');
      await generateIntegrityReport(payload, `SemanticGuard-Integrity-Report-${stamp}.pdf`);
      toast.success(`Generated report for ${chosen.length} candidate${chosen.length > 1 ? 's' : ''}.`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate the PDF report.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-balance flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" /> Candidate Integrity Reports
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Review real candidate integrity violations and export branded PDF reports.
            </p>
          </div>
          <Button size="sm" onClick={handleGenerate} disabled={generating || selected.size === 0}>
            {generating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> Generate PDF Report{selected.size > 0 ? ` (${selected.size})` : ''}</>
            )}
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-md p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="w-4 h-4 text-primary" /> Filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Assessment</Label>
              <select
                value={assessmentId}
                onChange={(e) => setAssessmentId(e.target.value)}
                aria-label="Filter by assessment"
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Assessments</option>
                {myAssessments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Suspicious Behavior</Label>
              <select
                value={violationType}
                onChange={(e) => setViolationType(e.target.value)}
                aria-label="Filter by suspicious behavior"
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {VIOLATION_FILTERS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Fraud Risk</Label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                aria-label="Filter by fraud risk level"
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {RISK_FILTERS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or email…"
                  className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
              className="w-4 h-4 rounded border-input accent-primary"
            />
            Show flagged sessions only
          </label>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Candidates', value: totalCandidates },
            { label: 'Flagged Sessions', value: flaggedCount },
            { label: 'High Risk', value: highRisk },
            { label: 'Total Violations', value: totalViolations },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-md p-4">
              <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Candidate list */}
        <div className="bg-card border border-border rounded-md">
          <div className="flex items-center gap-2 p-4 border-b border-border">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Candidate Integrity Records</h2>
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                      className="w-4 h-4 rounded border-input accent-primary"
                    />
                  </th>
                  {['Candidate', 'Email / ID', 'Assessment', 'Risk Score', 'Status', 'Violations'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No candidate records match the current filters.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.sessionId} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(r.sessionId)}
                        onChange={() => toggle(r.sessionId)}
                        aria-label={`Select ${r.name}`}
                        className="w-4 h-4 rounded border-input accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {r.email || `${r.candidateId.slice(0, 12)}…`}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap max-w-[200px] truncate">
                      {r.assessmentTitle || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-sm font-mono font-bold ${r.riskScore >= 70 ? 'text-destructive' : r.riskScore >= 40 ? 'text-yellow-500' : 'text-green-500'}`}>
                        {Math.round(r.riskScore)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded border ${
                        r.status === 'Flagged'
                          ? 'border-destructive/30 text-destructive bg-destructive/10'
                          : r.status === 'Suspicious'
                            ? 'border-yellow-500/30 text-yellow-600 dark:text-yellow-400 bg-yellow-500/10'
                            : 'border-green-500/30 text-green-600 dark:text-green-400 bg-green-500/10'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{r.violations.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default RecruiterReports;
