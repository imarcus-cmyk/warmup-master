// YouTube action helpers. Unique to YT: long watch dwell is the dominant signal;
// engagement (like/subscribe) stays rare. Each helper returns { <metric>, events }.
import { makeEvent } from '../core/runLog.js';
import { rand, sleep, shuffled, overtime } from '../core/util.js';

const DEFAULT_QUERIES = ['how to', 'review 2026', 'tutorial', 'documentary'];
const DEFAULT_COMMENTS = ['Nice video', 'Thanks for sharing', 'Great short', 'Interesting'];
const queries = ns => (ns && ns.length ? ns : DEFAULT_QUERIES);

async function dismiss(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button,tp-yt-paper-button,yt-button-shape button')) {
      const t = (b.textContent || '').toLowerCase();
      if (/accept all|reject all|no thanks|dismiss/.test(t)) { b.click(); break; }
    }
  }).catch(() => {});
}

export async function search(page, plan) {
  const events = []; let searches = 0;
  for (const q of shuffled(queries(plan.niches)).slice(0, plan.search)) {
    if (overtime(plan)) break;
    try {
      await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
        { waitUntil: 'domcontentloaded', timeout: 45000 });
      await dismiss(page);
      await sleep(rand(4000, 8000));
      await page.evaluate(() => window.scrollBy(0, 600 + Math.random() * 800)).catch(() => {});
      events.push(makeEvent('search', { query: q })); searches++;
      await sleep(rand(3000, 6000));
    } catch (e) { events.push(makeEvent('search', { query: q, error: e.message })); }
  }
  return { searches, events };
}

// NOTE: long-video watching is intentionally NOT implemented. YouTube warmup is
// shorts-only per requirement.

export async function scrollHome(page, plan) {
  const events = []; let scrolls = 0;
  try { await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.scrollHome; i++) {
    if (overtime(plan)) break;
    await page.evaluate(() => window.scrollBy(0, 600 + Math.random() * 700)).catch(() => {});
    await sleep(rand(2500, 6000));
    scrolls++;
  }
  events.push(makeEvent('scrollHome', { viewports: scrolls }));
  return { scrolls, events };
}

// The core YouTube signal: vertical Shorts feed only. Like/subscribe happen here,
// on the short currently playing (quotas from plan.likeOnShorts / subscribeOnShorts),
// spread across the run — never on a page with no video.
export async function shorts(page, plan) {
  const events = []; let shorts = 0; let likes = 0; let subscribes = 0;
  const likeQuota = plan.likeOnShorts || 0;
  const subQuota = plan.subscribeOnShorts || 0;
  try { await page.goto('https://www.youtube.com/shorts', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.shorts; i++) {
    if (overtime(plan)) break;
    await sleep(rand(5000, 20000)); // watch the current short

    // like some shorts, spread out (probabilistic so it's not the first N)
    if (likes < likeQuota && Math.random() < 0.5) {
      const ok = await page.evaluate(() => {
        const b = document.querySelector('ytd-reel-video-renderer[is-active] #like-button button, #shorts-player button[aria-label*="like" i], button[aria-label^="like" i]');
        if (!b) return false; b.click(); return true;
      }).catch(() => false);
      if (ok) { likes++; events.push(makeEvent('like', { onShort: i })); await sleep(rand(1500, 4000)); }
    }
    // subscribe rarely
    if (subscribes < subQuota && Math.random() < 0.3) {
      const ok = await page.evaluate(() => {
        const b = document.querySelector('ytd-reel-video-renderer[is-active] #subscribe-button button, #shorts-player [aria-label*="Subscribe" i]');
        if (!b) return false; b.click(); return true;
      }).catch(() => false);
      if (ok) { subscribes++; events.push(makeEvent('subscribe', { onShort: i })); await sleep(rand(1500, 4000)); }
    }

    await page.keyboard.press('ArrowDown').catch(() => {});
    shorts++;
  }
  events.push(makeEvent('shorts', { count: shorts, likes, subscribes }));
  return { shorts, likes, subscribes, events };
}

// Open the notifications bell once and read it. YouTube has no follow-back
// (subscriptions are one-way), so this is read-only — it just looks human.
export async function notifications(page, plan) {
  const events = []; let notificationsOpened = 0;
  try {
    await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismiss(page);
    await page.evaluate(() => {
      const b = document.querySelector('button[aria-label*="Notification" i], #notification-count button, ytd-notification-topbar-button-renderer button');
      if (b) b.click();
    }).catch(() => {});
    await sleep(rand(4000, 9000));
    await page.evaluate(() => window.scrollBy(0, 300)).catch(() => {});
    notificationsOpened = 1;
    events.push(makeEvent('notifications', { opened: 1 }));
  } catch (e) { events.push(makeEvent('notifications', { error: e.message })); }
  return { notificationsOpened, events };
}

export async function comment(page, plan) {
  const events = []; let comments = 0;
  try { await page.goto('https://www.youtube.com/shorts', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.comment; i++) {
    if (overtime(plan)) break;
    await sleep(rand(6000, 14000));
    const text = shuffled(DEFAULT_COMMENTS)[0];
    const ok = await page.evaluate((value) => {
      const commentButton = document.querySelector('ytd-reel-video-renderer[is-active] button[aria-label*="comment" i], #shorts-player button[aria-label*="comment" i]');
      if (commentButton) commentButton.click();
      const input = document.querySelector('#contenteditable-root[contenteditable="true"], div[contenteditable="true"], textarea');
      if (!input) return false;
      input.focus();
      document.execCommand('insertText', false, value);
      const submit = [...document.querySelectorAll('button, yt-button-shape button')]
        .find(b => /comment|post|send/i.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')));
      if (!submit) return false;
      submit.click();
      return true;
    }, text).catch(() => false);
    if (ok) { comments++; events.push(makeEvent('comment', { onShort: true })); }
    else events.push(makeEvent('comment', { skipped: 'comment box not found' }));
    await page.keyboard.press('ArrowDown').catch(() => {});
    await sleep(rand(5000, 10000));
  }
  return { comments, events };
}

// Standalone like/subscribe removed — they happen inside shorts() now (shorts-only).
