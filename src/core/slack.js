// Shared Slack reporter. Per-platform detail lines come from the platform
// definition's `slackParts(result)` so each platform reports its unique metrics.
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_REPORT_CHANNEL_ID = process.env.SLACK_REPORT_CHANNEL_ID || process.env.SLACK_CHANNEL_ID;
const SLACK_MENTION_USER_ID = process.env.SLACK_MENTION_USER_ID;
const SLACK_LOG_DIR = path.resolve('logs', 'slack');

function isWeeklyStatusDay(date = new Date()) {
  return date.getUTCDay() === 0;
}

export async function sendSlackReport(results, { platform, slackParts, newProfiles = [] }) {
  const ok = results.filter(r => r.status === 'ok');
  const failed = results.filter(r => r.status === 'failed');
  const skipped = results.filter(r => r.status === 'skipped');
  const blocked = results.filter(r => r.status === 'blocked');
  const includeWeeklyStatus = isWeeklyStatusDay();

  const parts = [];
  const head = `*${platform} warmup* — ${ok.length}/${results.length} ok`
    + (blocked.length ? `, ${blocked.length} blocked` : '')
    + (failed.length ? `, ${failed.length} failed` : '')
    + (skipped.length ? `, ${skipped.length} skipped` : '');
  parts.push(head);

  if (newProfiles.length) {
    parts.push(`:new: ${newProfiles.length} new profile(s) added to cycle: ${newProfiles.map(p => p.name).join(', ')}`);
  }

  for (const r of results) {
    const icon = r.status === 'ok' ? ':white_check_mark:'
      : r.status === 'skipped' ? ':fast_forward:'
      : r.status === 'blocked' ? ':warning:'
      : ':x:';
    let line = `${icon} ${r.name}`;
    if (r.status === 'ok' && typeof slackParts === 'function') {
      const detail = slackParts(r).filter(Boolean).join(' · ');
      if (detail) line += ` — ${detail}`;
      if (includeWeeklyStatus) {
        const weekly = [
          typeof r.day === 'number' && `day ${r.day}`,
          r.lifecycle,
          r.phase,
          r.manualUploadReady ? 'manual upload: yes' : null,
          r.warmupComplete ? 'warmup complete' : null,
        ].filter(Boolean).join(' · ');
        if (weekly) line += `${detail ? ' · ' : ' — '}${weekly}`;
      }
    } else if (r.status === 'blocked') {
      line += ` — *reached but unusable: ${r.blockReason}*`;
    } else if (r.error) {
      line += ` — ${r.error}`;
    }
    if (r.requeued) line += ' _(retry)_';
    parts.push(line);
  }

  // Account-health alert: profile opened fine but can't warm (suspended, login
  // wall, captcha, verification, action-block). These need a human, not a retry.
  if (blocked.length) {
    const mention = SLACK_MENTION_USER_ID ? `<@${SLACK_MENTION_USER_ID}> ` : '';
    parts.push(`:rotating_light: ${mention}${blocked.length} profile(s) reached but NOT able to warm: ${blocked.map(r => `${r.name} (${r.blockReason})`).join(', ')}`);
  }

  if (failed.length && SLACK_MENTION_USER_ID) {
    parts.push(`<@${SLACK_MENTION_USER_ID}> ${failed.length} account(s) failed to connect (technical).`);
  }

  await postSlack(parts.join('\n'));
}

async function archiveSlackMessage(record) {
  try {
    await mkdir(SLACK_LOG_DIR, { recursive: true });
    const stamp = record.generatedAt.replace(/[:.]/g, '-');
    const channel = String(record.channel || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = path.join(SLACK_LOG_DIR, `${stamp}-${channel}.json`);
    const dailyFile = path.join(SLACK_LOG_DIR, `${record.generatedAt.slice(0, 10)}.ndjson`);
    const payload = JSON.stringify({ ...record, archiveFile: path.basename(file) }, null, 2);
    await writeFile(file, payload);
    await appendFile(dailyFile, JSON.stringify({ ...record, archiveFile: path.basename(file) }) + '\n');
    return file;
  } catch (err) {
    console.error(`  >> slack archive failed: ${err.message}`);
    return null;
  }
}

// Low-level post. Logs to console when Slack isn't configured.
export async function postSlack(text, { channel = SLACK_REPORT_CHANNEL_ID } = {}) {
  const archiveRecord = {
    generatedAt: new Date().toISOString(),
    channel: channel || null,
    text,
    configured: Boolean(SLACK_BOT_TOKEN && channel),
    delivery: 'pending',
  };

  if (!SLACK_BOT_TOKEN || !channel) {
    console.log('  >> slack not configured; message below:\n' + text);
    archiveRecord.delivery = 'not_configured';
    await archiveSlackMessage(archiveRecord);
    return;
  }

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
    });
    const data = await res.json().catch(() => ({}));
    archiveRecord.delivery = data.ok ? 'sent' : 'slack_error';
    archiveRecord.slack = {
      ok: !!data.ok,
      status: res.status,
      error: data.error || null,
      ts: data.ts || null,
    };
    if (!data.ok) console.error(`  >> slack error: ${data.error || res.status}`);
  } catch (err) {
    archiveRecord.delivery = 'request_failed';
    archiveRecord.error = err.message;
    throw err;
  } finally {
    await archiveSlackMessage(archiveRecord);
  }
}

// Alert for GoLogin profiles that match no platform — they never warm.
export async function sendUnclassifiedAlert(list) {
  if (!list.length) return;
  const mention = SLACK_MENTION_USER_ID ? `<@${SLACK_MENTION_USER_ID}> ` : '';
  const lines = list.map(p => `• ${p.name} (folder: ${p.folder})`).join('\n');
  await postSlack(
    `:warning: ${mention}${list.length} GoLogin profile(s) NOT being warmed — `
    + `no platform match. Rename them or move into a platform-named folder `
    + `(Instagram/Tiktok/Twitter/Reddit/Youtube):\n${lines}`,
  );
}

export async function sendWarmupCompleteAlert(platform, list) {
  if (!list.length) return;
  const mention = SLACK_MENTION_USER_ID ? `<@${SLACK_MENTION_USER_ID}> ` : '';
  const names = list.map(r => r.name).join(', ');
  await postSlack(
    `:mortar_board: ${mention}${list.length} ${platform} account(s) completed the 30-day warmup `
    + `and are now in maintenance: ${names}`,
  );
}

export async function sendManualUploadReadyAlert(platform, list) {
  if (!list.length) return;
  const mention = SLACK_MENTION_USER_ID ? `<@${SLACK_MENTION_USER_ID}> ` : '';
  const names = list.map(r => r.name).join(', ');
  await postSlack(
    `:rocket: ${mention}${list.length} ${platform} account(s) reached manual-upload day `
    + `and can start manual content while warmup continues: ${names}`,
  );
}
