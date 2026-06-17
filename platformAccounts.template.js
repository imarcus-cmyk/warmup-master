// Profiles + day-based action plan. Plan ramps targets with account age.
export const platformAccounts = [
  // { profileId: "...", name: "...", wokeUpAt: "2026-01-01T00:00:00.000Z", mode: "revivedOld", niches: [] },
].map(a => ({ ...a, name: a.name || `pf-${a.profileId.slice(-4)}` }));

function activeDays(wokeUpAt) {
  return Math.max(0, Math.floor((Date.now() - new Date(wokeUpAt)) / 86400000));
}

function randTarget(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// Derive the allowed-action list from non-zero targets. The orchestrator gates
// each block on allowed.includes(<name>).
function buildActions(plan) {
  const actions = [];
  if (plan.searchTarget > 0) actions.push('search');
  // if (plan.likeTarget > 0) actions.push('like');
  return actions;
}

export function getPlatformActionPlan(accountOrWokeUpAt) {
  const account = typeof accountOrWokeUpAt === 'string'
    ? { wokeUpAt: accountOrWokeUpAt }
    : accountOrWokeUpAt;
  const days = activeDays(account.wokeUpAt);
  const mode = account.mode || 'revivedOld';
  const niches = account.niches || [];

  let phase = 'revive-1';
  let searchTarget = 1;
  // ...other targets, ramped by `days`/`mode` in if-branches.

  const plan = { days, mode, phase, searchTarget, niches };
  return { ...plan, actions: buildActions(plan) };
}

export function logPlatformAccount(profileId, name, plan) {
  console.log(`\n[${name}] (id: ...${profileId.slice(-6)}) - Platform warmup for ${plan.days} days`);
  console.log(`  mode: ${plan.mode} | phase: ${plan.phase} | allowed: ${plan.actions.join(', ')}`);
}
