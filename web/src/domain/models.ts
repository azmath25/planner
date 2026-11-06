/** Shared typed contracts for future Neon-backed React screens. No API access in M1.3. */
export type ISODate = `${number}-${number}-${number}`;
export type ClockTime = `${number}:${number}`;
export type TaskStatus = 'open' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Workspace {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  cover: string;
}

export interface Task {
  id: string;
  title: string;
  workspace: string;
  parent: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  estimate: number;
  spent: number;
  spentMs?: number;
  deadline: ISODate | null;
  deadlineTime?: ClockTime | null;
  reminder: ISODate | null;
  reminderTime?: ClockTime | null;
  long: boolean;
  notes: string;
}

export interface ScheduledInterval {
  id: string;
  taskId: string;
  day: ISODate;
  start: ClockTime;
  end: ClockTime;
}

export interface QuickNote {
  id: string;
  workspace: string;
  title: string;
  content: string;
  pinned: boolean;
  color: string;
}

import type { ActiveTimer, TimeSession } from './timeTracking';

/** One day can contain multiple timed intervals and an independent untimed pool. */
export interface DemoSnapshot {
  tasks: Task[];
  notes: QuickNote[];
  pools: Record<string, string[]>;
  scheduled: ScheduledInterval[];
  capacity: number;
  timer: ActiveTimer | null;
  sessions?: TimeSession[];
  theme?: string;
  accent?: string;
  density?: 'comfortable' | 'compact';
  coverStyle?: 'standard' | 'immersive' | 'minimal';
  media?: Record<string, string>;
  mediaPos?: Record<string, number>;
}
