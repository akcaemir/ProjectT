export const MAX_COUNT = 3;

export function sanitizeName(s) {
  return String(s ?? '').replace(/[^\p{L}\p{N}_.\- ]/gu, '').trim().slice(0, 16);
}

// "!red", "!blue", optionally "!red 2" (1-3). Anything else is ignored.
export function parseCommand(text) {
  const m = /^\s*!(red|blue)(?:\s+([1-3]))?\s*$/i.exec(String(text ?? '').slice(0, 40));
  if (!m) return null;
  return { team: m[1].toLowerCase() === 'red' ? 0 : 1, count: m[2] ? Number(m[2]) : 1 };
}

// Per-user cooldown. Returns true (and records) if the user may act now.
export class Cooldown {
  constructor(ms, now = () => Date.now()) { this.ms = ms; this.now = now; this.last = new Map(); }
  try(key) {
    const t = this.now();
    if (this.last.size > 5000) this.prune(t);
    const prev = this.last.get(key);
    if (prev !== undefined && t - prev < this.ms) return false;
    this.last.set(key, t);
    return true;
  }
  prune(t = this.now()) {
    for (const [k, v] of this.last) if (t - v >= this.ms) this.last.delete(k);
  }
}

// Bounded FIFO: when full, new items are dropped (never grows without limit).
export class SpawnQueue {
  constructor(maxLen = 200) { this.maxLen = maxLen; this.items = []; }
  push(item) { if (this.items.length >= this.maxLen) return false; this.items.push(item); return true; }
  shift() { return this.items.shift(); }
  clear() { this.items.length = 0; }
  get length() { return this.items.length; }
}

// Counts likes and reports how many whole thresholds were crossed.
export class LikeCounter {
  constructor(threshold = 100) { this.threshold = threshold; this.total = 0; }
  add(n) {
    const add = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 10000) : 0;
    const before = Math.floor(this.total / this.threshold);
    this.total += add;
    return Math.floor(this.total / this.threshold) - before;
  }
}
