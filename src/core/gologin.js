// GoLogin cloud-browser connection layer. Shared skeleton — identical for every
// platform subagent. Only HOME_URL varies, and that is passed in per platform.
import puppeteer from 'puppeteer-core';
import { token, sleep, rand, MAX_ATTEMPTS, BACKOFF_MS } from './util.js';

export async function stopProfile(profileId) {
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

export async function connectWithRetry(profileId, name, homeUrl) {
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

      await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
