// Generic warm-plan resolver. A platform supplies an ordered `ramp` of windows;
// this picks the right window for an account's age + mode and emits the plan.
//
// ramp window shape:
//   { phase:'revive-1', maxDay: 2, targets: { search: 1, scrollFeed: 3 }, opts:{...} }
// maxDay is the inclusive upper bound of the window (last window should be
// Infinity). `targets` are per-action counts; `opts` carries extra knobs (e.g.
// watch dwell ranges) merged into the plan.
//
// mode semantics (shared across platforms):
//   freshNew    — brand new: ramp slowest. Effective age = days - freshShiftDays.
//   revivedOld  — dormant revival: ramp as-is from the chosen wokeUpAt.
//   maintained  — already warm: pin to the final (steady) window.
import { activeDays } from './util.js';

function buildActions(targets) {
  return Object.entries(targets)
    .filter(([, v]) => Number(v) > 0)
    .map(([k]) => k);
}

export function resolvePlan(account, { ramp, freshShiftDays = 4 }) {
  const mode = account.mode || 'revivedOld';
  const rawDays = activeDays(account.wokeUpAt);

  let effDays = rawDays;
  if (mode === 'freshNew') effDays = Math.max(0, rawDays - freshShiftDays);

  let window;
  if (mode === 'maintained') {
    window = ramp[ramp.length - 1];
  } else {
    window = ramp.find(w => effDays <= w.maxDay) || ramp[ramp.length - 1];
  }

  const targets = { ...window.targets };
  return {
    days: rawDays,
    mode,
    phase: window.phase,
    niches: account.niches || [],
    actions: buildActions(targets),
    ...window.opts,
    ...targets,
  };
}
