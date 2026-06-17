import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PlusCircle, Trash2, CheckCircle2, Settings, Plus, Lock } from 'lucide-react';
import { assessmentsApi } from '@/lib/api';
import type { CodingLanguage } from '@/types/types';

const DETECTION_OPTIONS = [
  { key: 'faceDetection', label: 'Face Detection', desc: 'Verify candidate identity' },
  { key: 'eyeTracking', label: 'Eye Gaze Tracking', desc: 'Track where candidate looks' },
  { key: 'phoneDetection', label: 'Phone Detection', desc: 'Detect mobile devices' },
  { key: 'tabSwitchDetection', label: 'Tab Switch Detection', desc: 'Monitor browser tabs' },
  { key: 'audioDetection', label: 'Audio Detection', desc: 'Detect suspicious audio' },
  { key: 'suspiciousMovement', label: 'Movement Detection', desc: 'Detect suspicious movement' },
];

interface MCOption { text: string; }

interface TestCaseForm {
  args: string;
  expectedOutput: string;
  display: string;
  hidden: boolean;
}

type QuestionFormType = 'multiple_choice' | 'true_false' | 'short_answer' | 'coding';

interface QuestionForm {
  text: string;
  type: QuestionFormType;
  options: MCOption[];
  marks: number;
  correctAnswer: string;
  entryPoint: string;
  language: CodingLanguage;
  starterCode: string;
  testCases: TestCaseForm[];
}

const DEFAULT_MCQ: QuestionForm = {
  text: '',
  type: 'multiple_choice',
  options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
  marks: 2,
  correctAnswer: '',
  entryPoint: '',
  language: 'javascript',
  starterCode: '',
  testCases: [],
};

const SUM_EVEN_TEMPLATE: QuestionForm = {
  text: 'Implement a function `sumEven(nums)` that returns the sum of all even numbers in the array `nums`. Choose your preferred language.',
  type: 'coding',
  options: [],
  marks: 10,
  correctAnswer: '',
  entryPoint: 'sumEven',
  language: 'javascript',
  starterCode: 'function sumEven(nums) {\n  // your code\n}',
  testCases: [
    { args: '[[1,2,3,4,5,6]]', expectedOutput: '12', display: 'sumEven([1,2,3,4,5,6]) -> 12', hidden: false },
    { args: '[[2,4,6,8]]', expectedOutput: '20', display: 'sumEven([2,4,6,8]) -> 20', hidden: false },
    { args: '[[1,3,5,7]]', expectedOutput: '0', display: 'sumEven([1,3,5,7]) -> 0', hidden: true },
  ],
};

