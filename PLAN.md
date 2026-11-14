# Tutti — organ sight-reading trainer: plan and agent briefs

Status: PLAN ONLY. The planner had no Agent tool in its session, so nothing below has been
implemented. Each brief in section 7 is self-contained and can be pasted to a sub-agent as-is
(prepend sections 1-6, which are the shared contract every agent must read).

"Tutti" = the organ's full-organ stop. Short, organ-specific, easy to say.

---------------------------------------------------------------------------------------------------

## 1. Product in one paragraph

A mobile-first single-file web app. Core loop: a prompt is drawn on a staff -> the learner
plays/taps the matching key(s) -> the app records correctness and response time -> a pure-JS
adaptive engine decides the next prompt, when to introduce new material, when to promote, when to
step back. Sessions are short (default 10 min). Progress syncs through the artifact `db`
capability with localStorage and in-memory fallbacks.

Learner: adult beginner at notation, developer, wants the steepest safe learning curve. Design
consequence: never make him grind what he already reads fluently (placement, test-out, fast-path
promotion, known-on-sight item skip), and never let him guess his way forward (speed is part of
mastery, hints taint an answer).

---------------------------------------------------------------------------------------------------

## 2. Architecture

```
/home/claude/organ-trainer
  package.json            type: module; devDeps: esbuild, playwright
  build.mjs               esbuild bundle (iife) + inline css -> dist/index.html
  src/
    contracts.d.ts        JSDoc/TS typedefs of section 4 (reference only, not bundled)
    curriculum.js         SONNET  stage + item data, realize(), names, mnemonics
    engine.js             SONNET  adaptive engine, collector, rng (no DOM, no Date.now inside)
    storage.js            SONNET  db -> localStorage -> memory, merge, debounced single-flight write
    audio.js              SONNET  organ tone synth + metronome click (Web Audio)
    input/midi.js         SONNET  Web MIDI adapter
    input/mic.js          SONNET  YIN pitch detector adapter
    input/keys.js         SONNET  desktop keyboard shortcuts adapter
    ui/app.js             OPUS    entry: boot, hash router, state wiring
    ui/staff.js           OPUS    inline-SVG notation renderer
    ui/keyboard.js        OPUS    on-screen piano
    ui/screens/*.js       OPUS    home, practice, summary, progress, settings, placement
    ui/dialog.js          OPUS    in-page modal/confirm/toast
    styles.css            OPUS
    index.template.html   OPUS    shell with <!--CSS--> and <!--JS--> markers
  tests/*.test.mjs        SONNET  node --test
  tools/shoot.mjs         SONNET  playwright screenshots + console check
  screens/                output png
  dist/index.html         the deliverable
```

Decisions:
- Notation: custom inline SVG, not VexFlow. Reasons: no CDN dependency inside the sandbox, full
  control of per-note colouring (feedback, heatmap reuses the same renderer), tiny payload. Glyphs
  (treble clef, bass clef, sharp, flat, natural, rests, flags) are hand-authored SVG paths kept in
  `ui/staff.js`; noteheads are rotated ellipses. No music font download.
- No framework. Vanilla ES modules, small `h()` DOM helper. Bundled by esbuild to one IIFE.
- Only external resource allowed: Google Fonts stylesheet (optional; must degrade to system fonts).
- Pitches are MIDI numbers everywhere (C4 = 60). Staff position is derived, never stored.
- Time is injected into the engine (`now` in every call that needs it) so tests are deterministic.
- Hash routes: `#home` (default), `#practice`, `#progress`, `#settings`. Nothing else.

---------------------------------------------------------------------------------------------------

## 3. Curriculum (15 stages, 1 optional)

Each stage has `rt: {start, end}` in ms: the per-prompt response-time goal for a brand-new item and
for a fully mastered one. `kind` drives rendering and the answer collector.

