// Action helpers. Each returns { count, events }. Humanize all timings.
import { makeEvent } from './runLog.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

const DEFAULT_TOPICS = ['interesting discussion', 'helpful advice'];

function shuffled(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

function topicPool(topics = []) {
  return topics.length ? topics : DEFAULT_TOPICS;
}

// Click first button/link whose text or aria-label matches any pattern.
async function clickByText(page, patterns) {
  return page.evaluate(patterns => {
    const els = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"]'));
    const found = els.find(el => {
      const text = (el.textContent || '').trim();
      const label = el.getAttribute('aria-label') || '';
      return patterns.some(p => new RegExp(p, 'i').test(text) || new RegExp(p, 'i').test(label));
    });
    if (!found) return false;
    found.click();
    return true;
  }, patterns).catch(() => false);
}

export async function searchPlatformTopics(page, topics, target) {
  const events = [];
  let count = 0;
  for (const topic of shuffled(topicPool(topics)).slice(0, target)) {
    // ...navigate/type/search for `topic`, settle with rand() delays...
    events.push(makeEvent('search', { query: topic }));
    count++;
    await sleep(rand(3000, 6000));
  }
  return { count, events };
}
