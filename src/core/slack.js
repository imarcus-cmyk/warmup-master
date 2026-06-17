// Shared Slack reporter. Per-platform detail lines come from the platform
// definition's `slackParts(result)` so each platform reports its unique metrics.

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_REPORT_CHANNEL_ID = process.env.SLACK_REPORT_CHANNEL_ID || process.env.SLACK_CHANNEL_ID;
const SLACK_MENTION_USER_ID = process.env.SLACK_MENTION_USER_ID;

export async function sendSlackReport(results, { platform, slackParts, newProfiles = [] }) {
  const ok = results.filter(r => r.status === 'ok');
  const failed = results.filter(r => r.status === 'failed');
  const skipped = results.filter(r => r.status === 'skipped');
  const blocked = results.filter(r => r.status === 'blocked');

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

// Low-level post. Logs to console when Slack isn't configured.
export async function postSlack(text, { channel = SLACK_REPORT_CHANNEL_ID } = {}) {
  if (!SLACK_BOT_TOKEN || !channel) {
    console.log('  >> slack not configured; message below:\n' + text);
    return;
  }
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) console.error(`  >> slack error: ${data.error || res.status}`);
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

// Graduation alert — account finished warmup (reached steady) and is ready for
// manual upload. Fired ONCE per account (dedupe handled by graduation.js).
export async function sendGraduationAlert(platform, list) {
  if (!list.length) return;
  const mention = SLACK_MENTION_USER_ID ? `<@${SLACK_MENTION_USER_ID}> ` : '';
  const names = list.map(r => r.name).join(', ');
  await postSlack(
    `:mortar_board: ${mention}${list.length} ${platform} account(s) finished warmup — `
    + `now at steady, READY FOR MANUAL UPLOAD: ${names}`,
  );
}
