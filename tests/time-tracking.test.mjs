import test from 'node:test';
import assert from 'node:assert/strict';
import * as timer from '../web/src/domain/timeTracking.ts';

test('start, pause and resume exclude paused time', () => {
  const t = timer.startTimer('research',1000);
  assert.equal(timer.getElapsedMs(t,6200),5200);
  const paused = timer.pauseTimer(t,6200);
  assert.equal(timer.getElapsedMs(paused,100_000),5200);
  const resumed = timer.resumeTimer(paused,100_000);
  assert.equal(timer.getElapsedMs(resumed,106_200),11400);
  const result = timer.finishSession(resumed,106_200,'stopped','s1');
  assert.equal(result.durationMs,11400);
  assert.equal(result.taskId,'research');
  assert.equal(result.reason,'stopped');
  assert.equal(result.startedAt,1000);
  assert.equal(result.endedAt,106_200);
});

test('reload continues running timer from persisted wall-clock timestamps', () => {
  const snapshot = JSON.parse(JSON.stringify(timer.startTimer('research',3000)));
  const restored = timer.restoreTimer(snapshot,new Set(['research']));
  assert.equal(timer.getElapsedMs(restored,3600000),3597000);
  assert.equal(timer.formatElapsed(3597000),'00:59:57');
});

test('old demo timers migrate without dropping previous elapsed duration', () => {
  const old = { taskId:'research', startedAt:2_000_000, elapsed:37_800, running:false };
  const restored=timer.restoreTimer(old,new Set(['research']));
  assert.equal(timer.getElapsedMs(restored,9_000_000),37_800);
  assert.equal(restored.sessionStartedAt,1_962_200);
});

test('restores reject missing tasks, corrupt numbers and invalid IDs', () => {
  assert.equal(timer.restoreTimer({taskId:'bad',startedAt:10,elapsed:0,running:true},new Set(['good'])),null);
  assert.equal(timer.restoreTimer({taskId:'good',startedAt:Infinity,elapsed:0,running:true},new Set(['good'])),null);
  assert.equal(timer.restoreTimer({taskId:'good',startedAt:0,elapsed:-3,running:false},new Set(['good'])),null);
});

test('repeated short sessions retain millisecond precision', () => {
  const oldTask={spent:0};
  const first=timer.finishSession(timer.startTimer('a',100),39_100,'stopped','1');
  oldTask.spentMs=timer.recordedMs(oldTask)+first.durationMs;
  const second=timer.finishSession(timer.startTimer('a',60_000),91_000,'completed','2');
  oldTask.spentMs=timer.recordedMs(oldTask)+second.durationMs;
  assert.equal(oldTask.spentMs,70_000);
  assert.equal(timer.formatElapsed(oldTask.spentMs),'00:01:10');
  assert.equal(timer.recordedMs({spent:15}),900_000);
});

test('time display supports more than 24 hours', () => {
  assert.equal(timer.formatElapsed(27*3_600_000 + 61_000),'27:01:01');
});