const CreateAssessment: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [assessmentForm, setAssessmentForm] = useState({
    title: '', description: '', position: '', duration: 60, startDate: '', startTime: '', endDate: '', endTime: '', riskThreshold: 60, passMark: 50,
  });
  const [monitoring, setMonitoring] = useState<Record<string, boolean>>({
    faceDetection: true, eyeTracking: true, phoneDetection: true, tabSwitchDetection: true, audioDetection: false, suspiciousMovement: true,
  });
  const [questions, setQuestions] = useState<QuestionForm[]>([
    { ...DEFAULT_MCQ },
    { ...SUM_EVEN_TEMPLATE },
  ]);

  const [submitting, setSubmitting] = useState(false);

  const addQuestion = () => setQuestions(q => [...q, { ...DEFAULT_MCQ }]);
  const removeQuestion = (i: number) => setQuestions(q => q.filter((_, idx) => idx !== i));
  const updateQ = (i: number, field: keyof QuestionForm, val: string | number) =>
    setQuestions(q => q.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  const updateOpt = (qi: number, oi: number, val: string) =>
    setQuestions(q => q.map((item, idx) => idx === qi ? { ...item, options: item.options.map((o, j) => j === oi ? { text: val } : o) } : item));

  const handleTypeChange = (qi: number, type: QuestionFormType) => {
    setQuestions(q => q.map((item, idx) => {
      if (idx !== qi) return item;
      if (type === 'coding') return { ...SUM_EVEN_TEMPLATE, text: item.text || SUM_EVEN_TEMPLATE.text };
      return {
        ...DEFAULT_MCQ,
        text: item.text,
        type,
        marks: item.marks,
        correctAnswer: type === 'true_false' ? 'True' : '',
      };
    }));
  };

  const buildQuestionPayload = (q: QuestionForm, order: number) => {
    const base = { text: q.text || `Question ${order}`, type: q.type, marks: q.marks, order };
    if (q.type === 'multiple_choice') {
      return { ...base, options: q.options.map(o => o.text).filter(Boolean), correctAnswer: q.correctAnswer || undefined };
    }
    if (q.type === 'true_false') {
      return { ...base, options: ['True', 'False'], correctAnswer: q.correctAnswer || 'True' };
    }
    if (q.type === 'short_answer') {
      return { ...base, correctAnswer: q.correctAnswer || undefined };
    }
    if (q.type === 'coding') {
      return {
        ...base,
        entryPoint: q.entryPoint.trim() || 'solution',
        languages: [q.language],
        starterCodes: { [q.language]: q.starterCode },
        testCases: q.testCases
          .filter(tc => tc.expectedOutput.trim())
          .map((tc, i) => {
            let args: unknown[] = [];
            try { args = JSON.parse(tc.args || '[]'); } catch { /* keep empty */ }
            return { order: i + 1, args, expectedOutput: tc.expectedOutput.trim(), display: tc.display.trim() || undefined, hidden: tc.hidden };
          }),
      };
    }
    return base;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessmentForm.title.trim()) {
      toast.error('Assessment title is required');
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Publishing assessment...');
    try {
      let startTimeIso: string | null = null;
      if (assessmentForm.startDate && assessmentForm.startTime) {
        startTimeIso = `${assessmentForm.startDate}T${assessmentForm.startTime}:00Z`;
      }
      let endTimeIso: string | null = null;
      if (assessmentForm.endDate && assessmentForm.endTime) {
        endTimeIso = `${assessmentForm.endDate}T${assessmentForm.endTime}:00Z`;
      }

      // 1. Create the assessment
      const assessment = await assessmentsApi.create({
        title: assessmentForm.title,
        description: assessmentForm.description || undefined,
        position: assessmentForm.position || undefined,
        durationMinutes: assessmentForm.duration,
        startTime: startTimeIso || undefined,
        endTime: endTimeIso || undefined,
        riskThreshold: assessmentForm.riskThreshold,
        passMark: assessmentForm.passMark,
        shuffleQuestions: true,
        monitorFaceDetection: monitoring.faceDetection,
        monitorEyeTracking: monitoring.eyeTracking,
        monitorPhoneDetection: monitoring.phoneDetection,
        monitorTabSwitch: monitoring.tabSwitchDetection,
        monitorAudioDetection: monitoring.audioDetection,
        monitorSuspiciousMovement: monitoring.suspiciousMovement,
      });

      // 2. Add each question
      for (let i = 0; i < questions.length; i++) {
        await assessmentsApi.addQuestion(assessment.id, buildQuestionPayload(questions[i], i + 1));
      }

      // 3. Publish (set status to active)
      await assessmentsApi.changeStatus(assessment.id, 'active');

      toast.success('Assessment created and published successfully!', { id: toastId });
      navigate('/recruiter/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create assessment', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl space-y-6">
        <h1 className="text-xl font-bold text-balance">Create New Assessment</h1>

        {/* Step indicator */}
        <div className="flex items-center gap-3">
          {([1, 2, 3] as const).map(s => (
            <React.Fragment key={s}>
              <button
                onClick={() => s < step ? setStep(s) : undefined}
                className={`flex items-center gap-2 ${step >= s ? 'text-primary' : 'text-muted-foreground'}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step > s ? 'border-primary bg-primary text-primary-foreground' : step === s ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
                  {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
                </div>
                <span className="text-xs hidden sm:block">{s === 1 ? 'Assessment Details' : s === 2 ? 'Questions' : 'AI Monitoring'}</span>
              </button>
              {s < 3 && <div className={`flex-1 h-px ${step > s ? 'bg-primary' : 'bg-border'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="bg-card border border-border rounded-md p-5 space-y-5">
            <h2 className="font-semibold text-sm">Assessment Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-sm font-normal">Assessment Title</Label>
                  <Input value={assessmentForm.title} onChange={e => setAssessmentForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Senior Software Engineer – Technical Assessment" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Position</Label>
                  <Input value={assessmentForm.position} onChange={e => setAssessmentForm(f => ({ ...f, position: e.target.value }))} placeholder="e.g. Senior Software Engineer" />
                </div>
                <div className="sm:col-span-3 space-y-1.5">
                  <Label className="text-sm font-normal">Description</Label>
                  <textarea
                    value={assessmentForm.description}
                    onChange={e => setAssessmentForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description of this assessment…"
                    className="w-full p-3 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[72px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Duration (minutes)</Label>
                  <Input type="number" value={assessmentForm.duration} onChange={e => setAssessmentForm(f => ({ ...f, duration: Number(e.target.value) }))} min={15} max={300} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Pass Mark (%)</Label>
                  <Input type="number" value={assessmentForm.passMark} onChange={e => setAssessmentForm(f => ({ ...f, passMark: Number(e.target.value) }))} min={0} max={100} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Risk Threshold (0–100)</Label>
                  <Input type="number" value={assessmentForm.riskThreshold} onChange={e => setAssessmentForm(f => ({ ...f, riskThreshold: Number(e.target.value) }))} min={0} max={100} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Start Date</Label>
                  <Input type="date" value={assessmentForm.startDate} onChange={e => setAssessmentForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Start Time</Label>
                  <Input type="time" value={assessmentForm.startTime} onChange={e => setAssessmentForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">End Date</Label>
                  <Input type="date" value={assessmentForm.endDate} onChange={e => setAssessmentForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">End Time</Label>
                  <Input type="time" value={assessmentForm.endTime} onChange={e => setAssessmentForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>
            </div>
            <Button onClick={() => setStep(2)} className="w-full">Next: Add Questions →</Button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            {questions.map((q, qi) => (
              <div key={qi} className="bg-card border border-border rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">Question {qi + 1}</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={q.type}
                      onChange={e => handleTypeChange(qi, e.target.value as QuestionFormType)}
                      className="text-xs px-2 py-1 rounded border border-input bg-background text-foreground"
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      <option value="short_answer">Short Answer</option>
                      <option value="coding">Coding</option>
                    </select>
                    <Input type="number" value={q.marks} onChange={e => updateQ(qi, 'marks', Number(e.target.value))} min={1} className="w-16 h-7 text-xs" />
                    <span className="text-xs text-muted-foreground">marks</span>
                    {questions.length > 1 && (
                      <button onClick={() => removeQuestion(qi)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={q.text}
                  onChange={e => updateQ(qi, 'text', e.target.value)}
                  placeholder="Enter question text…"
                  className="w-full p-3 text-sm rounded border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[72px]"
                />
                {q.type === 'multiple_choice' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5 shrink-0">{String.fromCharCode(65 + oi)}.</span>
                          <Input value={opt.text} onChange={e => updateOpt(qi, oi, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + oi)}`} className="h-8 text-xs" />
                        </div>
                      ))}
                    </div>
                    <select
                      value={q.correctAnswer}
                      onChange={e => updateQ(qi, 'correctAnswer', e.target.value)}
                      className="text-xs px-2 py-1.5 rounded border border-input bg-background text-foreground w-full sm:w-auto"
                    >
                      <option value="">Correct answer…</option>
                      {q.options.map(o => o.text).filter(Boolean).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </>
                )}
                {q.type === 'true_false' && (
                  <select
                    value={q.correctAnswer}
                    onChange={e => updateQ(qi, 'correctAnswer', e.target.value)}
                    className="text-xs px-2 py-1.5 rounded border border-input bg-background text-foreground"
                  >
                    <option value="True">True</option>
                    <option value="False">False</option>
                  </select>
                )}
                {q.type === 'short_answer' && (
                  <textarea
                    value={q.correctAnswer}
                    onChange={e => updateQ(qi, 'correctAnswer', e.target.value)}
                    placeholder="Model answer (optional — for grading reference)…"
                    className="w-full p-3 text-sm rounded border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[60px]"
                  />
                )}
                {q.type === 'coding' && (
                  <div className="space-y-3 pt-1 border-t border-border/50">
                    <div className="flex flex-wrap gap-3">
                      <div className="space-y-1 flex-1 min-w-[120px]">
                        <Label className="text-[10px] text-muted-foreground">Entry Function</Label>
                        <Input value={q.entryPoint} onChange={e => updateQ(qi, 'entryPoint', e.target.value)} placeholder="sumEven" className="h-8 text-xs font-mono" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Language</Label>
                        <select
                          value={q.language}
                          onChange={e => updateQ(qi, 'language', e.target.value)}
                          className="text-xs px-2 py-1.5 rounded border border-input bg-background text-foreground h-8"
                        >
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Starter Code</Label>
                      <textarea
                        value={q.starterCode}
                        onChange={e => updateQ(qi, 'starterCode', e.target.value)}
                        spellCheck={false}
                        className="w-full p-3 text-[12px] font-mono rounded border border-input bg-background text-foreground resize-y min-h-[100px] whitespace-pre"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground">Sample Test Cases</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setQuestions(prev => prev.map((item, idx) => idx === qi
                            ? { ...item, testCases: [...item.testCases, { args: '[]', expectedOutput: '', display: '', hidden: false }] }
                            : item))}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Add
                        </Button>
                      </div>
                      {q.testCases.map((tc, ti) => (
                        <div key={ti} className="grid grid-cols-2 gap-2 p-2 bg-muted/30 rounded border border-border/50 text-xs">
                          <Input
                            value={tc.display}
                            onChange={e => setQuestions(prev => prev.map((item, idx) => idx === qi
                              ? { ...item, testCases: item.testCases.map((t, j) => j === ti ? { ...t, display: e.target.value } : t) }
                              : item))}
                            placeholder="Display label"
                            className="h-7 text-xs font-mono col-span-2"
                          />
                          <Input
                            value={tc.args}
                            onChange={e => setQuestions(prev => prev.map((item, idx) => idx === qi
                              ? { ...item, testCases: item.testCases.map((t, j) => j === ti ? { ...t, args: e.target.value } : t) }
                              : item))}
                            placeholder='Args JSON: [[1,2,3]]'
                            className="h-7 text-xs font-mono"
                          />
                          <Input
                            value={tc.expectedOutput}
                            onChange={e => setQuestions(prev => prev.map((item, idx) => idx === qi
                              ? { ...item, testCases: item.testCases.map((t, j) => j === ti ? { ...t, expectedOutput: e.target.value } : t) }
                              : item))}
                            placeholder="Expected: 12"
                            className="h-7 text-xs font-mono"
                          />
                          <label className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                            <input
                              type="checkbox"
                              checked={tc.hidden}
                              onChange={e => setQuestions(prev => prev.map((item, idx) => idx === qi
                                ? { ...item, testCases: item.testCases.map((t, j) => j === ti ? { ...t, hidden: e.target.checked } : t) }
                                : item))}
                            />
                            <Lock className="w-3 h-3" /> Hidden after submission
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <Button variant="outline" onClick={addQuestion} className="w-full">
              <PlusCircle className="w-4 h-4 mr-2" /> Add Question
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">← Back</Button>
              <Button onClick={() => setStep(3)} className="flex-1">Next: AI Monitoring →</Button>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-md p-5 space-y-5">
            <div className="flex items-center gap-2 mb-2">
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
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${monitoring[opt.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1" disabled={submitting}>← Back</Button>
              <Button type="submit" className="flex-1" disabled={submitting}>{submitting ? 'Publishing…' : 'Publish Assessment'}</Button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
};

export default CreateAssessment;
