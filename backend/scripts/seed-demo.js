#!/usr/bin/env node
/**
 * seed-demo.js — populate a DEMO device with SYNTHETIC sensor readings and cycles.
 *
 * Purpose: let the mobile app show a full Dashboard / Analytics / cycle history while
 * the physical ESP32 is unavailable. The values are illustrative only — they are NOT
 * experimental results and must never be cited as such (see CLAUDE.md barrier B8).
 *
 * Safety:
 *  - Writes only to the demo device (default `esp32-demo-001`), never to the real
 *    prototype `esp32-aquafilter-001`. Refuses the real device id unless --force-device.
 *  - `api` mode uses the public REST API like the ESP32 and the app do — safe against
 *    any backend, including Render. Needs an owner/technician login.
 *  - `db` mode writes with Mongoose and is LOCAL ONLY: it refuses Atlas/SRV URIs.
 *
 * Usage:
 *   node scripts/seed-demo.js --mode api --api https://aquafilter.onrender.com/api
 *   node scripts/seed-demo.js --mode api --api http://localhost:5000/api
 *   node scripts/seed-demo.js --mode db  [--reset]          (uses MONGO_URI from .env)
 *
 * Options:
 *   --mode api|db      api (default) or db
 *   --api URL          backend base URL for api mode (default http://localhost:5000/api)
 *   --device ID        demo device id (default esp32-demo-001)
 *   --days N           span of historical readings (default 7)
 *   --cycles N         number of cycles to create (default 6; api mode creates them
 *                      "live", so they last seconds — db mode backdates them realistically)
 *   --reset            db mode only: delete existing demo-device documents first
 *
 * Credentials for api mode are read from SEED_EMAIL / SEED_PASSWORD env vars, or
 * prompted interactively. Never pass a password on the command line.
 */

const path = require('path');
const readline = require('readline');

// -------------------------------------------------------------------
// ARGS
// -------------------------------------------------------------------

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const MODE = opt('mode', 'api');
const API = opt('api', 'http://localhost:5000/api').replace(/\/$/, '');
const DEVICE_ID = opt('device', 'esp32-demo-001');
const DAYS = parseInt(opt('days', '7'), 10);
const CYCLES = parseInt(opt('cycles', '6'), 10);
const RESET = flag('reset');

const REAL_DEVICE_ID = 'esp32-aquafilter-001';
if (DEVICE_ID === REAL_DEVICE_ID && !flag('force-device')) {
  console.error(
    `Refusing to seed synthetic data into the real prototype device "${REAL_DEVICE_ID}".\n` +
      'Use a demo device id (default esp32-demo-001).'
  );
  process.exit(1);
}

// -------------------------------------------------------------------
// SYNTHETIC DATA MODEL
// -------------------------------------------------------------------
// Deterministic PRNG so repeated runs produce the same series (reproducible demo).
let seed = 20260915;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const noise = (amp) => (rand() * 2 - 1) * amp;
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Influent (pre-filter) laundry wastewater and effluent (post-filter) values.
 * `age` is 0..1 — fraction of filter life used; effluent quality degrades slightly
 * as the bio-adsorbent saturates, which is the story the filter-health % tells.
 * These ranges are illustrative for a demo, not measured results.
 */
const preReading = () => ({
  ph: round(9.2 + noise(0.4), 2),
  turbidity: round(280 + noise(60), 1),
  tds: round(1150 + noise(150), 0),
  temperature: round(29 + noise(1.5), 1),
});
const postReading = (age) => ({
  ph: round(7.6 + age * 0.3 + noise(0.2), 2),
  turbidity: round(28 + age * 30 + noise(8), 1),
  tds: round(420 + age * 180 + noise(50), 0),
  temperature: round(28.5 + noise(1.2), 1),
});

const avg = (arr, k) => (arr.length ? arr.reduce((s, r) => s + r[k], 0) / arr.length : null);
const pct = (before, after) => (before && after ? round(((before - after) / before) * 100, 2) : null);

