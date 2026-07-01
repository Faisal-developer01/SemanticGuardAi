/**
 * SemanticGuard AI — Secure Browser Lockdown
 *
 * Implements the maximum web-achievable browser lockdown for the candidate
 * assessment screen. Activates only when enabled=true (phase === 'assessment').
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Layer 1 — Web App (this hook)          Always available               │
 * │    • Keyboard shortcut blocking                                         │
 * │    • Context menu / right-click prevention                              │
 * │    • Clipboard copy / cut / paste blocking                              │
 * │    • DevTools detection (resize heuristic)                              │
 * │    • Single-tab enforcement (BroadcastChannel)                          │
 * │    • Cursor-leave / window-blur detection                               │
 * │    • Screenshot key (PrintScreen) interception                          │
 * │    • Fullscreen auto-reentry (3 retries before alert)                   │
 * │    • Window title overwrite to hide exam content in taskbar             │
 * │                                                                         │
 * │  Layer 2 — Chrome Extension (optional, graceful degradation)           │
 * │    • Closes non-exam tabs                                               │
 * │    • Blocks navigation away from exam URL                               │
 * │    • Sends heartbeat → page shows "🔒 Enhanced lockdown active"         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { sessionsApi } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LockdownViolationType =
  | 'devtools_open'
  | 'keyboard_shortcut'
  | 'clipboard_attempt'
  | 'multiple_tabs'
  | 'browser_unfocused';

export interface LockdownOptions {
  /** Activate lockdown (should be: phase === 'assessment' && monitoringEnabled) */
  enabled: boolean;
  /** Backend session ID used for ingestEvent calls */
  sessionId: string | null;
  /** Callback so the parent component can update its own risk/alert state */
  onViolation?: (
    type: LockdownViolationType,
    severity: 'low' | 'medium' | 'high' | 'critical',
  ) => void;
}

export interface LockdownStatus {
  /** True once the SemanticGuard Chrome Extension sends its heartbeat */
  extensionActive: boolean;
  /** True while the DevTools panel is detected as open */
  devtoolsOpen: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BC_CHANNEL = 'sg_exam_lockdown_v1';
const DEVTOOLS_W_THRESHOLD = 160; // px side-docked devtools
const DEVTOOLS_H_THRESHOLD = 160; // px bottom-docked devtools
const DEVTOOLS_POLL_MS = 2000;
const FS_RETRY_MS = 3000;
const FS_MAX_RETRIES = 3;
const CURSOR_COOLDOWN_MS = 5000;
const EXAM_TITLE = '⛔ Exam in Progress — SemanticGuard AI';

// ─── useBrowserLockdown ───────────────────────────────────────────────────────

export function useBrowserLockdown(opts: LockdownOptions): LockdownStatus {
  const { enabled, sessionId, onViolation } = opts;

  const [extensionActive, setExtensionActive] = useState(false);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);

  const fsRetryCount = useRef(0);
  const fsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dtTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dtAlerted = useRef(false);
  const cursorCooldown = useRef(false);

  // ── Violation reporter ────────────────────────────────────────────────────

  const report = useCallback(
    (
      type: LockdownViolationType,
      severity: 'low' | 'medium' | 'high' | 'critical',
      payload?: Record<string, unknown>,
    ) => {
      onViolation?.(type, severity);
      if (!sessionId) return;
      sessionsApi
        .ingestEvent(sessionId, {
          type,
          severity,
          occurredAt: new Date().toISOString(),
          payload,
        })
        .catch(() => {/* fire-and-forget */});
    },
    [sessionId, onViolation],
  );

