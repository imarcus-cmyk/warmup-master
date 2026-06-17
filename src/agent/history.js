import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import twitter from '../platforms/twitter.js';
import youtube from '../platforms/youtube.js';
import tiktok from '../platforms/tiktok.js';
import reddit from '../platforms/reddit.js';
import instagram from '../platforms/instagram.js';
import { discoverAccounts } from '../core/discover.js';

const LOG_DIR = path.resolve('logs');
const PLATFORMS = [twitter, youtube, tiktok, reddit, instagram];

const STATUS_ICON = {
  ok: ':white_check_mark:',
  blocked: ':warning:',
  failed: ':x:',
  skipped: ':fast_forward:',
};

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9@#._-]+/g, ' ')
    .trim();
}

function words(value) {
  return norm(value).split(/\s+/).filter(w => w.length >= 3);
}

function platformKey(value) {
  const text = norm(value);
  for (const def of PLATFORMS) {
    const aliases = [def.key, def.label, def.label.replace(/\s+/g, '')].map(norm);
    if (aliases.some(alias => text.includes(alias))) return def.key;
  }
  if (text.includes('yt')) return 'youtube';
  if (text.includes('ig') || text.includes('insta')) return 'instagram';
  if (text.includes('x.com') || /\bx\b/.test(text)) return 'twitter';
  return null;
}

function defForKey(key) {
  return PLATFORMS.find(def => def.key === key);
}

function allKnownAccounts() {
  const byId = new Map();
  for (const def of PLATFORMS) {
    for (const account of def.accounts || []) {
      byId.set(account.profileId, {
        ...account,
        platformKey: def.key,
        platform: def.label,
      });
    }
  }
  return [...byId.values()];
}

async function liveAccountsForPlatform(key) {
  const def = defForKey(key);
  if (!def) return [];
  try {
    const accounts = await discoverAccounts(key, { overrides: def.accounts || [], refresh: true });
    return accounts.map(account => ({
      ...account,
      platformKey: def.key,
      platform: def.label,
      source: 'gologin',
    }));
  } catch {
    return [];
  }
}

function mergeAccounts(accounts) {
  const byId = new Map();
  for (const account of accounts) {
    if (!account?.profileId) continue;
    byId.set(account.profileId, { ...(byId.get(account.profileId) || {}), ...account });
  }
  return [...byId.values()];
}

