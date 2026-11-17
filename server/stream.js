import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const W = 720, H = 1280, FPS = 30;

export function buildFfmpegArgs({ encoder = 'libx264', bitrate = '2500k', output }) {
  if (!['libx264', 'h264_nvenc'].includes(encoder)) throw new Error(`unsupported encoder: ${encoder}`);
  if (!/^\d{3,5}k$/.test(bitrate)) throw new Error(`bad bitrate: ${bitrate}`);
  const kbps = parseInt(bitrate, 10);
  const video = encoder === 'h264_nvenc'
    ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'cbr']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-sc_threshold', '0'];
  const tail = output.kind === 'file'
    ? ['-t', String(output.seconds), '-movflags', '+faststart', '-y', output.path]
    : ['-f', 'flv', output.target];
  return [
    '-hide_banner', '-loglevel', 'warning',
    '-use_wallclock_as_timestamps', '1', '-thread_queue_size', '64', '-f', 'image2pipe', '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-vf', `fps=${FPS},format=yuv420p`,
    ...video, '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', `${kbps * 2}k`, '-g', String(FPS * 2), '-keyint_min', String(FPS * 2),
    '-c:a', 'aac', '-b:a', '64k', '-shortest', ...tail,
  ];
}

export async function startCapture({ url, ffmpegArgs, secret = '', chromePath, onExit, log }) {
  let finished = false, lastFrame = Date.now(), backpressure = false;
  const done = (reason) => { if (!finished) { finished = true; onExit(reason); } };

  const ff = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
  ff.stderr.on('data', (b) => {                       // ffmpeg can echo the output URL: redact the key
    let s = b.toString().trim();
    if (secret) s = s.split(secret).join('***');
    if (s) log(`ffmpeg: ${s}`);
  });
  ff.stdin.on('error', () => {});
  ff.on('exit', (code) => done(code === 0 ? 'ffmpeg finished' : `ffmpeg exited with code ${code}`));

  const args = ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--disable-dev-shm-usage', '--mute-audio', '--no-first-run', `--window-size=${W},${H}`];
  if (process.env.NO_SANDBOX === '1') args.push('--no-sandbox');   // only for Docker/root; off by default
  const browser = await puppeteer.launch({ headless: true, args, executablePath: chromePath || undefined, defaultViewport: { width: W, height: H, deviceScaleFactor: 1 } });
  browser.on('disconnected', () => done('browser disconnected'));
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'load' });

  const cdp = await page.createCDPSession();
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    lastFrame = Date.now();
    if (!backpressure && ff.stdin.writable) {
      if (!ff.stdin.write(Buffer.from(data, 'base64'))) { backpressure = true; ff.stdin.once('drain', () => { backpressure = false; }); }
    }
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

  const watchdog = setInterval(() => { if (Date.now() - lastFrame > 15000) done('no frames for 15s'); }, 5000);

  return {
    async stop() {
      clearInterval(watchdog);
      finished = true;
      try { ff.stdin.end(); } catch {}
      await new Promise((r) => { const t = setTimeout(() => { ff.kill('SIGKILL'); r(); }, 8000); ff.once('exit', () => { clearTimeout(t); r(); }); });
      await browser.close().catch(() => {});
    },
  };
}
