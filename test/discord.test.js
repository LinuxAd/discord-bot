import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postWebhook, reminderPayload, newsPayload } from '../src/discord.js';
import { loadConfig } from '../src/config.js';

const res = (status, body = {}) => ({ ok: status < 300, status, json: async () => body });

test('postWebhook retries on 429 then succeeds', async () => {
  const calls = [];
  const fetchImpl = async (_u, init) => { calls.push(init); return calls.length === 1 ? res(429, { retry_after: 0 }) : res(204); };
  await postWebhook('https://discord.com/api/webhooks/1/x', { content: 'hi' }, { fetchImpl });
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].body).allowed_mentions, { parse: [] });
});

test('postWebhook throws on other failures', async () => {
  await assert.rejects(
    postWebhook('https://discord.com/api/webhooks/1/x', {}, { fetchImpl: async () => res(404) }),
    /HTTP 404/,
  );
});

test('reminder embed shows London local kick-off time', () => {
  // 2026-10-17 14:00Z is 15:00 BST
  const p = reminderPayload({ home: 'Accrington Stanley', away: 'Gillingham', kickoff: Date.UTC(2026, 9, 17, 14), venue: 'Wham Stadium', url: 'u' });
  const e = p.embeds[0];
  assert.match(e.title, /Accrington Stanley vs Gillingham/);
  assert.match(e.fields[0].value, /Saturday.*17 October.*15:00/);
});

test('news embed is well formed', () => {
  const e = newsPayload({ title: 'T', url: 'u', category: 'Club News', publishedAt: 0, image: null }).embeds[0];
  assert.equal(e.title, 'T');
  assert.equal(e.image, undefined);
});

test('loadConfig validates webhook and parses categories', () => {
  assert.throws(() => loadConfig({}), /required/);
  assert.throws(() => loadConfig({ DISCORD_WEBHOOK_URL: 'https://evil.example/x' }), /webhook/);
  const c = loadConfig({ DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/x', NEWS_CATEGORIES: 'Club News, Youth' });
  assert.deepEqual(c.categories, ['club news', 'youth']);
  assert.equal(c.pollMinutes, 15);
});

test('scraped text is escaped and capped in embeds', () => {
  const e = reminderPayload({ home: 'A', away: 'B', kickoff: 0, venue: '[click](https://evil.example) '.repeat(100), url: 'u' }).embeds[0];
  assert.ok(!/\[click\]\(/.test(e.fields[1].value));
  assert.ok(e.fields[1].value.length <= 1024);
});
