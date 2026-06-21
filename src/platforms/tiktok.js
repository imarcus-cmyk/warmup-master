// TikTok subagent definition. Unique: FYP dwell is the core signal, engagement
// ramps slowest of all platforms. Ramp from ORCHESTRATOR.md §2.3.
import { resolvePlan } from '../core/ramp.js';
import * as A from '../actions/tiktokActions.js';

const ramp = [
  { phase: 'days-1-7',   maxDay: 7,        targets: { notifications: 1, watchFyp: [8, 12],  search: [0, 1], viewProfiles: [0, 1], like: [0, 2],  follow: 0 },     opts: { dwell: [5, 15], followBackMax: 2 } },
  { phase: 'days-8-14',  maxDay: 14,       targets: { notifications: 1, watchFyp: [12, 16], search: [1, 2], viewProfiles: [1, 2], like: [4, 7],  follow: [2, 4] }, opts: { dwell: [8, 25], followBackMax: 2 } },
  { phase: 'days-15-21', maxDay: 21,       targets: { notifications: 1, watchFyp: [16, 22], search: [2, 3], viewProfiles: [2, 3], like: [6, 9],  follow: [3, 5] }, opts: { dwell: [8, 35], followBackMax: 3 } },
  { phase: 'days-22-30', maxDay: 30,       targets: { notifications: 1, watchFyp: [20, 28], search: [2, 4], viewProfiles: [2, 4], like: [7, 11], follow: [4, 6] }, opts: { dwell: [8, 45], followBackMax: 4 } },
  { phase: 'days-31-45', maxDay: 45,       targets: { notifications: 1, watchFyp: [16, 24], search: [2, 3], viewProfiles: [1, 3], like: [4, 7],  follow: [1, 3] }, opts: { dwell: [8, 35], followBackMax: 3 } },
  { phase: 'days-46-60', maxDay: 60,       targets: { notifications: 1, watchFyp: [12, 20], search: [1, 3], viewProfiles: [1, 2], like: [3, 6],  follow: [1, 2] }, opts: { dwell: [8, 30], followBackMax: 2 } },
  { phase: 'days-61-75', maxDay: 75,       targets: { notifications: 1, watchFyp: [10, 16], search: [1, 2], viewProfiles: [0, 2], like: [2, 4],  follow: [0, 1] }, opts: { dwell: [8, 25], followBackMax: 2 } },
  { phase: 'days-76-90', maxDay: 90,       targets: { notifications: 1, watchFyp: [8, 14],  search: [0, 2], viewProfiles: [0, 1], like: [1, 3],  follow: [0, 1] }, opts: { dwell: [8, 20], followBackMax: 1 } },
  { phase: 'days-91+',   maxDay: Infinity, targets: { notifications: 1, watchFyp: [8, 14],  search: [0, 2], viewProfiles: [0, 1], like: [1, 3],  follow: [0, 1] }, opts: { dwell: [8, 20], followBackMax: 1 } },
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
  freshShiftDays: 0,
  caps: { follow: 6 },
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
  planFor(account) { return resolvePlan(account, { ramp, freshShiftDays: 0, warmupEndsDay: 30 }); },
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