  // ── Chrome Extension heartbeat ─────────────────────────────────────────────
  // The extension posts window messages; we listen and update state so the UI
  // can show "🔒 Enhanced lockdown active" without requiring the extension.

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.source !== 'SG_EXTENSION') return;

      switch (event.data.type) {
        case 'HEARTBEAT':
          setExtensionActive(true);
          break;
        case 'TAB_BLOCKED':
          report('multiple_tabs', 'high', { blockedUrl: event.data.url });
          toast.warning('🔒 A duplicate exam tab was detected and blocked by the SemanticGuard extension.');
          break;
        case 'NAVIGATION_BLOCKED':
          report('keyboard_shortcut', 'high', { context: 'navigation_blocked', url: event.data.url });
          break;
      }
    };

    window.addEventListener('message', handler);
    // Ping the extension so it starts sending heartbeats
    window.postMessage({ source: 'SG_PAGE', type: 'READY' }, '*');

    return () => window.removeEventListener('message', handler);
  }, [enabled, report]);

  // ── Keyboard shortcut blocking ─────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    const isBlocked = (e: KeyboardEvent): boolean => {
      const { key, code, ctrlKey, shiftKey, altKey, metaKey } = e;

      // DevTools
      if (key === 'F12') return true;
      if (ctrlKey && shiftKey && /^[ijcIJC]$/.test(key)) return true; // Ctrl+Shift+I/J/C
      if (ctrlKey && /^[uU]$/.test(key)) return true;                 // View source

      // Print / Save / Find / Select-all
      if (ctrlKey && /^[pPsS]$/.test(key)) return true;
      if (ctrlKey && /^[fFaA]$/.test(key)) return true;

      // Screenshot (PrintScreen / F13 / Ctrl+PrintScreen)
      if (key === 'PrintScreen' || code === 'PrintScreen' || key === 'F13') return true;

      // Browser tab / window management
      if (ctrlKey && /^[tTnNwW]$/.test(key)) return true;

      // Alt+F4
      if (altKey && key === 'F4') return true;

      // Win/Meta key combos
      if (metaKey) return true;

      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isBlocked(e)) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const combo = [
        e.ctrlKey  && 'Ctrl',
        e.shiftKey && 'Shift',
        e.altKey   && 'Alt',
        e.metaKey  && 'Meta',
        e.key,
      ].filter(Boolean).join('+');

      toast.error(`🔒 Shortcut blocked: ${combo}`, { duration: 2500 });
      report('keyboard_shortcut', 'medium', { key: e.key, code: e.code, combo });
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [enabled, report]);

  // ── Context menu (right-click) ─────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    const block = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('contextmenu', block, { capture: true });
    return () => document.removeEventListener('contextmenu', block, { capture: true });
  }, [enabled]);

  // ── Clipboard blocking ─────────────────────────────────────────────────────
  // Paste is allowed inside textareas / inputs (code editor needs it).

  useEffect(() => {
    if (!enabled) return;

    const blockCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      toast.warning('📋 Copy is disabled during the exam.', { duration: 2000 });
      report('clipboard_attempt', 'low', { action: 'copy' });
    };

    const blockCut = (e: ClipboardEvent) => {
      e.preventDefault();
      toast.warning('✂️ Cut is disabled during the exam.', { duration: 2000 });
      report('clipboard_attempt', 'low', { action: 'cut' });
    };

    const blockPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      // Allow paste inside the code editor / form inputs
      if (tag === 'textarea' || tag === 'input' || target?.isContentEditable) return;
      e.preventDefault();
      toast.warning('📋 Paste is restricted to the code editor only.', { duration: 2000 });
      report('clipboard_attempt', 'medium', { action: 'paste' });
    };

    document.addEventListener('copy',  blockCopy,  { capture: true });
    document.addEventListener('cut',   blockCut,   { capture: true });
    document.addEventListener('paste', blockPaste, { capture: true });

    return () => {
      document.removeEventListener('copy',  blockCopy,  { capture: true });
      document.removeEventListener('cut',   blockCut,   { capture: true });
      document.removeEventListener('paste', blockPaste, { capture: true });
    };
  }, [enabled, report]);

  // ── DevTools detection (resize heuristic) ──────────────────────────────────
  // When DevTools are docked to the side or bottom the window inner dimensions
  // shrink while outer dimensions stay the same — gap > threshold → flagged.

  useEffect(() => {
    if (!enabled) return;

    const check = () => {
      const wDiff = window.outerWidth  - window.innerWidth;
      const hDiff = window.outerHeight - window.innerHeight;
      const open  = wDiff > DEVTOOLS_W_THRESHOLD || hDiff > DEVTOOLS_H_THRESHOLD;

      if (open && !dtAlerted.current) {
        dtAlerted.current = true;
        setDevtoolsOpen(true);
        toast.error('🔒 Developer Tools detected — this violates exam integrity policy.', { duration: 6000 });
        report('devtools_open', 'high', { widthDiff: wDiff, heightDiff: hDiff });
      } else if (!open && dtAlerted.current) {
        dtAlerted.current = false;
        setDevtoolsOpen(false);
      }
    };

    dtTimer.current = setInterval(check, DEVTOOLS_POLL_MS);
    window.addEventListener('resize', check);

    return () => {
      if (dtTimer.current) clearInterval(dtTimer.current);
      window.removeEventListener('resize', check);
    };
  }, [enabled, report]);

  // ── Single-tab enforcement (BroadcastChannel) ──────────────────────────────
  // When a second tab opens the same session URL the two tabs negotiate via
  // BroadcastChannel and the newer one closes itself.

  useEffect(() => {
    if (!enabled || !sessionId) return;
    if (!('BroadcastChannel' in window)) return; // Safari < 15.4 fallback

    const bc = new BroadcastChannel(BC_CHANNEL);

    // Announce we are the active exam tab for this session
    bc.postMessage({ type: 'EXAM_ACTIVE', sessionId, ts: Date.now() });

    bc.onmessage = (e: MessageEvent) => {
      const { type, sessionId: sid } = e.data ?? {};
      if (sid !== sessionId) return;

      if (type === 'EXAM_ACTIVE') {
        // Another tab announced itself — tell it we are already running
        bc.postMessage({ type: 'ALREADY_RUNNING', sessionId, ts: Date.now() });
      }

      if (type === 'ALREADY_RUNNING') {
        // We are the duplicate — warn and schedule self-close
        toast.error(
          '🔒 This exam is already open in another tab. This tab will close in 4 seconds.',
          { duration: 4000 },
        );
        report('multiple_tabs', 'high', { action: 'duplicate_self_closed' });
        setTimeout(() => window.close(), 4000);
      }
    };

    return () => bc.close();
  }, [enabled, sessionId, report]);

  // ── Cursor-leave / document mouseleave ─────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    const onLeave = (e: MouseEvent) => {
      // Only fire if the cursor actually left the viewport
      if (e.clientY > 0 && e.clientX > 0 && e.clientX < window.innerWidth && e.clientY < window.innerHeight) return;
      if (cursorCooldown.current) return;
      cursorCooldown.current = true;
      toast.warning('👁 Mouse left the exam window — please keep focus.', { duration: 3000 });
      report('browser_unfocused', 'low', { context: 'cursor_left_viewport' });
      setTimeout(() => { cursorCooldown.current = false; }, CURSOR_COOLDOWN_MS);
    };

    document.addEventListener('mouseleave', onLeave);
    return () => document.removeEventListener('mouseleave', onLeave);
  }, [enabled, report]);

  // ── Window title ───────────────────────────────────────────────────────────
  // Overwrite the tab title so the question text is not visible in the taskbar
  // or OS window switcher (Alt+Tab preview).

  useEffect(() => {
    if (!enabled) return;
    const orig = document.title;
    document.title = EXAM_TITLE;
    return () => { document.title = orig; };
  }, [enabled]);

  // ── Fullscreen auto-reentry ─────────────────────────────────────────────────
  // When the candidate exits fullscreen the hook tries to reclaim it up to
  // FS_MAX_RETRIES times before firing a high-severity alert.

  useEffect(() => {
    if (!enabled) return;

    const onFsChange = () => {
      if (document.fullscreenElement) {
        // Successfully in fullscreen — cancel any pending retry
        if (fsTimer.current) clearInterval(fsTimer.current);
        fsRetryCount.current = 0;
        return;
      }

      // Not in fullscreen — start retry loop
      fsRetryCount.current = 0;
      if (fsTimer.current) clearInterval(fsTimer.current);

      fsTimer.current = setInterval(() => {
        if (document.fullscreenElement) {
          clearInterval(fsTimer.current!);
          return;
        }
        if (fsRetryCount.current >= FS_MAX_RETRIES) {
          clearInterval(fsTimer.current!);
          report('keyboard_shortcut', 'high', { context: 'fullscreen_refused_3x' });
          return;
        }
        fsRetryCount.current++;
        toast.warning(`⚠ Please return to fullscreen (attempt ${fsRetryCount.current}/${FS_MAX_RETRIES})`, { duration: 2500 });
        document.documentElement.requestFullscreen().catch(() => {});
      }, FS_RETRY_MS);
    };

    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      if (fsTimer.current) clearInterval(fsTimer.current);
    };
  }, [enabled, report]);

  // ── Visibility change / page hide ─────────────────────────────────────────
  // Supplement the tab-switch handler already in AssessmentScreen: report
  // browser_unfocused when the page becomes hidden without triggering termination
  // (termination is the parent's responsibility based on monitoringEnabled).

  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (document.hidden) {
        report('browser_unfocused', 'medium', { context: 'page_hidden' });
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [enabled, report]);

  return { extensionActive, devtoolsOpen };
}
