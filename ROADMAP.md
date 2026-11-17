# ProjectT — Safe & Basic Roadmap

A 3D Red vs. Blue battle simulation that viewers influence through TikTok Live chat. **One stream first.** Scale only after the basic version is stable.

## What changed from the original plan

| Original | Safe & basic version | Why |
| :-- | :-- | :-- |
| 3–5 streams on one machine | **1 stream** | Prove it works before multiplying the risk |
| NVENC, core pinning, PM2 cron restarts | CPU `libx264` first; PM2 only for auto-restart | Fewer moving parts; add NVENC later if CPU is too high |
| Gifts spawn units, meteors, bosses | **Chat commands + likes only** | Gifts involve real money; wrong behavior there causes disputes |
| 500 units, 2 draw calls | **100 units max**, plain `InstancedMesh` | Easier to debug, still looks full on a phone |
| Run 24/7 immediately | Run supervised sessions first, 24/7 later | Unattended automation is where accounts and streams get into trouble |

## Safety rules (apply from day one)

1. **Secrets never go in the repo.** Stream key, RTMP URL, tokens → `.env` only. Add `.env` to `.gitignore` *before the first commit*. Commit a `.env.example` with placeholder values.
2. **Use fine-grained, short-lived GitHub tokens** scoped to the single repo. Never paste tokens into chats, code, or issues. Revoke any token that has been shared.
3. **Treat viewer text as hostile.** Usernames and chat go on screen. Strip HTML/control characters, cap length (e.g. 16 chars), apply a simple blocklist, and render with canvas `fillText` only (never `innerHTML`).
4. **Rate-limit everything.** Per-user cooldown (15 s), global spawn queue (FIFO), hard cap on active units, drop excess instead of letting it pile up.
5. **TikTok risk check before going live.** `tiktok-live-connector` is an unofficial library and can break or conflict with TikTok's terms; going live via RTMP also has eligibility requirements. Read TikTok's current LIVE rules, test on a secondary account, and don't build anything you can't afford to lose on the main one.
6. **Content rules.** Fully automated, repetitive streams can be flagged. Keep the game varied and clearly interactive, and keep an easy manual kill switch.
7. **Log without leaking.** Never log stream keys or full URLs containing them.

## Roadmap

### Phase 0 — Repo hygiene (30 min)
- [ ] `.gitignore` (`node_modules`, `.env`, `*.log`, `out/`)
- [ ] `.env.example` with `TIKTOK_USERNAME`, `RTMP_URL`, `STREAM_KEY`
- [ ] README with run instructions

### Phase 1 — Offline battle engine (no TikTok, no streaming)
Runs in a normal browser tab with fake events from a debug panel.
- [ ] 1.1 720×1280 WebGL canvas with 2D overlay canvas
- [ ] 1.2 One low-poly unit, two `InstancedMesh` pools (red/blue), max 50 per side
- [ ] 1.3 Pre-allocated unit pool; dead units hidden via scale 0
- [ ] 1.4 Simple 2D movement + targeting using squared distances (no physics engine)
- [ ] 1.5 Scoreboard, base HP bars, up to 10 nameplates
- [ ] 1.6 Round end → 5 s banner → automatic reset
- [ ] 1.7 Debug buttons: "spawn red", "spawn blue", "reset"

**Done when:** it holds 30 FPS for 1 hour in a normal browser.

### Phase 2 — Event bridge (still no streaming)
- [ ] 2.1 Node.js listener for `chat` and `like` events only
- [ ] 2.2 Command parser for `!red` / `!blue`, sanitization, per-user cooldown, FIFO queue with max length
- [ ] 2.3 Send sanitized JSON to the page via a local WebSocket bound to `127.0.0.1` only
- [ ] 2.4 Auto-reconnect with backoff (not a tight retry loop)

**Done when:** chat commands from a test live spawn units, and spam does nothing harmful.

### Phase 3 — Capture to a local file first
- [ ] 3.1 Headless Chromium via Puppeteer, fixed viewport
- [ ] 3.2 Pipe frames to FFmpeg, output to a **local `.mp4`** (not RTMP yet)
- [ ] 3.3 Check smoothness, A/V sync, CPU/RAM
- [ ] 3.4 Only then switch FFmpeg output to RTMP (`libx264`, ~2500 kbps, 30 FPS, 2 s keyframes)

**Done when:** a 30-minute supervised test stream runs clean.

### Phase 4 — Single-stream hardening
- [ ] 4.1 PM2 with auto-restart and `max_memory_restart`
- [ ] 4.2 One daily restart in a quiet period
- [ ] 4.3 Log rotation; optional Discord/Telegram alert on repeated disconnects
- [ ] 4.4 Kill switch (one command stops FFmpeg + browser)

**Done when:** 24 hours of supervised uptime without leaks or drift.

### Phase 5 — Optional extras (only after Phase 4)
- Gift-triggered units (with strict caps and a clear policy)
- NVENC encoding if CPU is the bottleneck
- Multiple streams, each with its own `.env` and process

## Known technical caveat
Piping Puppeteer screenshots into FFmpeg is often too slow for 30 FPS. If Phase 3 stutters, try `canvas.captureStream` with a `MediaRecorder`, or render frames deterministically (fixed timestep, `canvas.toBlob`) and encode offline-style. Decide based on the Phase 3 measurements, not in advance.
