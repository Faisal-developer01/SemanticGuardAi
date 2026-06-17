// In-browser code execution for coding questions.
// JavaScript runs natively; Python runs on Pyodide (WASM); R runs on WebR (WASM).
// Engines are loaded lazily on first use and cached for the page lifetime.

import type { CodingLanguage, CodingTestCase } from '@/types/types';

const PYODIDE_VERSION = 'v0.26.4';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const WEBR_URL = 'https://webr.r-wasm.org/latest/webr.mjs';

// Languages that can actually execute in the browser. Others are captured for
// server-side grading after submission.
const RUNNABLE: CodingLanguage[] = ['javascript', 'python', 'r'];
export const isRunnable = (lang: CodingLanguage): boolean => RUNNABLE.includes(lang);

// Languages whose engine must download on first use (so the UI can show a hint).
const NEEDS_DOWNLOAD: CodingLanguage[] = ['python', 'r'];
const ready = new Set<CodingLanguage>(['javascript']);

/** Whether a language's runtime is already loaded and cached. */
export const isRuntimeReady = (lang: CodingLanguage): boolean => ready.has(lang);

/** Whether a language needs a one-time engine download before it can run. */
export const needsDownload = (lang: CodingLanguage): boolean =>
  NEEDS_DOWNLOAD.includes(lang) && !ready.has(lang);

/** Ensure the runtime for a language is loaded; resolves once it is ready. */
export async function ensureRuntime(lang: CodingLanguage): Promise<void> {
  if (lang === 'python') await getPyodide();
  else if (lang === 'r') await getWebR();
  ready.add(lang);
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

// ─── Pyodide (Python) ────────────────────────────────────────────────────────

let pyodidePromise: Promise<any> | null = null;

function getPyodide(): Promise<any> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = new Promise<any>((resolve, reject) => {
    const w = window as unknown as { loadPyodide?: (opts: { indexURL: string }) => Promise<any> };
    const init = () => {
      if (!w.loadPyodide) {
        reject(new Error('Pyodide failed to load'));
        return;
      }
      w.loadPyodide({ indexURL: PYODIDE_INDEX_URL }).then(resolve).catch(reject);
    };
    if (w.loadPyodide) {
      init();
      return;
    }
    const script = document.createElement('script');
    script.src = `${PYODIDE_INDEX_URL}pyodide.js`;
    script.onload = init;
    script.onerror = () => reject(new Error('Could not download the Python runtime'));
    document.head.appendChild(script);
  });
  return pyodidePromise;
}

async function runPython(code: string, entry: string, args: unknown[]): Promise<string> {
  const py = await getPyodide();
  py.globals.set('__args', py.toPy(args));
  try {
    const src = [
      'import json as __json',
      code,
      `__res = ${entry}(*__args)`,
      '__json.dumps(__res)',
    ].join('\n');
    const out = await py.runPythonAsync(src);
    return String(out);
  } finally {
    py.globals.delete('__args');
  }
}

// ─── WebR (R) ────────────────────────────────────────────────────────────────

let webRPromise: Promise<any> | null = null;

function getWebR(): Promise<any> {
  if (webRPromise) return webRPromise;
  webRPromise = (async () => {
    const url: string = WEBR_URL;
    const mod: any = await import(/* @vite-ignore */ url);
    const webR = new mod.WebR();
    await webR.init();
    return webR;
  })();
  return webRPromise;
}

// Convert a JS value to an R literal so test args pass into the candidate's function.
function toRLiteral(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.every(v => typeof v === 'number')) return `c(${value.join(', ')})`;
    if (value.every(v => typeof v === 'string')) return `c(${value.map(v => JSON.stringify(v)).join(', ')})`;
    return `list(${value.map(toRLiteral).join(', ')})`;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value === null || value === undefined) return 'NULL';
  return String(value);
}

// Reduce a WebR R object (already converted with toJs) to a comparable JSON string.
function rToJson(obj: any): string {
  const vals = obj && obj.values !== undefined ? obj.values : obj;
  if (Array.isArray(vals)) {
    if (vals.length === 1) return JSON.stringify(vals[0]);
    return JSON.stringify(vals);
  }
  return JSON.stringify(vals);
}

async function runR(code: string, entry: string, args: unknown[]): Promise<string> {
  const webR = await getWebR();
  const call = `${entry}(${args.map(toRLiteral).join(', ')})`;
  const robj = await webR.evalR(`${code}\n${call}`);
  try {
    const js = await robj.toJs();
    return rToJson(js);
  } finally {
    try { await webR.destroy(robj); } catch { /* ignore */ }
  }
}

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

async function runSingle(language: CodingLanguage, code: string, entry: string, args: unknown[]): Promise<string> {
  switch (language) {
    case 'javascript': return runJavaScript(code, entry, args);
    case 'python':     return runPython(code, entry, args);
    case 'r':          return runR(code, entry, args);
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
      const actual = await runSingle(language, code, entry, tc.args);
      results.push({ id: tc.id, actual, passed: normalize(actual) === normalize(tc.expectedOutput) });
    } catch (err) {
      results.push({ id: tc.id, actual: '', error: conciseError(errMsg(err)), passed: false });
    }
  }
  return results;
}
