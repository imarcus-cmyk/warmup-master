// Targeted/one-off Instagram task. Unlike TikTok, IG one-offs can run WITHOUT a
// named target: watch=reels feed, like=feed like, follow=given @handle(s) or the
// default brand handles. Reuses the warmup IG helpers with a synthetic plan.
import * as IG from '../../actions/instagramActions.js';

// task = { targets:[handle], counts:{watch,like,follow}, _deadlineAt }
export async function runInstagramTask(page, task) {
  const metrics = {}; const events = []; const notes = [];
  const plan = {
    dwell: [10, 30],
    niches: [],
    handles: task.targets, // empty → helper falls back to default brand handles
    watchReels: task.counts.watch || 0,
    like: task.counts.like || 0,
    follow: (task.counts.follow || 0) + (task.counts.subscribe || 0),
    notifications: task.counts.notifications || 0,
    comment: task.counts.comment || 0,
    followBackMax: 0,
    _deadlineAt: task._deadlineAt,
  };

  if (plan.notifications > 0) {
    const { notificationsOpened, events: e } = await IG.notifications(page, plan);
    metrics.notificationsOpened = (metrics.notificationsOpened || 0) + notificationsOpened; events.push(...e);
  }
  if (plan.watchReels > 0) {
    const { reels, events: e } = await IG.watchReels(page, plan);
    metrics.reels = (metrics.reels || 0) + reels; events.push(...e);
    if (reels < plan.watchReels) notes.push(`watched ${reels}/${plan.watchReels} reels`);
  }
  if (plan.like > 0) {
    const { likes, events: e } = await IG.like(page, plan);
    metrics.likes = (metrics.likes || 0) + likes; events.push(...e);
    if (likes < plan.like) notes.push(`liked ${likes}/${plan.like} (no more reachable like buttons in the feed)`);
  }
  if (plan.follow > 0) {
    if (!task.targets.length) notes.push('no @handle given — followed a default suggested account (add "follow @handle" to choose)');
    const { follows, events: e } = await IG.follow(page, plan);
    metrics.follows = (metrics.follows || 0) + follows; events.push(...e);
    if (follows < plan.follow) notes.push(`followed ${follows}/${plan.follow}`);
  }
  if (plan.comment > 0) {
    const { comments, events: e } = await IG.comment(page, plan);
    metrics.comments = (metrics.comments || 0) + comments; events.push(...e);
    if (comments < plan.comment) notes.push(`commented ${comments}/${plan.comment}`);
  }
  return { metrics, events, notes };
}
