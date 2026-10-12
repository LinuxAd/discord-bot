import { loadConfig, NEWS_URL, FIXTURES_URL } from './config.js';
import { parseNews, parseFixtures } from './parse.js';
import { postWebhook } from './discord.js';
import { loadState, saveState } from './state.js';
import { runCycle } from './bot.js';

const UA = 'gillingham-discord-bot/1.0 (+personal community bot)';
const log = (m) => console.log(`${new Date().toISOString()} ${m}`);

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

const config = loadConfig();
const once = process.argv.includes('--once');

async function tick() {
  const state = await loadState(config.stateFile);
  await runCycle({
    state,
    config,
    now: Date.now(),
    getNews: async () => parseNews(await fetchHtml(NEWS_URL)),
    getFixtures: async () => parseFixtures(await fetchHtml(FIXTURES_URL)),
    post: (payload) => postWebhook(config.webhookUrl, payload),
    persist: (s) => saveState(config.stateFile, s),
    log,
  });
}

let running = false;
async function safeTick() {
  if (running) return log('previous tick still running; skipping');
  running = true;
  try {
    await tick();
  } catch (err) {
    log(`tick failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    running = false;
  }
}

if (once) {
  await safeTick();
} else {
  log(`started; polling every ${config.pollMinutes} min`);
  await safeTick();
  setInterval(safeTick, config.pollMinutes * 60_000);
}
