// Twitter / X subagent definition. Unique: 40-min budget, strictest follow cap,
// engagement unlocks late. Ramp from ORCHESTRATOR.md §2.1.
import { resolvePlan } from '../core/ramp.js';
import * as A from '../actions/twitterActions.js';

const ramp = [
  { phase: 'revive-1', maxDay: 2,        targets: { notifications: 1, search: 1, scrollFeed: 3, watchVideos: 2, viewProfiles: 0, like: 0, follow: 0, bookmark: 0 }, opts: { followBackMax: 2 } },
  { phase: 'revive-2', maxDay: 6,        targets: { notifications: 1, search: 2, scrollFeed: 5, watchVideos: 3, viewProfiles: 1, like: 2, follow: 0, bookmark: 0 }, opts: { followBackMax: 2 } },
  { phase: 'ramp',     maxDay: 13,       targets: { notifications: 1, search: 2, scrollFeed: 6, watchVideos: 4, viewProfiles: 2, like: 4, follow: 1, bookmark: 1 }, opts: { followBackMax: 3 } },
  { phase: 'steady',   maxDay: Infinity, targets: { notifications: 1, search: 3, scrollFeed: 8, watchVideos: 6, viewProfiles: 3, like: 6, follow: 2, bookmark: 2 }, opts: { followBackMax: 5 } },
];

// Live GoLogin profiles (fetched 2026-06-14). wokeUpAt = createdAt.
export const accounts = [
  { profileId: '6a243d745662307ddb13b2ce', name: 'Twitter June 6th',        wokeUpAt: '2026-06-06T00:00:00.000Z', mode: 'freshNew',   niches: [] },
  { profileId: '6a1ee88affeb83f6f7f130d2', name: 'Twitter rdvlr June2nd',    wokeUpAt: '2026-06-02T00:00:00.000Z', mode: 'freshNew',   niches: [] },
  { profileId: '6a1d47cd01f69dc2b39e3aa4', name: 'Twitter ecfvt28284535',    wokeUpAt: '2026-06-01T00:00:00.000Z', mode: 'freshNew',   niches: [] },
  { profileId: '6a1d45bb485ea58de5783c83', name: 'Twitter Saurabh63078156',  wokeUpAt: '2026-06-01T00:00:00.000Z', mode: 'freshNew',   niches: [] },
  { profileId: '69c64af719cebe60b69bc06d', name: 'Twitter #1 27.3',          wokeUpAt: '2026-03-27T00:00:00.000Z', mode: 'maintained', niches: [] },
];

export default {
  key: 'twitter',
  label: 'Twitter',
  home: 'https://x.com/home',
  deadlineMin: 40,
  timeoutMin: 45,
  cron: '11 7 * * *',
  freshShiftDays: 4,
  caps: { follow: 2 }, // never exceed; enforced by orchestrator validation
  blockSignals: {
    urls: [
      { re: /\/(login|logout)\b|\/i\/flow\/login|\/account\/access/i, reason: 'logged out / login wall' },
      { re: /\/account\/suspended/i, reason: 'account suspended' },
    ],
    text: [
      { re: /your account is suspended|x suspends accounts/i, reason: 'account suspended' },
      { re: /sign in to x|sign up for x|to use x\.com/i, reason: 'logged out / login wall' },
    ],
  },
  accounts,
  actions: A,
  planFor(account) { return resolvePlan(account, { ramp, freshShiftDays: 4 }); },
  logAccount(account, plan) {
    console.log(`\n[${account.name}] (…${account.profileId.slice(-6)}) X warmup — ${plan.days}d, ${plan.mode}/${plan.phase}`);
    console.log(`  allowed: ${plan.actions.join(', ') || '(none)'}`);
  },
  slackParts(r) {
    const m = r.metrics || {};
    return [
      m.searches && `${m.searches} search`,
      m.scrolls && `${m.scrolls} scroll`,
      m.watches && `${m.watches} watch`,
      m.likes && `${m.likes} like`,
      m.follows && `${m.follows} follow`,
      m.followBacks && `${m.followBacks} followback`,
      m.bookmarks && `${m.bookmarks} bm`,
    ];
  },
};
