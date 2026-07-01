// In-browser code execution for coding questions.
// Coding assessments support JavaScript and Java only.
// JavaScript runs natively in the candidate's browser for instant feedback.
// Java has no browser runtime, so it is captured and compiled/graded server-side.

import type { CodingLanguage, CodingTestCase } from '@/types/types';

// Languages that can actually execute in the browser. Others (Java) are captured
// for server-side compilation and grading after submission.
const RUNNABLE: CodingLanguage[] = ['javascript'];
export const isRunnable = (lang: CodingLanguage): boolean => RUNNABLE.includes(lang);

/** Whether a language's runtime is already loaded and cached. */
export const isRuntimeReady = (lang: CodingLanguage): boolean => lang === 'javascript';

/** Whether a language needs a one-time engine download before it can run. */
export const needsDownload = (_lang: CodingLanguage): boolean => false;

/** Ensure the runtime for a language is loaded; resolves once it is ready. */
export async function ensureRuntime(_lang: CodingLanguage): Promise<void> {
  // JavaScript runs natively; nothing to load.
}

export interface RunResult {
  id: string;
  passed: boolean;
  actual: string;
  error?: string;
}

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// Pyodide/WebR errors arrive as a full multi-line traceback. Surface only the
// final, meaningful line (e.g. "IndentationError: …") to keep output readable.
const conciseError = (raw: string): string => {
  const lines = raw.split('\n').map(l => l.trimEnd()).filter(l => l.trim().length);
  const last = lines[lines.length - 1] ?? raw;
  return last.length > 300 ? `${last.slice(0, 300)}…` : last;
};

// Reduce two outputs to a canonical comparable string so 1 === 1, [0,1] === [0, 1].
const normalize = (v: string): string => {
  const t = v.trim();
  try {
    return JSON.stringify(JSON.parse(t));
  } catch {
    return t.replace(/\s+/g, ' ');
  }
};

// ─── JavaScript ──────────────────────────────────────────────────────────────

function runJavaScript(code: string, entry: string, args: unknown[]): string {
  // Defines the candidate's functions then returns the entry function reference.
  // Executes only in the candidate's own browser within an isolated function scope.
  // eslint-disable-next-line no-new-func
  const factory = new Function(`"use strict";\n${code}\n;return typeof ${entry} === 'function' ? ${entry} : undefined;`);
  const fn = factory();
  if (typeof fn !== 'function') throw new Error(`'${entry}' is not defined`);
  const out = (fn as (...a: unknown[]) => unknown)(...args);
  return out === undefined ? 'undefined' : JSON.stringify(out);
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

function runSingle(language: CodingLanguage, code: string, entry: string, args: unknown[]): string {
  switch (language) {
    case 'javascript': return runJavaScript(code, entry, args);
    default:           throw new Error(`${language} cannot run in the browser`);
  }
}

/** Run all test cases for a coding answer and return per-case pass/fail results. */
export async function runTestCases(
  language: CodingLanguage,
  code: string,
  entry: string,
  cases: CodingTestCase[],
): Promise<RunResult[]> {
  await ensureRuntime(language);
  const results: RunResult[] = [];
  for (const tc of cases) {
    try {
      const actual = runSingle(language, code, entry, tc.args);
      results.push({ id: tc.id, actual, passed: normalize(actual) === normalize(tc.expectedOutput) });
    } catch (err) {
      results.push({ id: tc.id, actual: '', error: conciseError(errMsg(err)), passed: false });
    }
  }
  return results;
}
