// Twitter / X subagent definition. Unique: 60-min budget, strictest follow cap,
// engagement unlocks late. Ramp from ORCHESTRATOR.md §2.1.
import { resolvePlan } from '../core/ramp.js';
import * as A from '../actions/twitterActions.js';

const ramp = [
  { phase: 'days-1-7',   maxDay: 7,        targets: { notifications: 1, search: [1, 2], scrollFeed: [3, 5], watchVideos: [2, 3], viewProfiles: [0, 1], like: [0, 1], follow: 0,      bookmark: [0, 1] }, opts: { followBackMax: 2 } },
  { phase: 'days-8-14',  maxDay: 14,       targets: { notifications: 1, search: [2, 3], scrollFeed: [5, 7], watchVideos: [3, 4], viewProfiles: [1, 2], like: [2, 3], commentLike: [2, 5], follow: [2, 3], bookmark: [0, 1] }, opts: { followBackMax: 2 } },
  { phase: 'days-15-21', maxDay: 21,       targets: { notifications: 1, search: [2, 3], scrollFeed: [6, 8], watchVideos: [4, 5], viewProfiles: [2, 3], like: [3, 5], commentLike: [2, 5], follow: [1, 2], bookmark: [1, 2] }, opts: { followBackMax: 3 } },
  { phase: 'days-22-30', maxDay: 30,       targets: { notifications: 1, search: [3, 4], scrollFeed: [7, 9], watchVideos: [5, 6], viewProfiles: [2, 4], like: [4, 6], commentLike: [2, 5], follow: [1, 2], bookmark: [1, 2] }, opts: { followBackMax: 3 } },
  { phase: 'days-31-45', maxDay: 45,       targets: { notifications: 1, search: [2, 4], scrollFeed: [6, 9], watchVideos: [4, 6], viewProfiles: [1, 3], like: [3, 5], commentLike: [2, 5], follow: [0, 2], bookmark: [1, 2] }, opts: { followBackMax: 3 } },
  { phase: 'days-46-60', maxDay: 60,       targets: { notifications: 1, search: [2, 4], scrollFeed: [5, 8], watchVideos: [3, 5], viewProfiles: [1, 3], like: [2, 4], commentLike: [2, 5], follow: [0, 1], bookmark: [1, 2] }, opts: { followBackMax: 2 } },
  { phase: 'days-61-75', maxDay: 75,       targets: { notifications: 1, search: [1, 3], scrollFeed: [4, 7], watchVideos: [2, 4], viewProfiles: [1, 2], like: [1, 3], commentLike: [2, 5], follow: [0, 1], bookmark: [0, 1] }, opts: { followBackMax: 2 } },
  { phase: 'days-76-90', maxDay: 90,       targets: { notifications: 1, search: [1, 2], scrollFeed: [3, 6], watchVideos: [2, 3], viewProfiles: [0, 2], like: [1, 2], commentLike: [2, 5], follow: [0, 1], bookmark: [0, 1] }, opts: { followBackMax: 2 } },
  { phase: 'days-91+',   maxDay: Infinity, targets: { notifications: 1, search: [1, 2], scrollFeed: [3, 6], watchVideos: [2, 3], viewProfiles: [0, 2], like: [1, 2], commentLike: [2, 5], follow: [0, 1], bookmark: [0, 1] }, opts: { followBackMax: 2 } },
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
  deadlineMin: 60,
  timeoutMin: 65,
  cron: '11 7 * * *',
  freshShiftDays: 0,
  caps: { follow: 3 }, // never exceed; enforced by orchestrator validation
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
  planFor(account) { return resolvePlan(account, { ramp, freshShiftDays: 0, warmupEndsDay: 30, manualUploadDay: 21 }); },
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
      m.commentLikes && `${m.commentLikes} comment-like`,
      m.follows && `${m.follows} follow`,
      m.followBacks && `${m.followBacks} followback`,
      m.bookmarks && `${m.bookmarks} bm`,
    ];
  },
};
