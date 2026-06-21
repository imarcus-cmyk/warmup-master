// Generic warm-plan resolver. A platform supplies an ordered `ramp` of windows;
// this picks the right window for an account's age + mode and emits the plan.
//
// ramp window shape:
//   { phase:'week-1', maxDay: 7, targets: { search: [1, 2], scrollFeed: [3, 5] }, opts:{...} }
// maxDay is the inclusive upper bound of the window (last window should be
// Infinity). `targets` are per-action counts; `opts` carries extra knobs (e.g.
// watch dwell ranges) merged into the plan.
//
// mode semantics (shared across platforms):
//   freshNew    — brand new: ramp from the day it joined the warmup plan.
//   revivedOld  — dormant revival: ramp as-is from the chosen wokeUpAt.
//   maintained  — already warm: pin to the final maintenance window.
import { activeDays, rand } from './util.js';

function normalizeRange(value) {
  if (Array.isArray(value)) {
    const [rawMin = 0, rawMax = rawMin] = value;
    const min = Number(rawMin) || 0;
    const max = Math.max(min, Number(rawMax) || 0);
    return { min, max };
  }
  if (value && typeof value === 'object') {
    const min = Number(value.min) || 0;
    const max = Math.max(min, Number(value.max) || 0);
    return { min, max };
  }
  const n = Number(value) || 0;
  return { min: n, max: n };
}

function buildActions(targets) {
  return Object.entries(targets)
    .filter(([, v]) => normalizeRange(v).max > 0)
    .map(([k]) => k);
}

function resolveTargets(targets) {
  return Object.fromEntries(Object.entries(targets).map(([key, value]) => {
    const range = normalizeRange(value);
    return [key, range.min === range.max ? range.min : rand(range.min, range.max)];
  }));
}

function resolveOptions(opts = {}) {
  return Object.fromEntries(Object.entries(opts).map(([key, value]) => {
    if (!Array.isArray(value)) return [key, value];
    if (key === 'dwell') return [key, value];
    const range = normalizeRange(value);
    return [key, range.min === range.max ? range.min : rand(range.min, range.max)];
  }));
}

export function resolvePlan(account, {
  ramp,
  freshShiftDays = 0,
  warmupEndsDay = 30,
  manualUploadDay = null,
} = {}) {
  const mode = account.mode || 'revivedOld';
  const rawDays = activeDays(account.wokeUpAt);
  const day = rawDays + 1;

  let effDays = rawDays;
  if (mode === 'freshNew') effDays = Math.max(0, rawDays - freshShiftDays);
  const effDay = effDays + 1;

  let idx;
  if (mode === 'maintained') {
    idx = ramp.length - 1;
  } else {
    idx = ramp.findIndex(w => effDay <= w.maxDay);
    if (idx === -1) idx = ramp.length - 1;
  }

  const window = ramp[idx];
  const isFinalWindow = idx === ramp.length - 1;
  const nextWindow = isFinalWindow ? null : ramp[idx + 1];
  const daysUntilNextPhase = nextWindow ? Math.max(0, window.maxDay + 1 - effDay) : null;

  const targetRanges = { ...window.targets };
  const targets = resolveTargets(targetRanges);
  const resolvedOpts = resolveOptions(window.opts);
  const warmupComplete = mode === 'maintained' || day > warmupEndsDay;
  const manualUploadReady = manualUploadDay ? (mode === 'maintained' || day >= manualUploadDay) : false;
  const lifecycle = day <= warmupEndsDay
    ? 'warmup'
    : day <= 60
      ? 'post-warmup-maintenance'
      : day <= 90
        ? 'human-maintenance'
        : 'steady-maintenance';

  return {
    day,
    days: rawDays,
    effDay,
    effDays,
    mode,
    phase: window.phase,
    lifecycle,
    niches: account.niches || [],
    actions: buildActions(targets),
    windowIndex: idx,
    totalWindows: ramp.length,
    isFinalWindow,
    graduated: warmupComplete,
    warmupComplete,
    warmupEndsDay,
    manualUploadDay,
    manualUploadReady,
    nextPhase: nextWindow ? nextWindow.phase : null,
    daysUntilNextPhase,
    rampPlan: ramp.map((w, i) => ({
      phase: w.phase,
      maxDay: w.maxDay,
      actions: buildActions(w.targets),
      current: i === idx,
    })),
    targetRanges,
    ...resolvedOpts,
    ...targets,
  };
}