| # | id | kind | clef | new items (intro order) | rt start->end |
|---|----|------|------|-------------------------|---------------|
| 0 | treble-landmarks | note | treble | C4, G4, C5, then E4, F5 (bottom/top line) | 3500->1500 |
| 1 | treble-staff | note | treble | D4 F4 A4 B4 D5 E5 G5 (fill outward from landmarks) | 3000->1200 |
| 2 | bass-landmarks | note | bass | C4, F3, C3, then G2, A3 (bottom/top line) | 3500->1500 |
| 3 | bass-staff | note | bass | B3 G3 E3 D3 B2 A2 F2 | 3000->1200 |
| 4 | grand-mixed | mix | grand | no new items: all of 0-3, clef changes every prompt | 2500->1100 |
| 5 | ledger | note | grand | treble A3 B3 A5 B5 C6; bass E2 D2 C2 D4 E4 | 3500->1400 |
| 6 | intervals | interval | both | melodic 2nd,3rd,4th,5th,6th,8ve up/down per clef; first key is lit, play the second | 3000->1300 |
| 7 | accidentals | note | grand | F#4 Bb4 C#5 Eb5 G#4 F#3 Bb3 Eb3 C#4(bass) Ab3 | 3500->1500 |
| 8 | dyads | dyad | both | harmonic 3rd,5th,6th,2nd,4th,8ve per clef (white keys) | 4000->1800 |
| 9 | hands-together | hands | grand | one note per staff: octaves, 10ths, 6ths, 5ths (16 curated pairs) | 4500->2000 |
| 10 | triads | chord | both | C F G Am Dm Em, root pos then 1st/2nd inversion, treble then bass | 5000->2200 |
| 11 | hymn-chords | chord | grand | SATB voicings I IV V vi V7 in C, G, F (key signature drawn) | 7000->3000 |
| 12 | rhythm | rhythm | none | 12 one-bar 4/4 patterns from w h q 8-8, with metronome; tap any key | timing tol. |
| 13 | phrases | phrase | grand | generated 4-8 note phrases: stepwise treble, stepwise bass, with skips, alternating hands | per-note 1800->900 |
| P | pedal (optional) | note | bass | C2..D4 pedalboard range, labelled "Pedal"; unlockable once stage 3 is passed | 3000->1300 |

Design notes:
- Landmark-first then fill outward by step: beginners anchor on C/G/F and read neighbours by
  distance, which is faster than mnemonics alone. Mnemonics (Every Good Boy..., FACE, Good Boys...,
  All Cows Eat Grass) are hint text only.
- Stage 4 has no new items; it is passed on its rolling window only (clef-switching fluency).
- Interval and dyad items are *shapes* (clef + size + direction), realised at a random start pitch
  per presentation, so the learner reads the shape, not a memorised pair.
- Item ids: `n:t:60` (note, treble staff, midi), `n:b:60`, `iv:t:+3`, `iv:b:-5`, `dy:t:3`,
  `ht:48+64`, `ch:t:C:0` (staff, chord, inversion), `hy:G:V7`, `rh:q-q-h`, `ph:tr-step`,
  `pd:36`. The same pitch on two staves is two different items (C4 treble vs C4 bass).

---------------------------------------------------------------------------------------------------

## 4. Shared contracts (FROZEN — every agent codes to these)

### 4.1 curriculum.js

```js
export const STAGES;   // Stage[] in order; optional pedal stage last with optional:true
export const ITEMS;    // Record<string, Item>
export function getStage(id);                 // Stage | undefined
export function stageItems(stageId);          // Item[] in intro order ('mix' stages: referenced items)
export function realize(item, rng);           // -> PromptBody (pure, uses rng() in [0,1) only)
export function noteName(midi, naming, opts); // naming: 'letters' | 'solfege' -> 'C4' | 'Do'
export function staffStep(midi, staff, accidental); // diatonic steps above the staff's bottom line
export function isBlack(midi);

/** Stage */ { id, index, title, short, description, kind, clef, itemIds: string[],
               refs?: string[] /* mix stages */, rt: {start, end}, optional?: boolean,
               requires?: string /* stage id */ }
/** Item  */ { id, stageId, kind, clef, label, hint: { name, mnemonic? }, gen?: {...} }
/** PromptBody */ {
  kind: 'note'|'interval'|'dyad'|'hands'|'chord'|'rhythm'|'phrase',
  clef: 'treble'|'bass'|'grand'|'none',
  keySig?: number,                       // -1 = F major, +1 = G major, 0 default
  notes: Array<{ midi, staff: 'treble'|'bass', accidental?: '#'|'b'|'n',
                 dur?: 'w'|'h'|'q'|'8', beat?: number /* start beat, 0-based */,
                 group?: number /* same group = sounded together */ }>,
  answer:
    | { type: 'set', midis: number[] }                  // note / dyad / hands / chord: any order
    | { type: 'sequence', midis: number[], given: number } // interval, phrase: first `given` are pre-lit
    | { type: 'rhythm', onsets: number[], beats: number, bpm: number }, // onsets in beats
  range: { lo: number, hi: number }      // keyboard range the UI should make visible
}
```

### 4.2 engine.js