/** Build the full historical plan: cycles spread across the last DAYS, plus idle trickle. */
function buildPlan() {
  const now = Date.now();
  const span = DAYS * 24 * 3600 * 1000;
  const cycles = [];
  for (let i = 0; i < CYCLES; i++) {
    const startedAt = new Date(now - span + ((i + 0.5) * span) / CYCLES);
    const durationSeconds = Math.round((25 + rand() * 15) * 60); // 25–40 min
    const completedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    const age = i / Math.max(1, CYCLES - 1);
    const readings = [];
    for (let t = 0; t <= durationSeconds; t += 60) {
      const ts = new Date(startedAt.getTime() + t * 1000);
      readings.push({ ...preReading(), samplePoint: 'pre-filter', timestamp: ts });
      readings.push({ ...postReading(age), samplePoint: 'post-filter', timestamp: ts });
    }
    cycles.push({ cycleNumber: i + 1, startedAt, completedAt, durationSeconds, age, readings });
  }
  // Sparse idle readings (post-filter, no cycle) so the 24 h / 7 d charts are continuous.
  const idle = [];
  for (let t = now - span; t < now; t += 30 * 60 * 1000) {
    idle.push({ ...postReading(0.5), samplePoint: 'post-filter', timestamp: new Date(t) });
  }
  return { cycles, idle };
}

// -------------------------------------------------------------------
// API MODE
// -------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prompt(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) rl._writeToOutput = () => {}; // do not echo password
  return new Promise((resolve) => {
    process.stdout.write(question);
    rl.question('', (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a.trim());
    });
  });
}

async function api(method, route, body, token) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Device-Id': DEVICE_ID,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${json.message || ''}`);
  return json;
}

async function postBatch(readings) {
  for (let i = 0; i < readings.length; i += 50) {
    const chunk = readings.slice(i, i + 50).map((r) => ({ ...r, timestamp: r.timestamp.toISOString() }));
    await api('POST', '/telemetry/batch', { readings: chunk });
    process.stdout.write('.');
    await sleep(400); // stay well under the 100 req/min API limit
  }
  process.stdout.write('\n');
}

async function runApiMode() {
  console.log(`API mode → ${API}  device=${DEVICE_ID}  days=${DAYS}  cycles=${CYCLES}`);
  const email = process.env.SEED_EMAIL || (await prompt('Login email: '));
  const password = process.env.SEED_PASSWORD || (await prompt('Password: ', true));
  const { token, user } = await api('POST', '/auth/login', { email, password });
  console.log(`Logged in as ${user.name} (${user.role})`);

  const { cycles, idle } = buildPlan();

  // 1. Backdated history — readings only (cycles cannot be backdated through the API).
  const historical = [...idle, ...cycles.flatMap((c) => c.readings)].sort((a, b) => a.timestamp - b.timestamp);
  console.log(`Posting ${historical.length} backdated readings in batches of 50`);
  await postBatch(historical);

  // 2. Live cycles so cycle history / filter health have entries. Each lasts seconds.
  const live = Math.min(CYCLES, 3);
  console.log(`Creating ${live} live cycles (short, timestamped now)`);
  for (let i = 0; i < live; i++) {
    const start = await api('POST', `/device/${DEVICE_ID}/cycle/start`, null, token);
    const cycleId = start.data.cycleId;
    const age = i / Math.max(1, live - 1);
    const now = Date.now();
    const readings = [];
    for (let k = 0; k < 6; k++) {
      const ts = new Date(now + k * 200);
      readings.push({ ...preReading(), samplePoint: 'pre-filter', timestamp: ts, cycleId });
      readings.push({ ...postReading(age), samplePoint: 'post-filter', timestamp: ts, cycleId });
    }
    await postBatch(readings);
    await sleep(1500);
    const done = await api('POST', `/device/${DEVICE_ID}/cycle/complete`, null, token);
    const s = done.data.summary;
    console.log(
      `  cycle #${start.data.cycleNumber}: turbidity −${s.turbidityReduction}%  tds −${s.tdsReduction}%`
    );
  }
  console.log('\nDone. In the app, set EXPO_PUBLIC_DEVICE_ID=' + DEVICE_ID + ' (frontend/.env) and restart Expo.');
}

