# Gillingham FC Discord feed

Posts to a Discord channel:

- **Major club news** from gillinghamfootballclub.com (Club News, First-Team, Fixture News, Match Previews, Match Reports, Ticket News).
- **A match reminder 24 hours before kick-off** (kick-off time in UK time, plus venue).

It uses a Discord **webhook**, so there is no bot token or gateway connection to manage.

## Setup

1. In Discord: *Channel settings → Integrations → Webhooks → New Webhook*, copy the URL.
2. `cp .env.example .env` and set `DISCORD_WEBHOOK_URL`.
3. `npm install`
4. `node --env-file=.env src/index.js` (long-running, polls every 15 min)
   or `node --env-file=.env src/index.js --once` from cron/launchd.

The first run records existing articles as seen and posts nothing (no backfill). State lives in `data/state.json`.

## Config (env)

| Var | Default | |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | none | required |
| `POLL_MINUTES` | 15 | |
| `REMINDER_HOURS` | 24 | how long before kick-off to remind |
| `MAX_NEWS_PER_POLL` | 5 | flood guard |
| `NEWS_CATEGORIES` | see above | comma-separated; add `Interviews`, `Youth`, etc. to widen |
| `STATE_FILE` | `data/state.json` | |

## Notes

- The club site has no RSS feed, so news and fixtures are scraped from its HTML. If the site redesigns, `src/parse.js` is the only file to fix; tests in `test/` use small fixtures mirroring the markup.
- The fixture list does not expose the competition as text, so reminders omit it.
- `npm test` runs the suite (Node 20+).
