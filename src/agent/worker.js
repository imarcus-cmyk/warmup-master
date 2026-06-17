// "Warmup social profiles" — the worker agent. The Warmup (manager) agent hands
// it a free-text action request; it resolves the named actor profile, opens that
// GoLogin browser, performs the targeted actions, logs the run, and returns a
// structured result the manager posts back to Slack.
//
// CLI:  node src/agent/worker.js "use Tiktok June 9 to go to @handle, watch 2 videos, follow 2 channels, like 1 video"
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { connectWithRetry, stopProfile } from '../core/gologin.js';
import { checkHealth } from '../core/health.js';
import { rand, sleep, SESSION_MIN_MS, SESSION_MAX_MS } from '../core/util.js';
import { writeRunLog } from '../core/runLog.js';
import { parseRequest, resolveActor } from './parse.js';
import { acquireLock, releaseLock } from './lock.js';
import { runTikTokTask } from './tasks/tiktokTask.js';
import { runInstagramTask } from './tasks/instagramTask.js';
import { runTwitterTask } from './tasks/twitterTask.js';
import { runYouTubeTask } from './tasks/youtubeTask.js';
import { runRedditTask } from './tasks/redditTask.js';
import tiktok from '../platforms/tiktok.js';
import instagram from '../platforms/instagram.js';
import twitter from '../platforms/twitter.js';
import youtube from '../platforms/youtube.js';
import reddit from '../platforms/reddit.js';

// platformKey -> { def, home, run(page, task) }. Every platform supports a
// feed/default fallback, so a target @handle is optional.
const HANDLERS = {
  tiktok: { def: tiktok, home: tiktok.home, run: runTikTokTask },
  instagram: { def: instagram, home: instagram.home, run: runInstagramTask },
  twitter: { def: twitter, home: twitter.home, run: runTwitterTask },
  youtube: { def: youtube, home: youtube.home, run: runYouTubeTask },
  reddit: { def: reddit, home: reddit.home, run: runRedditTask },
};

function summarize(result) {
  const m = result.metrics || {};
  const parts = [
    (m.watches || m.reels || m.shorts) && `${m.watches || m.reels || m.shorts} watched`,
    m.likes && `${m.likes} liked`,
    m.upvotes && `${m.upvotes} upvoted`,
    m.follows && `${m.follows} followed`,
    m.subscribes && `${m.subscribes} subscribed`,
    m.joins && `${m.joins} joined`,
    m.profileViews && `${m.profileViews} profiles viewed`,
    m.bookmarks && `${m.bookmarks} bookmarked`,
    m.reads && `${m.reads} read`,
    m.scrolls && `${m.scrolls} scrolled`,
    m.searches && `${m.searches} searched`,
  ].filter(Boolean);
  return parts.join(', ') || 'no actions completed';
}

// Run a parsed task on the resolved actor. Returns the run-log result shape.
async function execute(actor, handler, task) {
  const result = {
    platform: handler.def.label,
    name: actor.name,
    profileId: actor.profileId,
    kind: 'one-off-task',
    targets: task.targets,
    requested: task.counts,
    status: 'failed',
    metrics: {},
    events: [],
    error: null,
  };

  let browser;
  try {
    const session = await connectWithRetry(actor.profileId, actor.name, handler.home);
    browser = session.browser;
    const page = session.page;
    result.attempts = session.attempts;

    const sessionMs = rand(SESSION_MIN_MS, SESSION_MAX_MS);
    const deadlineAt = Date.now() + sessionMs;
    task._deadlineAt = deadlineAt;

    // Health is ADVISORY for one-off tasks — the user named this profile on
    // purpose, so we note any warning but still attempt the requested actions
    // (the warmup scheduler keeps the hard gate; this is user-driven).
    const health = await checkHealth(page, handler.def);
    if (!health.ok) {
      result.healthWarning = health.reason;
      result.events.push({ action: 'healthCheck', warning: health.reason, at: new Date().toISOString() });
    }

    await sleep(rand(2000, 4000));
    const { metrics, events, notes } = await handler.run(page, task);
    result.metrics = metrics;
    result.events = events;
    result.notes = notes || [];
    result.status = 'ok';
  } catch (err) {
    result.error = err.message;
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
    await stopProfile(actor.profileId);
  }
  return result;
}

// Main entry the manager calls. Returns { ok, message, result? }.
export async function runActionRequest(text) {
  const task = parseRequest(text);

  if (!task.platformKey) {
    return { ok: false, message: "I couldn't tell which platform you mean. Name it, e.g. `... on TikTok ...`." };
  }
  const handler = HANDLERS[task.platformKey];
  if (!handler) {
    return { ok: false, message: `One-off tasks aren't wired for *${task.platformKey}* yet.` };
  }
  const total = Object.values(task.counts).reduce((a, b) => a + (b || 0), 0);
  if (!total) {
    return { ok: false, message: 'No actions found. Try `like 2, follow 1, watch 3` (or subscribe/upvote/join/read).' };
  }

  const { actor, reason } = await resolveActor(text, task.platformKey);
  if (!actor) {
    return { ok: false, message: `I won't act — couldn't confidently match the profile you named (${reason}). I never fall back to another account. Name it exactly, e.g. \`Instagram June 17\`.` };
  }

  const lock = await acquireLock(actor.profileId, 'warmup-social-profiles');
  if (!lock.ok) {
    return { ok: false, message: `*${actor.name}* is busy (locked by ${lock.heldBy} since ${lock.since}). Try again shortly.` };
  }

  try {
    const result = await execute(actor, handler, task);
    await writeRunLog({ platform: handler.def.label, agent: 'warmup-social-profiles', results: [result] });

    if (result.status === 'ok') {
      const tgt = task.targets[0] ? ` on @${task.targets[0]}` : '';
      const warn = result.healthWarning ? ` :warning: (health signal: ${result.healthWarning} — acted anyway as you named this profile)` : '';
      const noteLines = (result.notes || []).length ? '\n' + result.notes.map(n => `   • ${n}`).join('\n') : '';
      return { ok: true, result, message: `:white_check_mark: *${actor.name}* (${handler.def.label})${tgt} — ${summarize(result)}.${warn}${noteLines}` };
    }
    if (result.status === 'blocked') {
      return { ok: false, result, message: `:warning: *${actor.name}* reached but unusable: ${result.blockReason}.` };
    }
    return { ok: false, result, message: `:x: *${actor.name}* task failed: ${result.error || 'unknown error'}.` };
  } finally {
    await releaseLock(actor.profileId);
  }
}

// CLI
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = process.argv.slice(2).join(' ');
  if (!text) {
    console.error('usage: node src/agent/worker.js "<request>"');
    process.exit(1);
  }
  runActionRequest(text).then(r => {
    console.log(r.message);
    process.exitCode = r.ok ? 0 : 1;
  }).catch(err => {
    console.error('worker error:', err);
    process.exitCode = 1;
  });
}
