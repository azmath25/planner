/**
 * Deterministic, browser-local stopwatch domain for the Dayframe preview.
 * Persists timestamps and millisecond precision; never trusts animation ticks for elapsed time.
 * Backend timestamps, ownership and cross-device reconciliation are deliberately out of scope.
 */
export interface ActiveTimer {
  taskId: string;
  /** First start of this session, UTC epoch milliseconds. */
  sessionStartedAt: number;
  /** Last resume/start. */
  startedAt: number;
  /** Accumulated active time from before the current running interval. */
  elapsed: number;
  running: boolean;
}

export type EndReason = 'stopped' | 'completed' | 'switched';

export interface TimeSession {
  id: string;
  taskId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  reason: EndReason;
}

function nonnegative(ms: number): number {
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
}

export function getElapsedMs(timer: ActiveTimer | null, now: number): number {
  if (!timer) return 0;
  return nonnegative(timer.elapsed) + (timer.running ? nonnegative(now - timer.startedAt) : 0);
}

export function startTimer(taskId: string, now: number): ActiveTimer {
  if (!taskId || !Number.isFinite(now)) throw new Error('Invalid timer start');
  return { taskId, sessionStartedAt: now, startedAt: now, elapsed: 0, running: true };
}

export function pauseTimer(timer: ActiveTimer, now: number): ActiveTimer {
  if (!timer.running) return timer;
  return { ...timer, elapsed: getElapsedMs(timer, now), running: false, startedAt: now };
}

export function resumeTimer(timer: ActiveTimer, now: number): ActiveTimer {
  if (timer.running) return timer;
  return { ...timer, startedAt: now, running: true };
}

export function finishSession(timer: ActiveTimer, now: number, reason: EndReason, id: string): TimeSession {
  return {
    id,
    taskId: timer.taskId,
    startedAt: timer.sessionStartedAt,
    endedAt: Math.max(now, timer.sessionStartedAt),
    durationMs: Math.floor(getElapsedMs(timer, now)),
    reason,
  };
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(nonnegative(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Converts older browser-preview timer snapshots without deleting elapsed work. */
export function restoreTimer(raw: unknown, validTaskIds: Set<string>): ActiveTimer | null {
  if (!raw || typeof raw !== 'object') return null;
  const timer = raw as Partial<ActiveTimer>;
  if (typeof timer.taskId !== 'string' || !validTaskIds.has(timer.taskId)) return null;
  if (typeof timer.startedAt !== 'number' || !Number.isFinite(timer.startedAt)) return null;
  if (typeof timer.elapsed !== 'number' || !Number.isFinite(timer.elapsed) || timer.elapsed < 0) return null;
  const began = typeof timer.sessionStartedAt === 'number' && Number.isFinite(timer.sessionStartedAt)
    ? timer.sessionStartedAt : timer.startedAt - timer.elapsed;
  if (!Number.isFinite(began) || began < 0) return null;
  return {
    taskId: timer.taskId,
    sessionStartedAt: began,
    startedAt: timer.startedAt,
    elapsed: timer.elapsed,
    running: timer.running === true,
  };
}

/** Existing demo tasks stored rounded minutes, while new work remains accurate to the millisecond. */
export function recordedMs(task: { spent?: number; spentMs?: number }): number {
  if (typeof task.spentMs === 'number' && Number.isFinite(task.spentMs)) return nonnegative(task.spentMs);
  return nonnegative((task.spent ?? 0) * 60_000);
}
