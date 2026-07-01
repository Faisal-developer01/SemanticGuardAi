import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Params = Partial<
  Record<keyof URLSearchParams, string | number | null | undefined>
>;

export function createQueryString(
  params: Params,
  searchParams: URLSearchParams
) {
  const newSearchParams = new URLSearchParams(searchParams?.toString());

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      newSearchParams.delete(key);
    } else {
      newSearchParams.set(key, String(value));
    }
  }

  return newSearchParams.toString();
}

export function formatDate(
  date: Date | string | number,
  opts: Intl.DateTimeFormatOptions = {}
) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: opts.month ?? "long",
    day: opts.day ?? "numeric",
    year: opts.year ?? "numeric",
    ...opts,
  }).format(new Date(date));
}

/* ─── Assessment time-window policy ──────────────────────────────────────────
 * Candidates may only access an assessment within its scheduled window:
 *   - before `startTime`  → locked (not yet available)
 *   - within the window   → open (joinable)
 *   - after `endTime`     → closed (removed from the portal)
 */

export type AssessmentAvailability = 'locked' | 'open' | 'closed';

/**
 * Normalize a backend ISO timestamp to be parsed as UTC. Backend timestamps are
 * stored in UTC; if a value arrives without a timezone designator we append "Z"
 * so the browser does not misread it as local time.
 */
export function normalizeUtc(value: string): string {
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
  return hasTz ? value : `${value.replace(' ', 'T')}Z`;
}

function parseTime(value?: string | null): number | null {
  if (!value) return null;
  const t = new Date(normalizeUtc(value)).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * The moment an assessment closes for candidates: the explicit `endTime` when
 * set, otherwise `startTime + duration` (minutes) so scheduled single-sitting
 * assessments still expire.
 */
function effectiveEnd(
  assessment: { startTime?: string | null; endTime?: string | null; duration?: number | null }
): number | null {
  const end = parseTime(assessment.endTime);
  if (end !== null) return end;
  const start = parseTime(assessment.startTime);
  if (start !== null && assessment.duration != null) {
    return start + assessment.duration * 60_000;
  }
  return null;
}

export function assessmentAvailability(
  assessment: { status?: string; startTime?: string | null; endTime?: string | null; duration?: number | null },
  now: number = Date.now()
): AssessmentAvailability {
  if (assessment.status === 'completed' || assessment.status === 'cancelled' || assessment.status === 'draft') {
    return 'closed';
  }
  const start = parseTime(assessment.startTime);
  const end = effectiveEnd(assessment);
  if (end !== null && now >= end) return 'closed';
  if (start !== null && now < start) return 'locked';
  return 'open';
}
