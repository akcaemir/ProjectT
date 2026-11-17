import dotenv from 'dotenv';
import { mkdirSync } from 'node:fs';
import { createBridge } from './bridge-server.js';
import { parseCommand, sanitizeName, Cooldown, SpawnQueue, LikeCounter } from './commands.js';

dotenv.config({ path: process.env.ENV_FILE || '.env', quiet: true });   // ENV_FILE lets each stream use its own env file later

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const mock = has('--mock'), record = has('--record'), rtmp = has('--rtmp');
const si = argv.indexOf('--seconds');
const seconds = si >= 0 ? Math.min(Math.max(Number(argv[si + 1]) || 60, 5), 3600) : 60;
const { TIKTOK_USERNAME, RTMP_URL, STREAM_KEY, ENCODER, BITRATE, ALERT_WEBHOOK_URL, CHROME_PATH } = process.env;
const port = Number(process.env.PORT) || 8000;

const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fatal = (m) => { log(`ERROR: ${m}`); process.exit(1); };

if (!mock && !TIKTOK_USERNAME) fatal('TIKTOK_USERNAME is not set (copy .env.example to .env), or use --mock');
if (rtmp && (!RTMP_URL || !STREAM_KEY)) fatal('--rtmp needs RTMP_URL and STREAM_KEY in your .env');

let lastAlert = 0;
async function alert(msg) {                                        // optional Discord-style webhook, max once / 5 min
  if (!ALERT_WEBHOOK_URL || Date.now() - lastAlert < 300000) return;
  lastAlert = Date.now();
  try { await fetch(ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: `ProjectT: ${msg}` }) }); } catch {}
}

// ---- event pipeline: sanitize -> cooldown -> bounded queue -> rate-limited drain ----
const bridge = createBridge({ port });
const cooldown = new Cooldown(15000);
const queue = new SpawnQueue(200);
const likes = new LikeCounter(100);

function onChat(userKey, name, text) {
  const cmd = parseCommand(text);
  if (!cmd || !userKey || !cooldown.try(userKey)) return;
  if (!queue.push({ type: 'spawn', team: cmd.team, name: sanitizeName(name), count: cmd.count })) log('queue full, dropped a spawn');
}
function onLike(n) {
  for (let i = likes.add(n); i > 0; i--) queue.push({ type: 'support' });
}
setInterval(() => {                                                // max 10 events/second reach the game
  const item = queue.shift();
  if (item && bridge.clientCount > 0) bridge.broadcast(item);      // nobody watching -> discard, never pile up stale events
}, 100);

let tiktok = null, capture = null;
if (mock) {
  const names = ['ali', 'zeynep', 'mehmet', 'ayse', 'can', 'deniz', 'ece', 'burak', 'selin', 'kaan'];
  (function tick() {
    const n = names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 90 + 10);
    onChat(n, n, Math.random() < 0.7 ? (Math.random() < 0.5 ? '!red' : '!blue 2') : 'hello');
    if (Math.random() < 0.3) onLike(25);
    setTimeout(tick, 300 + Math.random() * 900);
  })();
  log('MOCK mode: fake chat events, TikTok is not contacted');
} else {
  const { startTikTok } = await import('./tiktok.js');
  tiktok = startTikTok({ username: TIKTOK_USERNAME, onChat, onLike, log: (m) => log(`tiktok: ${m}`) });
}

await bridge.listen();
log(`game page: http://127.0.0.1:${port}/?bridge=1   (localhost only)`);

// ---- Phase 3: capture (file by default, RTMP only with --rtmp) ----
async function shutdown(code = 0) {
  log('shutting down');
  await Promise.allSettled([tiktok?.stop(), capture?.stop(), bridge.close()]);
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (record || rtmp) {
  const { buildFfmpegArgs, startCapture } = await import('./stream.js');
  let output;
  if (rtmp) {
    let host = 'the configured server';
    try { host = new URL(RTMP_URL).host; } catch {}
    log(`GOING LIVE to ${host} in 5 seconds. Press Ctrl+C to abort.`);
    await sleep(5000);
    output = { kind: 'rtmp', target: `${RTMP_URL.replace(/\/$/, '')}/${STREAM_KEY}` };
  } else {
    mkdirSync('out', { recursive: true });
    output = { kind: 'file', path: 'out/test.mp4', seconds };
    log(`recording ${seconds}s to out/test.mp4 (not streaming anywhere)`);
  }
  capture = await startCapture({
    url: `http://127.0.0.1:${port}/?bridge=1&capture=1`,
    ffmpegArgs: buildFfmpegArgs({ encoder: ENCODER || 'libx264', bitrate: BITRATE || '2500k', output }),
    secret: STREAM_KEY || '', chromePath: CHROME_PATH,
    log, onExit: async (reason) => {
      log(`capture ended: ${reason}`);
      const clean = reason === 'ffmpeg finished';
      if (!clean) await alert(`stream stopped (${reason})`);
      await shutdown(clean ? 0 : 1);                               // non-zero -> PM2 restarts the whole pipeline
    },
  });
}