```js
export function createRng(seed);        // mulberry32; returns fn with .state() / restorable
export function createEngine({ state, seed, config });  // state: saved State or undefined
export const DEFAULT_CONFIG;
export const STATE_VERSION = 1;
export function migrate(anyState);      // -> valid State (never throws; unknown -> fresh)
export function mergeStates(a, b);      // pick more totalAnswers, tie -> later updatedAt

engine.getState()                        // deep-cloned JSON-serialisable State
engine.startSession({ mode, stageId, lengthMs, now, inputMode })
        // mode: 'practice' | 'placement' | 'testout' | 'review'
        // inputMode: 'keys' | 'names' | 'midi' | 'mic' (affects rt allowance + pitch-class matching)
engine.next({ now })                     // -> Prompt | null (null = session is over)
engine.collector(prompt)                 // -> Collector for that prompt
engine.answer({ promptId, correct, rtMs, hintShown, wrong, now })   // -> Feedback
engine.skip({ promptId, now })           // counts as incorrect, reveals answer
engine.endSession({ now })               // -> Summary; safe to call twice
engine.progress({ now })                 // -> Progress (for the progress + home screens)
engine.canTestOut(stageId)               // boolean
engine.setSettings(partial); engine.reset({ now });

/** Prompt */ PromptBody & {
  promptId, itemId, stageId, isIntro,          // isIntro: first exposure -> UI shows teaching card
  hintAfterMs,                                  // 0 = show now, Infinity = never
  hint: { name, mnemonic? }, goalMs,            // goalMs: current fluency target for this prompt
  mode, index, reason }                         // reason: 'new'|'weak'|'due'|'retry'|'review'|'flow'|'probe'

/** Collector */ {
  push({ midi, t }) | push({ tap: true, t })   // t = performance.now()-style ms
     -> { status: 'pending'|'correct'|'wrong', matched: number[], wrongMidi?: number, need: number }
  startAt(t)                                    // UI calls when the prompt becomes visible
  result()                                      // -> { correct, rtMs, wrong: number[] }
}
   Rules: 'set' -> chord window 1500 ms from first key, extra wrong key = wrong immediately;
   'sequence' -> in order, first `given` notes are pre-satisfied; rtMs = time to LAST required key;
   pitchClass matching when inputMode is 'names' or 'mic' or settings.octaveStrict is false;
   'rhythm' -> correct when every onset is hit within +-(18% of a beat, min 110 ms) and no extras;
   rtMs for rhythm = mean absolute timing error (stored in the same field, flagged by kind).

/** Feedback */ { correct, rtMs, goalMs, fast: boolean, itemMastery: number /*0..1*/,
  events: Array<                               // UI turns these into toasts / interstitials
    | { type: 'item-mastered', itemId } | { type: 'new-item', itemId }
    | { type: 'stage-passed', stageId, via: 'mastery'|'fast-path'|'testout'|'placement' }
    | { type: 'step-back', toStageId, answers } | { type: 'step-back-over' }
    | { type: 'pace', dir: 'up'|'down' } | { type: 'placement-done', stageId }
    | { type: 'testout-result', passed, stageId } >,
  sessionOver: boolean }

/** Summary */ { mode, startedAt, durMs, answers, correct, accuracy, medianRtMs, bestStreak,
  itemsMastered: string[], itemsIntroduced: string[], weakest: string[],
  stageBefore, stageAfter, stageProgress /*0..1*/, dailyGoalMet, streakDays }

/** Progress */ { stageIdx, stages: Array<{ id, title, status, progress, canTestOut }>,
  items: Record<itemId, { mastery, acc, rtMs, n, box }>,
  heat: Array<{ midi, staff, mastery, n }>,   // single-note items only, for the staff heatmap
  sessions: Array<{ t, durMs, answers, accuracy, medianRtMs }>,   // oldest -> newest, max 60
  today: { ms, answers, goalMs }, streakDays, totalAnswers, pace }

/** State (persisted, v1) */ { v: 1, updatedAt, totalAnswers, rng, placementDone, stageIdx, pace,
  stages: Record<id, { status: 'locked'|'active'|'passed', via?, passedAt?, win: number[][] }>,
  items: Record<id, { n, c, acc, rt, streak, box, last, due, intro }>,
  sessions: [...max 60], days: Record<'YYYY-MM-DD', { ms, answers, correct }>,
  settings: { sessionMin: 10, dailyGoalMin: 10, inputMode: 'keys', sound: true, hints: true,
              naming: 'letters', octaveStrict: true, labels: 'c-only', metronome: true } }
```
Rounded numbers only (acc to 3 dp, rt to integer ms) to keep the doc small (< 40 KB worst case).

