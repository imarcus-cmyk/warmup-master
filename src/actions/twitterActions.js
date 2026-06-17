// Twitter / X action helpers. Unique to X: timeline scroll + profile views,
// strict engagement caps. Each helper returns { <metric>, events }.
import { makeEvent } from '../core/runLog.js';
import { rand, sleep, shuffled, overtime } from '../core/util.js';

const DEFAULT_TOPICS = ['tech news', 'startup', 'ai tools', 'design'];
const topics = ns => (ns && ns.length ? ns : DEFAULT_TOPICS);

async function dismiss(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('div[role="button"],button')) {
      const t = (b.textContent || '').toLowerCase();
      if (/accept|allow all|not now|dismiss/.test(t)) { b.click(); break; }
    }
  }).catch(() => {});
}

export async function search(page, plan) {
  const events = []; let searches = 0;
  for (const q of shuffled(topics(plan.niches)).slice(0, plan.search)) {
    try {
      await page.goto(`https://x.com/search?q=${encodeURIComponent(q)}&src=typed_query`,
        { waitUntil: 'domcontentloaded', timeout: 45000 });
      await dismiss(page);
      await sleep(rand(4000, 9000));
      await page.evaluate(() => window.scrollBy(0, 400 + Math.random() * 600)).catch(() => {});
      events.push(makeEvent('search', { query: q })); searches++;
      await sleep(rand(3000, 7000));
    } catch (e) { events.push(makeEvent('search', { query: q, error: e.message })); }
  }
  return { searches, events };
}

export async function scrollFeed(page, plan) {
  const events = []; let scrolls = 0;
  try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.scrollFeed; i++) {
    if (overtime(plan)) break;
    await page.evaluate(() => window.scrollBy(0, 500 + Math.random() * 700)).catch(() => {});
    await sleep(rand(2000, 6000)); // dwell per viewport
    scrolls++;
  }
  events.push(makeEvent('scrollFeed', { viewports: scrolls }));
  return { scrolls, events };
}

export async function viewProfiles(page, plan) {
  const events = []; let profileViews = 0;
  const handles = shuffled(plan.handles || []).slice(0, plan.viewProfiles);
  for (const h of handles) {
    try {
      await page.goto(`https://x.com/${h.replace(/^@/, '')}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(rand(4000, 8000));
      await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
      events.push(makeEvent('viewProfile', { handle: h })); profileViews++;
      await sleep(rand(2000, 5000));
    } catch (e) { events.push(makeEvent('viewProfile', { handle: h, error: e.message })); }
  }
  return { profileViews, events };
}

async function clickAriaN(page, label, n) {
  let done = 0;
  for (let i = 0; i < n; i++) {
    const ok = await page.evaluate(lbl => {
      const els = [...document.querySelectorAll(`[data-testid="${lbl}"]`)];
      const el = els[Math.floor(Math.random() * els.length)];
      if (!el) return false; el.click(); return true;
    }, label).catch(() => false);
    if (ok) done++;
    await sleep(rand(3000, 8000));
    await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
  }
  return done;
}

export async function like(page, plan) {
  const events = [];
  const likes = await clickAriaN(page, 'like', plan.like);
  events.push(makeEvent('like', { count: likes }));
  return { likes, events };
}

// Watch videos in the timeline. X autoplays muted video on scroll, so we scroll
// a video into view, let it play, dwell, then move past it. Used by both the
// daily warmup (plan.watchVideos from the ramp) and one-off Slack tasks.
export async function watchVideos(page, plan) {
  const events = []; let watches = 0;
  try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < (plan.watchVideos || 0); i++) {
    if (overtime(plan)) break;
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
    watches++;
    await page.evaluate(() => window.scrollBy(0, 900)).catch(() => {}); // past it, so the next find is new
    await sleep(rand(1500, 3500));
  }
  events.push(makeEvent('watchVideo', { count: watches }));
  return { watches, events };
}

// Follow accounts. With plan.handles → follow those specific accounts. With no
// handles → follow accounts found in the feed / who-to-follow (the daily warmup
// has no configured handles, so this is what makes daily follow actually work).
export async function follow(page, plan) {
  const events = []; let follows = 0;
  const handles = shuffled(plan.handles || []).slice(0, plan.follow);

  if (handles.length) {
    for (const h of handles) {
      try {
        await page.goto(`https://x.com/${h.replace(/^@/, '')}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await sleep(rand(3000, 6000));
        const ok = await page.evaluate(() => {
          const b = document.querySelector('[data-testid$="-follow"]');
          if (!b) return false; b.click(); return true;
        }).catch(() => false);
        if (ok) { follows++; events.push(makeEvent('follow', { handle: h })); }
        await sleep(rand(5000, 10000));
      } catch (e) { events.push(makeEvent('follow', { handle: h, error: e.message })); }
    }
    return { follows, events };
  }

  // Feed-follow fallback (no specific target).
  try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.follow; i++) {
    if (overtime(plan)) break;
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

// Open notifications once, find "followed you" entries, follow them back (paced,
// capped by plan.followBackMax). Reciprocal follows are low-risk.
export async function notifications(page, plan) {
  const events = []; let notificationsOpened = 0; let followBacks = 0;
  const max = plan.followBackMax || 0;
  try {
    await page.goto('https://x.com/notifications', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismiss(page);
    await sleep(rand(4000, 9000));
    await page.evaluate(() => window.scrollBy(0, 400 + Math.random() * 500)).catch(() => {});
    notificationsOpened = 1;
    for (let i = 0; i < max; i++) {
      const ok = await page.evaluate(() => {
        for (const c of document.querySelectorAll('[data-testid="cellInnerDiv"]')) {
          if (/followed you/i.test(c.textContent || '')) {
            const b = c.querySelector('[data-testid$="-follow"]');
            if (b && b.offsetParent !== null) { b.click(); return true; }
          }
        }
        return false;
      }).catch(() => false);
      if (!ok) break;
      followBacks++;
      await sleep(rand(4000, 9000));
    }
    events.push(makeEvent('notifications', { opened: 1, followBacks }));
  } catch (e) { events.push(makeEvent('notifications', { error: e.message })); }
  return { notificationsOpened, followBacks, events };
}

export async function bookmark(page, plan) {
  const events = [];
  const bookmarks = await clickAriaN(page, 'bookmark', plan.bookmark);
  events.push(makeEvent('bookmark', { count: bookmarks }));
  return { bookmarks, events };
}
