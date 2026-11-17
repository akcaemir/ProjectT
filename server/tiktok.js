import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

// Chat + like listener with exponential backoff (never a tight retry loop).
export function startTikTok({ username, onChat, onLike, log }) {
  let conn = null, stopped = false, retryTimer = null, delay = 5000;

  function scheduleRetry() {
    if (stopped || retryTimer) return;
    const wait = delay + Math.floor(Math.random() * 1000);
    log(`reconnecting in ${Math.round(wait / 1000)}s`);
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, wait);
    delay = Math.min(delay * 2, 120000);
  }

  async function connect() {
    if (stopped) return;
    conn?.disconnect().catch(() => {});
    conn = new TikTokLiveConnection(username);
    conn.on(WebcastEvent.CHAT, (d) => {
      const u = d.user ?? {};
      onChat(String(u.userId ?? u.uniqueId ?? ''), u.uniqueId ?? '', d.comment);
    });
    conn.on(WebcastEvent.LIKE, (d) => onLike(Number(d.likeCount) || 0));
    conn.on(ControlEvent.DISCONNECTED, () => { log('disconnected'); scheduleRetry(); });
    conn.on(ControlEvent.ERROR, (e) => log(`connector error: ${e?.message ?? e}`));
    try { await conn.connect(); delay = 5000; log(`connected to @${username}`); }
    catch (e) { log(`connect failed: ${e?.message ?? e}`); scheduleRetry(); }
  }

  connect();
  return { stop() { stopped = true; clearTimeout(retryTimer); return conn?.disconnect().catch(() => {}); } };
}