### 4.3 storage.js

```js
export function createStore({ key = 'tutti.progress.v1', claude = globalThis.claude,
                              localStorage = safe global, debounceMs = 1500, log });
store.loadLocal()            // sync -> State | null   (localStorage, try/catch)
store.connect()              // async -> { remote: State | null, backend: 'db'|'local'|'memory' }
                             //   never rejects; resolves within <= 12 s
store.save(state, { flush }) // debounced; single in-flight write per doc; coalesces; never throws
store.backend()              // current backend name, for the settings screen
store.onStatus(fn)           // 'saving' | 'saved' | 'offline'
```
db usage, exactly: `const db = await claude?.use?.('db')`, `const user = await claude?.use?.('user')`,
doc = `db.collection('data/users/' + await user.id()).doc('progress')`, `.get()` / `.set(obj)`.
Treat the result of `.get()` defensively (object, `{data}` wrapper, `.data()` function, or
null/undefined when missing). Never read `window.claude.db`. A failed write keeps the local copy
and retries on the next save. Every db write also writes localStorage first.
UI save policy: on session end (flush), every 20 answers (debounced), on settings change, on
`visibilitychange -> hidden` (localStorage only, synchronously).

### 4.4 audio.js

```js
export function createAudio();          // lazy: creates no AudioContext until unlock()
audio.unlock()                          // call inside a user gesture; try/catch; returns boolean
audio.noteOn(midi, { velocity }) ; audio.noteOff(midi) ; audio.allOff()
audio.blip('ok' | 'bad')                // very short, quiet feedback cue
audio.click(accent)                     // metronome tick
audio.now()                             // ctx.currentTime in ms, or performance.now() fallback
audio.setEnabled(bool) ; audio.available
```
Organ timbre: per note, sines at harmonics 1,2,3,4,6,8 with gains 1, .55, .3, .22, .1, .06
(drawbar-like), 12 ms attack, sustain flat while held, 60 ms release, master through a compressor,
max 8 voices. No decay while held.

### 4.5 input adapters (all same shape)

```js
createMidiInput({ onNote }) / createMicInput({ onNote }) / createKeyInput({ onNote, onCommand })
adapter.available      // feature detect only, never throws
adapter.start()        // async -> { ok: boolean, reason?: 'unsupported'|'blocked'|'no-device'|'denied' }
adapter.stop()
onNote({ midi, on: boolean, t, source: 'midi'|'mic'|'key' })
```
- midi: `navigator.requestMIDIAccess()` in try/catch, handles hot-plug (`statechange`), note-on
  velocity 0 = note-off.
- mic: `getUserMedia({audio})` in try/catch, YIN on 2048-sample frames, emits a note after 3
  consecutive agreeing frames with clarity > 0.9 and RMS over a gate; monophonic; reports
  `{ok:false, reason:'blocked'}` in the artifact frame. `yin(float32, sampleRate)` exported pure for tests.
- keys: desktop row `A W S E D F T G Y H U J K` = C..C chromatic from the visible octave, `Z`/`X`
  octave down/up, `Space` = skip/next, `H` conflicts so hint is `?`, `Esc` = pause. Also letters
  `C D E F G A B` when inputMode is 'names'. Ignores events when a dialog/input is focused.

### 4.6 UI <-> engine wiring (who calls what)

app boot: `local = store.loadLocal()` -> `engine = createEngine({state: local, seed: Date.now()})`
-> render immediately -> `store.connect()` resolves -> if remote wins `mergeStates`, rebuild the
engine from it only when no session is running (otherwise merge at session end) -> re-render.
practice loop: `p = engine.next()` -> draw -> `col = engine.collector(p); col.startAt(t)` -> each
input event `col.push(...)` -> on non-pending: `fb = engine.answer({...col.result(), promptId,
hintShown})` -> animate -> next after 450 ms (correct) / after the learner plays the right key
(wrong: answer is revealed on staff + keyboard and he must play it once, untimed, before moving on).
Timer pauses on `visibilitychange` and on the pause sheet; the engine also clamps rt at 15 s.

---------------------------------------------------------------------------------------------------

## 5. Adaptive algorithm (spec for engine.js)

All constants live in `DEFAULT_CONFIG` and are overridable in tests.

