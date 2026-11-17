// Single stream under PM2. Start with: pm2 start ecosystem.config.cjs
// NOTE: max_memory_restart only watches the Node controller; Chromium/FFmpeg are children and are
// covered by the controller's no-frames watchdog (exit 1 -> PM2 restarts everything) plus the daily restart.
module.exports = {
  apps: [{
    name: 'projectt',
    script: 'server/index.js',
    args: '--rtmp',                    // goes LIVE (after a 5 s countdown). Remove for a local-only run.
    autorestart: true,
    min_uptime: '30s',
    max_restarts: 10,
    exp_backoff_restart_delay: 2000,
    max_memory_restart: '600M',
    kill_timeout: 15000,               // time for ffmpeg to finish and Chromium to close
    cron_restart: '0 5 * * *',         // daily restart at 05:00 server time (quiet period)
  }],
};
