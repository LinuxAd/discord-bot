export const NEWS_URL = 'https://www.gillinghamfootballclub.com/news';
export const FIXTURES_URL = 'https://www.gillinghamfootballclub.com/fixture/list/56';
export const SITE_ORIGIN = 'https://www.gillinghamfootballclub.com';

const DEFAULT_CATEGORIES = [
  'Club News',
  'First-Team',
  'Fixture News',
  'Match Previews',
  'Match Reports',
  'Ticket News',
];

export function loadConfig(env = process.env) {
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL is required');
  if (!/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//.test(webhookUrl)) {
    throw new Error('DISCORD_WEBHOOK_URL does not look like a Discord webhook URL');
  }
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    webhookUrl,
    pollMinutes: Math.max(5, num(env.POLL_MINUTES, 15)),
    reminderHours: num(env.REMINDER_HOURS, 24),
    maxNewsPerPoll: num(env.MAX_NEWS_PER_POLL, 5),
    categories: (env.NEWS_CATEGORIES ? env.NEWS_CATEGORIES.split(',') : DEFAULT_CATEGORIES)
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
    stateFile: env.STATE_FILE || 'data/state.json',
  };
}