**Per-item model.** `acc` = EWMA of correctness (alpha .35; a hinted correct answer scores .5);
`rt` = EWMA of rtMs over un-hinted correct answers (alpha .35, rt clamped to 15 s); `streak`;
Leitner `box` 0..5; `due` (timestamp); `last` (global answer index).
`speed = clamp((slow - rt) / (slow - goal), 0, 1)` with `slow = 2.5 * stage.rt.start`,
`goal = lerp(stage.rt.start, stage.rt.end, box / 5)` plus an input allowance (names 0, keys 0,
midi 0, mic +350 ms; chords/hands already have their own stage goals).
`mastery = 0.6 * acc + 0.4 * speed`. Mastered = mastery >= .85 and streak >= 3 and n >= 4.
Because the goal tightens with the box, an item that is accurate but slow stops climbing: fluency is
required, not just correctness.

**Leitner moves.** Correct and rt <= goal: box +1. Correct but slow: box stays. Wrong: box =
max(0, box - 2), streak 0. Known-on-sight: an item answered correctly under `0.6 * goal` on its
first two exposures jumps straight to box 3. Box intervals for `due`: 0 -> now, 1 -> 10 min,
2 -> 1 day, 3 -> 3 days, 4 -> 7 days, 5 -> 21 days. At session start, items overdue by more than
2x their interval lose one box (forgetting) and are queued as `due`.

**Choosing the next prompt.** Pool = active (introduced) items of the current stage + review items
from passed stages. Mix by pace: normal 75/25, struggling 90/10 (less interference), flying 60/40
(interleaving harder). Weight = `1 + 4 * (1 - mastery)^2 + 2 * overdue + 1.5 * isNew`. Never the same
item twice in a row unless the pool has one item. A missed item is re-queued at +2, then +5, then
+10 answers (expanding retrieval inside the session) ahead of the weighted draw.

**Rolling window.** Last 20 answers in the stage: `[correct, rt / goal]`. Window accuracy `wa`,
window speed ratio `ws` (median).

**Pace (learner speed estimate, 0.5..3, starts 1).** After every 5 answers:
wa >= .9 and ws <= 1 -> pace * 1.25; wa < .7 -> pace * 0.7; otherwise drift to 1. Emits `pace` events.

**Introducing new items.** Active set starts with 3 (2 if pace < .8). Introduce when every active
item has mastery >= `introAt` and the last 4 answers were correct; `introAt` = .7 at pace 1, .55 at
pace >= 2, .8 at pace <= .7. Batch size = round(pace) clamped 1..3. First exposure is a teaching
card (`isIntro`, hint shown at once, untimed, not scored).

**Struggle handling.** wa < .65: freeze introductions; shrink the working set to the 3 weakest + 1
strong anchor until wa >= .8; `hintAfterMs` drops to 2500 (normal 5000; mastered items never hint;
hints off in settings -> Infinity). wa < .5 over >= 12 answers: `step-back` — the next 10 prompts
come from the previous stage's weakest items, then return (`step-back-over`); the unlocked stage is
not lost. Two step-backs in one stage inside a session also halves the batch size for that session.

**Promotion.** A stage passes when either
(a) mastery path: every item introduced and >= 85% of them mastered, and wa >= .85; or
(b) fast path: >= 12 answers in the stage, wa >= .95, ws <= 1.0, and every item answered correctly
    at least once (introduction at pace 3 makes this reachable in ~2 answers per item).
Mix stages use the window rule only (20 answers, wa >= .9, ws <= 1.1).

**Test-out.** Offered for the active stage and the next locked one. 12 prompts sampled to cover the
stage's items (15 for chord stages), no hints, no retries. Pass = accuracy >= 90% and median
rt <= 1.25 * stage.rt.start -> stage `passed` (via 'testout'), its items seeded at box 3, acc .85.
Fail = nothing lost; missed items are flagged weak. One attempt per stage per day.

**Placement (first launch, skippable with "I'm starting from zero").** Staircase over stages 0..9
in order: 4 prompts per stage drawn from its hardest items, no hints. >= 3/4 correct with median
rt <= 1.5 * rt.start -> stage passed (via 'placement', items seeded at box 2 = provisional, so they
come back for verification) and continue; otherwise stop. Cap 28 prompts. Result sets `stageIdx`.

**Sessions, goal, streak.** Session ends when `lengthMs` elapses (the current prompt is finished
first) or on test-out/placement completion. `days[YYYY-MM-DD]` accumulates active ms (local date
passed in by the UI via `now` + `tzOffsetMin` in startSession); streak = consecutive days meeting
`dailyGoalMin`, today not yet met does not break it.

**Determinism.** One seeded mulberry32 stream stored in state (`rng`). No `Math.random`,
`Date.now` or `performance.now` inside engine.js or curriculum.js.

---------------------------------------------------------------------------------------------------

