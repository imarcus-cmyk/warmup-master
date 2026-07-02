// Twitter / X action helpers. Unique to X: timeline scroll + profile views,
// strict engagement caps. Each helper returns { <metric>, events }.
import { makeEvent } from '../core/runLog.js';
import { rand, sleep, shuffled, overtime } from '../core/util.js';

const DEFAULT_TOPICS = ['tech news', 'startup', 'ai tools', 'design'];
const DEFAULT_COMMENTS = ['Nice', 'Great point', 'Interesting', 'Thanks for sharing'];
const topics = ns => (ns && ns.length ? ns : DEFAULT_TOPICS);

async function dismiss(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('div[role="button"],button')) {
      const t = (b.textContent || '').toLowerCase();
      if (/accept|allow all|not now|dismiss/.test(t)) { b.click(); break; }
    }
  }).catch(() => {});
}

async function readVisibleTweetBeforeEngagement(page, plan) {
  const startedAt = Date.now();
  await page.evaluate(() => {
    const article = [...document.querySelectorAll('article')]
      .find(a => a.offsetParent !== null);
    if (article) article.scrollIntoView({ block: 'center' });
  }).catch(() => {});
  await sleep(rand(6000, 16000));
  if (!overtime(plan) && Math.random() < 0.45) {
    await page.evaluate(() => window.scrollBy(0, 140 + Math.random() * 260)).catch(() => {});
    await sleep(rand(3000, 9000));
  }
  return Math.round((Date.now() - startedAt) / 1000);
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
    await readVisibleTweetBeforeEngagement(page);
    const ok = await page.evaluate(lbl => {
      const els = [...document.querySelectorAll(`[data-testid="${lbl}"], [aria-label*="${lbl}" i]`)]
        .filter(el => {
          const text = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`;
          return el.offsetParent !== null && !new RegExp(`un${lbl}|${lbl}d|remove`, 'i').test(text);
        });
      const el = els[Math.floor(Math.random() * els.length)];
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    }, label).catch(() => false);
    if (ok) done++;
    await sleep(rand(3000, 8000));
    await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
  }
  return done;
}

async function clickVisibleFollowButton(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-testid$="-follow"], div[role="button"], button')];
    const follow = buttons.find(b => {
      const text = (b.textContent || '').trim();
      const label = (b.getAttribute('aria-label') || '').trim();
      const visible = b.offsetParent !== null;
      return visible
        && /\bfollow\b/i.test(`${text} ${label}`)
        && !/\bfollowing\b|\bfollowers\b|\bfollowed you\b/i.test(`${text} ${label}`);
    });
    if (!follow) return false;
    follow.scrollIntoView({ block: 'center' });
    follow.click();
    return true;
  }).catch(() => false);
}

async function clickFollowFromHoverCard(page) {
  const handles = await page.$$(
    'article [data-testid="User-Name"] a[href^="/"], article a[role="link"][href^="/"]'
  ).catch(() => []);

  for (const handle of shuffled(handles).slice(0, 8)) {
    try {
      await handle.hover();
      await sleep(rand(900, 1800));
      const ok = await clickVisibleFollowButton(page);
      if (ok) return true;
    } catch {}
  }
  return false;
}

async function clickFollowFromPostMenu(page) {
  return page.evaluate(() => {
    const articles = [...document.querySelectorAll('article')].filter(a => a.offsetParent !== null);
    const article = articles.find(a => {
      const text = a.textContent || '';
      return /@[a-z0-9_]{2,15}/i.test(text) || a.querySelector('[data-testid="User-Name"]');
    }) || articles[0];
    if (!article) return false;

    const controls = [
      ...article.querySelectorAll('[data-testid="caret"], [aria-label*="More" i], [aria-label*="more" i], div[role="button"], button'),
    ];
    const menu = controls.find(b => {
      const label = b.getAttribute('aria-label') || '';
      const testid = b.getAttribute('data-testid') || '';
      return b.offsetParent !== null && (/caret/i.test(testid) || /\bmore\b/i.test(label));
    });
    if (!menu) return false;
    menu.scrollIntoView({ block: 'center' });
    menu.click();
    return true;
  }).catch(() => false).then(async opened => {
    if (!opened) return false;
    await sleep(rand(800, 1600));
    return page.evaluate(() => {
      const items = [...document.querySelectorAll('[role="menuitem"], div[role="button"], button')];
      const item = items.find(i => {
        const text = (i.textContent || '').trim();
        const label = (i.getAttribute('aria-label') || '').trim();
        return i.offsetParent !== null && /\bfollow\s+@/i.test(`${text} ${label}`);
      });
      if (!item) return false;
      item.click();
      return true;
    }).catch(() => false);
  });
}

async function followFromLoadedTwitterSurface(page) {
  if (await clickVisibleFollowButton(page)) return 'visibleButton';
  if (await clickFollowFromHoverCard(page)) return 'hoverCard';
  if (await clickFollowFromPostMenu(page)) return 'postMenu';
  return null;
}

export async function like(page, plan) {
  const events = [];
  const likes = await clickAriaN(page, 'like', plan.like);
  events.push(makeEvent('like', { count: likes }));
  return { likes, events };
}

async function openVisibleTweetPage(page) {
  return page.evaluate(() => {
    const articles = [...document.querySelectorAll('article')].filter(a => a.offsetParent !== null);
    const article = articles.find(a => a.querySelector('a[href*="/status/"]')) || articles[0];
    if (!article) return false;
    const statusLink = [...article.querySelectorAll('a[href*="/status/"]')]
      .find(a => !/\/photo\/|\/video\//i.test(a.getAttribute('href') || ''));
    if (!statusLink) return false;
    statusLink.scrollIntoView({ block: 'center' });
    statusLink.click();
    return true;
  }).catch(() => false);
}

async function likeVisibleTwitterComment(page) {
  return page.evaluate(() => {
    const articles = [...document.querySelectorAll('article')].filter(a => a.offsetParent !== null);
    for (const article of articles.slice(1)) {
      const like = [...article.querySelectorAll('[data-testid="like"], [aria-label*="like" i]')]
        .find(el => {
          const text = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`;
          return el.offsetParent !== null && !/unlike|liked|remove/i.test(text);
        });
      if (!like) continue;
      like.scrollIntoView({ block: 'center' });
      like.click();
      return true;
    }
    return false;
  }).catch(() => false);
}

