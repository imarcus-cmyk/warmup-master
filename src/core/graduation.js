// Milestone state for warmup lifecycle alerts. We persist which lifecycle
// milestones were already announced per profile so Slack only gets each alert
// once, even though maintenance continues forever.
//
// State lives in logs/graduated.json:
// {
//   "<profileId>": {
//     warmupComplete: { name, platform, at },
//     manualUploadReady: { name, platform, at }
//   }
// }
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve('logs', 'graduated.json');

export async function loadGraduated() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export async function saveGraduated(state) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(state, null, 2));
}

export async function recordMilestones(platform, results) {
  const state = await loadGraduated();
  const fresh = {
    warmupComplete: [],
    manualUploadReady: [],
  };

  for (const r of results) {
    if (r.status !== 'ok') continue;
    const current = state[r.profileId] || {};

    if (r.warmupComplete && !current.warmupComplete) {
      current.warmupComplete = { name: r.name, platform, at: new Date().toISOString() };
      fresh.warmupComplete.push(r);
    }
    if (r.manualUploadReady && !current.manualUploadReady) {
      current.manualUploadReady = { name: r.name, platform, at: new Date().toISOString() };
      fresh.manualUploadReady.push(r);
    }

    if (Object.keys(current).length) state[r.profileId] = current;
  }

  if (fresh.warmupComplete.length || fresh.manualUploadReady.length) {
    await saveGraduated(state);
  }
  return fresh;
}