## 6. Screens (spec for the UI)

- **Home**: greeting, streak + today's ring (minutes / goal), current stage card with progress bar,
  primary "Start 10-min session", secondary "Test out of this stage", "Quick review (3 min)".
  First launch: placement invitation card with two choices.
- **Practice**: top bar (pause, thin time bar, accuracy dot trail of last 10), staff card (large,
  ~45% of viewport height on phones), reason chip ("new", "review"), hint line that fades in at
  `hintAfterMs`, response-time pace bar that drains toward `goalMs` (subtle, not stressful), then
  input area: on-screen keyboard (default) or note-name buttons. Intro cards for new items. Wrong
  answer: staff note turns red, correct key pulses, name shown, play it to continue.
- **Keyboard**: 2 octaves visible at 390 px by default (white key >= 26 px wide, 120 px tall),
  auto-scrolls so `prompt.range` is centred, pinch or +/- buttons to zoom 1..3 octaves, minimap
  strip showing position on the full C2-C6 range, optional key labels (none / C only / all),
  multi-touch for chords, pointer events, `touch-action: none` on keys, horizontal scroll via the
  minimap not by dragging keys.
- **Summary**: accuracy, median response time vs last session, items mastered, new items, stage
  progress delta, weakest three with their staff glyphs, streak, "Again" / "Done".
- **Progress**: stage map (vertical path, passed / active / locked, test-out buttons), mastery
  heatmap drawn on a grand staff (one notehead per single-note item, coloured by mastery with a
  non-colour cue: ring thickness), speed trend sparkline over sessions (median rt, lower is better,
  with direct labels on first/last point), totals.
- **Settings**: session length (5/10/15/20), daily goal, input mode (keys / names / MIDI / mic —
  the last two show "unavailable here" when `start()` fails), sound, hints, naming, key labels,
  octave strictness, sync status (`store.backend()`), reset progress behind an in-page confirm.
- **Dialogs**: custom modal with focus trap and Esc; no alert/confirm/prompt anywhere.
- Look: calm, premium practice tool. Warm paper-like staff card in light theme, deep ink-blue/graphite
  in dark; one accent (brass/amber, nod to organ pipes), green/red reserved for feedback only.
  Serif display face for headings (e.g. Fraunces) + a clean grotesk for UI via Google Fonts with
  system fallbacks. `prefers-color-scheme` and `prefers-reduced-motion` honoured. Safe-area insets.
  Bottom tab bar on phones, left rail >= 900 px with the staff and keyboard centred, max-width 880.

---------------------------------------------------------------------------------------------------

## 7. Agent briefs

Order: A and B first in parallel (they only depend on section 4). C, D, E can run in parallel with
them. F (UI) starts as soon as A's and B's exports exist as stubs — brief A/B agents to commit the
export surface with stub bodies in their first 5 minutes. G runs last. Planner reviews at the end.

```
 A curriculum (sonnet) ─┐
 B engine+tests (sonnet)├─> F UI (opus) ─> G build QA + screenshots (sonnet) ─> planner review
 C storage (sonnet) ────┤
 D audio+inputs (sonnet)┤
 E build script (sonnet)┘
```

### Brief A — SONNET — curriculum data  (`src/curriculum.js`, `tests/curriculum.test.mjs`)
Read sections 3 and 4.1 of /home/claude/organ-trainer/PLAN.md and implement `src/curriculum.js` as
a pure ES module (no DOM, no Math.random, no imports). Export exactly the surface in 4.1. Build all
15 stages of section 3 with the listed items in intro order, ids in the listed formats, a `label`
and `hint.name` per item, and mnemonics for staff lines/spaces. `realize(item, rng)`:
single notes are fixed; intervals/dyads pick a random white-key start so both notes stay within the
staff plus one ledger line; triads list concrete voicings; hymn chords are hand-checked SATB
voicings (soprano+alto on treble, tenor+bass on bass, hand span <= an octave each) with `keySig`;
rhythm items give onsets in beats at 72 bpm; phrases are generated from the rng (4-8 notes, start on
a landmark, steps mostly, max one skip for the `-step` templates) and return a `sequence` answer
with `given: 0`. `staffStep`: treble bottom line E4 = 0, bass bottom line G2 = 0, one diatonic step
per unit, accidentals do not move the step. `range` = lowest/highest answer midi padded to whole
octaves (min 2 octaves).
Tests (node --test): every stage item id resolves; ids unique; every realised prompt has answer
midis consistent with `notes`; all notes of non-ledger stages fall within the 5 lines +- 1 step;
realize is deterministic for a fixed seed; `staffStep(64,'treble') === 0`, `staffStep(60,'treble')
=== -2`, `staffStep(60,'bass') === 10`, `staffStep(43,'bass') === 0`; noteName letters/solfege
(fixed-do, B = 'Ti', sharps as 'Fa#').
Done when `node --test tests/curriculum.test.mjs` passes. Report the export list and item counts.

