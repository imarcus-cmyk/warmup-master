// Orchestrator skeleton. Replace PLATFORM / Platform / platform / HOME_URL /
// action gates. Constants below MUST match the other warmup agents.
import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import { platformAccounts, getPlatformActionPlan, logPlatformAccount } from './platformAccounts.js';
import { /* actionA, actionB */ } from './platformActions.js';
import { sendSlackReport } from './slack.js';
import { writeRunLog } from './runLog.js';

dotenv.config();

const token = process.env.GL_API_TOKEN;

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HOME_URL = 'https://www.PLATFORM.com/';
const GLOBAL_DEADLINE = Date.now() + 110 * 60 * 1000; // keep below workflow timeout-minutes
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [5000, 15000, 45000, 90000, 180000];

async function stopProfile(profileId) {
  try {
    await fetch(`https://api.gologin.com/browser/${profileId}/web`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('  >> cloud session stopped');
  } catch (err) {
    console.log(`  >> stopProfile failed: ${err.message}`);
  }
}

async function connectWithRetry(profileId, name) {
  const cloudUrl = `https://cloudbrowser.gologin.com/connect?token=${token}&profile=${profileId}`;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let browser;
    try {
      const res = await fetch(cloudUrl);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`start failed: ${res.status} ${res.headers.get('X-Error-Reason') || body.slice(0, 80)}`);
      }

      browser = await puppeteer.connect({
        browserWSEndpoint: cloudUrl,
        ignoreHTTPSErrors: true,
        defaultViewport: null,
      });

      const pages = await browser.pages();
      const page = pages[0] || await browser.newPage();
      for (const extra of pages.slice(1)) { try { await extra.close(); } catch {} }

      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(rand(3000, 6000));

      if (attempt > 1) console.log(`  >> connected on attempt ${attempt}/${MAX_ATTEMPTS}`);
      return { browser, page, attempts: attempt };
    } catch (err) {
      lastErr = err;
      console.error(`  >> connect attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`);
      if (browser) { try { await browser.close(); } catch {} }
      await stopProfile(profileId);

      if (attempt < MAX_ATTEMPTS) {
        const wait = BACKOFF_MS[attempt - 1];
        console.log(`  >> retrying in ${wait / 1000}s...`);
        await sleep(wait);
      }
    }
  }

  throw new Error(`all ${MAX_ATTEMPTS} connect attempts failed for ${name}: ${lastErr?.message}`);
}

async function runAccount(account) {
  const { profileId, name } = account;
  const plan = getPlatformActionPlan(account);
  const allowed = plan.actions;
  logPlatformAccount(profileId, name, plan);

  const result = {
    platform: 'Platform',
    name,
    profileId,
    allowed,
    // ...plan targets mirrored here (e.g. searchTarget: plan.searchTarget)
    attempts: 0,
    status: 'failed',
    // ...metric counters init 0
    events: [],
    error: null,
  };

  let browser;
  try {
    const session = await connectWithRetry(profileId, name);
    browser = session.browser;
    const page = session.page;
    result.attempts = session.attempts;

    // One gated block per action:
    // if (allowed.includes('search')) {
    //   const r = await actionA(page, plan);
    //   result.searches = r.count;
    //   result.events.push(...r.events);
    // }

    result.status = 'ok';
    console.log(`  >> ${name} done`);
  } catch (err) {
    result.error = err.message;
    console.error(`  >> ${name} unrecoverable: ${err.message}`);
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
    await stopProfile(profileId);
  }

  return result;
}

console.log(`starting Platform warmup for ${platformAccounts.length} accounts\n`);

if (platformAccounts.length === 0) {
  console.log('no Platform accounts configured; add profiles in src/platformAccounts.js');
} else {
  const results = [];
  const failed = [];

  for (const account of platformAccounts) {
    if (Date.now() > GLOBAL_DEADLINE) {
      console.log(`\nglobal deadline reached - skipping ${account.name} and remaining accounts`);
      results.push({ platform: 'Platform', name: account.name, profileId: account.profileId, status: 'skipped', error: 'global time budget exceeded', skipped: true, events: [] });
      continue;
    }

    const result = await runAccount(account);
    results.push(result);
    if (result.status !== 'ok') failed.push(account);

    const interAccountDelay = rand(25000, 45000);
    console.log(`  >> pacing next Platform profile; sleeping for ${(interAccountDelay / 1000).toFixed(1)}s...`);
    await sleep(interAccountDelay);
  }

  if (failed.length) {
    console.log(`\nretry pass for ${failed.length} failed Platform account(s): ${failed.map(a => a.name).join(', ')}`);
    for (const account of failed) {
      if (Date.now() > GLOBAL_DEADLINE) {
        console.log(`global deadline reached - skipping retry for ${account.name}`);
        continue;
      }

      const retry = await runAccount(account);
      retry.requeued = true;

      const idx = results.findIndex(r => r.profileId === account.profileId);
      if (idx !== -1) results[idx] = retry;

      await sleep(rand(20000, 35000));
    }
  }

  try {
    const logPath = await writeRunLog({ platform: 'Platform', agent: 'platform-warmup', results });
    console.log(`  >> action log written: ${logPath}`);
  } catch (err) {
    console.error(`action log failed: ${err.message}`);
  }

  try {
    await sendSlackReport(results, { platform: 'Platform' });
  } catch (err) {
    console.error(`slack report failed: ${err.message}`);
  }
}

console.log('\nPlatform warmup done');
