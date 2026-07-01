import React, { useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Play, RotateCcw, Code2, CheckCircle2, XCircle, Loader2, Terminal, Lock, Download, Maximize2, Minimize2, Wand2 } from 'lucide-react';
import type { CodingLanguage, CodingTestCase } from '@/types/types';
import { isRunnable, isRuntimeReady, needsDownload, ensureRuntime, runTestCases, type RunResult } from '@/lib/codeRunner';
import { useTheme } from '@/contexts/ThemeContext';

export interface KeystrokeStats {
  keystrokes: number;
  chars: number;
  backspaces: number;
  pasteCount: number;
  pastedChars: number;
  durationMs: number;
  avgIntervalMs: number;
  codeLength: number;
}

interface CodeEditorProps {
  languages: CodingLanguage[];
  entryPoint: string;
  value: string;
  starterCodes?: Partial<Record<CodingLanguage, string>>;
  testCases?: CodingTestCase[];
  onChange: (code: string) => void;
  /** Reports typing biometrics (used for AI-generated-code / paste detection). */
  onTelemetry?: (stats: KeystrokeStats) => void;
}

const LANG_LABEL: Record<CodingLanguage, string> = {
  javascript: 'JavaScript',
  java: 'Java',
};

// Map our language keys to Monaco's language identifiers.
const MONACO_LANG: Record<CodingLanguage, string> = {
  javascript: 'javascript',
  java: 'java',
};

const callLabel = (tc: CodingTestCase, entry: string): string =>
  tc.display ?? `${entry}(${tc.args.map(a => JSON.stringify(a)).join(', ')})`;

