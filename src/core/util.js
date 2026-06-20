// Shared primitives used by every platform subagent. Identical everywhere —
// the orchestrator depends on these being constant.

export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function shuffled(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

// Inclusive day count since an ISO timestamp.
export function activeDays(wokeUpAt) {
  if (!wokeUpAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(wokeUpAt)) / 86400000));
}

// GoLogin token. Accept either name so .env (GOLOGIN_API_KEY) and the CI
// convention (GL_API_TOKEN) both work.
export const token = process.env.GL_API_TOKEN || process.env.GOLOGIN_API_KEY;

// Per-session time budget (time spent ON the platform per account per run).
// Randomized each session between min and max. Hard cap. Override via env for
// shakedown runs (WARMUP_SESSION_MIN_SEC / WARMUP_SESSION_MAX_SEC).
export const SESSION_MIN_MS = (Number(process.env.WARMUP_SESSION_MIN_SEC) || 240) * 1000;
export const SESSION_MAX_MS = (Number(process.env.WARMUP_SESSION_MAX_SEC) || 480) * 1000;

// True once the current account's session time budget is spent. Action helpers
// check this inside their loops so a single long action can't overrun the cap.
export const overtime = plan => plan && plan._deadlineAt && Date.now() > plan._deadlineAt;

// Shared retry/backoff constants — MUST match across all subagents.
export const MAX_ATTEMPTS = 5;
export const BACKOFF_MS = [5000, 15000, 45000, 90000, 180000];
