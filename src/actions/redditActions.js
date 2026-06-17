// Reddit action helpers. Unique to Reddit: read-dominant warmup, voting/joining
// is sensitive and late, no posting/commenting. Each helper returns { <metric>, events }.
import { makeEvent } from '../core/runLog.js';
import { rand, sleep, shuffled, overtime } from '../core/util.js';

const DEFAULT_SUBS = ['popular', 'all', 'mildlyinteresting', 'todayilearned'];
const DEFAULT_QUERIES = ['best of 2026', 'how to', 'explain'];
const subs = ns => (ns && ns.length ? ns : DEFAULT_SUBS);

async function dismiss(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').toLowerCase();
      if (/accept all|reject|not now|continue/.test(t)) { b.click(); break; }
    }
  }).catch(() => {});
}

export async function browseSubs(page, plan) {
  const events = []; let visits = 0;
  for (const s of shuffled(subs(plan.niches)).slice(0, plan.browseSubs)) {
    if (overtime(plan)) break;
    try {
      await page.goto(`https://www.reddit.com/r/${s.replace(/^r\//, '')}/`,
        { waitUntil: 'domcontentloaded', timeout: 45000 });
      await dismiss(page);
      await sleep(rand(4000, 8000));
      for (let i = 0; i < rand(2, 4); i++) {
        await page.evaluate(() => window.scrollBy(0, 600 + Math.random() * 700)).catch(() => {});
        await sleep(rand(2500, 6000));
      }
      events.push(makeEvent('browseSub', { sub: s })); visits++;
    } catch (e) { events.push(makeEvent('browseSub', { sub: s, error: e.message })); }
  }
  return { visits, events };
}

export async function search(page, plan) {
  const events = []; let searches = 0;
  const qs = plan.niches && plan.niches.length ? plan.niches : DEFAULT_QUERIES;
  for (const q of shuffled(qs).slice(0, plan.search)) {
    try {
      await page.goto(`https://www.reddit.com/search/?q=${encodeURIComponent(q)}`,
        { waitUntil: 'domcontentloaded', timeout: 45000 });
      await dismiss(page);
      await sleep(rand(4000, 8000));
      await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
      events.push(makeEvent('search', { query: q })); searches++;
      await sleep(rand(3000, 6000));
    } catch (e) { events.push(makeEvent('search', { query: q, error: e.message })); }
  }
  return { searches, events };
}

export async function readPosts(page, plan) {
  const events = []; let reads = 0;
  const seen = new Set();
  for (let i = 0; i < plan.readPosts; i++) {
    if (overtime(plan)) break;
    try {
      const href = await page.evaluate((seenArr) => {
        const skip = new Set(seenArr);
        const links = [...document.querySelectorAll('a[href*="/comments/"]')]
          .filter(a => { const u = a.href.split('?')[0]; return u && !skip.has(u); });
        const a = links[Math.floor(Math.random() * Math.min(links.length, 15))];
        if (!a) return null; a.click(); return a.href;
      }, [...seen]).catch(() => null);
      if (!href) { events.push(makeEvent('readPost', { skipped: 'no new posts in view' })); break; }
      seen.add(href.split('?')[0]);
      await sleep(rand(3000, 6000));
      // dwell reading comments
      const dwell = rand(20000, 90000);
      const chunks = rand(3, 6);
      for (let c = 0; c < chunks; c++) {
        await sleep(Math.floor(dwell / chunks));
        await page.evaluate(() => window.scrollBy(0, 400 + Math.random() * 500)).catch(() => {});
      }
      events.push(makeEvent('readPost', { url: href, dwellSec: Math.round(dwell / 1000) })); reads++;
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await sleep(rand(2000, 5000));
    } catch (e) { events.push(makeEvent('readPost', { error: e.message })); }
  }
  return { reads, events };
}

// Open the inbox/notifications once and read it. Reddit warmup does not
// follow-back, so this is read-only — natural daily habit.
export async function notifications(page, plan) {
  const events = []; let notificationsOpened = 0;
  try {
    await page.goto('https://www.reddit.com/notifications/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismiss(page);
    await sleep(rand(4000, 9000));
    await page.evaluate(() => window.scrollBy(0, 400)).catch(() => {});
    notificationsOpened = 1;
    events.push(makeEvent('notifications', { opened: 1 }));
  } catch (e) { events.push(makeEvent('notifications', { error: e.message })); }
  return { notificationsOpened, events };
}

export async function upvote(page, plan) {
  const events = []; let upvotes = 0;
  for (let i = 0; i < plan.upvote; i++) {
    if (overtime(plan)) break;
    const ok = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button[aria-label*="upvote" i], [data-post-click-location="vote"] button')];
      const b = els[Math.floor(Math.random() * els.length)];
      if (!b) return false; b.click(); return true;
    }).catch(() => false);
    if (ok) upvotes++;
    await sleep(rand(3000, 7000));
    await page.evaluate(() => window.scrollBy(0, 500)).catch(() => {});
  }
  events.push(makeEvent('upvote', { count: upvotes }));
  return { upvotes, events };
}

export async function join(page, plan) {
  const events = []; let joins = 0;
  const list = shuffled(subs(plan.niches)).slice(0, plan.join);
  for (const s of list) {
    try {
      await page.goto(`https://www.reddit.com/r/${s.replace(/^r\//, '')}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(rand(3000, 6000));
      const ok = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /^join$/i.test((x.textContent || '').trim()));
        if (!b) return false; b.click(); return true;
      }).catch(() => false);
      if (ok) { joins++; events.push(makeEvent('join', { sub: s })); }
      await sleep(rand(4000, 8000));
    } catch (e) { events.push(makeEvent('join', { sub: s, error: e.message })); }
  }
  return { joins, events };
}
