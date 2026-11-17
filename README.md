# ProjectT

Red vs. Blue 3D battle simulation driven by TikTok Live chat. See ROADMAP.md for the plan and safety rules.

## Setup
    npm ci
    cp .env.example .env      # then edit; .env is gitignored
    npm test

## Phase 1 - offline engine (no Node needed)
    python -m http.server 8000      # open http://localhost:8000, use the debug panel

## Phase 2 - chat bridge
    npm run mock        # fake chat/likes, TikTok is NOT contacted. Open http://127.0.0.1:8000/?bridge=1
    npm start           # real TikTok chat for TIKTOK_USERNAME (use a test account)

Commands: `!red`, `!blue`, optionally `!red 2` (1-3 units). 15 s cooldown per user, bounded queue,
max 10 events/s into the game, every 100 likes reinforces the side with fewer units.
The page is served on 127.0.0.1 only; the WebSocket rejects pages from other origins.

## Phase 3 - capture
    npm run record      # mock events -> out/test.mp4 (60 s). Nothing is streamed anywhere.
    node server/index.js --rtmp      # goes LIVE after a 5 s countdown (needs RTMP_URL + STREAM_KEY)

Requires `ffmpeg` on PATH. Stream keys are redacted from ffmpeg logs. Check `out/test.mp4` before ever using `--rtmp`.

## Phase 4 - hardening (single stream)
    npm i -g pm2 && pm2 start ecosystem.config.cjs

Auto-restart with backoff, 600M controller limit, daily 05:00 restart, a 15 s no-frames watchdog
that exits non-zero so PM2 restarts the whole pipeline, optional Discord webhook alert (ALERT_WEBHOOK_URL).
Kill switch: `pm2 stop projectt`.
