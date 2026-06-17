// One-off YouTube task. YT is shorts-only: watch/like/subscribe all happen inside
// shorts() on the playing short (like & subscribe are quota'd and spread, so we
// give enough shorts for the requested engagement to land). Page starts on the
// YT home (connectWithRetry landed there).
import * as YT from '../../actions/youtubeActions.js';

export async function runYouTubeTask(page, task) {
  const c = task.counts;
  const metrics = {}; const events = []; const notes = [];
  const likeN = c.like || 0;
  const subN = c.subscribe || c.follow || 0;
  // enough shorts to actually reach the like/subscribe quotas (helper is probabilistic)
  const shortsN = Math.max(c.watch || 0, (likeN + subN) * 3, likeN || subN ? 4 : 0);
  const add = (r, ...keys) => { for (const k of keys) if (r[k]) metrics[k] = (metrics[k] || 0) + r[k]; events.push(...r.events); };

  if (c.notifications > 0) add(await YT.notifications(page, { _deadlineAt: task._deadlineAt }), 'notificationsOpened');
  if (c.search > 0) add(await YT.search(page, { niches: [], search: c.search, _deadlineAt: task._deadlineAt }), 'searches');
  if (c.scroll > 0) add(await YT.scrollHome(page, { scrollHome: c.scroll, _deadlineAt: task._deadlineAt }), 'scrolls');
  if (shortsN > 0) {
    const r = await YT.shorts(page, {
      shorts: shortsN, likeOnShorts: likeN, subscribeOnShorts: subN, _deadlineAt: task._deadlineAt,
    });
    add(r, 'shorts', 'likes', 'subscribes');
  }
  if (c.comment > 0) {
    add(await YT.comment(page, { comment: c.comment, _deadlineAt: task._deadlineAt }), 'comments');
    if ((metrics.comments || 0) < c.comment) notes.push(`commented ${metrics.comments || 0}/${c.comment}`);
  }
  return { metrics, events, notes };
}
