# 🏀 Hoop Shoot League

Head-to-head arcade shooting game: you and an AI opponent race through 25-ball
racks under a 3-second shot clock, inside a 37-game season against a 16-team
league. **Every shot is real physics** — player and AI share one simulator, and
swishes (2 pts) emerge from entry angle, never from dice rolls.

Design spec: `hoop-shoot-league-handoff.md` (authoritative for physics numbers
and scoring; the league was later downsized from the handoff's 18 teams/42 games
to 16 teams/37 games — 15 active authored shooters + 2 `retired` legacy ones
kept so old seasons still resolve).

## Commands

```bash
npm run dev             # Vite dev server
npm test                # vitest — physics table, determinism, AI calibration, league properties
npm run typecheck       # app (vue-tsc)
npm run typecheck:core  # headless-core purity gate (src/core must never touch DOM/Vue/Three)
npm run calibrate       # Monte-Carlo refit of AI aim-error tables — run after ANY physics-constant change
npm run build           # production build → dist/
```

## Architecture

```
src/core/      HEADLESS game core — pure TS, zero DOM/Vue/Three (enforced by tsconfig.core.json)
  physics/     fixed-timestep sim (240 Hz), analytic sphere-vs-torus rim collision,
               graze-scaled impulses (κ = head-on-ness²) so kisses roll in and clangs bounce out
  shot/        drag→launch mapping (angle 1:1 = the skill; power saturating = forgiving), classifier
  ai/          ratings → physical aim error (fitted tables in aimError.ts), mood/streaks, cadence
  match/       rack state machine (25 balls / 3 s clock / 7-ball OT), head-to-head match engine
  league/      schedule gen (37 days × 8 games at 16 teams, ×3 conf ×2 cross), standings+tiebreakers,
               quickSim (off-screen games), playoffs (Bo3/Bo5/Bo5), player self-sim EWMA ratings
  data/        the authored AI shooters (15 active + 2 retired)
engine/        browser-side, non-Vue: Three.js views (ball squash-and-stretch, verlet net,
               rim wobble, mannequin rigs, camera rig, confetti), spring/tween anims,
               procedural Web Audio sfx (zero audio files), drag input, IndexedDB repositories
screens/       full-viewport Vue SFCs (no router — stores/ui.ts switches)
stores/        Pinia: campaign (owns the CampaignDoc + season flow), match, ui
```

Key invariants:

- **The handoff §3 table is a test fixture** (`tests/ballistics.spec.ts`). If it fails, fix physics — never the fixture.
- **Determinism**: same launch ⇒ identical contact log. All randomness flows through the seeded `Rng`.
- **Trajectory preview shows only the first 40% of the arc**, opacity-tapered. Do not extend it — it is the game's main balance lever.
- After changing anything in `src/core/physics/constants.ts`, re-run `npm run calibrate` and update
  `SIGMA_V_TABLE` / `ACC_LOOKUP` in `src/core/ai/aimError.ts` (instructions in the script output),
  then confirm `tests/aiCalibration.spec.ts` passes.

## Remaining device work (Capacitor — Phase 8 tail)

Platforms aren't added yet. When ready:

```bash
npx cap add ios && npx cap add android
npm i @capacitor/screen-orientation @capacitor/haptics
```

- Lock landscape via `ScreenOrientation.lock({ orientation: 'landscape' })` at boot
  (the portrait CSS nudge in `App.vue` is the web fallback).
- Haptic hooks: rim contacts (light), swish (medium), win (heavy) — wire in `MatchScreen.handleEvent`.
- `unlockAudio()` already runs on first gesture (iOS WebAudio requirement).
- Icons/splash via `@capacitor/assets`.

## Phase 9 (deferred): Laravel + S3 cloud sync spec

Mirror `growthdyn/bball_sim_NEW2026` (`frontend/src/stores/sync.js` + `backend/app/Http/Controllers/SyncController.php`):

- **Client**: a Pinia `sync` store chunks the campaign into gzipped parts —
  `['meta', 'campaign', 'liveGames', 'shots_recent']` — POSTed per-part to
  `/api/sync/{clientId}/push` (meta first; it creates the server row). Failed parts stay in a
  `_dirtyParts` set for retry. Triggers: match end, slate end, `visibilitychange`, explicit
  sync-now; 5-minute cooldown. Timestamp last-writer-wins merge on pull.
- **Server**: Laravel 12 + Sanctum. Each part `json_encode → gzencode(6) → Storage::put`
  (`campaigns/{clientId}/{part}.json.gz`) with S3 as the blob store; MySQL holds only the
  campaigns metadata row. Pull streams the stored `.gz` verbatim. Soft-delete + 30-day retention.
- The repositories in `src/engine/db/` already expose whole-doc snapshots, so no client
  rework is needed — the sync store serializes what they store.
