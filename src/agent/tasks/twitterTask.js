// One-off Twitter/X task. Maps generic verbs → X helpers. like/bookmark act on
// the loaded timeline, so the feed is scrolled first when those are requested.
// follow/view use the named @handles (task.targets); subscribe is treated as
// follow on X. Page starts on x.com/home (connectWithRetry landed there).
import * as TW from '../../actions/twitterActions.js';

export async function runTwitterTask(page, task) {
  const c = task.counts;
  const metrics = {}; const events = []; const notes = [];
  const likeN = c.like || c.upvote || 0;
  const followN = (c.follow || 0) + (c.subscribe || 0);
  const plan = {
    niches: [],
    handles: task.targets,
    _deadlineAt: task._deadlineAt,
    scrollFeed: Math.max(c.scroll || c.watch || 0, likeN || c.bookmark ? 3 : 0),
    like: likeN,
    bookmark: c.bookmark || 0,
    search: c.search || 0,
    viewProfiles: c.view || 0,
    follow: followN,
  };
  const add = (r, ...keys) => { for (const k of keys) if (r[k]) metrics[k] = (metrics[k] || 0) + r[k]; events.push(...r.events); };

  if (c.watch > 0) notes.push(`"watch" isn't a Twitter/X action (no video feed) — scrolled the timeline instead`);
  if (plan.scrollFeed > 0) add(await TW.scrollFeed(page, plan), 'scrolls');
  if (plan.like > 0) {
    add(await TW.like(page, plan), 'likes');
    if ((metrics.likes || 0) < likeN) notes.push(`liked ${metrics.likes || 0}/${likeN} (no more like buttons in the loaded timeline)`);
  }
  if (plan.bookmark > 0) add(await TW.bookmark(page, plan), 'bookmarks');
  if (plan.search > 0) add(await TW.search(page, plan), 'searches');
  if (plan.viewProfiles > 0) add(await TW.viewProfiles(page, plan), 'profileViews');
  if (followN > 0) {
    if (!task.targets.length) notes.push(`follow needs a target @handle on X — none given, skipped (try "...follow @someone")`);
    else { add(await TW.follow(page, plan), 'follows'); if ((metrics.follows || 0) < followN) notes.push(`followed ${metrics.follows || 0}/${followN}`); }
  }
  return { metrics, events, notes };
}
