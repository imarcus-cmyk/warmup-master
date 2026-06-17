// Account-health check. Runs AFTER a successful connect (profile reached) but
// BEFORE actions. Detects NON-technical problems where the browser opened fine
// yet the account can't perform scheduled actions: suspended, disabled, logged
// out / login wall, missing required login state, identity verification, captcha,
// or action-block.
//
// Returns { ok:true } or { ok:false, reason }. Conservative on purpose — only
// strong signals trip it, so a normal page is never falsely flagged.

// Shared signals (apply to every platform). Order matters: first match wins.
const GENERIC = [
  { re: /(your account|the account) (has been |is |was )?suspend/i, reason: 'account suspended' },
  { re: /account (has been |is |was )?(disabled|deactivated)|we (have )?disabled your account/i, reason: 'account disabled' },
  { re: /(temporarily|account) (locked|restricted)|we'?ve temporarily (locked|limited)/i, reason: 'account locked/restricted' },
  { re: /verify (your )?(identity|account|phone|email)|confirm your identity|unusual (login )?activity|help us confirm/i, reason: 'verification required' },
  { re: /are you a (robot|human)|complete (the |a )?captcha|press (&|and) hold|verify you are human|i'?m not a robot/i, reason: 'captcha / human check' },
  { re: /action blocked|we restrict certain activity|you'?re temporarily blocked|try again later/i, reason: 'action blocked' },
];

export async function checkHealth(page, def) {
  let url = '';
  let body = '';
  try { url = page.url() || ''; } catch {}
  try {
    body = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 5000) : '')).catch(() => '');
  } catch {}

  const sig = def.blockSignals || {};

  // URL-based signals first (login walls, suspension pages) — most reliable.
  for (const { re, reason } of (sig.urls || [])) {
    if (re.test(url)) return { ok: false, reason };
  }
  // Then platform-specific then generic text signals.
  for (const { re, reason } of [...(sig.text || []), ...GENERIC]) {
    if (re.test(body)) return { ok: false, reason };
  }

  // Optional platform checks for states that need positive proof, such as
  // YouTube being signed in even though signed-out Shorts still loads.
  for (const fn of (sig.custom || [])) {
    try {
      const result = await fn(page);
      if (result && result.ok === false) return result;
    } catch (err) {
      return { ok: false, reason: `health check failed: ${err.message}` };
    }
  }

  return { ok: true };
}
