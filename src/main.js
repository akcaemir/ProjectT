import * as THREE from 'three';

// ---------------- config ----------------
const W = 720, H = 1280;
const MAX = 50;                 // units per side
const N = MAX * 2;
const ARENA_X = 6, BASE_Z = 10, SPAWN_Z = 8.5;
const UNIT_HP = 30, DMG = 5, ATK_CD = 0.6;
const RANGE2 = 1.1 * 1.1, AGGRO2 = 16, BASE_RANGE = 1.8;
const SPEED = 2.2, SEP2 = 0.36, SEP_K = 6;
const BASE_HP = 300, RESET_SECS = 5, NAME_LIMIT = 10;
const TEAM = [
  { name: 'RED',  color: 0xe53935, css: '#e53935', dirZ:  1 },   // red marches toward +z (blue base)
  { name: 'BLUE', color: 0x1e88e5, css: '#1e88e5', dirZ: -1 },
];

// ---------------- pooled state (allocated once) ----------------
const active = new Uint8Array(N), mov = new Uint8Array(N), atk = new Uint8Array(N);
const hp = new Float32Array(N), px = new Float32Array(N), pz = new Float32Array(N);
const cd = new Float32Array(N), ph = new Float32Array(N), ox = new Float32Array(N), oz = new Float32Array(N);
const seq = new Uint32Array(N);
const owner = new Array(N).fill('');
const alive = [0, 0], wins = [0, 0], baseHp = [BASE_HP, BASE_HP];
let seqCounter = 0, time = 0, state = 'play', endTimer = 0, winner = -1, lastManual = -10, autoTimer = 0;

// ---------------- three.js scene ----------------
const glCanvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14181f);
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
camera.position.set(0, 20, 15);
camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(5, 12, 6);
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 26), new THREE.MeshLambertMaterial({ color: 0x2b3340 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

TEAM.forEach((t) => {
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 1.2), new THREE.MeshLambertMaterial({ color: t.color }));
  base.position.set(0, 0.6, -t.dirZ * BASE_Z);    // red base at top of screen, blue at bottom
  scene.add(base);
});

// 2 draw calls for all units (bases/ground are separate static meshes)
const unitGeo = new THREE.CylinderGeometry(0.3, 0.38, 0.9, 6);
const meshes = TEAM.map((t) => {
  const m = new THREE.InstancedMesh(unitGeo, new THREE.MeshLambertMaterial({ color: t.color }), MAX);
  m.frustumCulled = false;
  scene.add(m);
  return m;
});
const dummy = new THREE.Object3D();
const proj = new THREE.Vector3();

function hide(i) {
  const t = i < MAX ? 0 : 1;
  dummy.position.set(0, -10, 0);
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  meshes[t].setMatrixAt(i - t * MAX, dummy.matrix);
}
for (let i = 0; i < N; i++) hide(i);

// ---------------- helpers ----------------
function sanitize(s) {
  return String(s ?? '').replace(/[^\p{L}\p{N}_.\- ]/gu, '').trim().slice(0, 16);
}

function spawn(team, name = '', count = 1, auto = false) {
  if (state !== 'play') return 0;
  const who = sanitize(name);
  let made = 0;
  for (let k = 0; k < count; k++) {
    let slot = -1;
    for (let i = team * MAX; i < (team + 1) * MAX; i++) if (!active[i]) { slot = i; break; }
    if (slot < 0) break;                               // pool full: drop extra spawns
    active[slot] = 1; hp[slot] = UNIT_HP;
    px[slot] = (Math.random() * 2 - 1) * (ARENA_X - 1);
    pz[slot] = -TEAM[team].dirZ * SPAWN_Z + (Math.random() - 0.5) * 1.5;
    cd[slot] = Math.random() * ATK_CD; ph[slot] = Math.random() * 6.28;
    owner[slot] = who; seq[slot] = ++seqCounter;
    alive[team]++; made++;
  }
  if (!auto) lastManual = time;
  return made;
}

function kill(i) {
  active[i] = 0; owner[i] = '';
  alive[i < MAX ? 0 : 1]--;
  hide(i);
}

function resetRound(winTeam) {
  if (winTeam >= 0) wins[winTeam]++;
  for (let i = 0; i < N; i++) if (active[i]) { active[i] = 0; owner[i] = ''; hide(i); }
  alive[0] = alive[1] = 0;
  baseHp[0] = baseHp[1] = BASE_HP;
  state = 'play'; winner = -1; autoTimer = 0;
}

