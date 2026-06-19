# Warmup Orchestrator — Master Guidelines (All Platforms)

This is the single source of truth for warming GoLogin browser profiles across
every platform. It defines:

1. **The shared skeleton** — identical for all platforms (connection, retry,
   deadline, retry-pass, logging, Slack). Never diverge here; CI and reporting
   depend on it.
2. **Per-platform plans** — each platform is *unique*. Different home URL, time
   budget, cron slot, action set, humanization, and a day-based ramp ("warm
   plan") that decides which actions are allowed as an account ages.

Supported platforms: **twitter (X), youtube, tiktok, reddit, instagram**.

---

## Part 1 — Shared skeleton (DO NOT change per platform)

### File layout per platform `<x>`

| File | Role |
|------|------|
| `src/<x>Accounts.js` | profile list + `get<X>ActionPlan(account)` + `log<X>Account()` |
| `src/<x>Actions.js`  | puppeteer action helpers, each returns `{ <metric>, events }` |
| `src/<x>Warmup.js`   | orchestrator (the skeleton below) |
| `.github/workflows/<x>-warmup.yml` | cron + dispatch |
| `src/slack.js`       | shared — add platform's `parts.push(...)` lines |
| `src/runLog.js`      | shared — no change |

### Orchestrator constants (must match across platforms)

- `token = process.env.GL_API_TOKEN`
- `rand(min,max)` inclusive int, `sleep(ms)` promise.
- `MAX_ATTEMPTS = 5`, `BACKOFF_MS = [5000, 15000, 45000, 90000, 180000]`.
- `GLOBAL_DEADLINE = Date.now() + N*60*1000`. **N must be below the workflow
  `timeout-minutes`** (set N = timeout − 5..10). Per-platform N in Part 2.
- `stopProfile()` — `DELETE https://api.gologin.com/browser/<id>/web` in `finally`.
- `connectWithRetry()` — fetch `cloudbrowser.gologin.com/connect`,
  `puppeteer.connect`, reuse `pages[0]`, close extras, `goto(HOME, domcontentloaded,
  60000)`, settle 3–6s. On fail: close browser, `stopProfile`, backoff, retry.
- `runAccount()` — build `result` record, gate each action on
  `allowed.includes(x)`, push `…events`, set `status='ok'`, `stopProfile` in
  `finally`.
- main loop: deadline guard → run → `failed.push` if not ok → inter-account delay
  `rand(25000,45000)`. Then one **retry pass** over `failed` (`requeued=true`,
  delay `rand(20000,35000)`). Then `writeRunLog` + `sendSlackReport`, each in its
  own try/catch.

### Action helper rules (`<x>Actions.js`)

- `import { makeEvent } from './runLog.js'`; local `sleep`/`rand`.
- Each exported helper returns `{ <metric>, events }`.
- Build events with `makeEvent('actionName', {...details})`.
- Humanize: random watch/scroll/skip timings, shuffled pools, default pools when
  account supplies none, dismiss cookie/login prompts.

### CI rules (`.github/workflows/<x>-warmup.yml`)

- `schedule` cron **staggered** (see Part 2 — no two platforms collide) +
  `workflow_dispatch`.
- `timeout-minutes` > `GLOBAL_DEADLINE` minutes. node 22, `npm ci`.
- env: `GL_API_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`,
  `SLACK_MENTION_USER_ID`.
- upload `logs/*.json` artifact with `if: always()`.

### The warm plan contract (how every `get<X>ActionPlan` works)

```
activeDays(wokeUpAt) = floor((now - wokeUpAt) / 86400000)   // age in days
phase   = label for the current ramp window
targets = per-action integers, ramped by `days` and `mode`
actions = buildActions(plan)  // push action name only when its target > 0
```

`mode` values shared by all platforms:
- `freshNew` — brand new account, ramp slowest, most conservative caps.
- `revivedOld` — dormant account being revived, ramp medium.
- `maintained` — already warm, hold at steady ceiling.

The ramp is **additive and gated**: early phases unlock low-risk read actions
(search, scroll, watch); later phases unlock engagement (like, follow, upvote,
subscribe). An action only runs when its target > 0 *and* it's in `allowed`.

> The skeleton is identical everywhere. **Everything platform-specific lives in
> Part 2.** That is the whole point of one orchestrator: same machinery, unique
> plans.

---

## Part 2 — Per-platform plans (each is unique)

Legend for ramp tables: cell = action **target** (count) for that phase.
`—` means action not allowed in that phase (excluded from `actions`).

---

### 2.1 Twitter / X

| Setting | Value |
|---------|-------|
| `HOME_URL` | `https://x.com/home` |
| `GLOBAL_DEADLINE` N | **40 min** |
| workflow `timeout-minutes` | **45** |
| cron (UTC) | `11 7 * * *` |
| Risk profile | High ban sensitivity → slowest engagement unlock |

**Unique actions** (`twitterActions.js`):
- `searchTopics(page, topics, target)` → `{ searches, events }`
- `scrollHomeFeed(page, target)` — dwell 2–6s per viewport → `{ scrolls, events }`
- `viewProfiles(page, handles, target)` → `{ profileViews, events }`
- `likeTweets(page, target)` — only on already-open feed → `{ likes, events }`
- `followAccounts(page, handles, target)` → `{ follows, events }`
- `bookmarkTweets(page, target)` → `{ bookmarks, events }`

**Warm plan ramp:**

| phase | days | search | scrollFeed | viewProfiles | like | follow | bookmark |
|-------|------|--------|-----------|--------------|------|--------|----------|
| revive-1 | 0–2  | 1 | 3 | — | — | — | — |
| revive-2 | 3–6  | 2 | 5 | 1 | 2 | — | — |
| ramp     | 7–13 | 2 | 6 | 2 | 4 | 1 | 1 |
| steady   | 14+  | 3 | 8 | 3 | 6 | 2 | 2 |

`freshNew`: shift one phase slower (use the row for `days−4`). `maintained`:
pin to `steady`. Caps: never >2 follows/run on X — strictest follow ceiling.

---

### 2.2 YouTube

| Setting | Value |
|---------|-------|
| `HOME_URL` | `https://www.youtube.com/` |
| `GLOBAL_DEADLINE` N | **110 min** |
| workflow `timeout-minutes` | **120** |
| cron (UTC) | `31 7 * * *` |
| Risk profile | Watch-time driven; long dwell is normal and desired |

**Unique actions** (`youtubeActions.js`):
- `searchVideos(page, queries, target)` → `{ searches, events }`
- `watchVideos(page, target, { minSec, maxSec })` — open result, dwell a random
  slice (ramp `minSec/maxSec` by phase), allow occasional skip → `{ watches, events }`
- `scrollHome(page, target)` → `{ scrolls, events }`
- `browseShorts(page, target)` — vertical swipe, 5–20s each → `{ shorts, events }`
- `likeVideo(page, target)` — like the currently-watching video → `{ likes, events }`
- `subscribeChannels(page, channels, target)` → `{ subscribes, events }`

**Warm plan ramp** (watch dwell grows with age):

| phase | days | search | watch (dwell sec) | scrollHome | shorts | like | subscribe |
|-------|------|--------|-------------------|------------|--------|------|-----------|
| revive-1 | 0–2  | 1 | 2 (30–90)   | 2 | — | — | — |
| revive-2 | 3–6  | 2 | 3 (60–180)  | 3 | 2 | 1 | — |
| ramp     | 7–13 | 3 | 4 (120–300) | 4 | 3 | 2 | 1 |
| steady   | 14+  | 3 | 5 (180–420) | 5 | 5 | 3 | 1 |

Subscribe is rare on purpose (≤1/run). Watch dwell is the primary signal — keep
it dominant over engagement.

---

### 2.3 TikTok

| Setting | Value |
|---------|-------|
| `HOME_URL` | `https://www.tiktok.com/foryou` |
| `GLOBAL_DEADLINE` N | **110 min** |
| workflow `timeout-minutes` | **120** |
| cron (UTC) | `51 7 * * *` |
| Risk profile | FYP-dwell driven; engagement very late, login walls common |

**Unique actions** (`tiktokActions.js`):
- `watchFyp(page, target, { minSec, maxSec })` — swipe For-You, dwell per clip,
  occasional re-watch → `{ watches, events }` (the core action)
- `searchHashtags(page, tags, target)` → `{ searches, events }`
- `viewProfiles(page, handles, target)` → `{ profileViews, events }`
- `likeClips(page, target)` — double-tap current clip → `{ likes, events }`
- `followCreators(page, handles, target)` → `{ follows, events }`

**Warm plan ramp** (FYP dwell dominates):

| phase | days | watchFyp (dwell sec) | search | viewProfiles | like | follow |
|-------|------|----------------------|--------|--------------|------|--------|
| revive-1 | 0–3  | 8 (5–15)   | — | — | — | — |
| revive-2 | 4–7  | 12 (8–25)  | 1 | 1 | 2 | — |
| ramp     | 8–14 | 18 (8–35)  | 2 | 2 | 5 | 1 |
| steady   | 15+  | 25 (8–45)  | 3 | 3 | 8 | 1 |

TikTok ramps slowest on engagement (no like before day 4, no follow before day
8). Pure FYP scrolling for the first window is the safest signal.

---

### 2.4 Reddit

| Setting | Value |
|---------|-------|
| `HOME_URL` | `https://www.reddit.com/` |
| `GLOBAL_DEADLINE` N | **45 min** |
| workflow `timeout-minutes` | **50** |
| cron (UTC) | `11 8 * * *` |
| Risk profile | Karma/age gated; voting/joining is sensitive, read-heavy warmup |

**Unique actions** (`redditActions.js`):
- `popular(page, target)` — open the Popular feed, scroll naturally → `{ popularVisits, events }`
- `browseSubreddits(page, subs, target)` — open sub, scroll listing → `{ visits, events }`
- `explore(page, target)` — open Explore Communities, scan category chips and cards → `{ explores, events }`
- `searchPosts(page, queries, target)` → `{ searches, events }`
- `readPosts(page, target)` — open post, scroll comments, dwell 20–90s → `{ reads, events }`
- `upvotePosts(page, target)` → `{ upvotes, events }`
- `joinSubreddits(page, subs, target)` → `{ joins, events }`

**Warm plan ramp** (read-dominant; vote/join late):

| phase | days | popular | browseSubs | explore | search | readPosts | upvote | join |
|-------|------|---------|------------|---------|--------|-----------|--------|------|
| revive-1 | 0–3  | 1 | 1 | 1 | 1 | 2 | — | — |
| revive-2 | 4–9  | 1 | 2 | 1 | 1 | 3 | 2 | — |
| ramp     | 10–17| 1 | 2 | 1 | 2 | 4 | 4 | 1 |
| steady   | 18+  | 1 | 3 | 1 | 2 | 5 | 6 | 1 |

Longest ramp of all platforms (steady at day 18). Never join >1 sub/run. No
posting/commenting in warmup — read + vote only.

---

### 2.5 Instagram

| Setting | Value |
|---------|-------|
| `HOME_URL` | `https://www.instagram.com/` |
| `GLOBAL_DEADLINE` N | **110 min** |
| workflow `timeout-minutes` | **120** |
| cron (UTC) | `31 8 * * *` |
| Risk profile | Aggressive action-blocks; spread engagement thin, lots of passive view |

**Unique actions** (`instagramActions.js`):
- `scrollFeed(page, target)` — dwell 2–6s per post → `{ scrolls, events }`
- `watchReels(page, target, { minSec, maxSec })` → `{ reels, events }`
- `exploreSearch(page, queries, target)` — Explore tab / search → `{ searches, events }`
- `viewStories(page, target)` — tap through tray → `{ stories, events }`
- `likePosts(page, target)` → `{ likes, events }`
- `followAccounts(page, handles, target)` → `{ follows, events }`

**Warm plan ramp:**

| phase | days | scrollFeed | watchReels (dwell sec) | exploreSearch | viewStories | like | follow |
|-------|------|-----------|------------------------|---------------|-------------|------|--------|
| revive-1 | 0–2  | 4 | 3 (10–30)  | — | 2 | — | — |
| revive-2 | 3–7  | 6 | 5 (10–40)  | 1 | 4 | 2 | — |
| ramp     | 8–14 | 7 | 7 (10–50)  | 2 | 5 | 4 | 1 |
| steady   | 15+  | 9 | 9 (10–60)  | 3 | 7 | 6 | 1 |

Follow ceiling 1/run (action-block risk). Stories + reels are the safe bulk;
likes spread across the whole session, never bursted.

---

## Part 3 — Cron stagger summary (no collisions)

| Platform | cron (UTC) | N (deadline) | timeout |
|----------|-----------|--------------|---------|
| twitter  | `11 7 * * *` | 40  | 45  |
| youtube  | `31 7 * * *` | 110 | 120 |
| tiktok   | `51 7 * * *` | 110 | 120 |
| reddit   | `11 8 * * *` | 45  | 50  |
| instagram| `31 8 * * *` | 110 | 120 |

20-minute spacing between start slots so cloud-browser sessions don't pile up.

---

## Part 4 — Adding a new platform

1. Pick `HOME_URL`, N, timeout, a free cron slot (≥20 min from neighbors).
2. Copy `templates/platformWarmup.template.js` → `src/<x>Warmup.js`; replace
   `PLATFORM/Platform/platform/HOME_URL` and wire the gated action blocks.
3. Copy `platformActions.template.js` → write the platform's *unique* helpers.
4. Copy `platformAccounts.template.js` → encode the platform's ramp table from
   Part 2 into `get<X>ActionPlan`.
5. Copy `platform-warmup.template.yml` → `.github/workflows/<x>-warmup.yml`.
6. Add the platform's `parts.push(...)` summary lines to `src/slack.js`.
7. Append a new 2.x section here + a row in Part 3.

> Rule of thumb: **the skeleton stays identical, the plan is always unique.**
> Read actions unlock first, engagement unlocks late, and the riskier the
> platform the longer the ramp.
