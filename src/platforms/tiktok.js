// TikTok subagent definition. Unique: FYP dwell is the core signal, engagement
// ramps slowest of all platforms. Ramp from ORCHESTRATOR.md §2.3.
import { resolvePlan } from '../core/ramp.js';
import * as A from '../actions/tiktokActions.js';

const ramp = [
  { phase: 'revive-1', maxDay: 3,        targets: { notifications: 1, watchFyp: 8,  search: 0, viewProfiles: 0, like: 0, follow: 0 }, opts: { dwell: [5, 15], followBackMax: 2 } },
  { phase: 'revive-2', maxDay: 7,        targets: { notifications: 1, watchFyp: 12, search: 1, viewProfiles: 1, like: 2, follow: 0 }, opts: { dwell: [8, 25], followBackMax: 2 } },
  { phase: 'ramp',     maxDay: 14,       targets: { notifications: 1, watchFyp: 18, search: 2, viewProfiles: 2, like: 5, follow: 1 }, opts: { dwell: [8, 35], followBackMax: 3 } },
  { phase: 'steady',   maxDay: Infinity, targets: { notifications: 1, watchFyp: 25, search: 3, viewProfiles: 3, like: 8, follow: 1 }, opts: { dwell: [8, 45], followBackMax: 5 } },
];

export const accounts = [
  { profileId: '6a27f752476ff1ef40e29238', name: 'Tiktok June 9 germany', wokeUpAt: '2026-06-09T00:00:00.000Z', mode: 'freshNew', niches: [] },
  { profileId: '6a26e5176c199950b3c0bfd4', name: 'TikTok June 8',         wokeUpAt: '2026-06-08T00:00:00.000Z', mode: 'freshNew', niches: [] },
  { profileId: '6a215988fd64286a0cb16aca', name: 'Tiktok June',           wokeUpAt: '2026-06-04T00:00:00.000Z', mode: 'freshNew', niches: [] },
];

export default {
  key: 'tiktok',
  label: 'TikTok',
  home: 'https://www.tiktok.com/foryou',
  deadlineMin: 110,
  timeoutMin: 120,
  cron: '51 7 * * *',
  freshShiftDays: 4,
  caps: { follow: 1 },
  blockSignals: {
    urls: [
      { re: /\/login|\/logout/i, reason: 'logged out / login wall' },
      { re: /account.*(banned|suspended)/i, reason: 'account banned/suspended' },
    ],
    text: [
      { re: /account (was )?(banned|suspended)|your account is suspended|permanently banned/i, reason: 'account banned/suspended' },
      { re: /log in to (tiktok|follow)|sign up for tiktok/i, reason: 'logged out / login wall' },
    ],
  },
  accounts,
  actions: A,
  planFor(account) { return resolvePlan(account, { ramp, freshShiftDays: 4 }); },
  logAccount(account, plan) {
    console.log(`\n[${account.name}] (…${account.profileId.slice(-6)}) TT warmup — ${plan.days}d, ${plan.mode}/${plan.phase}`);
    console.log(`  fyp ${plan.watchFyp} clips @ ${plan.dwell?.join('-')}s | allowed: ${plan.actions.join(', ') || '(none)'}`);
  },
  slackParts(r) {
    const m = r.metrics || {};
    return [
      m.watches && `${m.watches} fyp`,
      m.searches && `${m.searches} search`,
      m.likes && `${m.likes} like`,
      m.follows && `${m.follows} follow`,
      m.followBacks && `${m.followBacks} followback`,
    ];
  },
};
