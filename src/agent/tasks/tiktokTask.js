// Targeted TikTok task helpers — DISTINCT from the warmup FYP helpers.
// The warmup helpers dwell on the For-You feed; these act on a SPECIFIC account
// the user named ("go to @handle, watch 2 of its videos, follow it, like 1").
import { makeEvent } from '../../core/runLog.js';
import { rand, sleep } from '../../core/util.js';
import * as TT from '../../actions/tiktokActions.js';

async function dismiss(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button,div[role="button"]')) {
      const t = (b.textContent || '').toLowerCase();
      if (/accept all|decline|not now|continue as guest|close/.test(t)) { b.click(); break; }
    }
  }).catch(() => {});
}

async function gotoProfile(page, handle) {
  const h = handle.replace(/^@/, '');
  await page.goto(`https://www.tiktok.com/@${h}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await dismiss(page);
  await sleep(rand(3000, 6000));
}

// Open the first video on the profile, then watch `n` of its videos, advancing
// with ArrowDown (TikTok's in-profile viewer supports keyboard next).
export async function watchProfileVideos(page, handle, n, dwell = [6, 18]) {
  const events = []; let watches = 0;
  if (n <= 0) return { watches, events };
  await gotoProfile(page, handle);
  const opened = await page.evaluate(() => {
    const a = document.querySelector('[data-e2e="user-post-item"] a, a[href*="/video/"]');
    if (a) { a.click(); return true; }
    return false;
  }).catch(() => false);
  if (!opened) {
    events.push(makeEvent('watchProfileVideos', { handle, error: 'no videos found on profile' }));
    return { watches, events };
  }
  await sleep(rand(3000, 5000));
  for (let i = 0; i < n; i++) {
    await sleep(rand(dwell[0], dwell[1]) * 1000);
    watches++;
    events.push(makeEvent('watchProfileVideos', { handle, index: i + 1 }));
    if (i < n - 1) await page.keyboard.press('ArrowDown').catch(() => {});
  }
  return { watches, events };
}

// Like the currently-open video `n` times across consecutive videos.
export async function likeCurrent(page, n) {
  const events = []; let likes = 0;
  for (let i = 0; i < n; i++) {
    await sleep(rand(3000, 8000));
    const ok = await page.evaluate(() => {
      const b = document.querySelector('[data-e2e="like-icon"], [data-e2e="browse-like-icon"], button[aria-label*="like" i]');
      if (!b) return false; b.click(); return true;
    }).catch(() => false);
    if (ok) { likes++; events.push(makeEvent('like', { index: i + 1 })); }
    if (i < n - 1) await page.keyboard.press('ArrowDown').catch(() => {});
  }
  return { likes, events };
}

// Follow each named handle (the "channels"). If fewer handles than requested,
// follows what was given.
export async function followHandles(page, handles, n) {
  const events = []; let follows = 0;
  const list = handles.slice(0, n || handles.length);
  for (const handle of list) {
    try {
      await gotoProfile(page, handle);
      const ok = await page.evaluate(() => {
        const b = document.querySelector('[data-e2e="follow-button"], button[aria-label*="follow" i]');
        if (!b) return false;
        if (/following/i.test((b.textContent || ''))) return 'already';
        b.click(); return true;
      }).catch(() => false);
      if (ok === true) { follows++; events.push(makeEvent('follow', { handle })); }
      else if (ok === 'already') events.push(makeEvent('follow', { handle, note: 'already following' }));
      else events.push(makeEvent('follow', { handle, error: 'follow button not found' }));
      await sleep(rand(4000, 9000));
    } catch (e) {
      events.push(makeEvent('follow', { handle, error: e.message }));
    }
  }
  return { follows, events };
}

// Feed-based fallback when no specific account is named: watch the For-You feed,
// like on it, follow the given handles (if any).
async function runFeedTask(page, task) {
  const c = task.counts;
  const metrics = {}; const events = []; const notes = [];
  const plan = { niches: [], handles: task.targets, dwell: [6, 18], _deadlineAt: task._deadlineAt,
    watchFyp: c.watch || 0, like: c.like || 0, follow: (c.follow || 0) + (c.subscribe || 0) };
  const add = (r, ...keys) => { for (const k of keys) if (r[k]) metrics[k] = (metrics[k] || 0) + r[k]; events.push(...r.events); };
  if (plan.watchFyp > 0) add(await TT.watchFyp(page, plan), 'watches');
  if (plan.like > 0) add(await TT.like(page, plan), 'likes');
  if (plan.follow > 0) {
    if (!plan.handles.length) notes.push('follow needs a target @handle on TikTok — none given, skipped (try "...follow @handle")');
    else add(await TT.follow(page, plan), 'follows');
  }
  return { metrics, events, notes };
}

// Orchestrate one TikTok task on an already-open page. With a named @handle it
// acts on that account's videos; with no handle it falls back to the FYP feed.
// task = { targets:[handle], counts:{watch,like,follow} }
export async function runTikTokTask(page, task) {
  if (!task.targets.length) return runFeedTask(page, task);
  const metrics = {}; const events = [];
  const primary = task.targets[0];
  const dwell = [6, 18];

  if (task.counts.watch > 0 && primary) {
    const { watches, events: e } = await watchProfileVideos(page, primary, task.counts.watch, dwell);
    metrics.watches = (metrics.watches || 0) + watches; events.push(...e);
  }
  if (task.counts.like > 0) {
    // like on whatever videos are currently in view (the target's, if watch ran)
    if (!task.counts.watch && primary) await gotoProfile(page, primary);
    const { likes, events: e } = await likeCurrent(page, task.counts.like);
    metrics.likes = (metrics.likes || 0) + likes; events.push(...e);
  }
  if (task.counts.follow > 0 && task.targets.length) {
    const { follows, events: e } = await followHandles(page, task.targets, task.counts.follow);
    metrics.follows = (metrics.follows || 0) + follows; events.push(...e);
  }
  return { metrics, events };
}
