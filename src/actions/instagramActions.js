// Instagram action helpers. Unique to IG: passive view bulk (feed/reels/stories),
// engagement spread thin (aggressive action-blocks). Each helper returns { <metric>, events }.
import { makeEvent } from '../core/runLog.js';
import { rand, sleep, shuffled, overtime } from '../core/util.js';

const DEFAULT_QUERIES = ['interior design', 'home decor', 'diy', 'aesthetic'];
const DEFAULT_HANDLES = [
  'architecturaldigest',
  'apartmenttherapy',
  'dominomag',
  'designmilk',
  'elledecor',
  'housebeautiful',
  'betterhomesandgardens',
  'dwellmagazine',
];
const DEFAULT_COMMENTS = ['Nice', 'Love this', 'So good', 'Beautiful'];
const queries = ns => (ns && ns.length ? ns : DEFAULT_QUERIES);
const handles = hs => (hs && hs.length ? hs : DEFAULT_HANDLES);

async function dismiss(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button,div[role="button"]')) {
      const t = (b.textContent || '').toLowerCase();
      if (/allow all|accept|not now|dismiss/.test(t)) { b.click(); break; }
    }
  }).catch(() => {});
}

export async function scrollFeed(page, plan) {
  const events = []; let scrolls = 0;
  try { await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.scrollFeed; i++) {
    if (overtime(plan)) break;
    await page.evaluate(() => window.scrollBy(0, 500 + Math.random() * 700)).catch(() => {});
    await sleep(rand(2000, 6000)); // dwell per post
    scrolls++;
  }
  events.push(makeEvent('scrollFeed', { posts: scrolls }));
  return { scrolls, events };
}

