import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layouts/AppLayout';
import { assessmentsApi, questionsApi } from '@/lib/api';
import { mapAssessment, mapQuestion } from '@/lib/mappers';
import { useAsync } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PlusCircle, Edit2, Trash2, X, Check, Search, Loader2, Plus, Lock } from 'lucide-react';
import type { CodingLanguage, Question } from '@/types/types';

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True / False',
  short_answer: 'Short Answer',
  coding: 'Coding',
};

interface TestCaseForm {
  args: string;
  expectedOutput: string;
  display: string;
  hidden: boolean;
}

interface NewQuestionForm {
  text: string;
  type: string;
  marks: number;
  options: string[];
  correctAnswer: string;
  entryPoint: string;
  language: CodingLanguage;
  starterCode: string;
  testCases: TestCaseForm[];
}

const EMPTY_TEST_CASE: TestCaseForm = { args: '[]', expectedOutput: '', display: '', hidden: false };

const DEFAULT_NEW_Q: NewQuestionForm = {
  text: '',
  type: 'multiple_choice',
  marks: 2,
  options: ['', '', '', ''],
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

const ManageQuestions: React.FC = () => {
  const [assessmentId, setAssessmentId] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newQ, setNewQ] = useState<NewQuestionForm>(DEFAULT_NEW_Q);

  const { data: assessmentsData } = useAsync(() => assessmentsApi.list({ perPage: 100 }), []);
  const myAssessments = (assessmentsData?.items ?? []).map(a => mapAssessment(a));

  useEffect(() => {
    if (!assessmentId && myAssessments.length) setAssessmentId(myAssessments[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentsData]);

  const { data: questionsData, loading: qLoading, reload: reloadQuestions } = useAsync(
    () => (assessmentId ? assessmentsApi.questions(assessmentId) : Promise.resolve([])),
    [assessmentId],
  );
  const allQuestions: Question[] = (questionsData ?? []).map(mapQuestion);
  const questions = allQuestions.filter(q => q.text.toLowerCase().includes(search.toLowerCase()));
  const totalMarks = allQuestions.reduce((a, q) => a + q.marks, 0);

  const handleTypeChange = (type: string) => {
    setNewQ(n => ({
      ...n,
      type,
      options: type === 'multiple_choice' ? ['', '', '', ''] : n.options,
      correctAnswer: type === 'true_false' ? 'True' : '',
      ...(type === 'coding' && !n.entryPoint ? DEFAULT_NEW_Q : {}),
    }));
  };

  const buildPayload = () => {
    const base = { text: newQ.text.trim(), type: newQ.type, marks: newQ.marks };
    if (newQ.type === 'multiple_choice') {
      return {
        ...base,
        options: newQ.options.filter(Boolean),
        correctAnswer: newQ.correctAnswer || undefined,
      };
    }
    if (newQ.type === 'true_false') {
      return { ...base, options: ['True', 'False'], correctAnswer: newQ.correctAnswer || 'True' };
    }
    if (newQ.type === 'short_answer') {
      return { ...base, correctAnswer: newQ.correctAnswer || undefined };
    }
    if (newQ.type === 'coding') {
      return {
        ...base,
        entryPoint: newQ.entryPoint.trim() || 'solution',
        languages: [newQ.language],
        starterCodes: { [newQ.language]: newQ.starterCode },
        testCases: newQ.testCases
          .filter(tc => tc.expectedOutput.trim())
          .map((tc, i) => {
            let args: unknown[] = [];
            try { args = JSON.parse(tc.args || '[]'); } catch { /* keep empty */ }
            return {
              order: i + 1,
              args,
              expectedOutput: tc.expectedOutput.trim(),
              display: tc.display.trim() || undefined,
              hidden: tc.hidden,
            };
          }),
      };
    }
    return base;
  };

  const saveNewQuestion = async () => {
    if (!assessmentId || !newQ.text.trim()) return;
    if (newQ.type === 'coding' && !newQ.entryPoint.trim()) {
      toast.error('Entry function name is required for coding questions');
      return;
    }
    setSaving(true);
    try {
      await assessmentsApi.addQuestion(assessmentId, buildPayload());
      toast.success('Question added');
      setShowAdd(false);
      setNewQ(DEFAULT_NEW_Q);
      reloadQuestions();
    } catch {
      toast.error('Could not add question');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (q: Question) => {
    try {
      await questionsApi.update(q.id, { text: editText });
      toast.success('Question updated');
      setEditing(null);
      reloadQuestions();
    } catch {
      toast.error('Could not update question');
    }
  };

  const deleteQuestion = async (q: Question) => {
    try {
      await questionsApi.remove(q.id);
      toast.success('Question deleted');
      reloadQuestions();
    } catch {
      toast.error('Could not delete question');
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-balance">Manage Questions</h1>
          <Button size="sm" onClick={() => setShowAdd(s => !s)}>
            <PlusCircle className="w-4 h-4 mr-2" /> Add Question
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="space-y-1 flex-1">
            <Label className="text-xs text-muted-foreground">Select Assessment</Label>
            <select
              value={assessmentId}
              onChange={e => setAssessmentId(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {myAssessments.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div className="space-y-1 flex-1">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions…" className="pl-9" />
            </div>
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          {[
            { label: 'Total Questions', value: allQuestions.length },
            { label: 'Total Marks', value: totalMarks },
            { label: 'Multiple Choice', value: allQuestions.filter(q => q.type === 'multiple_choice').length },
            { label: 'Short Answer', value: allQuestions.filter(q => q.type === 'short_answer').length },
            { label: 'Coding', value: allQuestions.filter(q => q.type === 'coding').length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded px-4 py-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {showAdd && (
          <div className="bg-card border border-primary/30 rounded-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">New Question</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <textarea
              value={newQ.text}
              onChange={e => setNewQ(n => ({ ...n, text: e.target.value }))}
              placeholder="Enter question text…"
              className="w-full p-3 text-sm rounded border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[80px]"
            />

            <div className="flex gap-3 flex-wrap items-end">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <select
                  value={newQ.type}
                  onChange={e => handleTypeChange(e.target.value)}
                  className="text-sm px-3 py-2 rounded border border-input bg-background text-foreground h-10"
                >
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True / False</option>
                  <option value="short_answer">Short Answer</option>
                  <option value="coding">Coding</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" value={newQ.marks} onChange={e => setNewQ(n => ({ ...n, marks: Number(e.target.value) }))} min={1} max={20} className="w-20 h-10" />
                <span className="text-sm text-muted-foreground">marks</span>
              </div>
              <Button size="sm" onClick={saveNewQuestion} disabled={!newQ.text.trim() || saving} className="h-10">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} Save Question
              </Button>
            </div>

            {newQ.type === 'multiple_choice' && (
              <div className="space-y-2 pt-2 border-t border-border/60">
                <Label className="text-xs text-muted-foreground">Answer Options</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {newQ.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">{String.fromCharCode(65 + i)}.</span>
                      <Input
                        value={opt}
                        onChange={e => setNewQ(n => ({ ...n, options: n.options.map((o, j) => j === i ? e.target.value : o) }))}
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        className="h-9 text-sm"
                      />
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Correct Answer</Label>
                  <select
                    value={newQ.correctAnswer}
                    onChange={e => setNewQ(n => ({ ...n, correctAnswer: e.target.value }))}
                    className="text-sm px-3 py-2 rounded border border-input bg-background text-foreground w-full sm:w-auto"
                  >
                    <option value="">Select correct option…</option>
                    {newQ.options.filter(Boolean).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {newQ.type === 'true_false' && (
              <div className="space-y-1 pt-2 border-t border-border/60">
                <Label className="text-xs text-muted-foreground">Correct Answer</Label>
                <select
                  value={newQ.correctAnswer}
                  onChange={e => setNewQ(n => ({ ...n, correctAnswer: e.target.value }))}
                  className="text-sm px-3 py-2 rounded border border-input bg-background text-foreground"
                >
                  <option value="True">True</option>
                  <option value="False">False</option>
                </select>
              </div>
            )}

            {newQ.type === 'short_answer' && (
              <div className="space-y-1 pt-2 border-t border-border/60">
                <Label className="text-xs text-muted-foreground">Model Answer (optional — for manual grading reference)</Label>
                <textarea
                  value={newQ.correctAnswer}
                  onChange={e => setNewQ(n => ({ ...n, correctAnswer: e.target.value }))}
                  placeholder="Expected answer or grading rubric…"
                  className="w-full p-3 text-sm rounded border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[72px]"
                />
              </div>
            )}

            {newQ.type === 'coding' && (
              <div className="space-y-4 pt-2 border-t border-border/60">
                <div className="flex flex-wrap gap-3">
                  <div className="space-y-1 flex-1 min-w-[140px]">
                    <Label className="text-xs text-muted-foreground">Entry Function</Label>
                    <Input
                      value={newQ.entryPoint}
                      onChange={e => setNewQ(n => ({ ...n, entryPoint: e.target.value }))}
                      placeholder="e.g. sumEven"
                      className="h-9 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Language</Label>
                    <select
                      value={newQ.language}
                      onChange={e => setNewQ(n => ({ ...n, language: e.target.value as CodingLanguage }))}
                      className="text-sm px-3 py-2 rounded border border-input bg-background text-foreground h-9"
                    >
                      <option value="javascript">JavaScript</option>
                      <option value="typescript">TypeScript</option>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                      <option value="cpp">C++</option>
                      <option value="csharp">C#</option>
                      <option value="go">Go</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Starter Code</Label>
                  <textarea
                    value={newQ.starterCode}
                    onChange={e => setNewQ(n => ({ ...n, starterCode: e.target.value }))}
                    spellCheck={false}
                    className="w-full p-3 text-[13px] font-mono rounded border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[120px] whitespace-pre"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Sample Test Cases</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setNewQ(n => ({ ...n, testCases: [...n.testCases, { ...EMPTY_TEST_CASE }] }))}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Test Case
                    </Button>
                  </div>
                  {newQ.testCases.map((tc, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-muted/30 rounded border border-border/60">
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Display Label</Label>
                        <Input
                          value={tc.display}
                          onChange={e => setNewQ(n => ({ ...n, testCases: n.testCases.map((t, j) => j === i ? { ...t, display: e.target.value } : t) }))}
                          placeholder="sumEven([1,2,3]) -> 6"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Args (JSON array)</Label>
                        <Input
                          value={tc.args}
                          onChange={e => setNewQ(n => ({ ...n, testCases: n.testCases.map((t, j) => j === i ? { ...t, args: e.target.value } : t) }))}
                          placeholder="[[1,2,3,4]]"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Expected Output</Label>
                        <Input
                          value={tc.expectedOutput}
                          onChange={e => setNewQ(n => ({ ...n, testCases: n.testCases.map((t, j) => j === i ? { ...t, expectedOutput: e.target.value } : t) }))}
                          placeholder="12"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={tc.hidden}
                          onChange={e => setNewQ(n => ({ ...n, testCases: n.testCases.map((t, j) => j === i ? { ...t, hidden: e.target.checked } : t) }))}
                          className="rounded"
                        />
                        <Lock className="w-3 h-3" /> Hidden test case (graded after submission)
                      </label>
                      {newQ.testCases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewQ(n => ({ ...n, testCases: n.testCases.filter((_, j) => j !== i) }))}
                          className="text-xs text-destructive hover:underline sm:col-span-2 text-left"
                        >
                          Remove test case
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {qLoading ? (
            <div className="bg-card border border-border rounded-md p-8 text-center">
              <Loader2 className="w-7 h-7 text-primary mx-auto animate-spin" />
            </div>
          ) : questions.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center">
              <p className="text-muted-foreground text-sm">No questions found.</p>
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} className="bg-card border border-border rounded-md p-4">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    {editing === q.id ? (
                      <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        className="w-full p-2 text-sm rounded border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[60px]"
                        autoFocus
                      />
                    ) : (
                      <p className="text-sm text-foreground leading-relaxed text-pretty">{q.text}</p>
                    )}
                    {q.options && (
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {q.options.map((opt, oi) => (
                          <span key={oi} className="text-xs text-muted-foreground flex items-center gap-1">
                            <span className="font-medium">{String.fromCharCode(65 + oi)}.</span> {opt}
                          </span>
                        ))}
                      </div>
                    )}
                    {q.type === 'short_answer' && (
                      <p className="mt-2 text-xs text-muted-foreground italic">Open-ended — candidate writes a short text response.</p>
                    )}
                    {q.type === 'coding' && (
                      <>
                        {q.entryPoint && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Function: <code className="font-mono text-primary">{q.entryPoint}()</code>
                          </p>
                        )}
                        {q.languages && q.languages.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {q.languages.map(l => (
                              <span key={l} className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">{l}</span>
                            ))}
                          </div>
                        )}
                        {(q.starterCode || q.starterCodes) && (
                          <pre className="mt-2 p-2.5 text-[12px] font-mono bg-muted/40 border border-border rounded overflow-auto max-h-40 whitespace-pre text-foreground">
                            {q.starterCode ?? (q.starterCodes && q.languages ? q.starterCodes[q.languages[0]] : Object.values(q.starterCodes ?? {})[0]) ?? ''}
                          </pre>
                        )}
                        {q.testCases && q.testCases.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Test Cases</p>
                            {q.testCases.map(tc => (
                              <div key={tc.id} className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                                {tc.hidden && <Lock className="w-3 h-3 shrink-0" />}
                                {tc.display ?? `${q.entryPoint}(…) -> ${tc.expectedOutput}`}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{TYPE_LABELS[q.type]}</span>
                      <span className="text-xs text-muted-foreground">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {editing === q.id ? (
                      <>
                        <button onClick={() => saveEdit(q)} className="p-1.5 rounded hover:bg-green-500/10 text-green-500 transition-colors"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditing(null)} className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"><X className="w-4 h-4" /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditing(q.id); setEditText(q.text); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deleteQuestion(q)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default ManageQuestions;
