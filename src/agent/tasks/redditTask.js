// One-off Reddit task. Maps generic verbs → Reddit helpers: like→upvote,
// follow/subscribe/join→join, watch/read→readPosts, scroll/browse→browseSubs.
// upvote acts on the loaded listing, so subs are browsed first when upvoting.
// task.targets are treated as subreddit names for join. Page starts on reddit home.
import * as RD from '../../actions/redditActions.js';

export async function runRedditTask(page, task) {
  const c = task.counts;
  const metrics = {}; const events = []; const notes = [];
  const upvoteN = c.upvote || c.like || 0;
  const joinN = c.join || c.follow || c.subscribe || 0;
  const readN = c.read || c.watch || 0;
  const plan = {
    niches: task.targets, // join/browse use these as subreddits when given
    _deadlineAt: task._deadlineAt,
    popular: c.popular || 0,
    browseSubs: Math.max(c.scroll || 0, upvoteN ? 1 : 0),
    explore: c.explore || 0,
    readPosts: readN,
    upvote: upvoteN,
    join: joinN,
    search: c.search || 0,
    notifications: c.notifications || 0,
    comment: c.comment || 0,
  };
  const add = (r, ...keys) => { for (const k of keys) if (r[k]) metrics[k] = (metrics[k] || 0) + r[k]; events.push(...r.events); };

  if (plan.notifications > 0) add(await RD.notifications(page, plan), 'notificationsOpened');
  if (plan.popular > 0) add(await RD.popular(page, plan), 'popularVisits');
  if (plan.browseSubs > 0) add(await RD.browseSubs(page, plan), 'visits');
  if (plan.explore > 0) add(await RD.explore(page, plan), 'explores');
  if (plan.readPosts > 0) add(await RD.readPosts(page, plan), 'reads');
  if (plan.upvote > 0) add(await RD.upvote(page, plan), 'upvotes');
  if (plan.search > 0) add(await RD.search(page, plan), 'searches');
  if (plan.join > 0) add(await RD.join(page, plan), 'joins');
  if (plan.comment > 0) {
    add(await RD.comment(page, { ...plan, browseSubs: Math.max(plan.browseSubs, 1) }), 'comments');
    if ((metrics.comments || 0) < plan.comment) notes.push(`commented ${metrics.comments || 0}/${plan.comment}`);
  }
  return { metrics, events, notes };
}
