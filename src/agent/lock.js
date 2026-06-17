// Per-profile lock so a Slack-triggered one-off task never opens a GoLogin
// profile that another run (scheduled warmup or a prior task) is already using.
// File-based; lock is considered stale after STALE_MS and reclaimed.
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

const LOCK_DIR = path.resolve('logs', 'locks');
const STALE_MS = 20 * 60 * 1000; // a session is capped well under this

function lockPath(profileId) {
  return path.join(LOCK_DIR, `${profileId}.lock`);
}

export async function acquireLock(profileId, owner = 'worker') {
  await mkdir(LOCK_DIR, { recursive: true });
  const file = lockPath(profileId);
  try {
    const raw = await readFile(file, 'utf8');
    const held = JSON.parse(raw);
    if (Date.now() - new Date(held.at).getTime() < STALE_MS) {
      return { ok: false, heldBy: held.owner, since: held.at };
    }
  } catch {
    // no lock or unreadable → free to take
  }
  await writeFile(file, JSON.stringify({ owner, at: new Date().toISOString() }));
  return { ok: true };
}

export async function releaseLock(profileId) {
  try { await unlink(lockPath(profileId)); } catch {}
}
