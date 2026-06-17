// TikTok action helpers. Unique to TT: For-You-feed dwell dominates; engagement
// unlocks very late. Each helper returns { <metric>, events }.
import { makeEvent } from '../core/runLog.js';
import { rand, sleep, shuffled, overtime } from '../core/util.js';

const DEFAULT_TAGS = ['fyp', 'diy', 'homedecor', 'satisfying'];
const DEFAULT_COMMENTS = ['Nice', 'Love this', 'Good one', 'So cool', 'Great video'];
const tags = ns => (ns && ns.length ? ns : DEFAULT_TAGS);

async function dismiss(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button,div[role="button"]')) {
      const t = (b.textContent || '').toLowerCase();
      if (/accept all|decline|not now|continue as guest|close/.test(t)) { b.click(); break; }
    }
  }).catch(() => {});
}

async function watchCurrentTikTokBeforeEngagement(page, plan) {
  const startedAt = Date.now();
  const maxWatchMs = rand(18000, 38000);
  let sawVideoClock = false;

  while (!overtime(plan) && Date.now() - startedAt < maxWatchMs) {
    const state = await page.evaluate(() => {
      const video = document.querySelector('video');
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return null;
      try { if (video.paused && video.play) video.play(); } catch {}
      return {
        currentTime: video.currentTime || 0,
        duration: video.duration,
        ended: !!video.ended,
      };
    }).catch(() => null);

    if (state) {
      sawVideoClock = true;
      const remaining = state.duration - state.currentTime;
      if (state.ended || state.currentTime >= state.duration * 0.85 || remaining <= 2.5) break;
    }
    await sleep(rand(900, 1800));
  }

  if (!sawVideoClock) await sleep(rand(10000, 22000));
  await sleep(rand(700, 2200));
  return Math.round((Date.now() - startedAt) / 1000);
}

function clickTikTokFollowButton() {
  const visible = el => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  };
  const labelOf = el => [
    el.textContent || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('title') || '',
    el.getAttribute('data-e2e') || '',
  ].join(' ').trim();
  const candidates = [
    ...document.querySelectorAll([
      '[data-e2e*="follow" i]',
      '[aria-label*="follow" i]',
      'button',
      'div[role="button"]',
      'span[role="button"]',
    ].join(',')),
  ];
  const button = candidates.find(el => {
    const text = labelOf(el);
    return visible(el)
      && /\bfollow\b|browse-follow|user-follow|follow-button/i.test(text)
      && !/following|follow back|followers/i.test(text);
  });
  if (!button) return false;
  button.scrollIntoView({ block: 'center' });
  button.click();
  return true;
}

function clickFypAvatarPlusByGeometry() {
  const visible = el => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  };
  const viewportW = window.innerWidth || document.documentElement.clientWidth;
  const media = [...document.querySelectorAll('img, picture, canvas, svg, div')]
    .filter(visible)
    .map(el => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => {
      const inRightRail = rect.left > viewportW * 0.45;
      const avatarSized = rect.width >= 28 && rect.width <= 80 && rect.height >= 28 && rect.height <= 80;
      const upperRail = rect.top > 80 && rect.top < (window.innerHeight || 900) * 0.75;
      return inRightRail && avatarSized && upperRail;
    })
    .sort((a, b) => a.rect.top - b.rect.top);

  for (const { rect } of media) {
    const points = [
      [rect.left + rect.width / 2, rect.bottom - 2],
      [rect.left + rect.width / 2, rect.bottom + 4],
      [rect.left + rect.width / 2, rect.top + rect.height * 0.72],
    ];
    for (const [x, y] of points) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      const target = el.closest('button,[role="button"],a,div,span') || el;
      if (!visible(target)) continue;
      const text = [
        target.textContent || '',
        target.getAttribute?.('aria-label') || '',
        target.getAttribute?.('data-e2e') || '',
      ].join(' ');
      if (/like|comment|share|favorite|bookmark/i.test(text)) continue;
      target.click();
      return true;
    }
  }
  return false;
}

function fypAvatarPlusPoint() {
  const visible = el => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  };
  const viewportW = window.innerWidth || document.documentElement.clientWidth;
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 900;
  const avatars = [...document.querySelectorAll('img')]
    .filter(visible)
    .map(el => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => {
      const inRightRail = rect.left > viewportW * 0.55;
      const avatarSized = rect.width >= 32 && rect.width <= 76 && rect.height >= 32 && rect.height <= 76;
      const usefulY = rect.top > viewportH * 0.18 && rect.top < viewportH * 0.75;
      return inRightRail && avatarSized && usefulY;
    })
    .sort((a, b) => a.rect.top - b.rect.top);

  const avatar = avatars[0];
  if (!avatar) return null;
  const { rect } = avatar;
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.bottom + Math.min(14, Math.max(7, rect.height * 0.22))),
  };
}

