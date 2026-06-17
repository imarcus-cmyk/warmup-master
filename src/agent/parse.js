// Request parser for the "Warmup social profiles" worker. Turns a free-text
// Slack request into a structured task:
//   { platformKey, actorQuery, targets:[handle], counts:{watch,like,follow,view} }
// Deterministic — no LLM. Counts accept digits ("2") and number words ("two").
import { discoverAccounts } from '../core/discover.js';
import twitter from '../platforms/twitter.js';
import youtube from '../platforms/youtube.js';
import tiktok from '../platforms/tiktok.js';
import reddit from '../platforms/reddit.js';
import instagram from '../platforms/instagram.js';

const PLATFORMS = [twitter, youtube, tiktok, reddit, instagram];

const WORD_NUM = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function norm(value) {
  return String(value || '').toLowerCase();
}

export function platformKey(text) {
  const t = norm(text);
  for (const def of PLATFORMS) {
    const aliases = [def.key, def.label.toLowerCase(), def.label.toLowerCase().replace(/\s+/g, '')];
    if (aliases.some(a => t.includes(a))) return def.key;
  }
  if (/\btiktok\b|\btik tok\b/.test(t)) return 'tiktok';
  if (/\byt\b|youtube/.test(t)) return 'youtube';
  if (/\big\b|insta/.test(t)) return 'instagram';
  if (/\bx\.com\b|\bx\b|twitter|tweet/.test(t)) return 'twitter';
  return null;
}

const NUM = `\\d{1,2}|${Object.keys(WORD_NUM).join('|')}`;

// Count is anchored on the ACTION verb, never the object noun — so "like one
// video" doesn't bleed into the watch count, and digits in a profile name
// ("June 8") can't be misread as a count. Matches "<verb> <number>", allowing
// a filler word in between ("watch the 2 videos").
function countFor(text, verbs) {
  const t = norm(text);
  let present = false;
  for (const verb of verbs) {
    if (new RegExp(`\\b${verb}(?:s|es|ed|ing)?\\b`, 'i').test(t)) present = true;
    const re = new RegExp(`\\b${verb}(?:s|es|ed)?\\b(?:\\s+\\w+){0,1}\\s+(${NUM})\\b`, 'i');
    const m = t.match(re);
    if (m) {
      const raw = m[1];
      const n = /^\d+$/.test(raw) ? Number(raw) : WORD_NUM[raw];
      if (n != null) return Math.max(0, Math.min(20, n));
    }
  }
  // Verb named but no explicit number ("like and follow") → do it once.
  return present ? 1 : 0;
}

// Pull explicit @handles and tiktok.com/@handle URLs out of the text.
export function extractTargets(text) {
  const handles = new Set();
  for (const m of String(text).matchAll(/@([a-z0-9._]{2,40})/gi)) handles.add(m[1].toLowerCase());
  for (const m of String(text).matchAll(/(?:tiktok\.com|youtube\.com|instagram\.com|x\.com|twitter\.com)\/@?([a-z0-9._]{2,40})/gi)) {
    handles.add(m[1].toLowerCase());
  }
  return [...handles];
}

export function parseCounts(text) {
  return {
    watch: countFor(text, ['watch']),
    like: countFor(text, ['like']),
    follow: countFor(text, ['follow']),
    subscribe: countFor(text, ['subscribe']),
    view: countFor(text, ['view', 'visit']),
    upvote: countFor(text, ['upvote', 'upvotes']),
    join: countFor(text, ['join']),
    search: countFor(text, ['search']),
    scroll: countFor(text, ['scroll', 'browse']),
    bookmark: countFor(text, ['bookmark']),
    read: countFor(text, ['read']),
  };
}

function tokenize(s) {
  return norm(s).split(/[^a-z0-9]+/).filter(Boolean);
}

// All digit-groups in a string, ordinal-safe: "June 8th" → ['8'],
// "June 16 2" → ['16','2'], "Reddit 12.5.26" → ['12','5','26'].
function digits(s) {
  return norm(s).match(/\d+/g) || [];
}

const PLATFORM_TOKENS = new Set([
  'twitter', 'x', 'tweet', 'instagram', 'ig', 'insta', 'tiktok', 'tik', 'tok',
  'youtube', 'yt', 'reddit',
]);
const FILLER_TOKENS = new Set([
  'go', 'to', 'the', 'on', 'in', 'into', 'onto', 'at', 'use', 'using', 'used',
  'have', 'has', 'had', 'get', 'got', 'please', 'pls', 'open', 'head', 'navigate',
  'profile', 'account', 'can', 'you', 'could', 'would', 'hey', 'lets', 'let',
  'a', 'an', 'of', 'for', 'with',
]);
// First action word ends the profile-name portion of the request.
const ACTION_TOKENS = new Set([
  'do', 'did', 'does', 'perform', 'performs', 'performed', 'make', 'run',
  'watch', 'watches', 'watched', 'like', 'likes', 'liked', 'follow', 'follows',
  'followed', 'following', 'subscribe', 'subscribes', 'subscribed', 'view',
  'views', 'viewed', 'visit', 'visits', 'visited', 'upvote', 'upvotes', 'upvoted',
  'join', 'joins', 'joined', 'read', 'reads', 'scroll', 'scrolls', 'scrolled',
  'browse', 'browses', 'search', 'searches', 'bookmark', 'bookmarks',
  'and', 'then', 'also', 'plus',
]);

