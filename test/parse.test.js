import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNews, parseFixtures } from '../src/parse.js';

const load = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('parseNews extracts articles and skips ones without a link', () => {
  const items = parseNews(load('news.html'));
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    id: '/news/signing-announced',
    url: 'https://www.gillinghamfootballclub.com/news/signing-announced',
    title: 'Striker "signs"',
    category: 'First-Team',
    publishedAt: 1791825246000,
    image: null,
  });
  assert.equal(items[1].url, 'https://www.gillinghamfootballclub.com/news/hale-interview');
  assert.equal(items[1].publishedAt, null);
});

test('parseFixtures uses teasers only, dedupes, keeps TBC flag, drops malformed rows', () => {
  const fx = parseFixtures(load('fixtures.html'));
  assert.deepEqual(fx.map((f) => f.id), ['0', '1']);
  const f1 = fx.find((f) => f.id === '1');
  assert.equal(f1.home, 'Accrington Stanley');
  assert.equal(f1.away, 'Gillingham');
  assert.equal(f1.kickoff, 1792245600000);
  assert.equal(f1.venue, 'Wham Stadium');
  assert.equal(fx.find((f) => f.id === '0').tbc, true);
});

test('parseNews drops off-site and non-http links', () => {
  const html = ['https://evil.example/x', 'javascript:alert(1)', '/news/ok']
    .map((h) => `<article class="m-teaser"><a class="m-teaser__link" href="${h}"></a><h3 class="m-teaser__title">T</h3></article>`)
    .join('');
  assert.deepEqual(parseNews(html).map((n) => n.id), ['/news/ok']);
});
