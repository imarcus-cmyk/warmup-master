// Shared run-log + event helpers. No per-platform changes.
import { appendFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export function makeEvent(action, details = {}) {
  return { action, at: new Date().toISOString(), ...details };
}

async function appendAuditEntries({ platform, agent, generatedAt, results, logFile }) {
  const dir = path.resolve('logs', 'accounts');
  await mkdir(dir, { recursive: true });

  const lines = results.map(result => JSON.stringify({
    generatedAt,
    platform,
    agent,
    logFile: path.basename(logFile),
    profileId: result.profileId,
    name: result.name,
    status: result.status,
    mode: result.mode || null,
    phase: result.phase || null,
    graduated: !!result.graduated,
    skipped: !!result.skipped,
    error: result.error || null,
    blockReason: result.blockReason || null,
    metrics: result.metrics || {},
    events: result.events || [],
  }) + '\n');

  await Promise.all(results.map((result, idx) => {
    const safeId = String(result.profileId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = path.join(dir, `${safeId}.ndjson`);
    return appendFile(file, lines[idx], 'utf8');
  }));
}

export async function appendDailyProfileLog({ platform, agent, result, runStartedAt, attempt = 'primary' }) {
  const generatedAt = new Date().toISOString();
  const dir = path.resolve('logs', 'daily-profiles');
  await mkdir(dir, { recursive: true });

  const record = {
    generatedAt,
    runStartedAt,
    date: generatedAt.slice(0, 10),
    platform,
    agent,
    attempt,
    profileId: result.profileId,
    name: result.name,
    status: result.status,
    mode: result.mode || null,
    phase: result.phase || null,
    lifecycle: result.lifecycle || null,
    day: typeof result.day === 'number' ? result.day : null,
    graduated: !!result.graduated,
    warmupComplete: !!result.warmupComplete,
    manualUploadReady: !!result.manualUploadReady,
    skipped: !!result.skipped,
    requeued: !!result.requeued,
    error: result.error || null,
    blockReason: result.blockReason || null,
    metrics: result.metrics || {},
    events: result.events || [],
  };

  const dailyFile = path.join(dir, `${record.date}.ndjson`);
  await appendFile(dailyFile, JSON.stringify(record) + '\n', 'utf8');
  return dailyFile;
}

// Append an action-level journal entry before and after each profile action.
// This is intentionally separate from the final JSON summary: if a browser,
// server, or process dies mid-profile, we still have a durable trail of the
// exact action that started and whatever details completed before the failure.
export async function appendActionLog({
  platform,
  agent,
  account,
  action,
  state,
  runStartedAt,
  plan = {},
  metrics = {},
  events = [],
  error = null,
}) {
  const generatedAt = new Date().toISOString();
  const dir = path.resolve('logs', 'actions');
  await mkdir(dir, { recursive: true });

  const record = {
    generatedAt,
    runStartedAt,
    date: generatedAt.slice(0, 10),
    platform,
    agent,
    profileId: account.profileId,
    name: account.name,
    action,
    state,
    mode: plan.mode || null,
    phase: plan.phase || null,
    lifecycle: plan.lifecycle || null,
    day: typeof plan.day === 'number' ? plan.day : null,
    metrics,
    events,
    error,
  };

  const dailyFile = path.join(dir, `${record.date}.ndjson`);
  const safeId = String(account.profileId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const profileFile = path.join(dir, `${safeId}.ndjson`);
  const line = JSON.stringify(record) + '\n';
  await Promise.all([
    appendFile(dailyFile, line, 'utf8'),
    appendFile(profileFile, line, 'utf8'),
  ]);
  return dailyFile;
}

// Persist a structured run log to logs/<platform>-<timestamp>.json
export async function writeRunLog({ platform, agent, results }) {
  const dir = path.resolve('logs');
  await mkdir(dir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const file = path.join(dir, `${platform.toLowerCase()}-${stamp}.json`);
  const payload = {
    platform,
    agent,
    generatedAt,
    summary: {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      blocked: results.filter(r => r.status === 'blocked').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
    },
    results,
  };
  await writeFile(file, JSON.stringify(payload, null, 2));
  await appendAuditEntries({ platform, agent, generatedAt, results, logFile: file });
  return file;
}
