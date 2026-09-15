# AquaPeelter — Claude Code Project Guide

This file is loaded into every Claude Code session for this repository. It is the single
source of truth for how Claude must behave here and what the system actually is.
**If code and this file disagree, the code wins — then update this file.**

---

## 0. Working rules for Claude (read first)

### 0.1 Context
This is an **undergraduate thesis / DOST-supported capstone project**. The repository is
evidence that will be defended in front of a panel. Every change must be explainable,
minimal, and honest. The user (Rylle, GitHub `RylleLang`, commits as `rylleairon-29`)
is the developer and owns all decisions; Claude assists.

- **GitHub:** https://github.com/RylleLang/AquaPeelter (renamed from `AquaFilter`; the
  local `origin` may still point at the old name — GitHub redirects it).
- **Collaborator:** Roy Carlos De Guzman (GitHub `kuyarruyyy`). Commits may come from
  either author; before editing, run `git status` / `git log -5` to see whether the
  collaborator has pushed changes, and never overwrite their work without pulling first
  (pulling is the user's action — see B2).

### 0.2 Professional conduct
- Communicate in clear, professional English. No filler, no hype, no emojis in code or docs.
- Before a non-trivial change, state in 1–3 sentences what you will change and why. After,
  list the files touched with paths and a one-line summary each.
- Prefer the smallest diff that solves the problem. Match the existing style of the file
  you are in (see §11). Do not refactor, rename, or "clean up" beyond the request.
- If a request is ambiguous in a way that changes the outcome, ask one precise question.
  Otherwise make the routine call and say what you assumed.
- Report results truthfully. If you did not run something, say so. Never say "tested" for
  code you only read. Note: `backend/npm test` runs Jest but **no test files exist yet**.
- Do not spawn subagents, workflows, or background agents unless the user asks.

### 0.3 Hard barriers — never do these without an explicit instruction in the same message
| # | Barrier | Reason |
|---|---------|--------|
| B1 | Never read, print, quote, copy, or commit `backend/.env` or any file matching `.env*` (except `.env.example`). Never paste secret values (JWT_SECRET, DEVICE_HMAC_SECRET, MONGO_URI_PROD, EXPO_ACCESS_TOKEN) into chat, docs, code, or commits. Do not run `git remote -v` or read `.git/config` — the remote URL may carry an embedded GitHub token; if one is ever seen, do not repeat it, and tell the user to revoke it. | Live production credentials. Leak = compromised thesis system. |
| B2 | Never run `git push`, `git push --force`, `git reset --hard`, `git checkout -- .`, `git clean`, `git rebase`, `git commit --amend`, branch deletion, or any history rewrite. | Irreversible; the remote is the thesis deliverable. |
| B3 | Never `git commit` unless the user asks for a commit. Never stage `.env`, `logs/`, `*.backup`, or `node_modules/`. | User controls the commit history. |
| B4 | Never run deploy/publish commands: `eas build`, `eas submit`, `eas update`, `npm publish`, Render/Railway CLI, or anything that changes the hosted backend or app store artifacts. | Production side-effects. |
| B5 | Never change the deployed API URL (`https://aquafilter.onrender.com/api`), the Expo `slug`, `bundleIdentifier`/`package` (`com.aquafilter.app`), or the EAS `projectId`. Never rebrand names/strings. | Identity of the deployed system and the thesis paper. |
| B6 | Never run scripts, queries, or migrations against the production MongoDB (`MONGO_URI_PROD`). Never write code that drops collections or deletes documents in bulk. | Contains real experimental data. |
| B7 | Never change **thesis parameters** — water-quality thresholds (§7), `FILTER_REPLACEMENT_CYCLE_LIMIT`, the SensorReading TTL, telemetry interval, polling intervals, offline threshold — unless explicitly told the new value. | These appear in the SRS and results chapters. |
| B8 | Never fabricate: citations, DOIs, statistics, sensor readings, test results, regulatory limits, or "industry standards". Placeholders must be written literally as `[TO BE CONFIRMED]`. Never cite the Philippine DAO as the basis for TDS or turbidity thresholds (it only mandates pH for this wastewater class). | Academic integrity. |
| B9 | Never describe unimplemented features as existing (Bluetooth backup, Guest Mode, water-level sensor, real HMAC signing, offline-detection push, cycle progress %). See §9 and §10. | Panel will test claims. |
| B10 | Never add a dependency without naming it, its purpose, and getting approval. Never upgrade Expo SDK / React Native / Mongoose major versions. | Stack must be justifiable and stable for the defense demo. |
| B11 | Never delete or overwrite files you did not create in the current session without confirmation. Never edit `frontend/App.js.backup`, `backend/logs/*`, or anything under `node_modules/`. | Safety. |
| B12 | The additional working directories under `C:\Users\Rylle\Desktop\integrity-realty\...` are an **unrelated work project**. Never read from or write to them while working on this thesis unless the user explicitly switches context. | Scope isolation. |
| B13 | Never expose the user's email or personal data in code, docs, or commits. | Privacy. |

If the user repeats an instruction that crosses a barrier, that is their decision — say
you are proceeding on their instruction and do it.

---

## 1. Project identity

- **Product name:** AquaPeelter (formerly AquaFilter — the old name still appears in
  package names, the Render URL, `deviceId`, and the Expo slug; do not rename them).
- **What it is:** An IoT laundry-wastewater filtration system using a **banana-peel
  bio-adsorbent filter**, monitored and controlled through a mobile app.
- **Sensors:** pH (0–14), Turbidity (NTU), TDS (ppm); optional temperature (°C).
  A water-level sensor is planned but **not** wired (dashboard shows "Sensor pending").
- **Stack:** ESP32 NodeMCU → Node.js/Express + MongoDB (Mongoose) on Render →
  React Native (Expo SDK 54) mobile app. Push via Expo Push API.
- **Single-device prototype:** `deviceId = esp32-aquafilter-001` is hardcoded in
  [frontend/src/api/client.js](frontend/src/api/client.js) and used as the telemetry fallback.
- **Roles:** `owner` (default on register), `technician`, `viewer`.

---

## 2. Repository layout

```
Software/
├── CLAUDE.md                 ← this file
├── .gitignore                ← ignores .env*, logs, android/, ios/, .claude/, *.backup
├── backend/                  ← Express API  (npm start | npm run dev)
│   ├── server.js             ← entry; forces Google DNS; graceful shutdown
│   ├── .env.example          ← template of required env vars (safe to read)
│   ├── .env                  ← REAL SECRETS — barrier B1
│   ├── esp32_firmware_reference/telemetry_sender.ino
│   └── src/
│       ├── app.js            ← middleware stack + route mounting
│       ├── config/   database.js, logger.js (winston → console + logs/*.log)
│       ├── models/   SensorReading, FiltrationCycle, MaintenanceRecord, DeviceState, DeviceConfig, User
│       ├── middleware/ auth.js, validateTelemetry.js, rateLimiter.js
│       ├── controllers/ auth, telemetry, sensor, device, maintenance
│       ├── routes/   auth, telemetry, sensor, device, maintenance, config
│       └── services/ notificationService.js, filterHealthService.js
└── frontend/                 ← Expo app  (npx expo start)
    ├── App.js, index.js, app.json, eas.json, babel.config.js
    └── src/
        ├── api/client.js         ← axios instance + all API wrappers
        ├── context/  AuthContext, DeviceContext (5 s polling), ThemeContext
        ├── navigation/AppNavigator.js  ← Login stack → 4 bottom tabs
        ├── screens/  Login, Dashboard, Analytics, Alerts, Maintenance
        ├── components/LineChart.js     ← SVG-free polyline made of Views
        └── utils/    storage.js (SecureStore/AsyncStorage), notifications.js
```

---

## 3. Data flow

```
ESP32 ──POST /api/telemetry (X-Device-Id, X-Device-Signature)──▶ Backend ──▶ MongoDB
  │                                                                 │
  ├──GET /api/config/cycle-state/:id  (poll: should pump run?)◀─────┤
  ├──GET /api/config/wifi/:id         (poll: new WiFi creds?)◀──────┤
  ├──GET /api/config/wifi-scan-request/:id ; POST wifi-scan-results  │
  │                                                                 │
Mobile app ──JWT Bearer──▶ /api/device, /api/sensors, /api/maintenance, /api/config
  ▲  polls state + latest reading every 5 s (DeviceContext)
  └──Expo push ◀── notificationService (cycle events, filter health, quality alerts)
```

Control is **cloud-mediated**: the app writes `DeviceState.cycleStatus`; the ESP32 polls
`/api/config/cycle-state/:deviceId` and drives the relay/valves accordingly.

---

## 4. Backend reference

### 4.1 Environment variables (`backend/.env.example`)
`PORT`, `NODE_ENV`, `MONGO_URI`, `MONGO_URI_PROD`, `JWT_SECRET`, `JWT_EXPIRES_IN` (7d),
`DEVICE_HMAC_SECRET`, `EXPO_ACCESS_TOKEN`, `FILTER_REPLACEMENT_CYCLE_LIMIT` (50),
`RATE_LIMIT_WINDOW_MS` (60000), `RATE_LIMIT_MAX_REQUESTS` (100).
`NODE_ENV=production` selects `MONGO_URI_PROD` and disables Mongoose `autoIndex`.

### 4.2 Middleware stack (app.js, in order)
`trust proxy 1` → helmet → cors (`origin:*`, methods GET/POST/PATCH/DELETE, headers
Content-Type/Authorization/X-Device-Signature/X-Device-Id) → compression →
`express.json({limit:'50kb'})` (saves `req.rawBody`) → morgan→winston → `apiLimiter` on
`/api` → routes → 404 JSON → global error handler (hides message in production).

### 4.3 Auth model
- **Mobile app:** JWT (`Authorization: Bearer`). `protect` loads the user; `authorize(...roles)`
  RBAC; `deviceAccess` — **role `owner` bypasses the deviceIds check** (any owner can
  access any device). Control actions require `owner` or `technician`.
- **ESP32:** `X-Device-Signature` header is compared **directly against
  `DEVICE_HMAC_SECRET`** (shared secret, not a real HMAC of the payload — commit
  `9a9b367`). On `/api/telemetry` the signature check middleware is **not mounted at all**
  (commit `26acce4`, "prototype") — only payload validation + rate limit run. The `config`
  routes polled by the ESP32 do a plain `!==` secret comparison.
- Rate limits: api 100/min per IP; auth 10 per 15 min; telemetry 600/min keyed by `X-Device-Id`.

### 4.4 Models (Mongoose)
| Model | Key fields | Notes |
|-------|-----------|-------|
| `SensorReading` | deviceId, timestamp, ph, turbidity, tds, temperature, cycleId, samplePoint (`pre-filter` / `post-filter`), payloadChecksum | Indexes `{deviceId,timestamp:-1}`, `{cycleId,samplePoint}`, **TTL on timestamp** (see §9 for the pending 90→180 day change). Virtual `qualityTier`. Statics `getAveragesForRange`, `getTimeSeries`. |
| `FiltrationCycle` | deviceId, startedAt, completedAt, durationSeconds, status (running / paused / completed / aborted), cycleNumber, summary{preFilter, postFilter, phImprovement, turbidityReduction, tdsReduction}, notes | `finalize(preAvg, postAvg)` computes % reductions. |
| `DeviceState` | deviceId (unique), isPoweredOn, cycleStatus (idle / running / paused / completed), activeCycleId, cyclesSinceLastService, totalCycles, filterHealthPercent, lastHeartbeatAt, firmwareVersion, pushTokens, offlineThresholdSeconds (30) | One upserted doc per device. `upsertState()`, `recalculateFilterHealth()`, virtual `isOnline`. |
| `MaintenanceRecord` | deviceId, type (filter_replacement / filter_cleaning / sensor_calibration / system_inspection / repair / other), performedAt, cycleCountAtService, acknowledged, filterStage, performedBy→User, notes, calibrationData | `filter_replacement` resets filter health to 100 %. |
| `DeviceConfig` | deviceId, wifi{ssid, password, updatedAt, applied}, wifiScan{requested, requestedAt, results[], completedAt} | WiFi password stored **in plaintext**. |
| `User` | name, email, password (bcrypt 12, select:false), role, deviceIds[], expoPushTokens[], isActive, lastLoginAt | `comparePassword`, `registerPushToken`, `removePushToken`. |

### 4.5 API endpoints
All responses are `{ success: boolean, ... }`. `:deviceId` routes use `mergeParams`.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | none | Uptime check |
| POST | `/api/auth/register` | authLimiter | name, email, password (≥8) → token + user |
| POST | `/api/auth/login` | authLimiter | email, password → token + user |
| GET | `/api/auth/me` | JWT | Current user |
| POST / DELETE | `/api/auth/push-token` | JWT | Register / remove Expo push token |
| POST | `/api/telemetry` | telemetryLimiter only | Single reading `{ph, turbidity, tds, temperature?, samplePoint, timestamp?, cycleId?}` → 201 |
| POST | `/api/telemetry/batch` | telemetryLimiter only | `{readings: [...]}` max 50 (no per-item validation) |
| GET | `/api/sensors/:id/history` | JWT + device | `startDate`, `endDate` required; `samplePoint`, `limit` (≤1000), `skip` |
| GET | `/api/sensors/:id/averages` | JWT + device | avg/min/max + readingCount for range |
| GET | `/api/sensors/:id/latest` | JWT + device | `{preFilter, postFilter}` most recent |
| GET | `/api/sensors/:id/compare` | JWT + device | pre vs post averages + % improvement |
| GET | `/api/device/:id/state` | JWT + device | DeviceState (404 if never created) |
| GET | `/api/device/:id/cycles` | JWT + device | Paginated cycles |
| PATCH | `/api/device/:id/power` | owner/tech | `{isPoweredOn}`; powering off aborts active cycle |
| POST | `/api/device/:id/cycle/start` | owner/tech | 409 if not powered on or already running |
| PATCH | `/api/device/:id/cycle/pause` | owner/tech | Toggles running ⇄ paused |
| POST | `/api/device/:id/cycle/complete` | owner/tech | Finalizes summary, bumps cycle counters, evaluates filter health |
| GET | `/api/maintenance/:id` | JWT + device | Paginated; `?type=` filter |
| GET | `/api/maintenance/:id/last-filter-replacement` | JWT + device | Latest replacement record |
| POST | `/api/maintenance/:id` | owner/tech | Create record |
| PATCH | `/api/maintenance/:id/:recordId/acknowledge` | owner/tech | Mark acknowledged |
| POST | `/api/config/wifi` | JWT | `{deviceId, ssid, password}` queue creds for ESP32 |
| GET | `/api/config/wifi/:id` | none | ESP32 polls; returns creds once, marks applied |
| POST | `/api/config/wifi-scan-request/:id` | JWT | App asks ESP32 to scan |
| GET | `/api/config/wifi-scan-request/:id` | device secret | ESP32 polls; clears flag |
| POST | `/api/config/wifi-scan-results/:id` | device secret | ESP32 uploads `{networks: [{ssid, rssi, open}]}` |
| GET | `/api/config/wifi-scan-results/:id` | JWT | App polls results |
| GET | `/api/config/cycle-state/:id` | device secret | ESP32 polls `{cycleRunning}` |

### 4.6 Services
- `filterHealthService`: `evaluateFilterHealth` (after cycle complete; notifies at exactly
  25 %, 10 %, 0 %), `resetFilterHealth`, `checkWaterQualityAlert` (post-filter only).
- `notificationService`: Expo push, channel `aquapeelter-alerts`, events
  `cycle_started`, `cycle_completed`, `cycle_paused`, `filter_replacement_needed`,
  `device_offline`, `device_online`, `quality_alert`. **`device_offline/online` are defined
  but nothing calls them** (no heartbeat scheduler exists).

---

## 5. Frontend reference (Expo SDK 54, RN 0.81, React 19)

- **Entry:** `App.js` loads Ionicons font, suppresses the Expo Go push warning, wraps
  `GestureHandlerRootView > SafeAreaProvider > ThemeProvider > AuthProvider > AppNavigator`.
- **Navigation:** native stack `Login` ⇄ `Main`; `Main` = bottom tabs
  Dashboard / Analytics / Alerts / Maintenance, wrapped in `DeviceProvider`.
- **API client:** axios, `BASE_URL = https://aquafilter.onrender.com/api` (hardcoded;
  `app.json extra.API_BASE_URL` duplicates it but is unused), 10 s timeout, JWT from
  `storage`, 401 → token cleared. Wrappers: `authAPI`, `sensorAPI`, `deviceAPI`,
  `configAPI`, `maintenanceAPI`.
- **AuthContext:** login/register/logout, rehydrates via `/auth/me`, syncs push token.
- **DeviceContext:** polls `getState` + `getLatest` every 5 s; `esp32Online` = last
  post-filter reading < 30 s old; local 1 s elapsed timer while running;
  `cycleProgress` is **always 0** (never computed). Exposes `togglePower` (no UI button —
  removed in `1a52bbb`), `startCycle`, `pauseCycle`.
- **ThemeContext:** LIGHT (default, "for thesis demo") / DARK green palette; persisted in
  AsyncStorage key `theme`. Components receive colors as `C`.
- **Storage:** `expo-secure-store` on native, AsyncStorage on web. Keys `authToken`, `pushToken`.
- **Notifications:** remote push disabled inside Expo Go (SDK 53+); requires a dev/EAS build.
  Local notifications fired from Dashboard when pH ∉ [6.5, 8.5] or turbidity > 100.
- **Screens:**
  - *Dashboard* — header (name, Online/Offline pill, WiFi modal, theme, logout), cycle card
    (timer, progress bar, Start/Pause), 4 sensor cards (pH, Turbidity, TDS, Water Level
    placeholder), Bio-Filter Health card. WiFi modal: scan (poll 3 s, 30 s timeout) → pick
    → password → `configAPI.updateWifi`; manual SSID fallback.
  - *Analytics* — ranges 1h/6h/24h/7d → `history` (limit 50) + `averages`; 3 line charts.
  - *Alerts* — **derived client-side** from recent readings + unacknowledged maintenance +
    filter health; not persisted server-side. Filters All/Sensors/Maintenance/Cycle.
  - *Maintenance* — list records, acknowledge, create via modal (types exclude
    `sensor_calibration`).
  - *Login* — Sign In / Register toggle.

---

## 6. ESP32 firmware contract

Reference sketch: [backend/esp32_firmware_reference/telemetry_sender.ino](backend/esp32_firmware_reference/telemetry_sender.ino)
(ArduinoJson + mbedTLS). It computes a **real HMAC-SHA256** of the JSON body — the backend
no longer verifies that; it expects the raw shared secret in `X-Device-Signature`.
Headers: `Content-Type: application/json`, `X-Device-Id`, `X-Device-Signature`.
Body: `{ph, turbidity, tds, samplePoint, timestamp?}` rounded to 2/1/0 decimals.
Interval: 5000 ms. ADC pins 34 (pH), 35 (turbidity), 32 (TDS); calibration curves in sketch.
The production firmware (with WiFi-config polling, scan upload, and cycle-state polling)
is **not in this repository**.

---

## 7. Water-quality thresholds (thesis parameters — barrier B7)

The codebase currently uses **four different threshold sets**. Do not "harmonize" them
without instruction; the user must pick the literature-backed values first.

| Location | pH | Turbidity (NTU) | TDS (ppm) |
|----------|----|-----------------|-----------|
| Backend push alert `filterHealthService.QUALITY_THRESHOLDS` | 6.0 – 9.0 | > 100 → alert | > 1500 → alert |
| `SensorReading.qualityTier` "safe" / "reuse" | 6.5–8.5 / 5.5–9.0 | < 5 / < 50 | < 500 / < 1000 |
| Dashboard card colours | 6.5–8.5 Normal | ≤ 50 ok, ≤ 100 warn | ≤ 500 ok, ≤ 1000 warn |
| Alerts screen + local notifications | < 6.5 or > 8.5 | > 100 | > 500 warn, > 1000 danger |

Regulatory basis (from the Aug 2026 mentoring meeting): the Philippine DAO for this
wastewater class mandates **pH only**. TDS and turbidity limits must be sourced from
peer-reviewed laundry-wastewater literature — write `[TO BE CONFIRMED]` until provided.

Other parameters: filter replacement at 50 cycles (health % = (limit − used) / limit);
offline threshold 30 s; telemetry 5 s; app polling 5 s; JWT 7 d.

---

## 8. Running & deployment

- **Backend local:** `cd backend && npm install && npm run dev` (needs `.env`; MongoDB at
  `MONGO_URI`). Health: `GET http://localhost:5000/health`.
- **Backend prod:** Render, `https://aquafilter.onrender.com` (free tier → cold starts;
  the app's 10 s axios timeout can trip on first request). Earlier hosts (Railway, local
  IP) are gone.
- **Frontend:** `cd frontend && npm install && npx expo start` (Expo Go for UI; EAS dev
  build required for push). EAS profiles: development / preview / production.
- **Git:** single branch `main` on https://github.com/RylleLang/AquaPeelter; two
  contributors (Rylle + Roy). The remote is the thesis deliverable (barrier B2/B3).

---

## 9. Known gaps / technical debt (state these honestly, never as features)

1. **Telemetry endpoint is unauthenticated** — signature middleware removed for the
   prototype; `X-Device-Id` defaults to `esp32-aquafilter-001` if absent.
2. "HMAC" is a shared-secret compare, not an HMAC of the payload; config routes use
   non-constant-time `!==`.
3. `POST /api/device/:id/cycle/start` returns 409 unless `isPoweredOn` is true, but the
   app has no power toggle — a fresh device must be powered on via API/DB first.
4. `cycleProgress` never updates; `cycle/complete` exists in the backend but the app
   never calls it (cycles end only via ESP32/manual API).
5. Alerts are computed on the client; there is no persisted alert history.
6. Water-level sensor card is a placeholder.
7. `notifyDeviceOffline/Online` unused; no heartbeat watchdog.
8. `deviceAccess` lets every `owner` see every device; default role is `owner`.
9. WiFi passwords stored in plaintext in `DeviceConfig`.
10. Batch telemetry skips field validation; `SensorReading` TTL currently has an
    **uncommitted change 90 → 180 days** in the working tree. MongoDB will not alter an
    existing TTL index via `createIndex` (needs `collMod` / drop-recreate), and prod has
    `autoIndex: false` — so the change is not live until applied manually on Atlas.
11. `LineChart` uses hardcoded dark-theme colours, not `ThemeContext`.
12. No automated tests; `jest` / `supertest` are installed but unused.
13. `frontend/App.js.backup` is a stale leftover (gitignored by `*.backup`).

---

## 10. Planned features (NOT implemented — from Aug 2026 meeting)

- Hybrid connectivity: WiFi/HTTPS primary + **Bluetooth backup** for local control.
- **Guest Mode**: no-auth Bluetooth session with basic monitor/control.
- SRS: FR11 WiFi provisioning → Low priority; FR12 filter health → Low; add Bluetooth FRs;
  qualitative response times only; add UI mockup + hardware interface sections.
- Hardware: two solenoid valves replace motorized ball valve; magnetic latches replace
  motorized doors (no software impact).
- Minutes of Meeting (MOM) are a DOST deliverable.

---

## 11. Code conventions

- **Backend:** CommonJS, 2-space indent, single quotes, semicolons, `exports.fn = async
  (req, res) => {}` controllers with try/catch → `logger.error` + `{success:false, message}`.
  Section banners `// ----` in models. Winston `logger` — never `console.log`.
- **Frontend:** functional components + hooks, inline style objects, theme colours via
  `const { colors: C } = useTheme()`, Ionicons, `SafeAreaView edges={['top']}`,
  `Alert.alert` for user errors, silent catch on polling.
- **Commits:** imperative summary line (see `git log`), no trailing period, optional body.
  Include the attribution trailer the harness supplies.
- **Branching workflow (agreed 2026-09-15, two contributors):**
  - `main` is protected by convention — **no direct commits to `main`**. Claude must
    refuse to commit on `main` and create a branch instead.
  - Branch names: `<person>/<topic>` in kebab-case, e.g. `rylle/alerts-history`,
    `roy/bluetooth-guest-mode`, `chore/docs`.
  - Start every branch from an up-to-date `main` (`git pull` is the user's action).
  - Finish with a Pull Request on GitHub; the other contributor reviews and merges.
    PR title = commit-style summary; PR body lists what changed, how it was tested, and
    any thesis parameter or document that must be updated as a result.
  - Claude never pushes or merges (B2). It prepares the branch and commit; the user pushes
    and opens the PR (`gh pr create` may be used only when the user asks).
- **Docs for the thesis** (SRS, MOM, chapters): the user authors; Claude drafts or edits
  only on request, in formal academic English, with `[TO BE CONFIRMED]` placeholders and
  no invented sources. Distinguish *implemented* vs *planned* every time a feature is named.
