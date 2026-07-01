import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save, ArrowLeft, Settings, CalendarClock, ListChecks, Rocket } from 'lucide-react';
import { assessmentsApi, type ApiAssessment } from '@/lib/api';
import { normalizeUtc } from '@/lib/utils';

const DETECTION_OPTIONS = [
  { key: 'faceDetection', label: 'Face Detection', desc: 'Verify candidate identity' },
  { key: 'eyeTracking', label: 'Eye Gaze Tracking', desc: 'Track where candidate looks' },
  { key: 'phoneDetection', label: 'Phone Detection', desc: 'Detect mobile devices' },
  { key: 'tabSwitchDetection', label: 'Tab Switch Detection', desc: 'Monitor browser tabs' },
  { key: 'audioDetection', label: 'Audio Detection', desc: 'Detect suspicious audio' },
  { key: 'suspiciousMovement', label: 'Movement Detection', desc: 'Detect suspicious movement' },
];

const STATUS_OPTIONS: { value: ApiAssessment['status']; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Split a stored UTC ISO timestamp into local date + time strings for the inputs. */
function splitLocal(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(normalizeUtc(iso));
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Combine local date + time (recruiter's wall clock) into the correct UTC ISO instant. */
function toUtcIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const EditAssessment: React.FC = () => {
  const navigate = useNavigate();
  const { assessmentId } = useParams<{ assessmentId: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', position: '', duration: 60,
    startDate: '', startTime: '', endDate: '', endTime: '',
    riskThreshold: 60, passMark: 50, status: 'upcoming' as ApiAssessment['status'],
  });
  const [monitoring, setMonitoring] = useState<Record<string, boolean>>({
    faceDetection: true, eyeTracking: true, phoneDetection: true,
    tabSwitchDetection: true, audioDetection: false, suspiciousMovement: true,
  });

  useEffect(() => {
    if (!assessmentId) return;
    let active = true;
    (async () => {
      try {
        const a = await assessmentsApi.get(assessmentId);
        if (!active) return;
        const start = splitLocal(a.startTime);
        const end = splitLocal(a.endTime);
        setForm({
          title: a.title,
          description: a.description ?? '',
          position: a.position ?? '',
          duration: a.durationMinutes,
          startDate: start.date, startTime: start.time,
          endDate: end.date, endTime: end.time,
          riskThreshold: a.riskThreshold,
          passMark: a.passMark,
          status: a.status === 'draft' ? 'upcoming' : a.status,
        });
        setMonitoring({
          faceDetection: a.monitorFaceDetection,
          eyeTracking: a.monitorEyeTracking,
          phoneDetection: a.monitorPhoneDetection,
          tabSwitchDetection: a.monitorTabSwitch,
          audioDetection: a.monitorAudioDetection,
          suspiciousMovement: a.monitorSuspiciousMovement,
        });
        const qs = await assessmentsApi.questions(assessmentId).catch(() => []);
        if (active) setQuestionCount(qs.length);
      } catch (err: any) {
        toast.error(err.message || 'Failed to load assessment');
        navigate('/recruiter/dashboard');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [assessmentId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessmentId) return;
    if (!form.title.trim()) {
      toast.error('Assessment title is required');
      return;
    }
    const startIso = toUtcIso(form.startDate, form.startTime);
    const endIso = toUtcIso(form.endDate, form.endTime);
    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      toast.error('End time must be after the start time');
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Saving changes...');
    try {
      await assessmentsApi.update(assessmentId, {
        title: form.title,
        description: form.description || undefined,
        position: form.position || undefined,
        durationMinutes: form.duration,
        startTime: startIso,
        endTime: endIso,
        riskThreshold: form.riskThreshold,
        passMark: form.passMark,
        monitorFaceDetection: monitoring.faceDetection,
        monitorEyeTracking: monitoring.eyeTracking,
        monitorPhoneDetection: monitoring.phoneDetection,
        monitorTabSwitch: monitoring.tabSwitchDetection,
        monitorAudioDetection: monitoring.audioDetection,
        monitorSuspiciousMovement: monitoring.suspiciousMovement,
      });
      await assessmentsApi.changeStatus(assessmentId, form.status);
      toast.success('Assessment updated successfully', { id: toastId });
      navigate('/recruiter/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update assessment', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const publish = async () => {
    if (!assessmentId) return;
    if (!questionCount) {
      toast.error('Add at least one question before publishing this assessment.');
      return;
    }
    setPublishing(true);
    try {
      await assessmentsApi.changeStatus(assessmentId, 'active');
      setForm(f => ({ ...f, status: 'active' }));
      toast.success('Assessment published — candidates can now take it.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish assessment');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-3xl py-12 text-sm text-muted-foreground">Loading assessment…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5 mb-1 -ml-2">
              <Link to="/recruiter/dashboard"><ArrowLeft className="w-3.5 h-3.5" /> Back</Link>
            </Button>
            <h1 className="text-xl font-bold text-balance">Assessment Details</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure the assessment, then add questions and publish.</p>
          </div>
        </div>

        {/* Questions & publish */}
        <div className="bg-card rounded-lg border border-border p-5 card-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ListChecks className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Questions</p>
              <p className="text-xs text-muted-foreground">
                {questionCount == null ? 'Loading…' : `${questionCount} question${questionCount === 1 ? '' : 's'} in this assessment`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/recruiter/questions?assessment=${assessmentId}`}>Manage Questions</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={publish}
              disabled={publishing || form.status === 'active' || !questionCount}
            >
              <Rocket className="w-3.5 h-3.5 mr-1.5" />
              {form.status === 'active' ? 'Published' : publishing ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        </div>

        {/* Details */}
        <div className="bg-card rounded-lg border border-border p-5 card-shadow space-y-4">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5"><Settings className="w-3.5 h-3.5" /> Details</p>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="position">Position</Label>
            <Input id="position" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Short description of the assessment"
              className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Schedule */}
        <div className="bg-card rounded-lg border border-border p-5 card-shadow space-y-4">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> Schedule</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="startTime">Start time</Label>
              <Input id="startTime" type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endTime">End time</Label>
              <Input id="endTime" type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input id="duration" type="number" min={1} max={600} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                title="Assessment status"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as ApiAssessment['status'] }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Times use your local timezone. Candidates can only join between the start and end times.
          </p>
        </div>

        {/* Scoring */}
        <div className="bg-card rounded-lg border border-border p-5 card-shadow space-y-4">
          <p className="text-xs font-bold text-foreground">Scoring</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="passMark">Pass mark (%)</Label>
              <Input id="passMark" type="number" min={0} max={100} value={form.passMark} onChange={e => setForm(f => ({ ...f, passMark: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="riskThreshold">Risk threshold (%)</Label>
              <Input id="riskThreshold" type="number" min={0} max={100} value={form.riskThreshold} onChange={e => setForm(f => ({ ...f, riskThreshold: Number(e.target.value) }))} />
            </div>
          </div>
        </div>

        {/* Monitoring */}
        <div className="bg-card rounded-lg border border-border p-5 card-shadow space-y-3">
          <p className="text-xs font-bold text-foreground">AI Monitoring</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {DETECTION_OPTIONS.map(opt => (
              <button
                type="button"
                key={opt.key}
                onClick={() => setMonitoring(m => ({ ...m, [opt.key]: !m[opt.key] }))}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  monitoring[opt.key]
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{opt.label}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${monitoring[opt.key] ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {monitoring[opt.key] ? 'On' : 'Off'}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitting} className="gap-1.5">
            <Save className="w-4 h-4" /> {submitting ? 'Saving…' : 'Save Changes'}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/recruiter/dashboard">Cancel</Link>
          </Button>
        </div>
      </form>
    </AppLayout>
  );
};

export default EditAssessment;
