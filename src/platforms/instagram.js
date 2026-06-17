// Instagram subagent definition. Unique: passive view bulk (feed/reels/stories),
// engagement spread thin, follow cap 1 (action-blocks). Ramp from ORCHESTRATOR.md §2.5.
import { resolvePlan } from '../core/ramp.js';
import * as A from '../actions/instagramActions.js';

const ramp = [
  { phase: 'revive-1', maxDay: 2,        targets: { notifications: 1, scrollFeed: 4, watchReels: 3, exploreSearch: 0, viewStories: 2, like: 0, follow: 0 }, opts: { dwell: [10, 30], followBackMax: 1 } },
  { phase: 'revive-2', maxDay: 7,        targets: { notifications: 1, scrollFeed: 6, watchReels: 5, exploreSearch: 1, viewStories: 4, like: 2, follow: 0 }, opts: { dwell: [10, 40], followBackMax: 1 } },
  { phase: 'ramp',     maxDay: 14,       targets: { notifications: 1, scrollFeed: 7, watchReels: 7, exploreSearch: 2, viewStories: 5, like: 4, follow: 1 }, opts: { dwell: [10, 50], followBackMax: 1 } },
  { phase: 'steady',   maxDay: Infinity, targets: { notifications: 1, scrollFeed: 9, watchReels: 9, exploreSearch: 3, viewStories: 7, like: 6, follow: 1 }, opts: { dwell: [10, 60], followBackMax: 1 } },
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
  freshShiftDays: 4,
  caps: { follow: 1 },
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
  planFor(account) { return resolvePlan(account, { ramp, freshShiftDays: 4 }); },
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
