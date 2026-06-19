// Reddit subagent definition. Unique: read-dominant, longest ramp (steady d18),
// vote/join late, no posting. Ramp from ORCHESTRATOR.md §2.4.
import { resolvePlan } from '../core/ramp.js';
import * as A from '../actions/redditActions.js';

const ramp = [
  { phase: 'revive-1', maxDay: 3,        targets: { notifications: 1, popular: 1, browseSubs: 1, explore: 1, search: 1, readPosts: 2, upvote: 0, join: 0 } },
  { phase: 'revive-2', maxDay: 9,        targets: { notifications: 1, popular: 1, browseSubs: 2, explore: 1, search: 1, readPosts: 3, upvote: 2, join: 0 } },
  { phase: 'ramp',     maxDay: 17,       targets: { notifications: 1, popular: 1, browseSubs: 2, explore: 1, search: 2, readPosts: 4, upvote: 4, join: 1 } },
  { phase: 'steady',   maxDay: Infinity, targets: { notifications: 1, popular: 1, browseSubs: 3, explore: 1, search: 2, readPosts: 5, upvote: 6, join: 1 } },
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
  freshShiftDays: 5,
  caps: { join: 1 },
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
  planFor(account) { return resolvePlan(account, { ramp, freshShiftDays: 5 }); },
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
