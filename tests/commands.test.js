import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, sanitizeName, Cooldown, SpawnQueue, LikeCounter } from '../server/commands.js';
import { buildFfmpegArgs } from '../server/stream.js';

test('parseCommand accepts only !red / !blue with optional 1-3', () => {
  assert.deepEqual(parseCommand('!red'), { team: 0, count: 1 });
  assert.deepEqual(parseCommand('  !BLUE 3 '), { team: 1, count: 3 });
  for (const bad of ['red', '!red 9', '!red 0', '!green', '!red now', '', null, undefined, '!red\n!blue']) assert.equal(parseCommand(bad), null, String(bad));
});

test('sanitizeName strips markup and caps length', () => {
  assert.equal(sanitizeName('<img src=x onerror=1>'), 'img srcx onerror');
  assert.equal(sanitizeName('a'.repeat(50)).length, 16);
  assert.equal(sanitizeName(undefined), '');
  assert.equal(sanitizeName('Çağlar_01'), 'Çağlar_01');
});

test('Cooldown blocks repeats until the window passes', () => {
  let t = 0;
  const c = new Cooldown(15000, () => t);
  assert.equal(c.try('u1'), true);
  assert.equal(c.try('u1'), false);
  assert.equal(c.try('u2'), true);
  t = 15000;
  assert.equal(c.try('u1'), true);
});

test('SpawnQueue is FIFO and bounded', () => {
  const q = new SpawnQueue(2);
  assert.equal(q.push(1), true); assert.equal(q.push(2), true); assert.equal(q.push(3), false);
  assert.equal(q.shift(), 1); assert.equal(q.shift(), 2); assert.equal(q.shift(), undefined);
});

test('LikeCounter reports crossed thresholds and ignores junk', () => {
  const l = new LikeCounter(100);
  assert.equal(l.add(60), 0); assert.equal(l.add(60), 1); assert.equal(l.add(250), 2);
  assert.equal(l.add(-5), 0); assert.equal(l.add(NaN), 0);
});

test('buildFfmpegArgs validates input and never uses a shell string', () => {
  const out = { kind: 'file', path: 'out/t.mp4', seconds: 10 };
  assert.ok(Array.isArray(buildFfmpegArgs({ output: out })));
  assert.throws(() => buildFfmpegArgs({ encoder: 'rm -rf', output: out }));
  assert.throws(() => buildFfmpegArgs({ bitrate: '2500k; ls', output: out }));
});