### Brief B — SONNET — adaptive engine  (`src/engine.js`, `tests/engine.test.mjs`)
Read sections 4.2 and 5 of PLAN.md and implement `src/engine.js` (pure ES module; imports only
`./curriculum.js`; if that file is not there yet, code against section 4.1 and use a small fixture
curriculum in tests through `config.curriculum` injection — keep that injection point permanently).
No DOM, no Date.now/Math.random/performance.now: time arrives as `now`, randomness from the seeded
rng persisted in state. Implement every method, the Collector rules, `migrate`, `mergeStates`.
`migrate` must accept garbage and return a fresh valid state.
Tests, using a simulated learner `sim({ pKnown, pLearnPerExposure, rtMean, rtSd, seed })` that
answers through the public API only:
1. determinism: same seed + same answers -> identical prompt sequence and final state;
2. fast learner (97% correct, rt 0.6x goal) passes stage 3 in at most 45% of the answers a slow
   learner (72% correct, rt 1.4x goal) needs; print both counts;
3. struggling learner with two "confusable" items answered at 40%: those items are presented at
   least 2x as often as the others over 200 prompts;
4. promotion: mastery path and fast path each fire `stage-passed` with the right `via`;
5. step-back fires after a run of wrong answers (wa < .5, >= 12 answers), serves previous-stage
   items for 10 prompts, then `step-back-over`; stageIdx unchanged;
6. intro freezes while wa < .65 and resumes after recovery; batch size follows pace;
7. placement: an oracle that knows stages 0-4 lands on stage 5 in <= 28 prompts; a zero-knowledge
   learner lands on stage 0;
8. test-out pass and fail paths; one attempt per day;
9. goalMs for an item is non-increasing as its box rises; accurate-but-slow answers never reach
   mastered;
10. collector: set (any order, chord window, wrong key), sequence with `given`, pitch-class mode,
    rhythm tolerance;
11. session end by time, summary fields, streak across simulated days, forgetting after 30 idle days;
12. state survives JSON round-trip; mergeStates prefers more totalAnswers then later updatedAt.
Done when `node --test tests/engine.test.mjs` passes with zero failures. Report pass count and the
fast-vs-slow answer counts.

### Brief C — SONNET — persistence  (`src/storage.js`, `tests/storage.test.mjs`)
Implement section 4.3 exactly. Everything in try/catch; `connect()` never rejects and gives up after
12 s. Single-flight writes: if a save is requested while one is in flight, keep only the latest
pending state and write it when the first settles. Tests with fakes: no `claude` at all; `use`
resolving null; `use` never resolving (fake timers); `.get()` returning each of the four shapes;
`.set()` rejecting then succeeding; localStorage throwing on setItem; 10 rapid saves -> exactly one
or two db writes with the last state; nothing written when the state is unchanged (compare
`updatedAt` + `totalAnswers`).

### Brief D — SONNET — audio and input adapters  (`src/audio.js`, `src/input/*.js`, `tests/yin.test.mjs`)
Implement sections 4.4 and 4.5. No AudioContext, getUserMedia or requestMIDIAccess call at import
time or before `unlock()` / `start()`. Every browser API call wrapped in try/catch and reduced to
the `{ok, reason}` result. Test `yin()` in node on synthesized sines and sine+harmonics at A2, C4,
A4, C6 (within 20 cents) and on noise (returns null). Modules must import cleanly in node (guard
`typeof window`).

### Brief E — SONNET — build  (`package.json`, `build.mjs`)
`npm init`, devDeps esbuild + playwright. `node build.mjs`: bundle `src/ui/app.js` with esbuild
(format iife, target es2020, minify, no sourcemap), read `src/styles.css` and
`src/index.template.html`, replace `<!--CSS-->` with `<style>...</style>` and `<!--JS-->` with
`<script>...</script>` (escape `</script` inside the bundle), write `dist/index.html`. Fail the
build if the output does not start with `<!DOCTYPE html>`, lacks `<title>`, or contains `alert(`,
`confirm(`, `prompt(`, `window.open`, `serviceWorker`, `<img src="http`, or any `src=`/`href=` to a
host other than fonts.googleapis.com / fonts.gstatic.com. Print the output size. `npm test` =
`node --test tests/*.test.mjs`; `npm run build`.

