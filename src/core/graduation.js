// Graduation state. An account "graduates" when it reaches the final (steady)
// ramp window — warmup is done and it's ready for manual upload. We alert ONCE
// per account, so we persist which profileIds have already been announced.
//
// State lives in logs/graduated.json: { [profileId]: { name, platform, at } }.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve('logs', 'graduated.json');

export async function loadGraduated() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return {}; // missing/corrupt → start fresh
  }
}

export async function saveGraduated(state) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(state, null, 2));
}

// Given a platform's run results, return the accounts that graduated THIS run
// and haven't been announced before. Records them so they won't alert again.
// Only counts accounts that actually warmed ok (status 'ok') — a graduated but
// blocked/failed profile isn't really ready.
export async function recordGraduations(platform, results) {
  const state = await loadGraduated();
  const fresh = [];
  for (const r of results) {
    if (r.status !== 'ok' || !r.graduated) continue;
    if (state[r.profileId]) continue;
    state[r.profileId] = { name: r.name, platform, at: new Date().toISOString() };
    fresh.push(r);
  }
  if (fresh.length) await saveGraduated(state);
  return fresh;
}