// -------------------------------------------------------------------
// DB MODE (local MongoDB only)
// -------------------------------------------------------------------

async function runDbMode() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const uri = process.env.MONGO_URI || '';
  if (!uri || /mongodb\+srv|mongodb\.net/i.test(uri)) {
    console.error('db mode is for a LOCAL MongoDB only (MONGO_URI must not be an Atlas/SRV URI).');
    process.exit(1);
  }
  const mongoose = require('mongoose');
  const SensorReading = require('../src/models/SensorReading');
  const FiltrationCycle = require('../src/models/FiltrationCycle');
  const DeviceState = require('../src/models/DeviceState');

  await mongoose.connect(uri);
  console.log(`DB mode → ${uri}  device=${DEVICE_ID}  days=${DAYS}  cycles=${CYCLES}`);

  if (RESET) {
    const r = await Promise.all([
      SensorReading.deleteMany({ deviceId: DEVICE_ID }),
      FiltrationCycle.deleteMany({ deviceId: DEVICE_ID }),
      DeviceState.deleteOne({ deviceId: DEVICE_ID }),
    ]);
    console.log(`Reset: removed ${r[0].deletedCount} readings, ${r[1].deletedCount} cycles`);
  }

  const { cycles, idle } = buildPlan();
  const limit = parseInt(process.env.FILTER_REPLACEMENT_CYCLE_LIMIT, 10) || 50;

  for (const c of cycles) {
    const pre = c.readings.filter((r) => r.samplePoint === 'pre-filter');
    const post = c.readings.filter((r) => r.samplePoint === 'post-filter');
    const preAvg = { avgPh: avg(pre, 'ph'), avgTurbidity: avg(pre, 'turbidity'), avgTds: avg(pre, 'tds') };
    const postAvg = { avgPh: avg(post, 'ph'), avgTurbidity: avg(post, 'turbidity'), avgTds: avg(post, 'tds') };
    const cycle = await FiltrationCycle.create({
      deviceId: DEVICE_ID,
      cycleNumber: c.cycleNumber,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      durationSeconds: c.durationSeconds,
      status: 'completed',
      summary: {
        preFilter: preAvg,
        postFilter: postAvg,
        phImprovement: pct(preAvg.avgPh, postAvg.avgPh),
        turbidityReduction: pct(preAvg.avgTurbidity, postAvg.avgTurbidity),
        tdsReduction: pct(preAvg.avgTds, postAvg.avgTds),
      },
      notes: 'SYNTHETIC DEMO DATA — not an experimental result',
    });
    await SensorReading.insertMany(c.readings.map((r) => ({ ...r, deviceId: DEVICE_ID, cycleId: cycle._id })));
    console.log(`  cycle #${c.cycleNumber}: ${c.readings.length} readings, turbidity −${cycle.summary.turbidityReduction}%`);
  }
  await SensorReading.insertMany(idle.map((r) => ({ ...r, deviceId: DEVICE_ID, cycleId: null })));
  console.log(`  ${idle.length} idle readings`);

  const used = cycles.length;
  await DeviceState.upsertState(DEVICE_ID, {
    $set: {
      isPoweredOn: true,
      cycleStatus: 'completed',
      activeCycleId: null,
      totalCycles: used,
      cyclesSinceLastService: used,
      filterHealthPercent: Math.max(0, Math.round(((limit - used) / limit) * 100)),
      lastHeartbeatAt: idle[idle.length - 1].timestamp,
    },
  });
  await mongoose.disconnect();
  console.log('\nDone. In the app, set EXPO_PUBLIC_DEVICE_ID=' + DEVICE_ID + ' (frontend/.env) and restart Expo.');
}

// -------------------------------------------------------------------

(MODE === 'db' ? runDbMode() : runApiMode()).catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