// The profile-name tokens the user typed, with the platform word and filler
// stripped: "go to Twitter June 2 do 1 follow" → ['june','2']. Stops at the
// first action word so action counts never leak into the name.
// Normalize ordinals so "8th" and "8" compare equal: "8th"→"8", "1st"→"1".
function deOrdinal(t) {
  const m = t.match(/^(\d+)(?:st|nd|rd|th)$/);
  return m ? m[1] : t;
}

function profileRef(text) {
  const out = [];
  for (const t of tokenize(text)) {
    if (ACTION_TOKENS.has(t)) break;
    if (PLATFORM_TOKENS.has(t) || FILLER_TOKENS.has(t)) continue;
    out.push(deOrdinal(t));
  }
  return out;
}

// A profile name reduced to the same comparable form (platform word stripped,
// ordinals normalized): "Twitter June 2 2" → ['june','2','2'],
// "Instagram June 8th" → ['june','8'], "Instagram haleyc_wagner" → ['haleyc','wagner'].
function nameRef(name) {
  return tokenize(name).filter(t => !PLATFORM_TOKENS.has(t)).map(deOrdinal);
}

function seqEqual(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// Token-based, number-aware. Profile names differ mainly by a day number
// ("June 17" vs "June 1"), so the number is decisive: matching day numbers add
// a lot, conflicting day numbers disqualify. Substring matching is avoided —
// "june 1" is a substring of "june 17" and would mis-match.
function scoreActor(text, account) {
  const q = tokenize(text);
  const qSet = new Set(q);
  const n = tokenize(account.name);
  let score = 0;
  let hits = 0;
  for (const tok of n) {
    if (qSet.has(tok)) { score += tok.length >= 3 ? tok.length : 5; hits++; }
  }
  if (n.length && hits === n.length) score += 50; // every name token present

  const qNums = digits(text);
  const nNums = digits(account.name);
  if (qNums.length && nNums.length) {
    const inter = nNums.filter(x => qNums.includes(x));
    if (inter.length) score += 40 * inter.length;
    else score -= 100; // both name and query have numbers, none match → wrong profile
  }
  if (account.profileId && norm(text).includes(account.profileId.slice(-6))) score += 60;
  return score;
}

// Resolve which of OUR GoLogin profiles runs the actions, from the named text.
// Returns { actor } on a confident match, or { actor: null, reason } — it NEVER
// guesses a near-match. When the request names a number ("June 17") the chosen
// profile MUST carry that exact number; otherwise it refuses rather than wander
// to another account. A top-score tie also refuses (ambiguous).
export async function resolveActor(text, key) {
  let accounts = [];
  try {
    const def = PLATFORMS.find(d => d.key === key);
    accounts = await discoverAccounts(key, { overrides: def?.accounts || [], refresh: true });
  } catch {
    const def = PLATFORMS.find(d => d.key === key);
    accounts = def?.accounts || [];
  }

  // Exact name match: the profile-name tokens the user typed must equal a
  // profile's name tokens exactly (order included). This is what keeps
  // "Twitter June 2" from matching "Twitter June 2 2", even when an action count
  // ("2 likes") repeats the number. We never fall back to a near profile.
  const ref = profileRef(text);
  let pool = accounts;
  if (ref.length) {
    pool = accounts.filter(a => seqEqual(ref, nameRef(a.name)));
    if (!pool.length) {
      return { actor: null, reason: `no ${key} profile matching "${ref.join(' ')}"` };
    }
  }

  const scored = pool
    .map(a => ({ a, s: scoreActor(text, a) }))
    .sort((x, y) => y.s - x.s);

  if (!scored.length || scored[0].s < 20) return { actor: null, reason: 'no confident match' };
  if (scored[1] && scored[0].s === scored[1].s) {
    return { actor: null, reason: `ambiguous: ${scored[0].a.name} vs ${scored[1].a.name}` };
  }
  return { actor: { ...scored[0].a, platformKey: key } };
}

// Full parse → structured task. `actor` resolution is async (hits GoLogin), so
// the worker calls resolveActor separately when it needs the live roster.
export function parseRequest(text) {
  const key = platformKey(text);
  return {
    raw: String(text || '').trim(),
    platformKey: key,
    targets: extractTargets(text),
    counts: parseCounts(text),
  };
}
