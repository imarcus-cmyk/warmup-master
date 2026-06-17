// ============================================================================
// MASTER ORCHESTRATOR
// ----------------------------------------------------------------------------
// Owns every platform "subagent" and guarantees each one runs its OWN unique
// warm plan. Responsibilities:
//   1. Hold the platform registry (twitter / youtube / tiktok / reddit / instagram).
//   2. VALIDATE every subagent before running — unique home + cron, sane deadline,
//      every ramp action has a helper, no plan exceeds its declared cap. This is
//      how the orchestrator "controls" each subagent: a platform whose plan drifts
//      from its rules (missing helper, follow burst, collision) fails the gate and
//      does NOT run.
//   3. Dispatch the requested platform(s) with their own deadline + plan + actions.
//
// Usage:
//   node src/orchestrator.js <platform>   run one (twitter|youtube|tiktok|reddit|instagram)
//   node src/orchestrator.js all          run every platform sequentially
//   node src/orchestrator.js --validate   validate the registry and exit
//   node src/orchestrator.js --check-unclassified  alert on GoLogin profiles matching no platform
//   PLATFORM=<x> node src/orchestrator.js (env fallback, used by CI matrix)
// ============================================================================
import 'dotenv/config'; // MUST be first: loads .env before modules read process.env
import { token, rand, sleep } from './core/util.js';
import { discoverAccounts, findUnclassified } from './core/discover.js';
import { runAccount } from './core/runAccount.js';
import { writeRunLog } from './core/runLog.js';
import { sendSlackReport, sendUnclassifiedAlert } from './core/slack.js';

import twitter from './platforms/twitter.js';
import youtube from './platforms/youtube.js';
import tiktok from './platforms/tiktok.js';
import reddit from './platforms/reddit.js';
import instagram from './platforms/instagram.js';

const REGISTRY = { twitter, youtube, tiktok, reddit, instagram };

