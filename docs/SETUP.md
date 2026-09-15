# AquaPeelter — Contributor Setup

How to get the project running on a new machine and work on it safely.
Takes about 20 minutes. Ask Rylle if anything here doesn't match what you see.

## 1. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Git | any recent | `git --version` |
| Node.js | 18 or newer (20 LTS recommended) | `node --version` |
| Expo Go app | the version matching the project's Expo SDK (currently **57**) | Play Store / App Store |
| Claude Code (optional) | latest | `claude --version` |

You do **not** need MongoDB, Arduino IDE, or the ESP32 to work on the mobile app —
the app talks to the deployed backend on Render.

## 2. Clone and install

```bash
git clone https://github.com/RylleLang/AquaPeelter.git
cd AquaPeelter

cd frontend && npm install && cd ..
cd backend  && npm install && cd ..
```

If Git asks you to sign in, use your GitHub account in the browser window that opens.
Do **not** put a token in the remote URL.

## 3. Run the mobile app

```bash
cd frontend
npx expo start
```

Scan the QR code with Expo Go on your phone (phone and laptop must be on the same
Wi‑Fi). The app connects to `https://aquafilter.onrender.com/api` automatically.

If Expo Go says **"Project is incompatible with this version of Expo Go"**, the
project's SDK (see `"expo"` in `frontend/package.json`) and your Expo Go version differ.
Stock Expo Go only supports the newest SDK; older Android builds are at
https://expo.dev/go. Do not upgrade the project SDK on your own — agree it first.

Notes:
- The Render backend is on a free tier — the **first request after idle can take
  30–60 s** and may time out once. Just retry.
- Register your own account from the Login screen (Register tab). New accounts get the
  `owner` role and can see the single prototype device `esp32-aquafilter-001`.
- **Push notifications do not work inside Expo Go** (Expo SDK 53+). They need an EAS
  development build; ask Rylle before attempting one.
- Water Level card shows "Sensor pending" — that sensor is not wired yet. This is
  expected.

## 4. Run the backend locally (optional)

Only needed if you are changing backend code and want to test it before a PR.
It requires secrets that are **not in the repository**:

1. Copy the template: `cp backend/.env.example backend/.env`
2. Ask Rylle for the real values **in person or via a password manager** — never
   through GitHub, chat, email, or a shared screen.
3. `cd backend && npm run dev` → `http://localhost:5000/health` should return `ok`.
4. To point the app at your local backend, temporarily change `BASE_URL` in
   `frontend/src/api/client.ts` to `http://<your-laptop-ip>:5000/api` — and **change
   it back before committing**.

Never commit `backend/.env`. It is gitignored; keep it that way.

## 5. Working with Git — branch and PR workflow

`main` is the thesis deliverable. Nobody commits to it directly.

```bash
git checkout main
git pull                          # always start from the latest main
git checkout -b roy/<topic>       # e.g. roy/bluetooth-guest-mode
# ... make changes ...
git add <files>
git commit -m "Short imperative summary"
git push -u origin roy/<topic>
```

Then open a Pull Request on GitHub, describe what changed and how you tested it, and
request a review from the other contributor. The reviewer merges.

Rules:
- One topic per branch. Keep PRs small enough to review in a few minutes.
- Never `git push --force`, never rewrite history on a shared branch.
- Do not change thesis parameters (water-quality thresholds, filter cycle limit, data
  retention, polling intervals) without agreeing on them first — they appear in the
  SRS and results chapters.
- Do not rename the app, the API URL, the bundle ID, or the Expo project ID.

## 6. Using Claude Code on this project

The repository already contains the setup — you don't configure anything.

1. Install Claude Code: `npm install -g @anthropic-ai/claude-code` (or install the
   "Claude Code" VS Code extension) and sign in with your own Anthropic account.
2. Open a terminal in the repo folder and run `claude`.

What happens automatically:
- **`CLAUDE.md`** at the repo root is loaded into every session. It contains the full
  architecture, API reference, thresholds, known gaps, and the rules Claude must follow
  (the "barriers"). Read it once yourself — it is the fastest overview of the system.
- **`.claude/settings.json`** applies the shared guardrails: Claude cannot read `.env`
  files, cannot force-push, reset, or deploy, and must ask you before every commit,
  push, or `npm install`.
- Your own preferences go in `.claude/settings.local.json` (gitignored, optional).

Good habits:
- Tell Claude what you want changed and let it explain before it edits.
- Ask it to run `git status` and `git log -5` first so it sees any recent work from
  the other contributor.
- If it says a feature is "planned" (Bluetooth, Guest Mode, water level), that is
  correct — do not let it describe those as implemented in thesis documents.

## 7. One-time: update the Atlas TTL index (data retention)

`SensorReading` readings expire automatically via a MongoDB TTL index. The code sets
this to **180 days**, but MongoDB will not change an index that already exists with a
different value, and the production server runs with `autoIndex: false`. So the live
database keeps the old **90-day** value until someone updates it by hand. Do this once,
on the production cluster, from MongoDB Atlas:

1. Atlas → your cluster → **Browse Collections** → database `aquafilter` →
   collection `sensorreadings` → **Indexes** tab. Confirm there is an index on
   `{ timestamp: 1 }` with `expireAfterSeconds: 7776000` (= 90 days).
2. Open the **Atlas Shell** / `mongosh` connected to the cluster (Atlas → *Connect* →
   *Shell*), then run:

   ```javascript
   use aquafilter
   db.runCommand({
     collMod: "sensorreadings",
     index: { keyPattern: { timestamp: 1 }, expireAfterSeconds: 15552000 }
   })
   ```

   `15552000` = 180 × 24 × 60 × 60. A reply of `{ ok: 1, expireAfterSeconds_old: 7776000,
   expireAfterSeconds_new: 15552000 }` confirms it.
3. Refresh the Indexes tab — it should now show `expireAfterSeconds: 15552000`.

`collMod` only edits the index option; no data is touched and no downtime occurs.
Record the date you did this in the thesis change log.

## 8. Demo data while the ESP32 is unavailable

The app shows `--` and "Offline" when no device is posting. To demo or test the UI
without hardware, seed **synthetic** data into a separate demo device
(`esp32-demo-001`). This never touches the real prototype's data.

```bash
cd backend
npm run seed:demo -- --mode api --api https://aquafilter.onrender.com/api
```

It asks for your app login (owner or technician). It posts ~7 days of backdated
readings and creates 3 short live cycles so Analytics, Dashboard, and cycle history
have content. Then point the app at the demo device:

```bash
# frontend/.env  (untracked — never commit it)
EXPO_PUBLIC_DEVICE_ID=esp32-demo-001
```

Restart `npx expo start` (env vars are read at startup). Delete the line, or the file,
to return to the real device.

Rules:
- Demo values are **illustrative only**. Never present them as experimental results
  or use them in the thesis (CLAUDE.md barrier B8).
- The seeder refuses the real device id and refuses Atlas in `db` mode; `db` mode is
  for a local MongoDB only and can backdate realistic multi-day cycles
  (`npm run seed:demo -- --mode db --reset`).

## 9. Repository map (short)

```
backend/     Express + MongoDB API (deployed on Render)
frontend/    Expo / React Native mobile app
docs/        This file and future thesis-support docs
CLAUDE.md    Project guide + rules for Claude Code (read it)
```

Full details: `CLAUDE.md` sections 2–7.