### Brief F — OPUS — all UI/UX  (`src/ui/**`, `src/styles.css`, `src/index.template.html`)
Read PLAN.md sections 1, 2, 4, 6 fully; treat section 4 as frozen (if something is missing, add a
thin adapter in `ui/`, do not edit engine/curriculum; list any contract gaps in your report).
Build: the app shell and hash router; `ui/staff.js` — `renderStaff(promptBody, opts) -> SVGElement`
drawing treble / bass / grand staff (brace + barline), clefs as inline paths, ledger lines,
accidentals, key signatures, stems (direction by position; shared stem for chords, seconds offset),
durations w/h/q/8 with beams for eighth pairs, time signature and beat grid for rhythm prompts,
per-note state classes (`is-target`, `is-correct`, `is-wrong`, `is-ghost`) and a `heat` mode used by
the progress screen; `ui/keyboard.js` per section 6; the six screens; in-page dialog and toast;
wiring per section 4.6 including storage merge, save policy, audio unlock on the first tap, input
adapters with graceful "unavailable here" states, pause on hidden tab.
Platform rules (hard): single file after build, everything inline, no alert/confirm/prompt, no
window.open, no downloads, no service worker, no remote images, hashes only for routing, must work
when `window.claude` is undefined, render before storage resolves. `<meta viewport>` with
`viewport-fit=cover` and `env(safe-area-inset-*)` padding. Works at 380 px wide with no horizontal
page scroll; touch targets >= 44 px; staff notation legible at arm's length (staff space >= 11 px
on phones). Dark and light themes, reduced motion, visible focus rings, aria-labels on keys
("C4"), live region for correct/incorrect.
Design direction: section 6 "Look". Avoid a generic template feel: the staff card is the hero;
feedback is a notehead colour fill + a soft ring on the key + a 150 ms scale, nothing louder.
Verify with Playwright (`npm i -D playwright && npx playwright install --with-deps chromium`):
load `dist/index.html` from file://, at 390x844 and 1280x800, both colour schemes; walk home ->
placement skip -> practice (answer 5 prompts right and 2 wrong by clicking keys) -> summary ->
progress -> settings -> reset confirm; assert zero console errors and zero page errors; save
screenshots to `/home/claude/organ-trainer/screens/<screen>-<width>-<scheme>.png`; look at them and
fix overlap, clipping and overflow. Report screens built, contract gaps, screenshot paths.

### Brief G — SONNET — integration QA  (`tools/shoot.mjs`, fixes limited to glue)
Run `npm test` and `npm run build`. Write `tools/shoot.mjs` to repeat brief F's walkthrough
headlessly plus: (1) a stubbed `window.claude.use` whose db is an in-memory fake -> progress written
after a session and restored on reload; (2) `use` resolving null -> localStorage path; (3)
localStorage disabled -> in-memory path, no errors; (4) a full simulated 60-answer session driven by
clicking the correct key from `prompt` data exposed on `window.__tutti` (debug hook, only when the
URL hash contains `debug`); (5) check `document.documentElement.scrollWidth <= innerWidth` at 380,
390, 768, 1280. Report failures to the planner rather than rewriting UI code.

### Planner final review checklist
- dist/index.html: starts with `<!DOCTYPE html>`, has `<title>`, size sane (< 400 KB), build guards pass.
- Engine tests green; fast/slow ratio printed; no Date.now/Math.random in engine or curriculum.
- Contract drift: grep the UI for engine members not in 4.2.
- Screens reviewed at both sizes and both themes; practice screen fits 390x844 with no scroll.
- Publishing note for the parent: after publishing, declare capabilities `{ db: {}, user: {} }`
  on the artifact (the db how-to requires both), otherwise the app silently stays on localStorage.

---------------------------------------------------------------------------------------------------

## 8. Risks and open points

- Web MIDI and microphone will almost certainly be blocked inside the artifact frame; both are
  progressive enhancements and the settings screen says so plainly.
- Hand-drawn clef paths are the main visual-quality risk; budget time for them in brief F.
- Rhythm timing on touch devices has 30-80 ms of latency; the tolerance in 4.2 allows for it and a
  one-time "tap along" calibration can be added later.
- Threshold constants are first guesses grounded in spaced-retrieval practice; after a week of real
  use, tune from `sessions` history (all constants are in DEFAULT_CONFIG).
- Not in scope for v1: importing real scores (MusicXML), multi-voice rhythm, pedal + manuals together.
