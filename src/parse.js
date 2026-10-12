import * as cheerio from 'cheerio';
import { SITE_ORIGIN } from './config.js';

const abs = (href) => {
  if (!href) return null;
  try {
    const u = new URL(href, SITE_ORIGIN);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
};
const onSite = (href) => {
  const u = abs(href);
  return u && u.origin === SITE_ORIGIN ? u.toString() : null;
};
const clean = (s) => s.replace(/\s+/g, ' ').trim();

export function parseNews(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('article.m-teaser').each((_, el) => {
    const a = $(el).find('a.m-teaser__link').first();
    const url = onSite(a.attr('href') ?? '');
    const title = clean($(el).find('.m-teaser__title').first().text());
    if (!url || !title) return;
    const ts = Number($(el).find('[data-timestamp]').first().attr('data-timestamp'));
    const img = $(el).find('img').first();
    const image = abs(img.attr('src') || img.attr('data-src') || '')?.toString() ?? null;
    items.push({
      id: new URL(url).pathname,
      url,
      title,
      category: clean($(el).find('.m-teaser__category').first().text()),
      publishedAt: Number.isFinite(ts) && ts > 0 ? ts * 1000 : null,
      image,
    });
  });
  return items;
}

export function parseFixtures(html) {
  const $ = cheerio.load(html);
  const byId = new Map();
  $('.m-fixture-entity[data-fixture-id][data-display-mode="teaser"]').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('data-fixture-id');
    const start = Number($el.attr('data-start-time'));
    const home = clean($el.find('.m-fixture__team-name--home').first().text());
    const away = clean($el.find('.m-fixture__team-name--away').first().text());
    if (!id || !Number.isFinite(start) || start <= 0 || !home || !away) return;
    byId.set(id, {
      id,
      kickoff: start * 1000,
      tbc: $el.attr('data-tbc') === '1',
      status: $el.attr('data-match-status') || '',
      home,
      away,
      venue: clean($el.find('.m-fixture__venue').first().text()) || null,
      url: onSite(`/fixture/view/${encodeURIComponent(id)}`),
    });
  });
  return [...byId.values()].sort((a, b) => a.kickoff - b.kickoff);
}
