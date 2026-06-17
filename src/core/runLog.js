// Shared run-log + event helpers. No per-platform changes.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export function makeEvent(action, details = {}) {
  return { action, at: new Date().toISOString(), ...details };
}

// Persist a structured run log to logs/<platform>-<timestamp>.json
export async function writeRunLog({ platform, agent, results }) {
  const dir = path.resolve('logs');
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${platform.toLowerCase()}-${stamp}.json`);
  const payload = {
    platform,
    agent,
    generatedAt: new Date().toISOString(),
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
  return file;
}
