// Instagram subagent definition. Unique: passive view bulk (feed/reels/stories),
// engagement spread thin, follow cap 1 (action-blocks). Ramp from ORCHESTRATOR.md §2.5.
import { resolvePlan } from '../core/ramp.js';
import * as A from '../actions/instagramActions.js';

const ramp = [
  { phase: 'days-1-7',   maxDay: 7,        targets: { notifications: 1, scrollFeed: [4, 6],  watchReels: [4, 7],  exploreSearch: [0, 1], viewStories: [2, 4], like: [0, 2], follow: [0, 1] }, opts: { dwell: [10, 30], followBackMax: 1 } },
  { phase: 'days-8-14',  maxDay: 14,       targets: { notifications: 1, scrollFeed: [6, 8],  watchReels: [6, 10], exploreSearch: [1, 2], viewStories: [4, 6], like: [2, 4], follow: [2, 4] }, opts: { dwell: [10, 40], followBackMax: 1 } },
  { phase: 'days-15-21', maxDay: 21,       targets: { notifications: 1, scrollFeed: [7, 10], watchReels: [8, 12], exploreSearch: [2, 3], viewStories: [5, 7], like: [4, 6], follow: [1, 2] }, opts: { dwell: [10, 50], followBackMax: 1 } },
  { phase: 'days-22-30', maxDay: 30,       targets: { notifications: 1, scrollFeed: [8, 12], watchReels: [10, 14], exploreSearch: [2, 4], viewStories: [6, 8], like: [5, 8], follow: [1, 3] }, opts: { dwell: [10, 60], followBackMax: 1 } },
  { phase: 'days-31-45', maxDay: 45,       targets: { notifications: 1, scrollFeed: [6, 10], watchReels: [8, 12], exploreSearch: [1, 3], viewStories: [4, 7], like: [3, 6], follow: [0, 2] }, opts: { dwell: [10, 50], followBackMax: 1 } },
  { phase: 'days-46-60', maxDay: 60,       targets: { notifications: 1, scrollFeed: [5, 8],  watchReels: [6, 10], exploreSearch: [1, 2], viewStories: [3, 6], like: [2, 5], follow: [0, 1] }, opts: { dwell: [10, 45], followBackMax: 1 } },
  { phase: 'days-61-75', maxDay: 75,       targets: { notifications: 1, scrollFeed: [4, 7],  watchReels: [5, 8],  exploreSearch: [0, 2], viewStories: [2, 5], like: [1, 4], follow: [0, 1] }, opts: { dwell: [10, 40], followBackMax: 1 } },
  { phase: 'days-76-90', maxDay: 90,       targets: { notifications: 1, scrollFeed: [3, 6],  watchReels: [4, 7],  exploreSearch: [0, 1], viewStories: [2, 4], like: [1, 3], follow: [0, 1] }, opts: { dwell: [10, 35], followBackMax: 1 } },
  { phase: 'days-91+',   maxDay: Infinity, targets: { notifications: 1, scrollFeed: [3, 6],  watchReels: [4, 7],  exploreSearch: [0, 1], viewStories: [2, 4], like: [1, 3], follow: [0, 1] }, opts: { dwell: [10, 35], followBackMax: 1 } },
];

export const accounts = [
  { profileId: '6a2a5657d60a5555274a954e', name: 'Instagram June 11',      wokeUpAt: '2026-06-11T00:00:00.000Z', mode: 'freshNew', niches: [] },
  { profileId: '6a29194eadac2b5341fd0a0d', name: 'Instagram June 10',      wokeUpAt: '2026-06-10T00:00:00.000Z', mode: 'freshNew', niches: [] },
  { profileId: '6a2685fc81f2599785599253', name: 'Instagram June 8th',     wokeUpAt: '2026-06-08T00:00:00.000Z', mode: 'freshNew', niches: [] },
  { profileId: '6a2671247394cc8bccea2b6b', name: 'Instagram June 7th',     wokeUpAt: '2026-06-08T00:00:00.000Z', mode: 'freshNew', niches: [] },
  { profileId: '6a1d40005cdf7b25a1fdda72', name: 'Instagram haleyc_wagner', wokeUpAt: '2026-06-01T00:00:00.000Z', mode: 'freshNew', niches: [] },
];

export default {
  key: 'instagram',
  label: 'Instagram',
  home: 'https://www.instagram.com/',
  deadlineMin: 110,
  timeoutMin: 120,
  cron: '31 8 * * *',
  freshShiftDays: 0,
  caps: { follow: 4 },
  blockSignals: {
    urls: [
      { re: /\/accounts\/login|\/accounts\/logout/i, reason: 'logged out / login wall' },
      { re: /\/accounts\/suspended|\/challenge\//i, reason: 'suspended / checkpoint challenge' },
    ],
    text: [
      { re: /we suspended your account|your account has been suspended/i, reason: 'account suspended' },
      { re: /suspicious login attempt|we detected an unusual login|help us confirm/i, reason: 'checkpoint / verify identity' },
    ],
  },
  accounts,
  actions: A,
  planFor(account) { return resolvePlan(account, { ramp, freshShiftDays: 0, warmupEndsDay: 30 }); },
  logAccount(account, plan) {
    console.log(`\n[${account.name}] (…${account.profileId.slice(-6)}) IG warmup — ${plan.days}d, ${plan.mode}/${plan.phase}`);
    console.log(`  reels dwell ${plan.dwell?.join('-')}s | allowed: ${plan.actions.join(', ') || '(none)'}`);
  },
  slackParts(r) {
    const m = r.metrics || {};
    return [
      m.scrolls && `${m.scrolls} feed`,
      m.reels && `${m.reels} reels`,
      m.stories && `${m.stories} stories`,
      m.likes && `${m.likes} like`,
      m.follows && `${m.follows} follow`,
      m.followBacks && `${m.followBacks} followback`,
    ];
  },
};