export async function watchReels(page, plan) {
  const events = []; let reels = 0;
  const [minSec, maxSec] = plan.dwell || [10, 30];
  try { await page.goto('https://www.instagram.com/reels/', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.watchReels; i++) {
    if (overtime(plan)) break;
    await sleep(rand(minSec, maxSec) * 1000);
    await page.keyboard.press('ArrowDown').catch(() => {});
    reels++;
  }
  events.push(makeEvent('watchReels', { count: reels }));
  return { reels, events };
}

export async function exploreSearch(page, plan) {
  const events = []; let searches = 0;
  for (const q of shuffled(queries(plan.niches)).slice(0, plan.exploreSearch)) {
    try {
      await page.goto(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(q)}`,
        { waitUntil: 'domcontentloaded', timeout: 45000 });
      await dismiss(page);
      await sleep(rand(4000, 9000));
      await page.evaluate(() => window.scrollBy(0, 500 + Math.random() * 700)).catch(() => {});
      events.push(makeEvent('exploreSearch', { query: q })); searches++;
      await sleep(rand(3000, 6000));
    } catch (e) { events.push(makeEvent('exploreSearch', { query: q, error: e.message })); }
  }
  return { searches, events };
}

export async function viewStories(page, plan) {
  const events = []; let stories = 0;
  try { await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  // open first story in tray, tap through
  const opened = await page.evaluate(() => {
    const s = document.querySelector('div[role="menu"] button, header ~ div button img');
    if (!s) return false; s.click(); return true;
  }).catch(() => false);
  if (opened) {
    for (let i = 0; i < plan.viewStories; i++) {
      await sleep(rand(3000, 7000));
      await page.keyboard.press('ArrowRight').catch(() => {});
      stories++;
    }
  }
  events.push(makeEvent('viewStories', { count: stories }));
  return { stories, events };
}

export async function like(page, plan) {
  const events = []; let likes = 0;
  try { await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.like; i++) {
    if (overtime(plan)) break;
    await sleep(rand(5000, 12000)); // spread out, never bursted
    const ok = await page.evaluate(() => {
      const els = [...document.querySelectorAll('svg[aria-label="Like"]')];
      const el = els[Math.floor(Math.random() * els.length)];
      if (!el) return false; (el.closest('button') || el.parentElement).click(); return true;
    }).catch(() => false);
    if (ok) likes++;
    await page.evaluate(() => window.scrollBy(0, 700)).catch(() => {});
  }
  events.push(makeEvent('like', { count: likes }));
  return { likes, events };
}

// Open notifications/activity, then only follow back brand-new follower rows.
// Instagram does not expose an exact timestamp in the DOM, so we use the visible
// activity age: now/s/m/h/today/yesterday/1d/2d are treated as <= 48h; older
// day/week/month/year rows are skipped.
export async function notifications(page, plan) {
  const events = []; let notificationsOpened = 0; let followBacks = 0;
  const max = plan.followBackMax || 0;
  let eligibleRecentFollowers = 0;
  let skippedOldFollowers = 0;
  try {
    await page.goto('https://www.instagram.com/notifications/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismiss(page);
    await sleep(rand(4000, 9000));
    await page.evaluate(() => window.scrollBy(0, 400)).catch(() => {});
    notificationsOpened = 1;
    for (let i = 0; i < max; i++) {
      const ok = await page.evaluate(() => {
        function ageFromText(text) {
          const t = text.toLowerCase();
          if (/\b(now|just now|today|yesterday)\b/.test(t)) return 24;
          const compact = t.match(/\b(\d+)\s*([smhdw])\b/);
          if (compact) {
            const n = Number(compact[1]);
            const unit = compact[2];
            if (unit === 's' || unit === 'm') return 0;
            if (unit === 'h') return n;
            if (unit === 'd') return n * 24;
            if (unit === 'w') return n * 24 * 7;
          }
          const wordy = t.match(/\b(\d+)\s+(second|minute|hour|day|week|month|year)s?\b/);
          if (wordy) {
            const n = Number(wordy[1]);
            const unit = wordy[2];
            if (unit === 'second' || unit === 'minute') return 0;
            if (unit === 'hour') return n;
            if (unit === 'day') return n * 24;
            if (unit === 'week') return n * 24 * 7;
            return Infinity;
          }
          return Infinity;
        }

        const seen = new Set();
        const rows = [...document.querySelectorAll('div')]
          .filter(d => /started following you/i.test(d.textContent || ''))
          .filter(d => {
            const text = (d.textContent || '').trim();
            if (seen.has(text)) return false;
            seen.add(text);
            return true;
          });

        for (const r of rows) {
          if (ageFromText(r.textContent || '') > 48) continue;
          const b = [...r.querySelectorAll('button')].find(x => /^follow$/i.test((x.textContent || '').trim()));
          if (b && b.offsetParent !== null) { b.click(); return true; }
        }
        return false;
      }).catch(() => false);
      if (!ok) break;
      followBacks++;
      await sleep(rand(5000, 11000));
    }
    const counts = await page.evaluate(() => {
      function ageFromText(text) {
        const t = text.toLowerCase();
        if (/\b(now|just now|today|yesterday)\b/.test(t)) return 24;
        const compact = t.match(/\b(\d+)\s*([smhdw])\b/);
        if (compact) {
          const n = Number(compact[1]);
          const unit = compact[2];
          if (unit === 's' || unit === 'm') return 0;
          if (unit === 'h') return n;
          if (unit === 'd') return n * 24;
          if (unit === 'w') return n * 24 * 7;
        }
        const wordy = t.match(/\b(\d+)\s+(second|minute|hour|day|week|month|year)s?\b/);
        if (wordy) {
          const n = Number(wordy[1]);
          const unit = wordy[2];
          if (unit === 'second' || unit === 'minute') return 0;
          if (unit === 'hour') return n;
          if (unit === 'day') return n * 24;
          if (unit === 'week') return n * 24 * 7;
          return Infinity;
        }
        return Infinity;
      }

      const seen = new Set();
      const rows = [...document.querySelectorAll('div')]
        .filter(d => /started following you/i.test(d.textContent || ''))
        .map(d => (d.textContent || '').trim())
        .filter(Boolean)
        .filter(text => {
          if (seen.has(text)) return false;
          seen.add(text);
          return true;
        });
      const recent = rows.filter(text => ageFromText(text) <= 48).length;
      return { recent, old: Math.max(0, rows.length - recent) };
    }).catch(() => ({ recent: 0, old: 0 }));
    eligibleRecentFollowers = counts.recent;
    skippedOldFollowers = counts.old;
    events.push(makeEvent('notifications', { opened: 1, followBacks, eligibleRecentFollowers, skippedOldFollowers }));
  } catch (e) { events.push(makeEvent('notifications', { error: e.message })); }
  return { notificationsOpened, followBacks, events };
}

export async function follow(page, plan) {
  const events = []; let follows = 0;
  const targetHandles = shuffled(handles(plan.handles)).slice(0, plan.follow);
  for (const h of targetHandles) {
    try {
      await page.goto(`https://www.instagram.com/${h.replace(/^@/, '')}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(rand(3000, 6000));
      const ok = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /^follow$/i.test((x.textContent || '').trim()));
        if (!b) return false; b.click(); return true;
      }).catch(() => false);
      if (ok) { follows++; events.push(makeEvent('follow', { handle: h })); }
      await sleep(rand(6000, 12000));
    } catch (e) { events.push(makeEvent('follow', { handle: h, error: e.message })); }
  }
  return { follows, events };
}

export async function comment(page, plan) {
  const events = []; let comments = 0;
  try { await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.comment; i++) {
    if (overtime(plan)) break;
    await sleep(rand(5000, 12000));
    const text = shuffled(DEFAULT_COMMENTS)[0];
    const ok = await page.evaluate((value) => {
      const textarea = [...document.querySelectorAll('textarea[aria-label*="comment" i], textarea')]
        .find(x => x.offsetParent !== null);
      if (!textarea) return false;
      textarea.focus();
      textarea.value = value;
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      const post = [...document.querySelectorAll('div[role="button"],button')]
        .find(b => /^post$/i.test((b.textContent || '').trim()));
      if (!post) return false;
      post.click();
      return true;
    }, text).catch(() => false);
    if (ok) { comments++; events.push(makeEvent('comment', { fromFeed: true })); }
    else events.push(makeEvent('comment', { skipped: 'comment box not found' }));
    await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
    await sleep(rand(5000, 10000));
  }
  return { comments, events };
}
