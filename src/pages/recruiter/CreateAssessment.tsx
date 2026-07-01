import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, Settings, FileText } from 'lucide-react';
import { assessmentsApi } from '@/lib/api';

const DETECTION_OPTIONS = [
  { key: 'faceDetection', label: 'Face Detection', desc: 'Verify candidate identity' },
  { key: 'eyeTracking', label: 'Eye Gaze Tracking', desc: 'Track where candidate looks' },
  { key: 'phoneDetection', label: 'Phone Detection', desc: 'Detect mobile devices' },
  { key: 'tabSwitchDetection', label: 'Tab Switch Detection', desc: 'Monitor browser tabs' },
  { key: 'audioDetection', label: 'Audio Detection', desc: 'Detect suspicious audio' },
  { key: 'suspiciousMovement', label: 'Movement Detection', desc: 'Detect suspicious movement' },
];

/**
 * Create Assessment — the first step of the assessment lifecycle.
 *
 * This screen ONLY creates the assessment record (as a draft). It never creates
 * questions. On success the recruiter is redirected to the Assessment Details
 * page, where questions are added and the assessment is published.
 */
const CreateAssessment: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    title: '', description: '', position: '', duration: 60,
    startDate: '', startTime: '', endDate: '', endTime: '',
    riskThreshold: 60, passMark: 50,
  });
  const [monitoring, setMonitoring] = useState<Record<string, boolean>>({
    faceDetection: true, eyeTracking: true, phoneDetection: true,
    tabSwitchDetection: true, audioDetection: false, suspiciousMovement: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const goToMonitoring = () => {
    if (!form.title.trim()) {
      toast.error('Assessment title is required');
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Assessment title is required');
      setStep(1);
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Creating assessment…');
    try {
      // The date/time pickers capture the recruiter's *local* wall-clock time;
      // convert to the correct UTC instant for storage.
      let startTimeIso: string | undefined;
      if (form.startDate && form.startTime) {
        startTimeIso = new Date(`${form.startDate}T${form.startTime}:00`).toISOString();
      }
      let endTimeIso: string | undefined;
      if (form.endDate && form.endTime) {
        endTimeIso = new Date(`${form.endDate}T${form.endTime}:00`).toISOString();
      }

      // Creating an assessment ONLY creates the assessment record (a draft).
      // Questions are added afterwards on the Assessment Details page.
      const assessment = await assessmentsApi.create({
        title: form.title,
        description: form.description || undefined,
        position: form.position || undefined,
        durationMinutes: form.duration,
        startTime: startTimeIso,
        endTime: endTimeIso,
        riskThreshold: form.riskThreshold,
        passMark: form.passMark,
        shuffleQuestions: true,
        monitorFaceDetection: monitoring.faceDetection,
        monitorEyeTracking: monitoring.eyeTracking,
        monitorPhoneDetection: monitoring.phoneDetection,
        monitorTabSwitch: monitoring.tabSwitchDetection,
        monitorAudioDetection: monitoring.audioDetection,
        monitorSuspiciousMovement: monitoring.suspiciousMovement,
      });

      toast.success('Assessment created. Now add your questions.', { id: toastId });
      navigate(`/recruiter/edit-assessment/${assessment.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create assessment', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-balance">Create New Assessment</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Set up the assessment details — you'll add questions on the next screen.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3">
          {([1, 2] as const).map(s => (
            <React.Fragment key={s}>
              <button
                onClick={() => (s < step ? setStep(s) : undefined)}
                className={`flex items-center gap-2 ${step >= s ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step > s ? 'border-primary bg-primary text-primary-foreground' : step === s ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
                  {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
                </div>
                <span className="text-xs hidden sm:block">{s === 1 ? 'Assessment Details' : 'AI Monitoring'}</span>
              </button>
              {s < 2 && <div className={`flex-1 h-px ${step > s ? 'bg-primary' : 'bg-border'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Details */}
        {step === 1 && (
          <div className="bg-card border border-border rounded-md p-5 space-y-5">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm">Assessment Details</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-sm font-normal">Assessment Title <span className="text-destructive">*</span></Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Senior Software Engineer – Technical Assessment" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">Position</Label>
                <Input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="e.g. Senior Software Engineer" />
              </div>
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-sm font-normal">Description / Instructions</Label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description and instructions for candidates…"
                  className="w-full p-3 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[72px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">Duration (minutes)</Label>
                <Input type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} min={15} max={300} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">Pass Mark (%)</Label>
                <Input type="number" value={form.passMark} onChange={e => setForm(f => ({ ...f, passMark: Number(e.target.value) }))} min={0} max={100} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">Risk Threshold (0–100)</Label>
                <Input type="number" value={form.riskThreshold} onChange={e => setForm(f => ({ ...f, riskThreshold: Number(e.target.value) }))} min={0} max={100} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">Start Time</Label>
                <Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-normal">End Time</Label>
                <Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            <Button onClick={goToMonitoring} className="w-full">Next: AI Monitoring →</Button>
          </div>
        )}

        {/* Step 2: AI Monitoring */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-md p-5 space-y-5">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm">AI Monitoring Settings</h2>
            </div>
            <div className="space-y-3">
              {DETECTION_OPTIONS.map(opt => (
                <div key={opt.key} className="flex items-center justify-between p-3 bg-muted/50 rounded border border-border">
                  <div>
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMonitoring(m => ({ ...m, [opt.key]: !m[opt.key] }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${monitoring[opt.key] ? 'bg-primary' : 'bg-muted'}`}
                    aria-label={`Toggle ${opt.label}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${monitoring[opt.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1" disabled={submitting}>← Back</Button>
              <Button type="submit" className="flex-1" disabled={submitting}>{submitting ? 'Creating…' : 'Create Assessment'}</Button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
};

export default CreateAssessment;
