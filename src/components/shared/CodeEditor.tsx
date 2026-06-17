import React, { useMemo, useRef, useState } from 'react';
import { Play, RotateCcw, Code2, CheckCircle2, XCircle, Loader2, Terminal, Lock, Download } from 'lucide-react';
import type { CodingLanguage, CodingTestCase } from '@/types/types';
import { isRunnable, isRuntimeReady, needsDownload, ensureRuntime, runTestCases, type RunResult } from '@/lib/codeRunner';

interface CodeEditorProps {
  languages: CodingLanguage[];
  entryPoint: string;
  value: string;
  starterCodes?: Partial<Record<CodingLanguage, string>>;
  testCases?: CodingTestCase[];
  onChange: (code: string) => void;
}

const LANG_LABEL: Record<CodingLanguage, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  r: 'R',
  cpp: 'C++',
  csharp: 'C#',
  go: 'Go',
  sql: 'SQL',
};

// Indentation unit per language. Python is whitespace-sensitive and its starter
// code uses 4 spaces, so the editor must match to avoid IndentationError.
const indentUnit = (lang: CodingLanguage): string => (lang === 'python' ? '    ' : '  ');

const callLabel = (tc: CodingTestCase, entry: string): string =>
  tc.display ?? `${entry}(${tc.args.map(a => JSON.stringify(a)).join(', ')})`;

/**
 * In-browser code space for coding questions.
 * JavaScript runs natively; Python runs on Pyodide and R on WebR (both WASM,
 * loaded on first use). Languages without a browser runtime are captured for
 * grading after submission.
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({ languages, entryPoint, value, starterCodes, testCases, onChange }) => {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
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
  const lines = useMemo(() => code.split('\n').length, [code]);
  const runnable = isRunnable(lang);

  const setCode = (next: string) => {
    setCodeByLang(m => ({ ...m, [lang]: next }));
    onChange(next);
  };

  const switchLang = (l: CodingLanguage) => {
    setLang(l);
    setResults({});
    setConsoleOut('');
    onChange(codeByLang[l] ?? starterCodes?.[l] ?? '');
  };

  const syncScroll = () => {
    if (gutterRef.current && taRef.current) {
      gutterRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const unit = indentUnit(lang);

    if (e.key === 'Tab') {
      e.preventDefault();
      const next = code.slice(0, start) + unit + code.slice(end);
      setCode(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + unit.length;
      });
      return;
    }

    if (e.key === 'Enter') {
      // Auto-indent: inherit the current line's leading whitespace, and add one
      // extra level after a block opener (':' for Python, '{' otherwise).
      const lineStart = code.lastIndexOf('\n', start - 1) + 1;
      const currentLine = code.slice(lineStart, start);
      const leading = currentLine.match(/^[ \t]*/)?.[0] ?? '';
      const opensBlock = lang === 'python'
        ? /:\s*$/.test(currentLine)
        : /[{([]\s*$/.test(currentLine);
      const insert = '\n' + leading + (opensBlock ? unit : '');
      e.preventDefault();
      const next = code.slice(0, start) + insert + code.slice(end);
      setCode(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + insert.length;
      });
    }
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
    <div className="rounded-md border border-border overflow-hidden bg-card">
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

      {/* Editor: line-number gutter + textarea */}
      <div className="flex font-mono text-[13px] leading-6 max-h-[420px]">
        <div
          ref={gutterRef}
          aria-hidden
          className="select-none text-right text-muted-foreground/60 bg-muted/30 py-3 px-2 overflow-hidden border-r border-border"
        >
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={taRef}
          value={code}
          spellCheck={false}
          onChange={e => setCode(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          placeholder="Write your solution here…"
          className="flex-1 resize-y py-3 px-3 bg-background text-foreground outline-none min-h-[220px] max-h-[420px] whitespace-pre overflow-auto"
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