export async function commentLike(page, plan) {
  const events = []; let commentLikes = 0;
  try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.commentLike; i++) {
    if (overtime(plan)) break;
    await readVisibleTweetBeforeEngagement(page, plan);
    let opened = false;
    for (let s = 0; s < 8; s++) {
      opened = await openVisibleTweetPage(page);
      if (opened) break;
      await page.evaluate(() => window.scrollBy(0, 750)).catch(() => {});
      await sleep(rand(1500, 3500));
    }
    if (!opened) {
      events.push(makeEvent('commentLike', { skipped: 'no post link found' }));
      break;
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => {});
    await sleep(rand(5000, 10000));
    let ok = false;
    for (let s = 0; s < 8; s++) {
      ok = await likeVisibleTwitterComment(page);
      if (ok) break;
      await page.evaluate(() => window.scrollBy(0, 500 + Math.random() * 500)).catch(() => {});
      await sleep(rand(1500, 3500));
    }
    if (ok) {
      commentLikes++;
      events.push(makeEvent('commentLike', { fromPostPage: true }));
    } else {
      events.push(makeEvent('commentLike', { skipped: 'comment like button not found' }));
    }
    await sleep(rand(4000, 9000));
    try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
    await dismiss(page);
    await page.evaluate(() => window.scrollBy(0, 800 + Math.random() * 700)).catch(() => {});
    await sleep(rand(1500, 3500));
  }
  return { commentLikes, events };
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
        await readVisibleTweetBeforeEngagement(page, plan);
        const method = await followFromLoadedTwitterSurface(page);
        if (method) { follows++; events.push(makeEvent('follow', { handle: h, method })); }
        else events.push(makeEvent('follow', { handle: h, skipped: 'follow control not found' }));
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
    let method = null;
    for (let s = 0; s < 10; s++) {
      await readVisibleTweetBeforeEngagement(page, plan);
      method = await followFromLoadedTwitterSurface(page);
      ok = !!method;
      if (ok) break;
      await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
      await sleep(rand(1500, 3500));
    }
    if (!ok) { events.push(makeEvent('follow', { skipped: 'no follow button found in feed' })); break; }
    follows++; events.push(makeEvent('follow', { fromFeed: true, method }));
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

export async function comment(page, plan) {
  const events = []; let comments = 0;
  try { await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  await dismiss(page);
  for (let i = 0; i < plan.comment; i++) {
    if (overtime(plan)) break;
    const text = shuffled(DEFAULT_COMMENTS)[0];
    await readVisibleTweetBeforeEngagement(page, plan);
    const ok = await page.evaluate((value) => {
      const reply = [...document.querySelectorAll('[data-testid="reply"], [aria-label*="reply" i]')]
        .find(x => x.offsetParent !== null);
      if (!reply) return false;
      reply.scrollIntoView({ block: 'center' });
      reply.click();
      const box = document.querySelector('[data-testid="tweetTextarea_0"][contenteditable="true"], div[role="textbox"][contenteditable="true"]');
      if (!box) return false;
      box.focus();
      document.execCommand('insertText', false, value);
      const send = document.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
      if (!send) return false;
      send.click();
      return true;
    }, text).catch(() => false);
    if (ok) { comments++; events.push(makeEvent('comment', { fromFeed: true })); }
    else events.push(makeEvent('comment', { skipped: 'reply box not found' }));
    await sleep(rand(5000, 10000));
    await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
  }
  return { comments, events };
}
