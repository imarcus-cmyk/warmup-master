# New Platform Warmup — Boilerplate & Rules

Every warmup orchestrator (`twitter`, `youtube`, `tiktok`, `reddit`, `instagram`)
follows the same skeleton. To add a platform, copy the rules below. They are
extracted verbatim from the existing agents — keep them identical so reporting,
logging, and CI all keep working.

## File layout per platform `<x>`

| File | Role |
|------|------|
| `src/<x>Accounts.js` | profile list + `get<X>ActionPlan(account)` + `log<X>Account()` |
| `src/<x>Actions.js`  | puppeteer action helpers, each returns `{ count/…, events }` |
| `src/<x>Warmup.js`   | orchestrator (the shared skeleton below) |
| `.github/workflows/<x>-warmup.yml` | daily cron + dispatch |
| `src/slack.js`       | shared — add platform's `parts.push(...)` lines |
| `src/runLog.js`      | shared — no change needed |

## Orchestrator rules (the constants that MUST match)

- `token = process.env.GL_API_TOKEN`
- `rand(min,max)` inclusive int, `sleep(ms)` promise.
- `MAX_ATTEMPTS = 5`, `BACKOFF_MS = [5000, 15000, 45000, 90000, 180000]`.
- `GLOBAL_DEADLINE` = `Date.now() + N*60*1000`. N must be **below the workflow
  `timeout-minutes`**. Convention: twitter 40 (timeout 45), most others 110
  (timeout 120), reddit 45. Pick N = timeout − 5..10.
- `stopProfile()` — `DELETE https://api.gologin.com/browser/<id>/web` in `finally`.
- `connectWithRetry()` — fetch `cloudbrowser.gologin.com/connect`, `puppeteer.connect`,
  reuse `pages[0]`, close extras, `goto(HOME, domcontentloaded, 60000)`, settle 3–6s.
  On fail: close browser, `stopProfile`, backoff, retry.
- `runAccount()` — build `result` record, gate each action on `allowed.includes(x)`,
  push `…events`, set `status='ok'`, `stopProfile` in `finally`.
- main loop: deadline guard → run → `failed.push` if not ok → inter-account
  delay `rand(25000,45000)`. Then one **retry pass** over `failed`
  (`requeued=true`, delay `rand(20000,35000)`). Then `writeRunLog` + `sendSlackReport`,
  each in its own try/catch.

## Action helper rules (`<x>Actions.js`)

- `import { makeEvent } from './runLog.js'`; local `sleep`/`rand`.
- Each exported helper returns `{ count, events }` (or named metric + `events`).
- Build events with `makeEvent('actionName', {...details})`.
- Humanize everything: random watch/scroll/skip timings, shuffled pools,
  default pools when account supplies none, dismiss cookie/login prompts.

## CI rules (`.github/workflows/<x>-warmup.yml`)

- `schedule` cron staggered (don't collide with other platforms) + `workflow_dispatch`.
- `timeout-minutes` > `GLOBAL_DEADLINE` minutes. node 22, `npm ci`.
- env: `GL_API_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_MENTION_USER_ID`.
- upload `logs/*.json` artifact with `if: always()`.

See `templates/` for copy-paste skeletons.