async function loadRunLogs() {
  let files = [];
  try {
    files = await readdir(LOG_DIR);
  } catch {
    return [];
  }

  const logs = [];
  for (const file of files.filter(f => f.endsWith('.json')).sort()) {
    try {
      const raw = await readFile(path.join(LOG_DIR, file), 'utf8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data.results)) continue;
      logs.push({ ...data, file });
    } catch {
      // Ignore malformed or partial log files. The agent can still answer from the rest.
    }
  }
  return logs.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
}

function flattenResults(logs) {
  return logs.flatMap(log => (log.results || []).map(result => ({
    ...result,
    platform: result.platform || log.platform,
    generatedAt: log.generatedAt,
    logFile: log.file,
  }))).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
}

function scoreAccount(text, account) {
  const query = norm(text);
  const name = norm(account.name);
  let score = 0;
  if (query.includes(name)) score += 100;
  if (account.profileId && query.includes(account.profileId.toLowerCase())) score += 100;
  if (account.profileId && query.includes(account.profileId.slice(-6).toLowerCase())) score += 40;
  if (platformKey(query) && platformKey(query) === account.platformKey) score += 10;
  for (const word of words(account.name)) {
    if (query.includes(word)) score += word.length;
  }
  return score;
}

function findAccount(text, results, extraAccounts = []) {
  const accounts = new Map();
  for (const account of allKnownAccounts()) accounts.set(account.profileId, account);
  for (const account of extraAccounts) accounts.set(account.profileId, account);
  for (const r of results) {
    if (!accounts.has(r.profileId)) {
      accounts.set(r.profileId, {
        profileId: r.profileId,
        name: r.name,
        platform: r.platform,
        platformKey: norm(r.platform),
      });
    }
  }

  const scored = [...accounts.values()]
    .map(account => ({ account, score: scoreAccount(text, account) }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 20 ? scored[0].account : null;
}

function countFromText(text, fallback = 5) {
  const match = String(text).match(/\b(?:last|past|previous)\s+(\d{1,2})\b/i)
    || String(text).match(/\b(\d{1,2})\s+(?:runs?|days?)\b/i);
  if (!match) return fallback;
  return Math.max(1, Math.min(14, Number(match[1]) || fallback));
}

function formatDate(iso) {
  if (!iso) return 'unknown time';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function formatMetrics(metrics = {}) {
  const parts = [];
  const labels = {
    watches: 'fyp',
    shorts: 'shorts',
    reels: 'reels',
    scrolls: 'scrolls',
    searches: 'searches',
    likes: 'likes',
    dislikes: 'dislikes',
    follows: 'follows',
    followBacks: 'followbacks',
    subscribes: 'subs',
    profileViews: 'profile views',
    storyViews: 'stories',
    notificationsOpened: 'notifications',
  };
  for (const [key, label] of Object.entries(labels)) {
    const value = metrics[key];
    if (typeof value === 'number' && value > 0) parts.push(`${value} ${label}`);
  }
  return parts.join(', ');
}

function formatResultLine(result) {
  const icon = STATUS_ICON[result.status] || ':grey_question:';
  const metrics = formatMetrics(result.metrics);
  const note = result.blockReason || result.error || '';
  const details = [metrics, note].filter(Boolean).join(' - ');
  return `• ${formatDate(result.generatedAt)} ${icon} ${result.status}${details ? ` - ${details}` : ''}`;
}

function profileHistory(account, results, count) {
  const runs = results
    .filter(r => r.profileId === account.profileId
      || norm(r.name) === norm(account.name))
    .slice(0, count);

  if (!runs.length) {
    const platformRuns = results.filter(r => norm(r.platform) === norm(account.platform));
    const latestPlatformRun = platformRuns[0];
    const lines = [
      `I know *${account.name}* (${account.platform}), but I do not see this profile in the local run history yet.`,
    ];
    if (account.wokeUpAt) lines.push(`Configured wake-up date: ${formatDate(account.wokeUpAt)}.`);
    if (account.mode) lines.push(`Configured mode: ${account.mode}.`);
    if (latestPlatformRun) {
      lines.push('');
      lines.push(`Latest ${account.platform} log I do have:`);
      lines.push(`• ${latestPlatformRun.name}: ${latestPlatformRun.status}${formatMetrics(latestPlatformRun.metrics) ? ` - ${formatMetrics(latestPlatformRun.metrics)}` : ''}`);
    }
    return lines.join('\n');
  }

  const ok = runs.filter(r => r.status === 'ok').length;
  const latest = runs[0];
  return [
    `*${latest.name || account.name}* (${latest.platform || account.platform})`,
    `Last ${runs.length} run(s): ${ok}/${runs.length} ok. Latest status: *${latest.status}*.`,
    ...runs.map(formatResultLine),
  ].join('\n');
}

async function platformSummary(key, results) {
  const def = defForKey(key);
  const label = def?.label || key;
  const knownAccounts = mergeAccounts([
    ...(def?.accounts || []).map(account => ({
      ...account,
      platformKey: key,
      platform: label,
      source: 'config',
    })),
    ...(await liveAccountsForPlatform(key)),
  ]);

  const runs = results.filter(r => norm(r.platform) === key || norm(r.platform) === norm(PLATFORMS.find(p => p.key === key)?.label));

  const latestByProfile = new Map();
  for (const run of runs) {
    if (!latestByProfile.has(run.profileId)) latestByProfile.set(run.profileId, run);
  }

  const ids = new Set([
    ...knownAccounts.map(account => account.profileId),
    ...latestByProfile.keys(),
  ]);
  if (!ids.size) return `I do not see recent logs or live GoLogin profiles for *${label}* yet.`;

  const rows = [...ids].map(profileId => {
    const account = knownAccounts.find(a => a.profileId === profileId);
    const run = latestByProfile.get(profileId);
    return {
      profileId,
      name: run?.name || account?.name || `pf-${profileId.slice(-4)}`,
      run,
      account,
    };
  }).sort((a, b) => {
    if (a.run && !b.run) return -1;
    if (!a.run && b.run) return 1;
    if (a.run && b.run) return new Date(b.run.generatedAt) - new Date(a.run.generatedAt);
    return String(a.name).localeCompare(String(b.name));
  });

  const ok = rows.filter(row => row.run?.status === 'ok').length;
  const warmed = rows.filter(row => row.run).length;
  const noHistory = rows.length - warmed;
  return [
    `*${label}* profile status: ${ok}/${rows.length} ok${noHistory ? `, ${noHistory} no run history yet` : ''}.`,
    ...rows.map(row => {
      if (!row.run) return `• ${row.name}: no run history yet`;
      const icon = STATUS_ICON[row.run.status] || ':grey_question:';
      const metrics = formatMetrics(row.run.metrics);
      return `• ${row.name}: ${icon} ${row.run.status}${metrics ? ` - ${metrics}` : ''}`;
    }),
  ].join('\n');
}

function issuesSummary(results, count) {
  const issues = results
    .filter(r => ['failed', 'blocked', 'skipped'].includes(r.status))
    .slice(0, count);
  if (!issues.length) return 'I do not see failed, blocked, or skipped profiles in the recent logs.';
  return [
    `Recent profiles needing attention (${issues.length}):`,
    ...issues.map(r => {
      const icon = STATUS_ICON[r.status] || ':grey_question:';
      const reason = r.blockReason || r.error || 'no reason recorded';
      return `• ${formatDate(r.generatedAt)} ${icon} ${r.name} (${r.platform}) - ${reason}`;
    }),
  ].join('\n');
}

function overview(results) {
  if (!results.length) return 'I do not see any warmup logs yet.';
  const latestByPlatform = new Map();
  for (const run of results) {
    const key = norm(run.platform);
    if (!latestByPlatform.has(key)) latestByPlatform.set(key, []);
    latestByPlatform.get(key).push(run);
  }

  const lines = ['Latest warmup snapshot:'];
  for (const [key, runs] of latestByPlatform.entries()) {
    const latestByProfile = new Map();
    for (const run of runs) {
      if (!latestByProfile.has(run.profileId)) latestByProfile.set(run.profileId, run);
    }
    const latest = [...latestByProfile.values()];
    const ok = latest.filter(r => r.status === 'ok').length;
    lines.push(`• ${key}: ${ok}/${latest.length} ok`);
  }
  return lines.join('\n');
}

export function looksLikeActionRequest(text) {
  const value = norm(text);
  const verb = /\b(use|make|have|tell|ask|run|start|open|go to|visit|watch|like|follow|subscribe|browse|upvote|join|read|scroll|search|bookmark|view)\b/.test(value);
  const object = /\b(watch|video|videos|short|shorts|reel|reels|visit|open|like|likes|follow|follows|subscribe|channel|browse|upvote|join|sub|subreddit|post|posts|tweet|story|stories|profile|account|warmup|warm)\b/.test(value);
  const readOnly = /\b(status|history|how did|how is|how are|last \d|failed|blocked|report|logs?|doing\??$)\b/.test(value);
  return verb && object && !readOnly;
}

export function helpText() {
  return [
    '*Warmup Agent* can answer read-only account questions now.',
    'Try:',
    '• `how is Youtube June 9 doing?`',
    '• `show last 5 runs for Tiktok June`',
    '• `which profiles failed recently?`',
    '• `status of youtube profiles`',
    '',
    '*One-off actions* (TikTok live; runs immediately, per-profile locked):',
    '• `use Tiktok June 9 to go to @someaccount, watch 2 videos, follow 2 channels, like 1 video`',
  ].join('\n');
}

export async function answerWarmupQuestion(text) {
  const clean = String(text || '').trim();
  if (!clean || /\bhelp\b/i.test(clean)) return helpText();

  const logs = await loadRunLogs();
  const results = flattenResults(logs);
  if (!results.length) return 'I do not see any warmup logs yet.';

  const count = countFromText(clean);
  if (/\b(failed|failure|blocked|problem|problems|error|errors|skipped|attention)\b/i.test(clean)) {
    return issuesSummary(results, count);
  }

  const key = platformKey(clean);
  const liveAccounts = key ? await liveAccountsForPlatform(key) : [];
  const account = findAccount(clean, results, liveAccounts);
  if (account) return profileHistory(account, results, count);

  if (key) return platformSummary(key, results);

  return overview(results);
}
