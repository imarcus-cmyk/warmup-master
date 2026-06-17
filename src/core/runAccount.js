// Generic per-account runner. Identical machinery for every platform; all the
// uniqueness comes from the platform definition (`def`):
//   def.home            home URL to land on
//   def.planFor(acct)   -> { mode, phase, actions:[names], ...targets }
//   def.actions         { name: async (page, plan, account) => { events, ...counters } }
//   def.logAccount(acct, plan)   optional console line
//
// The orchestrator owns `def`; this file just executes it. Each allowed action
// is gated, so a platform only ever does what ITS plan unlocks for that age.
import { connectWithRetry, stopProfile } from './gologin.js';
import { checkHealth } from './health.js';
import { sleep, rand, shuffled, SESSION_MIN_MS, SESSION_MAX_MS } from './util.js';

// Randomized gap between actions. Never the same twice — base jitter plus a
// chance of a longer "distraction" with idle scrolling, so daily timing and
// inter-action gaps differ on every run.
async function humanGap(page) {
  await sleep(rand(4000, 12000)); // base jitter, varies every call
  if (Math.random() < 0.35) {
    const scrolls = rand(1, 3);
    for (let i = 0; i < scrolls; i++) {
      await page.evaluate(() => window.scrollBy(0, 250 + Math.random() * 650)).catch(() => {});
      await sleep(rand(1500, 5000));
    }
    await sleep(rand(3000, 16000)); // distracted pause
  }
}

export async function runAccount(account, def) {
  const { profileId, name } = account;
  const plan = def.planFor(account);
  const allowed = plan.actions;
  if (typeof def.logAccount === 'function') def.logAccount(account, plan);

  const result = {
    platform: def.label,
    name,
    profileId,
    mode: plan.mode,
    phase: plan.phase,
    allowed,
    attempts: 0,
    status: 'failed',
    metrics: {},
    events: [],
    error: null,
  };

  let browser;
  try {
    const session = await connectWithRetry(profileId, name, def.home);
    browser = session.browser;
    const page = session.page;
    result.attempts = session.attempts;

    // Session time budget: randomized 5–10 min on platform, hard stop.
    const sessionMs = rand(SESSION_MIN_MS, SESSION_MAX_MS);
    const deadlineAt = Date.now() + sessionMs;
    plan._deadlineAt = deadlineAt; // helpers honor this inside their loops
    result.sessionBudgetSec = Math.round(sessionMs / 1000);
    console.log(`  >> session budget ${result.sessionBudgetSec}s (5–10 min cap)`);

    // Non-technical health gate: profile opened, but is the account usable?
    const health = await checkHealth(page, def);
    if (!health.ok) {
      result.status = 'blocked';
      result.blockReason = health.reason;
      result.events.push({ action: 'healthCheck', blocked: true, reason: health.reason, at: new Date().toISOString() });
      console.error(`  >> ${name} BLOCKED (not technical): ${health.reason} — skipping actions`);
      return result; // finally still stops the profile
    }

    // Run order: notifications ALWAYS first (check who followed us, follow back),
    // then the rest in a shuffled order so the daily action sequence varies.
    const rest = allowed.filter(a => a !== 'notifications');
    const sequence = [
      ...(allowed.includes('notifications') ? ['notifications'] : []),
      ...shuffled(rest),
    ];

    for (const actionName of sequence) {
      if (Date.now() > deadlineAt) {
        console.log(`  >> session time cap reached; stopping remaining actions for ${name}`);
        result.events.push({ action: 'sessionCap', at: new Date().toISOString(), reachedAfterSec: result.sessionBudgetSec });
        break;
      }
      const fn = def.actions[actionName];
      if (!fn) {
        console.log(`  >> no helper for action '${actionName}' on ${def.label}; skipping`);
        continue;
      }
      try {
        const { events = [], ...counters } = await fn(page, plan, account);
        result.events.push(...events);
        for (const [k, v] of Object.entries(counters)) {
          result.metrics[k] = (result.metrics[k] || 0) + v;
        }
        // randomized human pause between action types — never a fixed gap
        await humanGap(page);
      } catch (err) {
        console.error(`  >> ${name} action '${actionName}' failed: ${err.message}`);
        result.events.push({ action: actionName, error: err.message, at: new Date().toISOString() });
      }
    }

    result.status = 'ok';
    console.log(`  >> ${name} done`);
  } catch (err) {
    result.error = err.message;
    console.error(`  >> ${name} unrecoverable: ${err.message}`);
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
    await stopProfile(profileId);
  }

  return result;
}
