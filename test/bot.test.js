import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCycle } from '../src/bot.js';

const H = 3_600_000;
const config = { categories: ['club news', 'first-team'], reminderHours: 24, maxNewsPerPoll: 2 };
const art = (id, category, t = 0) => ({ id, url: `https://x/${id}`, title: id, category, publishedAt: t, image: null });
const fresh = () => ({ seeded: false, seenNews: [], remindedFixtures: [] });

function harness(over = {}) {
  const posts = [];
  return {
    posts,
    run: (state, o = {}) => runCycle({
      state, config, now: 1_000_000_000_000, post: async (p) => { posts.push(p); },
      getNews: async () => [], getFixtures: async () => [], ...over, ...o,
    }),
  };
}

test('first run seeds news without posting', async () => {
  const h = harness();
  const s = await h.run(fresh(), { getNews: async () => [art('a', 'Club News'), art('b', 'First-Team')] });
  assert.equal(h.posts.length, 0);
  assert.deepEqual(s.seenNews, ['a', 'b']);
  assert.equal(s.seeded, true);
});

test('posts only new allowlisted articles, oldest first, then never again', async () => {
  const h = harness();
  const state = { seeded: true, seenNews: ['old'], remindedFixtures: [] };
  const news = [art('old', 'Club News'), art('n2', 'Club News', 2), art('i', 'Interviews', 3), art('n1', 'first-team', 1)];
  await h.run(state, { getNews: async () => news });
  assert.deepEqual(h.posts.map((p) => p.embeds[0].title), ['n1', 'n2']);
  await h.run(state, { getNews: async () => news });
  assert.equal(h.posts.length, 2);
  assert.ok(state.seenNews.includes('i'));
});

test('caps news per poll and does not post the overflow later', async () => {
  const h = harness();
  const state = { seeded: true, seenNews: [], remindedFixtures: [] };
  const news = [1, 2, 3, 4].map((i) => art(`n${i}`, 'Club News', i));
  await h.run(state, { getNews: async () => news });
  assert.deepEqual(h.posts.map((p) => p.embeds[0].title), ['n3', 'n4']);
  await h.run(state, { getNews: async () => news });
  assert.equal(h.posts.length, 2);
});

test('failed post leaves article unseen so it retries', async () => {
  let fail = true;
  const posts = [];
  const state = { seeded: true, seenNews: [], remindedFixtures: [] };
  const o = {
    getNews: async () => [art('a', 'Club News')],
    post: async (p) => { if (fail) throw new Error('boom'); posts.push(p); },
  };
  const h = harness();
  await h.run(state, o);
  assert.equal(state.seenNews.includes('a'), false);
  fail = false;
  await h.run(state, o);
  assert.equal(posts.length, 1);
});

test('reminder fires once inside the 24h window, not before, not after kickoff, not when TBC', async () => {
  const now = 1_000_000_000_000;
  const fx = (id, dt, extra = {}) => ({ id, kickoff: now + dt, tbc: false, home: 'Gillingham', away: id, venue: 'V', url: 'u', ...extra });
  const fixtures = [fx('inside', 23 * H), fx('edge', 24 * H), fx('far', 24 * H + 1), fx('past', -H), fx('tbc', H, { tbc: true })];
  const h = harness();
  const state = { seeded: true, seenNews: [], remindedFixtures: [] };
  await h.run(state, { getFixtures: async () => fixtures });
  assert.deepEqual(h.posts.map((p) => p.embeds[0].title.split("vs ")[1]), ["inside", "edge"]);
  await h.run(state, { getFixtures: async () => fixtures });
  assert.equal(h.posts.length, 2);
});

test('news failure does not block reminders', async () => {
  const now = 1_000_000_000_000;
  const h = harness();
  await h.run(fresh(), {
    getNews: async () => { throw new Error('site down'); },
    getFixtures: async () => [{ id: 'x', kickoff: now + H, tbc: false, home: 'Gillingham', away: 'Y', venue: null, url: 'u' }],
  });
  assert.equal(h.posts.length, 1);
});

test('permanent 4xx on one item is skipped and does not block the rest', async () => {
  const posts = [];
  const state = { seeded: true, seenNews: [], remindedFixtures: [] };
  const h = harness();
  await h.run(state, {
    getNews: async () => [art('bad', 'Club News', 1), art('good', 'Club News', 2)],
    post: async (p) => {
      if (p.embeds[0].title === 'bad') throw Object.assign(new Error('400'), { status: 400 });
      posts.push(p);
    },
  });
  assert.deepEqual(posts.map((p) => p.embeds[0].title), ['good']);
  assert.ok(state.seenNews.includes('bad'));
});

test('transient 5xx leaves item unseen for retry', async () => {
  const state = { seeded: true, seenNews: [], remindedFixtures: [] };
  await harness().run(state, {
    getNews: async () => [art('a', 'Club News')],
    post: async () => { throw Object.assign(new Error('503'), { status: 503 }); },
  });
  assert.equal(state.seenNews.includes('a'), false);
});

test('rescheduled fixture (same id, new kickoff) is reminded again', async () => {
  const now = 1_000_000_000_000;
  const mk = (dt) => ({ id: '7', kickoff: now + dt, tbc: false, status: 'Fixture', home: 'Gillingham', away: 'Y', venue: null, url: 'u' });
  const h = harness();
  const state = { seeded: true, seenNews: [], remindedFixtures: [] };
  await h.run(state, { getFixtures: async () => [mk(2 * H)] });
  await h.run(state, { now: now + 100 * H, getFixtures: async () => [{ ...mk(2 * H), kickoff: now + 101 * H }] });
  assert.equal(h.posts.length, 2);
});

test('postponed fixture gets no reminder', async () => {
  const now = 1_000_000_000_000;
  const h = harness();
  await h.run({ seeded: true, seenNews: [], remindedFixtures: [] }, {
    getFixtures: async () => [{ id: '8', kickoff: now + H, tbc: false, status: 'Postponed', home: 'G', away: 'Y', venue: null, url: 'u' }],
  });
  assert.equal(h.posts.length, 0);
});

test('empty news parse does not arm seeding', async () => {
  const state = { seeded: false, seenNews: [], remindedFixtures: [] };
  await harness().run(state, { getNews: async () => [] });
  assert.equal(state.seeded, false);
});

test('state is persisted after each successful post', async () => {
  const saves = [];
  const state = { seeded: true, seenNews: [], remindedFixtures: [] };
  await harness().run(state, {
    getNews: async () => [art('a', 'Club News', 1), art('b', 'Club News', 2)],
    persist: async (s) => saves.push([...s.seenNews]),
  });
  assert.deepEqual(saves[0], []); // initial save, before any post
  assert.deepEqual(saves[1], ['a']);
  assert.deepEqual(saves[2], ['a', 'b']);
});

test('unwritable state aborts the cycle before anything is posted', async () => {
  const h = harness();
  await assert.rejects(
    h.run({ seeded: true, seenNews: [], remindedFixtures: [] }, {
      getNews: async () => [art('a', 'Club News')],
      persist: async () => { throw new Error('disk full'); },
    }),
    /disk full/,
  );
  assert.equal(h.posts.length, 0);
});

test('dead webhook (404) aborts the cycle and marks nothing seen', async () => {
  const state = { seeded: true, seenNews: [], remindedFixtures: [] };
  await assert.rejects(
    harness().run(state, {
      getNews: async () => [art('a', 'Club News')],
      post: async () => { throw Object.assign(new Error('404'), { status: 404 }); },
    }),
    /404/,
  );
  assert.equal(state.seenNews.includes('a'), false);
});
