// YouTube subagent definition. Unique: SHORTS ONLY — never watches long videos.
// Subscribe stays rare. Ramp from ORCHESTRATOR.md §2.2.
import { resolvePlan } from '../core/ramp.js';
import * as A from '../actions/youtubeActions.js';

async function requireSignedIn(page) {
  await page.waitForFunction(() => {
    const loggedInConfig = Boolean(
      window.ytcfg
      && typeof window.ytcfg.get === 'function'
      && window.ytcfg.get('LOGGED_IN') === true
    );
    const visible = el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    };
    const signedInSelectors = [
      'button#avatar-btn',
      '#avatar-btn img',
      'button[aria-label*="Account menu" i]',
      'button[aria-label*="Google Account" i]',
    ];
    const hasAccountMenu = signedInSelectors
      .some(selector => [...document.querySelectorAll(selector)].some(visible));
    const hasSignInButton = [...document.querySelectorAll('a,button')]
      .some(el => {
        if (!visible(el)) return false;
        const text = (el.textContent || '').trim();
        const aria = el.getAttribute('aria-label') || '';
        const href = el.getAttribute('href') || '';
        return /^sign in$/i.test(text)
          || /sign in/i.test(aria)
          || /accounts\.google\.com\/(signin|ServiceLogin|v3\/signin)/i.test(href);
      });
    return loggedInConfig || hasAccountMenu || hasSignInButton;
  }, { timeout: 12000 }).catch(() => {});

  const state = await page.evaluate(() => {
    const loggedInConfig = Boolean(
      window.ytcfg
      && typeof window.ytcfg.get === 'function'
      && window.ytcfg.get('LOGGED_IN') === true
    );
    const visible = el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    };
    const signedInSelectors = [
      'button#avatar-btn',
      '#avatar-btn img',
      'button[aria-label*="Account menu" i]',
      'button[aria-label*="Google Account" i]',
    ];
    const signedIn = signedInSelectors
      .some(selector => [...document.querySelectorAll(selector)].some(visible))
      || loggedInConfig;
    const signedOut = [...document.querySelectorAll('a,button')]
      .some(el => {
        if (!visible(el)) return false;
        const text = (el.textContent || '').trim();
        const aria = el.getAttribute('aria-label') || '';
        const href = el.getAttribute('href') || '';
        return /^sign in$/i.test(text)
          || /sign in/i.test(aria)
          || /accounts\.google\.com\/(signin|ServiceLogin|v3\/signin)/i.test(href);
      });
    return { signedIn, signedOut };
  }).catch(() => ({ signedIn: false, signedOut: false }));

  if (state.signedIn) return { ok: true };
  if (!state.signedOut) return { ok: true };
  return {
    ok: false,
    reason: 'logged out / YouTube sign-in required',
  };
}

// YouTube is shorts-only, so like/subscribe happen INSIDE the shorts loop (on the
// short currently playing) — they live in opts, not as standalone actions, so
// they never run on a page with no video.
const ramp = [
  { phase: 'revive-1', maxDay: 2,        targets: { notifications: 1, search: 1, shorts: 3,  scrollHome: 2 }, opts: { likeOnShorts: 0, subscribeOnShorts: 0 } },
  { phase: 'revive-2', maxDay: 6,        targets: { notifications: 1, search: 2, shorts: 6,  scrollHome: 3 }, opts: { likeOnShorts: 1, subscribeOnShorts: 0 } },
  { phase: 'ramp',     maxDay: 13,       targets: { notifications: 1, search: 3, shorts: 10, scrollHome: 4 }, opts: { likeOnShorts: 2, subscribeOnShorts: 1 } },
  { phase: 'steady',   maxDay: Infinity, targets: { notifications: 1, search: 3, shorts: 15, scrollHome: 5 }, opts: { likeOnShorts: 3, subscribeOnShorts: 1 } },
];

export const accounts = [
  { profileId: '6a27fb413e0fcc26ba41df20', name: 'Youtube June 9',  wokeUpAt: '2026-06-09T00:00:00.000Z', mode: 'freshNew',   niches: [] },
  { profileId: '69c8f25cc486ca2caa5f0c93', name: 'Youtube #1 29.3', wokeUpAt: '2026-03-29T00:00:00.000Z', mode: 'maintained', niches: [] },
];

export default {
  key: 'youtube',
  label: 'YouTube',
  home: 'https://www.youtube.com/',
  deadlineMin: 110,
  timeoutMin: 120,
  cron: '31 7 * * *',
  freshShiftDays: 4,
  caps: { subscribeOnShorts: 1 },
  blockSignals: {
    urls: [
      { re: /accounts\.google\.com\/(signin|ServiceLogin|v3\/signin)/i, reason: 'logged out / Google sign-in' },
    ],
    text: [
      { re: /this account has been terminated|account was terminated|violating youtube'?s/i, reason: 'channel terminated' },
      { re: /sign in to confirm|verify it'?s you|confirm you'?re not a bot/i, reason: 'verification / bot check' },
    ],
    custom: [requireSignedIn],
  },
  accounts,
  actions: A,
  planFor(account) { return resolvePlan(account, { ramp, freshShiftDays: 4 }); },
  logAccount(account, plan) {
    console.log(`\n[${account.name}] (…${account.profileId.slice(-6)}) YT warmup — ${plan.days}d, ${plan.mode}/${plan.phase}`);
    console.log(`  shorts-only | allowed: ${plan.actions.join(', ') || '(none)'}`);
  },
  slackParts(r) {
    const m = r.metrics || {};
    return [
      m.shorts && `${m.shorts} shorts`,
      m.searches && `${m.searches} search`,
      m.likes && `${m.likes} like`,
      m.subscribes && `${m.subscribes} sub`,
    ];
  },
};