// ---------------------------------------------------------------------------
// Subagent plan control / validation
// ---------------------------------------------------------------------------
function validateRegistry() {
  const errors = [];
  const homes = new Map();
  const crons = new Map();

  for (const [key, def] of Object.entries(REGISTRY)) {
    if (def.key !== key) errors.push(`${key}: def.key '${def.key}' != registry key`);

    // unique home + cron so subagents never collide
    if (homes.has(def.home)) errors.push(`${key}: home collides with ${homes.get(def.home)}`);
    homes.set(def.home, key);
    if (crons.has(def.cron)) errors.push(`${key}: cron '${def.cron}' collides with ${crons.get(def.cron)}`);
    crons.set(def.cron, key);

    // deadline must stay below CI timeout
    if (!(def.deadlineMin < def.timeoutMin)) errors.push(`${key}: deadlineMin ${def.deadlineMin} must be < timeoutMin ${def.timeoutMin}`);

    // every account's resolved plan must reference only actions that have helpers,
    // and must respect declared caps.
    for (const acct of def.accounts) {
      const plan = def.planFor(acct);
      for (const a of plan.actions) {
        if (typeof def.actions[a] !== 'function') {
          errors.push(`${key}/${acct.name}: plan action '${a}' has no helper`);
        }
      }
      for (const [capAction, capMax] of Object.entries(def.caps || {})) {
        if (typeof plan[capAction] === 'number' && plan[capAction] > capMax) {
          errors.push(`${key}/${acct.name}: ${capAction} target ${plan[capAction]} exceeds cap ${capMax}`);
        }
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Run one platform subagent end-to-end
// ---------------------------------------------------------------------------
async function runPlatform(def) {
  const deadline = Date.now() + def.deadlineMin * 60 * 1000;

  // Discover profiles live each run so new GoLogin profiles auto-join the cycle.
  // Static def.accounts act as per-profile overrides (niches / forced mode).
  let roster = def.accounts;
  let newProfiles = [];
  if (!process.env.WARMUP_NO_DISCOVERY) {
    try {
      const discovered = await discoverAccounts(def.key, { overrides: def.accounts });
      const knownIds = new Set(def.accounts.map(a => a.profileId));
      newProfiles = discovered.filter(a => !knownIds.has(a.profileId));
      if (newProfiles.length) console.log(`  >> discovered ${newProfiles.length} NEW ${def.label} profile(s): ${newProfiles.map(a => a.name).join(', ')}`);
      roster = discovered;
    } catch (err) {
      console.error(`  >> discovery failed (${err.message}); falling back to static roster`);
    }
  }

  console.log(`\n=== ${def.label} warmup — ${roster.length} account(s), budget ${def.deadlineMin}m ===`);
  if (roster.length === 0) {
    console.log(`no ${def.label} accounts found.`);
    return [];
  }

  const results = [];
  const failed = [];

  // Shakedown: WARMUP_LIMIT caps accounts per platform (e.g. 1 for a test run).
  const limit = Number(process.env.WARMUP_LIMIT) || 0;
  const accounts = limit > 0 ? roster.slice(0, limit) : roster;
  if (limit > 0) console.log(`  (shakedown: limited to ${accounts.length} account)`);

  for (const account of accounts) {
    if (Date.now() > deadline) {
      console.log(`\nglobal deadline reached — skipping ${account.name} and the rest`);
      results.push({ platform: def.label, name: account.name, profileId: account.profileId, status: 'skipped', error: 'global time budget exceeded', skipped: true, events: [], metrics: {} });
      continue;
    }
    const result = await runAccount(account, def);
    results.push(result);
    // Only RETRY technical failures. 'blocked' (suspended/login wall) won't be
    // fixed by retrying, so don't hammer it.
    if (result.status === 'failed') failed.push(account);

    const delay = rand(25000, 45000);
    console.log(`  >> pacing next ${def.label} profile; sleeping ${(delay / 1000).toFixed(1)}s...`);
    await sleep(delay);
  }

  // one retry pass over failures
  if (failed.length) {
    console.log(`\nretry pass for ${failed.length} ${def.label} account(s): ${failed.map(a => a.name).join(', ')}`);
    for (const account of failed) {
      if (Date.now() > deadline) { console.log(`deadline reached — skipping retry for ${account.name}`); continue; }
      const retry = await runAccount(account, def);
      retry.requeued = true;
      const idx = results.findIndex(r => r.profileId === account.profileId);
      if (idx !== -1) results[idx] = retry;
      await sleep(rand(20000, 35000));
    }
  }

  try {
    const logPath = await writeRunLog({ platform: def.label, agent: `${def.key}-warmup`, results });
    console.log(`  >> action log written: ${logPath}`);
  } catch (err) { console.error(`action log failed: ${err.message}`); }

  if (process.env.WARMUP_NO_SLACK) {
    console.log('  >> slack suppressed (WARMUP_NO_SLACK)');
  } else {
    try {
      await sendSlackReport(results, { platform: def.label, slackParts: def.slackParts, newProfiles });
    } catch (err) { console.error(`slack report failed: ${err.message}`); }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
const target = (process.argv[2] || process.env.PLATFORM || '').toLowerCase();

const errors = validateRegistry();
if (errors.length) {
  console.error('REGISTRY VALIDATION FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('registry validated: all subagent plans unique + within caps.');

if (target === '--validate') {
  console.log('validate-only: OK');
  process.exit(0);
}

if (!token) {
  console.error('missing GoLogin token (set GL_API_TOKEN or GOLOGIN_API_KEY).');
  process.exit(1);
}

// Surface GoLogin profiles that classify to no platform — they never warm.
// Run by the daily scheduler before the cycle so misfiled profiles get caught.
if (target === '--check-unclassified') {
  const list = await findUnclassified();
  if (!list.length) {
    console.log('all GoLogin profiles classify to a platform.');
  } else {
    console.log(`${list.length} unclassified profile(s) (NOT warmed):`);
    for (const p of list) console.log(`  - ${p.name} [folder: ${p.folder}]`);
    if (!process.env.WARMUP_NO_SLACK) {
      try { await sendUnclassifiedAlert(list); }
      catch (err) { console.error(`slack alert failed: ${err.message}`); }
    }
  }
  process.exit(0);
}

const toRun = target === 'all' || target === ''
  ? Object.values(REGISTRY)
  : REGISTRY[target] ? [REGISTRY[target]] : null;

if (!toRun) {
  console.error(`unknown platform '${target}'. Use: ${Object.keys(REGISTRY).join(' | ')} | all | --validate`);
  process.exit(1);
}

for (const def of toRun) {
  try { await runPlatform(def); }
  catch (err) { console.error(`${def.label} run crashed: ${err.message}`); }
}

console.log('\norchestrator done');