function clickFypPlusFollowButton() {
  const visible = el => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  };
  const isPink = el => {
    const style = window.getComputedStyle(el);
    const colors = [style.backgroundColor, style.color, style.borderColor].join(' ');
    return /rgb\(\s*254\s*,\s*44\s*,\s*85\s*\)|rgb\(\s*255\s*,\s*59\s*,\s*92\s*\)|#fe2c55/i.test(colors);
  };
  const labelOf = el => [
    el.textContent || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('title') || '',
    el.getAttribute('data-e2e') || '',
  ].join(' ').trim();
  const viewportW = window.innerWidth || document.documentElement.clientWidth;
  const candidates = [
    ...document.querySelectorAll([
      '[data-e2e="browse-follow"]',
      '[data-e2e*="follow" i]',
      '[aria-label*="follow" i]',
      'button',
      'div[role="button"]',
      'span[role="button"]',
    ].join(',')),
  ];
  const button = candidates.find(el => {
    if (!visible(el)) return false;
    const rect = el.getBoundingClientRect();
    const text = labelOf(el);
    const inRightRail = rect.left > viewportW * 0.45;
    const compact = rect.width >= 14 && rect.width <= 80 && rect.height >= 14 && rect.height <= 80;
    const isFollow = /\bfollow\b|browse-follow|user-follow|follow-button/i.test(text);
    const isPlus = /^\+$/.test(text) || el.querySelector('svg, path, circle, line');
    return inRightRail
      && compact
      && !/following|follow back|followers/i.test(text)
      && (isFollow || (isPlus && (isPink(el) || [...el.querySelectorAll('*')].some(isPink))));
  });
  if (!button) return false;
  button.scrollIntoView({ block: 'center' });
  button.click();
  return true;
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
    await watchCurrentTikTokBeforeEngagement(page, plan);
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

  if (handles.length) {
    for (const h of handles) {
      try {
        await page.goto(`https://www.tiktok.com/@${h.replace(/^@/, '')}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await dismiss(page);
        await sleep(rand(8000, 18000));
        const ok = await page.evaluate(clickTikTokFollowButton).catch(() => false);
        if (ok === true) { follows++; events.push(makeEvent('follow', { handle: h })); }
        else if (ok === 'already') events.push(makeEvent('follow', { handle: h, note: 'already following' }));
        else events.push(makeEvent('follow', { handle: h, error: 'follow button not found' }));
        await sleep(rand(5000, 10000));
      } catch (e) { events.push(makeEvent('follow', { handle: h, error: e.message })); }
    }
    return { follows, events };
  }

  try { await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.follow; i++) {
    if (overtime(plan)) break;
    let ok = false;
    for (let s = 0; s < 12; s++) {
      await watchCurrentTikTokBeforeEngagement(page, plan);
      ok = await page.evaluate(clickFypPlusFollowButton).catch(() => false);
      if (!ok) ok = await page.evaluate(clickFypAvatarPlusByGeometry).catch(() => false);
      if (!ok) {
        const point = await page.evaluate(fypAvatarPlusPoint).catch(() => null);
        if (point) {
          await page.mouse.move(point.x, point.y).catch(() => {});
          await sleep(rand(250, 700));
          await page.mouse.click(point.x, point.y).catch(() => {});
          ok = true;
        }
      }
      if (ok) break;
      await page.keyboard.press('ArrowDown').catch(() => {});
      await sleep(rand(2000, 5000));
    }
    if (!ok) {
      const tag = shuffled(tags(plan.niches))[0];
      try {
        await page.goto(`https://www.tiktok.com/search/user?q=${encodeURIComponent(tag)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await dismiss(page);
        await sleep(rand(4000, 8000));
        for (let s = 0; s < 5; s++) {
          ok = await page.evaluate(clickTikTokFollowButton).catch(() => false);
          if (ok) break;
          await page.evaluate(() => window.scrollBy(0, 600 + Math.random() * 700)).catch(() => {});
          await sleep(rand(2000, 5000));
        }
      } catch {}
    }
    if (!ok) { events.push(makeEvent('follow', { skipped: 'no TikTok FYP plus follow button found' })); break; }
    follows++; events.push(makeEvent('follow', { fromFyp: true }));
    await sleep(rand(5000, 10000));
  }
  return { follows, events };
}

export async function comment(page, plan) {
  const events = []; let comments = 0;
  try { await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.comment; i++) {
    if (overtime(plan)) break;
    await watchCurrentTikTokBeforeEngagement(page, plan);
    const text = shuffled(DEFAULT_COMMENTS)[0];
    const ok = await page.evaluate((value) => {
      const commentButton = document.querySelector('[data-e2e="comment-icon"], button[aria-label*="comment" i]');
      if (commentButton) commentButton.click();
      const input = document.querySelector('[contenteditable="true"], textarea');
      if (!input) return false;
      input.focus();
      document.execCommand('insertText', false, value);
      const submit = [...document.querySelectorAll('button,div[role="button"]')]
        .find(b => /post|send|comment/i.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')));
      if (!submit) return false;
      submit.click();
      return true;
    }, text).catch(() => false);
    if (ok) { comments++; events.push(makeEvent('comment', { fromFyp: true })); }
    else events.push(makeEvent('comment', { skipped: 'comment box not found' }));
    await page.keyboard.press('ArrowDown').catch(() => {});
    await sleep(rand(4000, 9000));
  }
  return { comments, events };
}
