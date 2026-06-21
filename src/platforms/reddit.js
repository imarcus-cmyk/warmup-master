// Reddit subagent definition. Unique: read-dominant, longest ramp (steady d18),
// vote/join late, no posting. Ramp from ORCHESTRATOR.md §2.4.
import { resolvePlan } from '../core/ramp.js';
import * as A from '../actions/redditActions.js';

const ramp = [
  { phase: 'days-1-7',   maxDay: 7,        targets: { notifications: 1, popular: 1,     browseSubs: [1, 2], explore: 1,     search: [1, 2], readPosts: [4, 8], upvote: [0, 2], join: [1, 2] } },
  { phase: 'days-8-14',  maxDay: 14,       targets: { notifications: 1, popular: 1,     browseSubs: [2, 3], explore: 1,     search: [1, 2], readPosts: [4, 6], upvote: [2, 4], join: [1, 2] } },
  { phase: 'days-15-21', maxDay: 21,       targets: { notifications: 1, popular: 1,     browseSubs: [2, 4], explore: 1,     search: [2, 3], readPosts: [5, 7], upvote: [4, 7], join: [1, 2] } },
  { phase: 'days-22-30', maxDay: 30,       targets: { notifications: 1, popular: 1,     browseSubs: [3, 4], explore: 1,     search: [2, 3], readPosts: [6, 8], upvote: [5, 9], join: [1, 2] } },
  { phase: 'days-31-45', maxDay: 45,       targets: { notifications: 1, popular: 1,     browseSubs: [2, 4], explore: 1,     search: [1, 3], readPosts: [4, 7], upvote: [3, 6], join: [0, 1] } },
  { phase: 'days-46-60', maxDay: 60,       targets: { notifications: 1, popular: 1,     browseSubs: [2, 3], explore: 1,     search: [1, 2], readPosts: [4, 6], upvote: [2, 5], join: [0, 1] } },
  { phase: 'days-61-75', maxDay: 75,       targets: { notifications: 1, popular: [0, 1], browseSubs: [1, 3], explore: [0, 1], search: [1, 2], readPosts: [3, 5], upvote: [1, 4], join: [0, 1] } },
  { phase: 'days-76-90', maxDay: 90,       targets: { notifications: 1, popular: [0, 1], browseSubs: [1, 2], explore: [0, 1], search: [0, 2], readPosts: [2, 4], upvote: [1, 3], join: 0 } },
  { phase: 'days-91+',   maxDay: Infinity, targets: { notifications: 1, popular: [0, 1], browseSubs: [1, 2], explore: [0, 1], search: [0, 2], readPosts: [2, 4], upvote: [1, 3], join: 0 } },
];

export const accounts = [
  { profileId: '6a033e1ec4397236eb925888', name: 'Reddit 12.5.26', wokeUpAt: '2026-05-12T00:00:00.000Z', mode: 'maintained', niches: [] },
];

export default {
  key: 'reddit',
  label: 'Reddit',
  home: 'https://www.reddit.com/',
  deadlineMin: 45,
  timeoutMin: 50,
  cron: '11 8 * * *',
  freshShiftDays: 0,
  caps: { join: 2 },
  blockSignals: {
    urls: [
      { re: /\/login|\/account-suspended/i, reason: 'logged out / login wall' },
    ],
    text: [
      { re: /this account has been suspended|your account was suspended|account permanently suspended/i, reason: 'account suspended' },
      { re: /log in to reddit|sign up to (continue|join)/i, reason: 'logged out / login wall' },
    ],
  },
  accounts,
  actions: A,
  planFor(account) { return resolvePlan(account, { ramp, freshShiftDays: 0, warmupEndsDay: 30 }); },
  logAccount(account, plan) {
    console.log(`\n[${account.name}] (…${account.profileId.slice(-6)}) Reddit warmup — ${plan.days}d, ${plan.mode}/${plan.phase}`);
    console.log(`  allowed: ${plan.actions.join(', ') || '(none)'}`);
  },
  slackParts(r) {
    const m = r.metrics || {};
    return [
      m.reads && `${m.reads} read`,
      m.popularVisits && `${m.popularVisits} popular`,
      m.visits && `${m.visits} sub`,
      m.explores && `${m.explores} explore`,
      m.searches && `${m.searches} search`,
      m.upvotes && `${m.upvotes} upvote`,
      m.joins && `${m.joins} join`,
    ];
  },
};
