// One-off Twitter/X task. Maps generic verbs → X actions. X DOES have video in
// the timeline, so "watch" plays feed videos. follow with no @handle follows
// accounts found in the feed / who-to-follow (no specific target required);
// with @handles it follows those. Page starts on x.com/home.
import * as TW from '../../actions/twitterActions.js';
import { makeEvent } from '../../core/runLog.js';
import { rand, sleep } from '../../core/util.js';

// Watch N videos in the timeline: scroll until a video is in view, let it play,
// dwell, move on. X autoplays muted video on scroll.
async function watchVideos(page, n) {
  const events = []; let watches = 0;
  try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await sleep(rand(2000, 4000));
  for (let i = 0; i < n; i++) {
    let found = false;
    for (let s = 0; s < 10; s++) {
      found = await page.evaluate(() => {
        const v = document.querySelector('[data-testid="videoComponent"] video, [data-testid="videoPlayer"] video, video');
        if (v) { v.scrollIntoView({ block: 'center' }); try { v.muted = true; v.play && v.play(); } catch {} return true; }
        return false;
      }).catch(() => false);
      if (found) break;
      await page.evaluate(() => window.scrollBy(0, 700)).catch(() => {});
      await sleep(rand(1500, 3500));
    }
    if (!found) { events.push(makeEvent('watchVideo', { skipped: 'no video found in feed' })); break; }
    await sleep(rand(6000, 20000)); // watch dwell
    watches++; events.push(makeEvent('watchVideo', { index: i + 1 }));
    await page.evaluate(() => window.scrollBy(0, 900)).catch(() => {}); // scroll past so the next find is a new video
    await sleep(rand(1500, 3500));
  }
  return { watches, events };
}

// Follow N accounts found anywhere in the feed / who-to-follow — no specific
// target needed. Skips buttons already showing "Following".
async function followFromFeed(page, n) {
  const events = []; let follows = 0;
  try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await sleep(rand(2000, 4000));
  for (let i = 0; i < n; i++) {
    let ok = false;
    for (let s = 0; s < 10; s++) {
      ok = await page.evaluate(() => {
        const b = [...document.querySelectorAll('[data-testid$="-follow"]')]
          .find(x => x.offsetParent !== null && /follow/i.test(x.textContent || '') && !/following/i.test(x.textContent || ''));
        if (b) { b.scrollIntoView({ block: 'center' }); b.click(); return true; }
        return false;
      }).catch(() => false);
      if (ok) break;
      await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
      await sleep(rand(1500, 3500));
    }
    if (!ok) { events.push(makeEvent('follow', { skipped: 'no follow button found in feed' })); break; }
    follows++; events.push(makeEvent('follow', { fromFeed: true }));
    await sleep(rand(5000, 10000));
  }
  return { follows, events };
}

export async function runTwitterTask(page, task) {
  const c = task.counts;
  const metrics = {}; const events = []; const notes = [];
  const likeN = c.like || c.upvote || 0;
  const followN = (c.follow || 0) + (c.subscribe || 0);
  const watchN = c.watch || 0;
  const plan = {
    niches: [],
    handles: task.targets,
    _deadlineAt: task._deadlineAt,
    scrollFeed: Math.max(c.scroll || 0, likeN || c.bookmark ? 3 : 0),
    like: likeN,
    bookmark: c.bookmark || 0,
    search: c.search || 0,
    viewProfiles: c.view || 0,
  };
  const add = (r, ...keys) => { for (const k of keys) if (r[k]) metrics[k] = (metrics[k] || 0) + r[k]; events.push(...r.events); };

  if (watchN > 0) {
    add(await watchVideos(page, watchN), 'watches');
    if ((metrics.watches || 0) < watchN) notes.push(`watched ${metrics.watches || 0}/${watchN} videos (no more videos surfaced in the feed)`);
  }
  if (plan.scrollFeed > 0) add(await TW.scrollFeed(page, plan), 'scrolls');
  if (plan.like > 0) {
    add(await TW.like(page, plan), 'likes');
    if ((metrics.likes || 0) < likeN) notes.push(`liked ${metrics.likes || 0}/${likeN} (no more like buttons in the loaded timeline)`);
  }
  if (plan.bookmark > 0) add(await TW.bookmark(page, plan), 'bookmarks');
  if (plan.search > 0) add(await TW.search(page, plan), 'searches');
  if (plan.viewProfiles > 0) add(await TW.viewProfiles(page, plan), 'profileViews');
  if (followN > 0) {
    if (task.targets.length) add(await TW.follow(page, { ...plan, follow: followN }), 'follows');
    else add(await followFromFeed(page, followN), 'follows');
    if ((metrics.follows || 0) < followN) notes.push(`followed ${metrics.follows || 0}/${followN}`);
  }
  return { metrics, events, notes };
}
