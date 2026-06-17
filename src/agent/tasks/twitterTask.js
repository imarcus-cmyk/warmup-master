// One-off Twitter/X task. Maps generic verbs → X actions, reusing the SAME
// helpers as the daily warmup (twitterActions): "watch" plays feed videos,
// follow with no @handle follows accounts from the feed / who-to-follow, with
// @handles it follows those. Page starts on x.com/home.
import * as TW from '../../actions/twitterActions.js';

export async function runTwitterTask(page, task) {
  const c = task.counts;
  const metrics = {}; const events = []; const notes = [];
  const likeN = c.like || c.upvote || 0;
  const followN = (c.follow || 0) + (c.subscribe || 0);
  const watchN = c.watch || 0;
  const plan = {
    niches: [],
    handles: task.targets,
    _deadlineAt: task._deadlineAt,
    scrollFeed: Math.max(c.scroll || 0, likeN || c.bookmark ? 3 : 0),
    like: likeN,
    bookmark: c.bookmark || 0,
    search: c.search || 0,
    viewProfiles: c.view || 0,
    notifications: c.notifications || 0,
    comment: c.comment || 0,
    followBackMax: 0,
  };
  const add = (r, ...keys) => { for (const k of keys) if (r[k]) metrics[k] = (metrics[k] || 0) + r[k]; events.push(...r.events); };

  if (plan.notifications > 0) add(await TW.notifications(page, plan), 'notificationsOpened');
  if (watchN > 0) {
    add(await TW.watchVideos(page, { ...plan, watchVideos: watchN }), 'watches');
    if ((metrics.watches || 0) < watchN) notes.push(`watched ${metrics.watches || 0}/${watchN} videos (no more videos surfaced in the feed)`);
  }
  if (plan.scrollFeed > 0) add(await TW.scrollFeed(page, plan), 'scrolls');
  if (plan.like > 0) {
    add(await TW.like(page, plan), 'likes');
    if ((metrics.likes || 0) < likeN) notes.push(`liked ${metrics.likes || 0}/${likeN} (no more like buttons in the loaded timeline)`);
  }
  if (plan.bookmark > 0) add(await TW.bookmark(page, plan), 'bookmarks');
  if (plan.search > 0) add(await TW.search(page, plan), 'searches');
  if (plan.viewProfiles > 0) add(await TW.viewProfiles(page, plan), 'profileViews');
  if (followN > 0) {
    // handles present → follow those; none → feed-follow (helper handles both)
    add(await TW.follow(page, { ...plan, follow: followN, handles: task.targets }), 'follows');
    if ((metrics.follows || 0) < followN) notes.push(`followed ${metrics.follows || 0}/${followN}`);
  }
  if (plan.comment > 0) {
    add(await TW.comment(page, plan), 'comments');
    if ((metrics.comments || 0) < plan.comment) notes.push(`commented ${metrics.comments || 0}/${plan.comment}`);
  }
  return { metrics, events, notes };
}
