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