// ---------------- simulation ----------------
function step(dt) {
  time += dt;
  if (state === 'ended') {
    endTimer -= dt;
    if (endTimer <= 0) resetRound(winner);
    return;
  }

  // baseline trickle so the arena never sits empty
  autoTimer += dt;
  if (time - lastManual > 3 && autoTimer > 1.2) {
    autoTimer = 0;
    spawn(alive[0] <= alive[1] ? 0 : 1, '', 1, true);
  }

  // soft separation (O(n^2) per team, ~2500 pair checks)
  ox.fill(0); oz.fill(0);
  for (let t = 0; t < 2; t++) {
    const a = t * MAX, b = a + MAX;
    for (let i = a; i < b; i++) {
      if (!active[i]) continue;
      for (let j = i + 1; j < b; j++) {
        if (!active[j]) continue;
        const dx = px[j] - px[i], dz = pz[j] - pz[i], d2 = dx * dx + dz * dz;
        if (d2 < SEP2 && d2 > 1e-6) {
          const k = SEP_K * (1 - d2 / SEP2);
          ox[i] -= dx * k; oz[i] -= dz * k; ox[j] += dx * k; oz[j] += dz * k;
        }
      }
    }
  }

  // targeting, attacking, moving (squared distances for acquisition)
  for (let i = 0; i < N; i++) {
    if (!active[i]) continue;
    const t = i < MAX ? 0 : 1, tm = TEAM[t], e0 = (1 - t) * MAX, e1 = e0 + MAX;
    let best = -1, bd = AGGRO2;
    for (let j = e0; j < e1; j++) {
      if (!active[j]) continue;
      const dx = px[j] - px[i], dz = pz[j] - pz[i], d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = j; }
    }
    cd[i] -= dt; atk[i] = 0;
    let mx = 0, mz = 0;
    if (best >= 0) {
      if (bd <= RANGE2) {
        atk[i] = 1;
        if (cd[i] <= 0) { cd[i] = ATK_CD; hp[best] -= DMG; if (hp[best] <= 0) kill(best); }
      } else {
        const d = Math.sqrt(bd);                         // only for units that are moving
        mx = (px[best] - px[i]) / d; mz = (pz[best] - pz[i]) / d;
      }
    } else if (Math.abs(tm.dirZ * BASE_Z - pz[i]) < BASE_RANGE) {
      atk[i] = 1;
      if (cd[i] <= 0) { cd[i] = ATK_CD; baseHp[1 - t] -= DMG * 0.5; }
    } else {
      mz = tm.dirZ;
    }
    mov[i] = (mx !== 0 || mz !== 0) ? 1 : 0;
    px[i] += mx * SPEED * dt; pz[i] += mz * SPEED * dt;
  }

  for (let i = 0; i < N; i++) {
    if (!active[i]) continue;
    px[i] = Math.max(-ARENA_X, Math.min(ARENA_X, px[i] + ox[i] * dt));
    pz[i] = Math.max(-BASE_Z, Math.min(BASE_Z, pz[i] + oz[i] * dt));
  }

  for (let t = 0; t < 2; t++) {
    if (baseHp[t] <= 0) { baseHp[t] = 0; state = 'ended'; winner = 1 - t; endTimer = RESET_SECS; }
  }
}

// ---------------- rendering ----------------
function renderUnits() {
  for (let i = 0; i < N; i++) {
    if (!active[i]) continue;
    const t = i < MAX ? 0 : 1;
    const hop = mov[i] ? Math.abs(Math.sin(time * 9 + ph[i])) * 0.22 : 0;
    const tilt = atk[i] ? Math.sin(time * 20 + ph[i]) * 0.4 + 0.3 : 0;
    dummy.position.set(px[i], 0.45 + hop, pz[i]);
    dummy.rotation.set(tilt * TEAM[t].dirZ, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    meshes[t].setMatrixAt(i - t * MAX, dummy.matrix);
  }
  meshes[0].instanceMatrix.needsUpdate = true;
  meshes[1].instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

const ctx = document.getElementById('ui').getContext('2d');
ctx.textAlign = 'center'; ctx.lineJoin = 'round';

function label(text, x, y, size, color = '#fff') {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = '#000'; ctx.fillStyle = color;
  ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
}

function bar(y, frac, color) {
  const w = 320, h = 22, x = (W - w) / 2;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, frac), h);
}

const pick = new Int16Array(NAME_LIMIT);
function drawNameplates() {
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (!active[i] || !owner[i]) continue;
    if (n < NAME_LIMIT) { pick[n++] = i; continue; }
    let m = 0;
    for (let k = 1; k < NAME_LIMIT; k++) if (seq[pick[k]] < seq[pick[m]]) m = k;
    if (seq[i] > seq[pick[m]]) pick[m] = i;
  }
  for (let k = 0; k < n; k++) {
    const i = pick[k];
    proj.set(px[i], 1.5, pz[i]).project(camera);
    label(owner[i], (proj.x * 0.5 + 0.5) * W, (-proj.y * 0.5 + 0.5) * H, 22, i < MAX ? '#ffb3b0' : '#b3d9ff');
  }
}

function renderHud() {
  ctx.clearRect(0, 0, W, H);
  label(`RED ${wins[0]}  –  ${wins[1]} BLUE`, W / 2, 62, 38);
  label(`${alive[0]} units`, W * 0.25, 100, 24, TEAM[0].css);
  label(`${alive[1]} units`, W * 0.75, 100, 24, TEAM[1].css);
  bar(128, baseHp[0] / BASE_HP, TEAM[0].css);
  bar(H - 64, baseHp[1] / BASE_HP, TEAM[1].css);
  drawNameplates();
  if (state === 'ended') {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, H / 2 - 110, W, 220);
    label(`${TEAM[winner].name} WINS!`, W / 2, H / 2 + 10, 78, TEAM[winner].css);
    label(`next round in ${Math.ceil(endTimer)}`, W / 2, H / 2 + 70, 30);
  }
}

// ---------------- main loop ----------------
const stats = document.getElementById('stats');
let last = performance.now(), frames = 0, fpsT = 0, fps = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  step(dt);
  renderUnits();
  renderHud();
  frames++; fpsT += dt;
  if (fpsT >= 1) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; stats.textContent = `FPS ${fps} · red ${alive[0]} · blue ${alive[1]}`; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- debug panel + hook for later phases ----------------
const nameInput = document.getElementById('name');
document.querySelectorAll('button[data-t]').forEach((b) =>
  b.addEventListener('click', () => spawn(+b.dataset.t, nameInput.value, +b.dataset.n)));
document.getElementById('reset').addEventListener('click', () => resetRound(-1));
window.battle = { spawn, reset: () => resetRound(-1) };   // Phase 2 bridge will call this
