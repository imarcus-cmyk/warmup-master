// TikTok action helpers. Unique to TT: For-You-feed dwell dominates; engagement
// unlocks very late. Each helper returns { <metric>, events }.
import { makeEvent } from '../core/runLog.js';
import { rand, sleep, shuffled, overtime } from '../core/util.js';

const DEFAULT_TAGS = ['fyp', 'diy', 'homedecor', 'satisfying'];
const tags = ns => (ns && ns.length ? ns : DEFAULT_TAGS);

async function dismiss(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button,div[role="button"]')) {
      const t = (b.textContent || '').toLowerCase();
      if (/accept all|decline|not now|continue as guest|close/.test(t)) { b.click(); break; }
    }
  }).catch(() => {});
}

// The core signal: swipe the For-You feed, dwell per clip.
export async function watchFyp(page, plan) {
  const events = []; let watches = 0;
  const [minSec, maxSec] = plan.dwell || [5, 15];
  try { await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.watchFyp; i++) {
    if (overtime(plan)) break;
    const dwell = rand(minSec, maxSec) * 1000;
    await sleep(dwell);
    // occasional re-watch (don't advance)
    if (Math.random() < 0.2) { await sleep(rand(2000, 5000)); }
    await page.keyboard.press('ArrowDown').catch(() => {});
    watches++;
    if (i % 5 === 4) events.push(makeEvent('watchFyp', { clips: watches }));
  }
  events.push(makeEvent('watchFyp', { clips: watches }));
  return { watches, events };
}

export async function search(page, plan) {
  const events = []; let searches = 0;
  for (const tag of shuffled(tags(plan.niches)).slice(0, plan.search)) {
    try {
      await page.goto(`https://www.tiktok.com/search?q=${encodeURIComponent(tag)}`,
        { waitUntil: 'domcontentloaded', timeout: 45000 });
      await dismiss(page);
      await sleep(rand(4000, 9000));
      await page.evaluate(() => window.scrollBy(0, 500 + Math.random() * 700)).catch(() => {});
      events.push(makeEvent('search', { query: tag })); searches++;
      await sleep(rand(3000, 6000));
    } catch (e) { events.push(makeEvent('search', { query: tag, error: e.message })); }
  }
  return { searches, events };
}

export async function viewProfiles(page, plan) {
  const events = []; let profileViews = 0;
  const handles = shuffled(plan.handles || []).slice(0, plan.viewProfiles);
  for (const h of handles) {
    try {
      await page.goto(`https://www.tiktok.com/@${h.replace(/^@/, '')}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(rand(4000, 8000));
      await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
      events.push(makeEvent('viewProfile', { handle: h })); profileViews++;
      await sleep(rand(2000, 5000));
    } catch (e) { events.push(makeEvent('viewProfile', { handle: h, error: e.message })); }
  }
  return { profileViews, events };
}

export async function like(page, plan) {
  const events = []; let likes = 0;
  // back to feed, double-tap-equivalent like on current clip
  try { await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.like; i++) {
    if (overtime(plan)) break;
    await sleep(rand(4000, 10000)); // watch before liking
    const ok = await page.evaluate(() => {
      const b = document.querySelector('[data-e2e="like-icon"], button[aria-label*="like" i]');
      if (!b) return false; b.click(); return true;
    }).catch(() => false);
    if (ok) likes++;
    await page.keyboard.press('ArrowDown').catch(() => {});
  }
  events.push(makeEvent('like', { count: likes }));
  return { likes, events };
}

// Open the activity/notifications inbox, follow back new followers via the
// "Follow back" button (paced, capped by plan.followBackMax).
export async function notifications(page, plan) {
  const events = []; let notificationsOpened = 0; let followBacks = 0;
  const max = plan.followBackMax || 0;
  try {
    await page.goto('https://www.tiktok.com/notifications', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismiss(page);
    await sleep(rand(4000, 9000));
    await page.evaluate(() => window.scrollBy(0, 400)).catch(() => {});
    notificationsOpened = 1;
    for (let i = 0; i < max; i++) {
      const ok = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /follow back/i.test((x.textContent || '').trim()));
        if (b && b.offsetParent !== null) { b.click(); return true; }
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

export async function follow(page, plan) {
  const events = []; let follows = 0;
  const handles = shuffled(plan.handles || []).slice(0, plan.follow);
  for (const h of handles) {
    try {
      await page.goto(`https://www.tiktok.com/@${h.replace(/^@/, '')}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(rand(3000, 6000));
      const ok = await page.evaluate(() => {
        const b = document.querySelector('[data-e2e="follow-button"], button[aria-label*="follow" i]');
        if (!b) return false; b.click(); return true;
      }).catch(() => false);
      if (ok) { follows++; events.push(makeEvent('follow', { handle: h })); }
      await sleep(rand(5000, 10000));
    } catch (e) { events.push(makeEvent('follow', { handle: h, error: e.message })); }
  }
  return { follows, events };
}