/**
 * In-browser code space for coding questions.
 * JavaScript runs natively in the browser for instant feedback. Java has no
 * browser runtime, so solutions are captured and compiled/graded server-side
 * after submission.
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({ languages, entryPoint, value, starterCodes, testCases, onChange, onTelemetry }) => {
  const { theme } = useTheme();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // ── Typing biometrics (per editor instance / question) ──
  const telemetryRef = useRef({
    keystrokes: 0,
    chars: 0,
    backspaces: 0,
    pasteCount: 0,
    pastedChars: 0,
    firstTs: 0,
    lastTs: 0,
    intervalSum: 0,
    intervalCount: 0,
  });

  const reportTelemetry = (codeLength: number) => {
    if (!onTelemetry) return;
    const t = telemetryRef.current;
    onTelemetry({
      keystrokes: t.keystrokes,
      chars: t.chars,
      backspaces: t.backspaces,
      pasteCount: t.pasteCount,
      pastedChars: t.pastedChars,
      durationMs: t.firstTs ? Math.max(0, t.lastTs - t.firstTs) : 0,
      avgIntervalMs: t.intervalCount ? Math.round(t.intervalSum / t.intervalCount) : 0,
      codeLength,
    });
  };

  const recordKey = (key: string) => {
    const t = telemetryRef.current;
    const now = Date.now();
    if (t.firstTs === 0) t.firstTs = now;
    if (t.lastTs !== 0) {
      const delta = now - t.lastTs;
      if (delta > 0 && delta < 5000) {
        t.intervalSum += delta;
        t.intervalCount += 1;
      }
    }
    t.lastTs = now;
    t.keystrokes += 1;
    if (key === 'Backspace' || key === 'Delete') t.backspaces += 1;
    else if (key.length === 1) t.chars += 1;
  };
  const [lang, setLang] = useState<CodingLanguage>(languages[0]);
  const [codeByLang, setCodeByLang] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const l of languages) seed[l] = starterCodes?.[l] ?? '';
    if (value) seed[languages[0]] = value; // restore a previously saved answer
    return seed;
  });
  const [running, setRunning] = useState(false);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [consoleOut, setConsoleOut] = useState<string>('');

  const code = codeByLang[lang] ?? '';
  const runnable = isRunnable(lang);

  const setCode = (next: string) => {
    setCodeByLang(m => ({ ...m, [lang]: next }));
    onChange(next);
    reportTelemetry(next.length);
  };

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    // Keystroke telemetry (typing rhythm) feeds AI-generated-code detection.
    editor.onKeyDown((e) => recordKey(e.browserEvent.key));
    // Paste telemetry (copy-paste / AI-paste detection).
    editor.onDidPaste((e) => {
      const model = editor.getModel();
      const pastedLen = model ? model.getValueInRange(e.range).length : 0;
      const t = telemetryRef.current;
      t.pasteCount += 1;
      t.pastedChars += pastedLen;
    });
  };

  const formatCode = () => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run();
  };

  const switchLang = (l: CodingLanguage) => {
    setLang(l);
    setResults({});
    setConsoleOut('');
    onChange(codeByLang[l] ?? starterCodes?.[l] ?? '');
  };

  const reset = () => {
    setCode(starterCodes?.[lang] ?? '');
    setResults({});
    setConsoleOut('');
  };

  const runTests = async () => {
    if (!code.trim()) return;
    setRunning(true);
    setResults({});

    if (!testCases?.length) {
      setConsoleOut('No test cases are available for this question.');
      setRunning(false);
      return;
    }

    if (!runnable) {
      setConsoleOut(
        `${LANG_LABEL[lang]} cannot run in the browser. Your solution is saved and will be compiled and graded against the full test suite after you submit.`,
      );
      setRunning(false);
      return;
    }

    // Python/R engines download on first use — let the candidate know.
    setConsoleOut(
      lang === 'javascript'
        ? 'Running test cases…'
        : `Preparing the ${LANG_LABEL[lang]} runtime… (the engine downloads once on first run, then stays cached)`,
    );

    try {
      if (needsDownload(lang)) {
        setLoadingRuntime(true);
        await ensureRuntime(lang);
        setLoadingRuntime(false);
        setConsoleOut('Running test cases…');
      }
      const out = await runTestCases(lang, code, entryPoint, testCases);
      const next: Record<string, RunResult> = {};
      const logs: string[] = [];
      for (const r of out) {
        next[r.id] = r;
        const tc = testCases.find(t => t.id === r.id);
        const label = tc ? callLabel(tc, entryPoint) : r.id;
        logs.push(r.error ? `✗ ${label}  →  Error: ${r.error}` : `${r.passed ? '✓' : '✗'} ${label}  →  ${r.actual}`);
      }
      const passedCount = out.filter(r => r.passed).length;
      logs.unshift(`Ran ${out.length} test case${out.length !== 1 ? 's' : ''} — ${passedCount} passed, ${out.length - passedCount} failed\n`);
      setResults(next);
      setConsoleOut(logs.join('\n'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setConsoleOut(`Could not run your code: ${message}`);
    } finally {
      setLoadingRuntime(false);
      setRunning(false);
    }
  };

  const visibleTests = testCases?.filter(t => !t.hidden) ?? [];
  const hiddenCount = (testCases?.length ?? 0) - visibleTests.length;

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-card'
          : 'rounded-md border border-border overflow-hidden bg-card'
      }
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
        <Code2 className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground">Code Space</span>
        {languages.length > 1 ? (
          <select
            value={lang}
            onChange={e => switchLang(e.target.value as CodingLanguage)}
            aria-label="Choose language"
            className="text-[11px] font-medium bg-background text-foreground border border-input rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {languages.map(l => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
          </select>
        ) : (
          <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
            {LANG_LABEL[lang]}
          </span>
        )}
        {loadingRuntime ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            <Download className="w-3.5 h-3.5 animate-pulse" />
            <span className="hidden sm:inline">Loading {LANG_LABEL[lang]} runtime…</span>
            <span className="sm:hidden">Loading…</span>
          </span>
        ) : runnable && !isRuntimeReady(lang) && needsDownload(lang) ? (
          <span className="text-[10px] text-muted-foreground hidden sm:inline">first run downloads engine</span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={formatCode}
            disabled={running}
            title="Format code"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Wand2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Format</span>
          </button>
          <button
            type="button"
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={running}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            type="button"
            onClick={runTests}
            disabled={running || !code.trim()}
            className="inline-flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {loadingRuntime ? 'Loading…' : running ? 'Running…' : runnable ? 'Run Tests' : 'Run'}
          </button>
        </div>
      </div>

      {/* Monaco editor (VS Code engine): syntax highlighting, IntelliSense,
          undo/redo, formatting, theming. Loads on demand. */}
      <div className={fullscreen ? 'flex-1 min-h-0' : 'h-[340px]'}>
        <Editor
          path={`solution-${lang}`}
          language={MONACO_LANG[lang]}
          value={code}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          onChange={(v) => setCode(v ?? '')}
          onMount={handleMount}
          loading={
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading editor…
            </div>
          }
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            formatOnPaste: true,
            wordWrap: 'off',
            renderLineHighlight: 'line',
            fixedOverflowWidgets: true,
            smoothScrolling: true,
            padding: { top: 10, bottom: 10 },
            scrollbar: { alwaysConsumeMouseWheel: false },
          }}
        />
      </div>

      {/* Test cases */}
      {visibleTests.length > 0 && (
        <div className="border-t border-border px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Sample Test Cases</p>
          {visibleTests.map(tc => {
            const r = results[tc.id];
            return (
              <div key={tc.id} className="flex items-start gap-2 text-xs">
                {r ? (
                  r.passed
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                    : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-border shrink-0 mt-0.5" />
                )}
                <code className="font-mono text-foreground break-all">{callLabel(tc, entryPoint)}</code>
                <span className="text-muted-foreground">→</span>
                <code className="font-mono text-primary break-all">{tc.expectedOutput}</code>
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-0.5">
              <Lock className="w-3 h-3" /> {hiddenCount} hidden test case{hiddenCount !== 1 ? 's' : ''} run after submission
            </p>
          )}
        </div>
      )}

      {/* Console output */}
      {consoleOut && (
        <div className="border-t border-border">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/40 border-b border-border">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-muted-foreground">Output</span>
          </div>
          <pre className="px-3 py-2.5 text-[12px] font-mono text-foreground whitespace-pre-wrap break-words max-h-44 overflow-auto">{consoleOut}</pre>
        </div>
      )}
    </div>
  );
};

export default CodeEditor;
