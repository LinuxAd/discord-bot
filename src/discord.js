const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function postWebhook(webhookUrl, payload, { fetchImpl = fetch, retries = 3, backoffMs = 2000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      if (attempt < retries) { await sleep(backoffMs); continue; }
      throw err;
    }
    if (res.ok) return;
    if (attempt < retries && (res.status === 429 || res.status >= 500)) {
      const body = res.status === 429 ? await res.json().catch(() => ({})) : {};
      await sleep(res.status === 429 ? Math.min(Math.ceil((body.retry_after ?? 1) * 1000), 30_000) : backoffMs);
      continue;
    }
    throw Object.assign(new Error(`Discord webhook failed: HTTP ${res.status}`), { status: res.status });
  }
}

const GILLS_BLUE = 0x0033a0;
// Scraped text is rendered as Discord markdown (masked links etc.), so escape and cap it.
const md = (s) => s.replace(/[\\*_~`|>[\]()#]/g, '\\$&');
const cap = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmtTime = (ms) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London',
  }).format(new Date(ms));

export function newsPayload(item) {
  return {
    embeds: [{
      title: cap(item.title, 256),
      url: item.url,
      color: GILLS_BLUE,
      description: item.category ? `**${cap(md(item.category), 200)}**` : undefined,
      image: item.image ? { url: item.image } : undefined,
      timestamp: item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined,
      footer: { text: 'gillinghamfootballclub.com' },
    }],
  };
}

export function reminderPayload(fx) {
  return {
    embeds: [{
      title: cap(`⚽ Next match: ${fx.home} vs ${fx.away}`, 256),
      url: fx.url,
      color: GILLS_BLUE,
      // <t:…:R> renders as "in 23 hours" and stays correct if the bot posts late.
      description: `Kicks off <t:${Math.floor(fx.kickoff / 1000)}:R>`,
      fields: [
        { name: 'Kick-off', value: fmtTime(fx.kickoff), inline: true },
        ...(fx.venue ? [{ name: 'Venue', value: cap(md(fx.venue), 1024), inline: true }] : []),
      ],
      footer: { text: 'Up the Gills!' },
    }],
  };
}
