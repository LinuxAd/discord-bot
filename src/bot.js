import { newsPayload, reminderPayload } from './discord.js';

const KEEP = 500;
const CANCELLED = /postpon|cancel|abandon|suspend|void/i;
// A 4xx (other than 429, retried upstream) will never succeed: skip the item rather than block the feed.
const isFatal = (err) => [401, 403, 404].includes(err.status); // webhook deleted/unauthorised: stop, mark nothing
const isPermanent = (err) => err.status >= 400 && err.status < 500 && err.status !== 429 && !isFatal(err);
const fatal = (err) => Object.assign(err, { fatal: true });
const reminderKey = (fx) => `${fx.id}:${fx.kickoff}`; // a rescheduled match is a new reminder

/**
 * One poll cycle. All I/O arrives via arguments. `persist(state)` is called after every
 * successful post so a crash or failed save cannot cause re-posting of what already went out.
 */
export async function runCycle({
  state, config, now, getNews, getFixtures, post, persist = async () => {}, log = () => {},
}) {
  const seen = new Set(state.seenNews);
  const reminded = new Set(state.remindedFixtures);
  const sync = async () => {
    state.seenNews = [...seen].slice(-KEEP);
    state.remindedFixtures = [...reminded].slice(-KEEP);
    try {
      await persist(state);
    } catch (err) {
      throw fatal(err); // never keep posting when progress cannot be saved
    }
  };
  await sync(); // fail before posting anything if the state file is not writable

  try {
    const news = await getNews();
    if (news.length === 0) {
      log('warning: news page parsed to 0 articles (markup change or error page?)');
    } else if (!state.seeded) {
      news.forEach((n) => seen.add(n.id));
      state.seeded = true;
      log(`first run: seeded ${news.length} existing articles, no backfill`);
      await sync();
    } else {
      const unseen = news.filter((n) => !seen.has(n.id));
      const wanted = unseen
        .filter((n) => config.categories.includes(n.category.toLowerCase()))
        .sort((a, b) => (a.publishedAt ?? 0) - (b.publishedAt ?? 0))
        .slice(-config.maxNewsPerPoll);
      const toPost = new Set(wanted.map((n) => n.id));
      unseen.filter((n) => !toPost.has(n.id)).forEach((n) => seen.add(n.id));
      for (const item of wanted) {
        try {
          await post(newsPayload(item));
          seen.add(item.id);
          log(`posted news: ${item.title}`);
        } catch (err) {
          if (isFatal(err)) throw fatal(err);
          if (isPermanent(err)) seen.add(item.id);
          log(`news post failed (${item.id}): ${err.message}`);
        }
        await sync();
      }
      // Keep ids still on the page at the recent end so eviction never re-posts a pinned article.
      news.forEach((n) => { if (seen.delete(n.id)) seen.add(n.id); });
    }
  } catch (err) {
    if (err.fatal) throw err;
    log(`news step failed: ${err.message}`);
  }

  try {
    const windowMs = config.reminderHours * 3_600_000;
    for (const fx of await getFixtures()) {
      const key = reminderKey(fx);
      if (fx.tbc || reminded.has(key) || CANCELLED.test(fx.status ?? '')) continue;
      if (fx.kickoff <= now || fx.kickoff - now > windowMs) continue;
      try {
        await post(reminderPayload(fx));
        reminded.add(key);
        log(`posted reminder: ${fx.home} vs ${fx.away}`);
      } catch (err) {
        if (isFatal(err)) throw fatal(err);
        if (isPermanent(err)) reminded.add(key);
        log(`reminder post failed (${fx.id}): ${err.message}`);
      }
      await sync();
    }
  } catch (err) {
    if (err.fatal) throw err;
    log(`fixtures step failed: ${err.message}`);
  }

  await sync();
  return state;
}
