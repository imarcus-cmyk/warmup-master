// Daily profile discovery. Pulls the live GoLogin profile list and maps each to
// a warmup account for its platform. New profiles are picked up automatically —
// no code change needed when you add a profile in GoLogin.
//
// Platform is decided by folder first (Instagram/Tiktok/Twitter/Reddit/Youtube),
// then by a keyword in the profile name as fallback.
//
// wokeUpAt = the profile's createdAt (stable across days → consistent day count
// without storing state). mode is derived from age: a profile older than
// `graduateDays` that we treat as already-warm becomes 'maintained', otherwise
// 'freshNew'. Per-profile overrides (niches, forced mode) come from each
// platform's static `accounts` seed, matched by profileId.
import { token, activeDays } from './util.js';

const KEYWORDS = {
  instagram: ['instagram', 'insta', ' ig'],
  tiktok: ['tiktok', 'tik tok', 'tik-tok'],
  twitter: ['twitter', ' x ', 'x.com', 'tweet'],
  youtube: ['youtube', 'yt '],
  reddit: ['reddit'],
};

export function classify(profile) {
  const folder = (profile.folders || [])[0];
  if (folder) {
    const f = folder.toLowerCase();
    for (const key of Object.keys(KEYWORDS)) if (f.includes(key)) return key;
  }
  const name = ` ${(profile.name || '').toLowerCase()} `;
  for (const [key, kws] of Object.entries(KEYWORDS)) {
    if (kws.some(k => name.includes(k))) return key;
  }
  return null;
}

let _cache = null;
// GoLogin v2 paginates at a fixed 30 profiles/page (the `limit` param is
// ignored). Page until we've collected allProfilesCount — otherwise profiles
// past the first page silently vanish from the cycle and never warm.
export async function fetchProfiles({ refresh = false } = {}) {
  if (_cache && !refresh) return _cache;
  const all = [];
  let page = 1;
  let total = Infinity;
  while (all.length < total) {
    const res = await fetch(`https://api.gologin.com/browser/v2?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`GoLogin profile list failed: ${res.status}`);
    const data = await res.json();
    const batch = data.profiles || (Array.isArray(data) ? data : []);
    if (!batch.length) break;
    all.push(...batch);
    total = Number.isFinite(data.allProfilesCount) ? data.allProfilesCount : all.length;
    page += 1;
  }
  _cache = all;
  return _cache;
}

// Return the warmup accounts for one platform, discovered live.
export async function discoverAccounts(platformKey, { graduateDays = 21, overrides = [], refresh = false } = {}) {
  const profiles = await fetchProfiles({ refresh });
  const ovById = new Map(overrides.map(o => [o.profileId, o]));

  const accounts = [];
  for (const p of profiles) {
    if (classify(p) !== platformKey) continue;
    const wokeUpAt = p.createdAt || new Date().toISOString();
    const age = activeDays(wokeUpAt);
    const ov = ovById.get(p.id) || {};
    accounts.push({
      profileId: p.id,
      name: p.name || `pf-${p.id.slice(-4)}`,
      wokeUpAt,
      mode: ov.mode || (age >= graduateDays ? 'maintained' : 'freshNew'),
      niches: ov.niches && ov.niches.length ? ov.niches : [],
    });
  }
  // stable order: oldest first
  accounts.sort((a, b) => new Date(a.wokeUpAt) - new Date(b.wokeUpAt));
  return accounts;
}

// Profiles that match NO platform (folder + name both fail classify). These are
// silently skipped by every platform run, so surface them for a human to fix
// (rename the profile or move it into a platform-named folder).
export async function findUnclassified() {
  const profiles = await fetchProfiles();
  return profiles
    .filter(p => classify(p) === null)
    .map(p => ({
      id: p.id,
      name: p.name || `pf-${p.id.slice(-4)}`,
      folder: (p.folders || [])[0] || '(no folder)',
    }));
}
