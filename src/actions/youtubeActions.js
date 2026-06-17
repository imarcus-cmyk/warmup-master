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

async function clickActiveShortControl(page, names, blocked = []) {
  return page.evaluate(({ names, blocked }) => {
    const visible = el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const textFor = el => [
      el.textContent || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || '',
      el.getAttribute('id') || '',
      el.getAttribute('class') || '',
    ].join(' ').trim();
    const click = el => {
      const button = el.matches('button, [role="button"]') ? el : el.querySelector('button, [role="button"]');
      const target = button || el;
      if (!visible(target)) return false;
      target.scrollIntoView({ block: 'center' });
      target.click();
      return true;
    };
    const wantsLike = names.some(name => /^like$/i.test(name));
    const wantsDislike = names.some(name => /^dislike$/i.test(name));
    const wantsComment = names.some(name => /^comments?$/i.test(name));
    const active = document.querySelector('ytd-reel-video-renderer[is-active]')
      || document.querySelector('#shorts-player')
      || document;
    const roots = active === document ? [document] : [active, document];

    const directSelectors = [];
    if (wantsLike) directSelectors.push('#like-button button', '#like-button [role="button"]', 'button[aria-label*="like this video" i]');
    if (wantsDislike) directSelectors.push('#dislike-button button', '#dislike-button [role="button"]', 'button[aria-label*="dislike this video" i]');
    if (wantsComment) directSelectors.push('#comments-button button', '#comments-button [role="button"]', 'button[aria-label*="comment" i]');

    for (const root of roots) {
      for (const selector of directSelectors) {
        for (const el of root.querySelectorAll(selector)) {
          const text = textFor(el);
          if (blocked.some(name => new RegExp(`\\b${name}\\b`, 'i').test(text))) continue;
          if (click(el)) return true;
        }
      }
    }

    const buttons = roots
      .flatMap(root => [...root.querySelectorAll('button, yt-button-shape button, [role="button"]')])
      .filter((button, index, all) => all.indexOf(button) === index);
    const control = buttons.find(button => {
      if (!visible(button)) return false;
      const text = textFor(button);
      return names.some(name => new RegExp(`\\b${name}\\b`, 'i').test(text))
        && !blocked.some(name => new RegExp(`\\b${name}\\b`, 'i').test(text));
    });
    if (!control) return false;
    return click(control);
  }, { names, blocked }).catch(() => false);
}

async function clickActiveShortSubscribe(page) {
  return page.evaluate(() => {
    const visible = el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const active = document.querySelector('ytd-reel-video-renderer[is-active]')
      || document.querySelector('#shorts-player')
      || document;
    const buttons = [...active.querySelectorAll('button, yt-button-shape button, [role="button"]')];
    const subscribe = buttons.find(button => {
      if (!visible(button)) return false;
      const text = `${button.textContent || ''} ${button.getAttribute('aria-label') || ''}`;
      return /\bsubscribe\b/i.test(text) && !/\bsubscribed\b|\bunsubscribe\b/i.test(text);
    });
    if (!subscribe) return false;
    subscribe.scrollIntoView({ block: 'center' });
    subscribe.click();
    return true;
  }).catch(() => false);
}

async function openActiveShortComments(page) {
  if (await clickActiveShortControl(page, ['comment', 'comments'], [])) return true;
  return page.evaluate(() => {
    const active = document.querySelector('ytd-reel-video-renderer[is-active]')
      || document.querySelector('#shorts-player')
      || document;
    const buttons = [...active.querySelectorAll('button, yt-button-shape button, [role="button"]')];
    const comment = buttons.find(button => {
      const text = `${button.textContent || ''} ${button.getAttribute('aria-label') || ''}`;
      return button.offsetParent !== null && /comment/i.test(text);
    });
    if (!comment) return false;
    comment.click();
    return true;
  }).catch(() => false);
}

async function watchActiveShortBeforeEngagement(page, plan) {
  const startedAt = Date.now();
  const maxWatchMs = rand(22000, 42000);
  let sawVideoClock = false;

  while (!overtime(plan) && Date.now() - startedAt < maxWatchMs) {
    const state = await page.evaluate(() => {
      const active = document.querySelector('ytd-reel-video-renderer[is-active]')
        || document.querySelector('#shorts-player')
        || document;
      const video = active.querySelector('video') || document.querySelector('video');
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

  if (!sawVideoClock) await sleep(rand(12000, 24000));
  await sleep(rand(800, 2500)); // small human pause after viewing, before reacting
  return {
    watchedMs: Date.now() - startedAt,
    usedVideoClock: sawVideoClock,
  };
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
  const events = []; let shorts = 0; let likes = 0; let dislikes = 0; let subscribes = 0;
  const likeQuota = plan.likeOnShorts || 0;
  const dislikeQuota = plan.dislikeOnShorts || 0;
  const subQuota = plan.subscribeOnShorts || 0;
  const strictQuotas = !!plan.strictQuotas;
  try { await page.goto('https://www.youtube.com/shorts', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.shorts; i++) {
    if (overtime(plan)) break;
    const watch = await watchActiveShortBeforeEngagement(page, plan);
    events.push(makeEvent('shortWatch', {
      onShort: i,
      watchedSec: Math.round(watch.watchedMs / 1000),
      fullWatchSignal: watch.usedVideoClock,
    }));

    // like some shorts, spread out (probabilistic so it's not the first N)
    const didLike = likes < likeQuota && (strictQuotas || Math.random() < 0.5)
      ? await clickActiveShortControl(page, ['like'], ['dislike', 'unlike'])
      : false;
    if (didLike) {
      likes++;
      events.push(makeEvent('like', { onShort: i }));
      await sleep(rand(1500, 4000));
    }
    // dislike stays opt-in for one-off tasks; daily warmup does not request it.
    const canDislikeThisShort = !strictQuotas || !didLike;
    if (canDislikeThisShort && dislikes < dislikeQuota && (strictQuotas || Math.random() < 0.5)) {
      const ok = await clickActiveShortControl(page, ['dislike'], ['remove']);
      if (ok) { dislikes++; events.push(makeEvent('dislike', { onShort: i })); await sleep(rand(1500, 4000)); }
    }
    // subscribe rarely
    if (subscribes < subQuota && (strictQuotas || Math.random() < 0.3)) {
      const ok = await clickActiveShortSubscribe(page);
      if (ok) { subscribes++; events.push(makeEvent('subscribe', { onShort: i })); await sleep(rand(1500, 4000)); }
    }

    await page.keyboard.press('ArrowDown').catch(() => {});
    shorts++;
  }
  events.push(makeEvent('shorts', { count: shorts, likes, dislikes, subscribes }));
  return { shorts, likes, dislikes, subscribes, events };
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
    await watchActiveShortBeforeEngagement(page, plan);
    const text = shuffled(DEFAULT_COMMENTS)[0];
    await openActiveShortComments(page);
    await sleep(rand(1200, 2500));
    const ok = await page.evaluate((value) => {
      const input = [...document.querySelectorAll('#contenteditable-root[contenteditable="true"], div[contenteditable="true"], textarea')]
        .find(el => el.offsetParent !== null);
      if (!input) return false;
      input.focus();
      document.execCommand('insertText', false, value);
      const submit = [...document.querySelectorAll('button, yt-button-shape button')]
        .find(b => {
          const text = `${b.textContent || ''} ${b.getAttribute('aria-label') || ''}`;
          return b.offsetParent !== null && /comment|post|send/i.test(text) && !b.disabled;
        });
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
