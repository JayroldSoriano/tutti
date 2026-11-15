# Tutti v2 — Daily Lessons: plan and agent briefs

Status: PLAN ONLY. Nothing here is implemented. Sections 1-6 are the shared contract; every brief
in section 7 assumes the agent has read them. v1 (PLAN.md, the adaptive drill engine) stays and is
reused; v2 adds a teaching layer on top of it.

Feedback being answered: "There should be daily lessons; right now it is a test app and a sight
reader. It should teach me and help me memorise the notes so I can play by sight."

Verified against the code on disk (not just PLAN.md): `src/curriculum.js` exports `STAGES, ITEMS,
getStage, stageItems, realize, noteName, staffStep, isBlack`; `src/engine.js` exports
`createEngine, migrate, mergeStates, createRng, DEFAULT_CONFIG, STATE_VERSION`; `migrate` rebuilds
state from a fresh object and DROPS unknown fields; `mergeStates` picks one whole state; the router
in `src/ui/app.js` takes the first hash segment split on `/[&?/]/` against a `ROUTES` list;
`renderStaff` has no dotted notes, no inner barlines, no time signature, no rests (so melodies need
a new score renderer); `createKeyboard` returns `{ el, showRange, mark(midi, cls, ms), clearMarks,
press, setLabels, setDisabled, setOctaves, layout, destroy }` with mark classes `is-hint`, `is-ok`,
`is-bad`, `is-given`.

---------------------------------------------------------------------------------------------------

## 1. Learning design rationale

1. **Play real music in lesson 1.** Motivation comes from tunes, not flashcards. The path starts in
   the right-hand C position (C4-G4), where dozens of real melodies live, instead of v1's
   landmark order. Every lesson ends by sight-playing a real public-domain melody built only from
   notes taught so far.
2. **Errorless first, then fade.** New material is shown with the key glowing and the name
   printed, then name only, then nothing. Mistakes during the scaffolded phase cost nothing; the
   learner never has to guess. Retrieval difficulty rises inside the lesson, not across days.
3. **Landmarks and distance, not letter-counting.** Fluent readers anchor on a few notes (middle C,
   treble G, bass F, the two outer Cs) and read everything else as "a step up", "a skip down".
   Mnemonics (FACE, Every Good Boy...) are taught as a backup retrieval route through an activity,
   never as the primary method.
4. **Dual coding: see it, say it, play it.** Each new note is bound three ways: its place on the
   staff, its spoken letter, its key under a specific finger. The staff-to-key link line makes the
   mapping visible.
5. **Spaced, expanding retrieval.** Every lesson opens with a warm-up drawn from the v1 Leitner
   model (due and weak items), and missed items come back at +2, +5, +10 inside the drill. Lesson
   practice and free practice feed one mastery model.
6. **Mastery-gated, not date-gated.** A checkpoint ends each lesson. Ace it: the next lesson is
   open today. Pass: it opens tomorrow (soft gate, "start anyway" allowed). Miss: a short focused
   review lesson is inserted and replaces a full repeat.
7. **Organ habits from day one.** Finger numbers, five-finger positions and legato (organ tone does
   not decay, so gaps are audible) arrive as one-screen tips attached to the tune being played.
8. **10-15 minutes.** A lesson has 9-13 short steps. Each step states its own purpose in one line.

---------------------------------------------------------------------------------------------------

## 2. Lesson path (32 core lessons, 6 units)

Arc: right hand C position -> left hand C position -> grand staff -> whole treble staff -> rhythm
-> whole bass staff -> hands together -> key signatures and accidentals -> ledger lines -> hymn
lines with both hands. Review lessons are generated and inserted by the progress logic (4.3) and
do not appear in this list.

### 2.1 Standard lesson skeleton

Unless a lesson row says otherwise, steps are generated in this order. Step types are defined in
section 3. `NEW` = the lesson's new note items; `TODAY` = all of the lesson's `items`.

| # | step | content |
|---|------|---------|
| 1 | `drill` (source `warmup`) | 8 prompts picked by `pickWarmup` from earlier lessons. Omitted in L01. |
| 2 | `concept` x1-3 | the lesson's concept cards, visual first |
| 3 | `demo` | watch and listen: NEW notes in order, twice, key and notehead lit together |
| 4 | `guided` scaffold `glow` | each NEW note x2 in order, name printed large, "say it as you play it" |
| 5 | technique steps | the lesson's memory activities (`find-key`, `landmark-distance`, `mnemonic`, `name-it`, `flash`) |
| 6 | `guided` scaffold `name` | NEW notes x2 shuffled, name shown, no glow |
| 7 | `guided` scaffold `none` | NEW notes + 3 earlier notes, shuffled, x2, nothing shown |
| 8 | `tip` | organ technique micro-tip |
| 9 | `drill` (source `today`) | adaptive drill, hints off, 10-24 prompts, stops early at 7 of last 8 correct |
| 10 | `melody-wait` x1-2 | the lesson's songs; first pass with note names, second pass plain |
| 11 | `melody-tempo` (optional) | one song with metronome; never gates progress |
| 12 | `quiz` | checkpoint |
| 13 | `recap` | what was learned, grade, tomorrow's preview, streak |

Lessons with no NEW notes (L03, L04, L08, L12, L16-18, L24-32) skip steps 3, 4, 6, 7 unless the
row lists guided targets.

Default checkpoint: `quiz` of 10 prompts (12 from L09 on) drawn from TODAY plus a sample of earlier
items, no hints, no retries. **pass** = accuracy >= 0.80. **ace** = accuracy >= 0.90 and median
response-time ratio (rt / goal) <= 1.0 and first-try accuracy >= 0.85 on the lesson's last
`melody-wait`. Lessons marked "melody checkpoint" have no quiz: pass = first-try accuracy >= 0.80
on the named song in wait mode, ace = >= 0.92.

Pitch names use scientific octaves (C4 = middle C = MIDI 60). Item ids are v1 engine ids:
`n:t:60` = C4 on the treble staff, `n:b:48` = C3 on the bass staff, `iv:` melodic interval shape,
`dy:` harmonic interval, `ht:` hands-together pair, `ch:` triad, `hy:` hymn chord, `rh:` rhythm.

Feature tags a lesson unlocks (used to grade songs, section 4.2): `q h w` (L01), `h.` (L04),
`rest` and `grand` (L07), `8`, `q.`, `3/4`, `pickup` (L12), `together` (L16), `key1` (L19),
`key-1` (L20), `chord` (L25).

### 2.2 Unit 1 — Right hand, first five notes

**L01 The keyboard map and middle C**
- Goal: find any C, D, E on the keyboard; read C4, D4, E4 on the treble staff; play a tune.
- Teaches: treble C4, D4, E4. Items: `n:t:60 n:t:62 n:t:64`. Features: `q h w`. placeOut: `treble-landmarks, treble-staff`.
- Concepts: (1) "Twos and threes" — black keys come in groups of 2 and 3; visual `kb-groups`.
  (2) "C lives left of the two" — C is the white key just left of every group of two; D sits
  between the two, E to the right; visual `kb-names` {letters: C D E}. (3) "Middle C on paper" —
  the staff is a ladder; middle C sits on its own short line below the treble staff, D hangs under
  the bottom line, E sits on the bottom line; visual `staff-key-link` {C4, D4, E4}.
- Technique: `find-key` "Find every C" (4 Cs, C2-C6 range, groups hinted); `find-key` "Find D, then
  E" (pitch classes D, E, 3 each); `name-it` C4 D4 E4 x2 (say it, then tap the letter).
- Tip: "Right hand, curved fingers: thumb is 1, index 2, middle 3. Thumb on middle C." visual `finger-numbers` {hand: rh}.
- Songs: wait `hot-cross-buns` (pos rh thumb C4).
- No warm-up. Quiz 8 prompts.

**L02 F and G: the C position**
- Goal: read F4 and G4; keep five fingers over C-D-E-F-G and play without looking down.
- Teaches: treble F4, G4. Items: `n:t:65 n:t:67`.
- Concepts: (1) "The treble clef is a G" — the clef curls around the second line: that line is
  G; visual `clef` {clef: treble, landmark: G4}. (2) "F and G live left of the three" — F is left
  of the group of three, G is next; visual `kb-names` {letters: F G}. (3) "Up the ladder" — line,
  space, line, space: each step up the staff is the next white key to the right; visual
  `line-space` {from: C4, to: G4}.
- Technique: `landmark-distance` landmark G4, targets F4 E4 (one step down, a skip down);
  `landmark-distance` landmark C4, targets D4 E4; `find-key` "Find every G" (3).
- Tip: "C position: fingers 1-2-3-4-5 rest on C-D-E-F-G. Each finger owns one key; do not look
  down." visual `hand-position` {hand: rh, thumb: C4}.
- Songs: wait `mary-lamb`, wait `lightly-row` (pos rh thumb C4, finger numbers on first pass).

**L03 Steps and skips: reading by distance**
- Goal: read a melody as a contour (same, step, skip) instead of naming every note.
- Teaches: no new notes. Items: `iv:t:+2 iv:t:-2 iv:t:+3 iv:t:-3`.
- Concepts: (1) "Step" — line to the next space or space to the next line = the neighbouring key;
  visual `step-skip` {size: 2}. (2) "Skip" — line to line or space to space = miss one key; visual
  `step-skip` {size: 3}. (3) "Read the shape" — name the first note, then follow the shape; visual
  `interval-shapes` {song: ode-to-joy, bars: [1, 2]}.
- Technique: `landmark-distance` landmark C4, targets D4 E4 (answer step up / skip up);
  landmark G4, targets F4 E4; `flash` x4 three-note patterns (C-D-E, G-F-E, C-E-G, E-D-C; shown
  1500 ms, then hidden; play from memory = chunking).
- Tip: "Eyes on the page. Feel for the neighbouring key with the neighbouring finger."
- Songs: wait `au-clair`, wait `ode-to-joy`.
- Quiz: the four interval items + L01-L02 notes.

**L04 Counting and legato: your first recital**
- Goal: hold notes for their full value, count a steady beat, join notes smoothly.
- Teaches: no new notes. Items: `rh:w rh:h-h rh:q-q-q-q rh:q-q-h rh:h-q-q`. Features: `h.`.
- Concepts: (1) "How long?" — quarter = 1 beat, half = 2, dotted half = 3, whole = 4; visual
  `note-values`. (2) "4/4" — four beats in every bar, bar lines are the fence posts; visual
  `time-sig` {time: [4, 4]}. (3) "Legato" — organ tone never fades; release a key exactly as the
  next goes down, no gap and no overlap; visual `legato`.
- Technique: `drill` on the rhythm items (tap pad, count 6) placed before the songs.
- Tip: "Sit tall, forearms level with the keys, wrists loose." visual `hand-position` {posture: true}.
- Songs: wait `aunt-rhody`; tempo `ode-to-joy` at 72 bpm (first required tempo step, pass or fail
  does not gate); wait `jingle-bells`.
- Melody checkpoint: `jingle-bells`. passesStages: none.

### 2.3 Unit 2 — Left hand and the grand staff

**L05 The bass clef: F, C and G**
- Goal: read the bass landmarks with the left hand.
- Teaches: bass F3, C3, G3. Items: `n:b:53 n:b:48 n:b:55`. placeOut: `bass-landmarks, bass-staff`.
- Concepts: (1) "The bass clef is an F" — its two dots hug the fourth line: that line is F below
  middle C; visual `clef` {clef: bass, landmark: F3}. (2) "Bass C" — second space from the bottom,
  one octave below middle C; visual `landmarks` {staff: bass, notes: [C3, F3]}. (3) "G sits on top
  of F" — the space above the F line; visual `staff-key-link` {C3, F3, G3}.
- Technique: `find-key` "Find the F below middle C, then bass C"; `landmark-distance` landmark F3,
  target G3; `name-it` C3 F3 G3 x2.
- Tip: "Left hand mirrors the right: pinky is 5 on C, thumb is 1 on G." visual `finger-numbers` {hand: lh}.
- Songs: wait `low-pipes` (pos lh pinky C3).

**L06 D and E: the left-hand C position**
- Goal: read all five left-hand notes C3-G3 by step and skip.
- Teaches: bass D3, E3. Items: `n:b:50 n:b:52 iv:b:+2 iv:b:-2 iv:b:+3 iv:b:-3`.
- Concepts: (1) "Fill the gap" — D is the middle line, E the space above it; visual
  `line-space` {from: C3, to: G3, staff: bass}. (2) "Same shapes, new clef" — steps and skips look
  identical in both clefs; only the names change; visual `step-skip` {size: 3, staff: bass}.
- Technique: `landmark-distance` landmark C3, targets D3 E3; landmark F3, targets E3 D3; `flash`
  x4 (C3-D3-E3, G3-F3-E3, C3-E3-G3, E3-D3-C3).
- Tip: "Left-hand C position: 5-4-3-2-1 on C-D-E-F-G." visual `hand-position` {hand: lh, pinky: C3}.
- Songs: wait `hot-cross-buns-lh`, wait `ode-to-joy-lh`. Spare: `au-clair-lh`.

**L07 The grand staff: where the hands meet**
- Goal: read both staves at once and know which hand plays; meet middle C from the bass side.
- Teaches: bass C4. Items: `n:b:60`. Features: `rest grand`.
- Concepts: (1) "Two staves, one keyboard" — treble staff = right hand, bass staff = left hand,
  joined by a brace; visual `grand-staff`. (2) "One middle C, two spellings" — the same key is the
  ledger line below the treble staff and the ledger line above the bass staff; visual
  `staff-key-link` {notes: [treble C4, bass C4]}. (3) "Rests" — a rest is silence for that hand;
  the whole rest hangs under the fourth line; visual `note-values` {rests: true}.
- Technique: `name-it` mixed clef (C4 treble, C4 bass, G4, F3, C3, E4) x2 with the question
  "which hand?" answered by tapping a hand icon first.
- Tip: "Both hands rest on the keys the whole time, even when one is silent."
- Songs: wait `middle-c-meeting`, wait `ode-relay` (hands `both`).

**L08 Recital 1: ten notes, two hands**
- Goal: consolidate C3-G3 and C4-G4; switch clefs without hesitation.
- Teaches: nothing new. Items: none.
- Concepts: (1) "Your landmarks so far" — middle C, treble G, bass F, bass C; visual `landmarks` {staff: grand}.
- Technique: `landmark-distance` mixed (6 targets across both staves); `flash` x6 mixed-clef
  three-note patterns; `drill` source `mixed` count 20 (all single-note items so far).
- Tip: "Legato check: listen for gaps between notes; there should be none."
- Songs: wait `mary-relay`; tempo `jingle-bells` at 84 bpm (optional).
- Melody checkpoint: `mary-relay`.

### 2.4 Unit 3 — The whole treble staff, then rhythm

**L09 A and B: above the C position**
- Goal: read A4 and B4; move the hand out of C position.
- Teaches: treble A4, B4. Items: `n:t:69 n:t:71`.
- Concepts: (1) "Keep climbing" — A is the second space, B is the middle line; visual
  `line-space` {from: G4, to: B4}. (2) "A and B finish the group of three" — G, A, B are the three
  white keys around the right two black keys of the group of three; visual `kb-names` {letters: G A B}.
  (3) "Stretch or shift" — to reach A, finger 5 stretches one key, or the whole hand moves up; visual `hand-position` {hand: rh, shift: true}.
- Technique: `landmark-distance` landmark G4, targets A4 B4; `find-key` "Find every A, every B";
  `name-it` G4 A4 B4 F4 x2.
- Tip: "When a tune leaves the position, move the whole hand; do not twist the wrist."
- Songs: wait `twinkle`, wait `b-in-the-middle`. Spare: `london-bridge`.

**L10 High C and D: a second landmark**
- Goal: own C5 as a landmark and read D5 from it.
- Teaches: treble C5, D5. Items: `n:t:72 n:t:74`.
- Concepts: (1) "Treble C" — third space; an octave above middle C; visual `landmarks`
  {staff: treble, notes: [C4, G4, C5]}. (2) "G position" — thumb on G, fingers on G-A-B-C-D: every
  tune you know can be played here; visual `hand-position` {hand: rh, thumb: G4}.
- Technique: `landmark-distance` landmark C5, targets D5 B4 A4; `flash` x4 in G position;
  `find-key` "Find middle C, then the C above it".
- Tip: "Same tune, new place = transposing. Your fingers repeat the pattern; only the names change."
- Songs: wait `lightly-row-g`, wait `mary-lamb-g` (pos rh thumb G4).

**L11 E, F, G: the top of the staff**
- Goal: read the full treble staff E4-G5; recall any line or space instantly.
- Teaches: treble E5, F5, G5. Items: `n:t:76 n:t:77 n:t:79`. passesStages: `treble-landmarks, treble-staff`.
- Concepts: (1) "Top-line F" — the top line is F, a new landmark; G sits on top of the staff;
  visual `landmarks` {staff: treble, notes: [C4, G4, C5, F5]}. (2) "Lines: E G B D F" and
  (3) "Spaces: F A C E" — visual `mnemonic`.
- Technique: `mnemonic` {phrase: "Every Good Boy Does Fine", notes: E4 G4 B4 D5 F5};
  `mnemonic` {phrase: "FACE", notes: F4 A4 C5 E5}; `landmark-distance` landmark F5, targets E5 G5 D5.
- Tip: "Mnemonics are the spare key. Landmarks and distance are faster; use the rhyme only when stuck."
- Songs: wait `lines-and-spaces`, wait `old-hundredth-c`.

**L12 Rhythm 2: eighths, dots and three-four**
- Goal: read eighth notes, dotted quarters, 3/4 time and a pickup.
- Teaches: no new notes. Items: `rh:q-h-q rh:8-8-q-h rh:q-8-8-h rh:h-8-8-q rh:8-8-8-8-h rh:q-q-8-8-q rh:8-8-q-8-8-q`. Features: `8 q. 3/4 pickup`.
- Concepts: (1) "Eighths" — two to a beat, joined by a beam, count "1-and"; visual `note-values`
  {eighths: true}. (2) "The dot" — a dot adds half: dotted quarter = one and a half beats, usually
  followed by an eighth; visual `note-values` {dots: true}. (3) "3/4 and the pickup" — three beats
  per bar; a tune may start on the last beat; visual `time-sig` {time: [3, 4], pickup: true}.
- Technique: `drill` on the rhythm items (tap pad, count 10).
- Tip: "Count out loud. Organists count; the instrument will not cover a late note."
- Songs: wait `joy-to-the-world`, wait `amazing-grace`, tempo `amazing-grace` at 66 bpm (optional). Spare: `silent-night`.
- Melody checkpoint: `amazing-grace`.

### 2.5 Unit 4 — The whole bass staff and hands together

**L13 A and B: up to middle C**
- Goal: read G3-A3-B3-C4 in the bass clef.
- Teaches: bass A3, B3. Items: `n:b:57 n:b:59`.
- Concepts: (1) "The top of the bass staff" — A is the top line, B sits on top, middle C is the
  ledger line; visual `line-space` {from: G3, to: C4, staff: bass}.
- Technique: `landmark-distance` landmark C4 (bass), targets B3 A3; landmark F3, targets G3 A3;
  `name-it` F3 G3 A3 B3 C4 x2.
- Tip: "Left-hand thumb is as strong as any finger: let it play A, B and middle C."
- Songs: wait `twinkle-lh`, wait `b-in-the-middle-lh`. Spare: `london-bridge-lh`.

**L14 Low G, A, B: the bottom of the staff**
- Goal: read G2, A2, B2.
- Teaches: bass G2, A2, B2. Items: `n:b:43 n:b:45 n:b:47`.
- Concepts: (1) "Bottom-line G" — a new landmark, two octaves below treble G; visual `landmarks`
  {staff: bass, notes: [G2, C3, F3, C4]}. (2) "Lines: G B D F A" and (3) "Spaces: A C E G" — visual `mnemonic`.
- Technique: `mnemonic` {phrase: "Good Boys Do Fine Always", notes: G2 B2 D3 F3 A3};
  `mnemonic` {phrase: "All Cows Eat Grass", notes: A2 C3 E3 G3}; `landmark-distance` landmark G2,
  targets A2 B2; landmark C3, targets B2 A2.
- Tip: "Bass lines often walk by step. Keep the hand low and quiet."
- Songs: wait `walking-down`, wait `old-hundredth-lh`.

**L15 Low F and the whole grand staff**
- Goal: read F2; read any note on either staff.
- Teaches: bass F2. Items: `n:b:41`. passesStages: `bass-landmarks, bass-staff, grand-mixed`.
- Concepts: (1) "One below the staff" — F hangs under the bottom line; visual `staff-key-link`
  {F2, G2}. (2) "All your landmarks" — bass G, bass C, bass F, middle C, treble G, treble C, top F;
  visual `landmarks` {staff: grand}.
- Technique: `landmark-distance` mixed clef x8; `flash` x6 mixed clef; `drill` source `mixed` count 24.
- Tip: "Look ahead: your eyes should be one note in front of your fingers."
- Songs: wait `bottom-of-the-staff`, wait `twinkle-relay`.
- Quiz: 14 prompts, both staves.

**L16 Hands together 1: a held bass**
- Goal: play a left-hand long note while the right hand plays a melody.
- Teaches: no new notes. Items: `ht:48+60 ht:50+62 ht:52+64 ht:55+67 ht:57+69`. Features: `together`.
- Concepts: (1) "Read bottom to top" — when notes line up vertically they sound together; read
  the bass note first, then the treble; visual `chord-stack` {pairs: [[C3, C4], [G3, G4]]}.
  (2) "Octaves" — the same letter in both hands; visual `staff-key-link` {notes: [bass C3, treble C4]}.
- Technique: `guided` scaffold `glow` on the five octave pairs; `guided` scaffold `none` on the same.
- Tip: "Hold the bass key down for its full length. On the organ, lifting early leaves a hole."
- Songs: wait `hot-cross-buns-drone`, wait `ode-drone` (hands `both`).

**L17 Hands together 2: moving in tenths**
- Goal: move both hands in the same direction at the same time.
- Teaches: no new notes. Items: `ht:48+64 ht:50+65 ht:53+69 ht:55+71 dy:t:3 dy:b:3 dy:t:5 dy:b:5`.
- Concepts: (1) "Thirds and fifths in one hand" — a third is line-line or space-space, a fifth
  skips one more; visual `interval-shapes` {sizes: [3, 5], harmonic: true}. (2) "Tenths" — a third
  spread across two hands: the hands move like a mirror image on the page, in step; visual
  `chord-stack` {pairs: [[C3, E4], [D3, F4], [E3, G4]]}.
- Technique: `guided` scaffold `name` on the four tenth pairs; `flash` x4 two-pair patterns.
- Tip: "When both hands move, think of one shape, not two notes."
- Songs: wait `twinkle-hands` (first pass right hand alone, second pass hands `both`).

**L18 Recital 2: both hands, whole staves**
- Goal: consolidate hands-together reading.
- Teaches: nothing new. Items: `iv:t:+4 iv:t:-4 iv:t:+5 iv:t:-5 iv:b:+4 iv:b:-4 iv:b:+5 iv:b:-5`.
- Concepts: (1) "Fourths and fifths" — a fourth is line to space with a gap, a fifth is line to
  line with one line between; visual `interval-shapes` {sizes: [4, 5]}.
- Technique: `drill` source `mixed` count 24; `flash` x6.
- Tip: "If you slip, keep the beat and rejoin. Never go back to fix a note in a hymn."
- Songs: wait `lightly-row-hands`, wait `jingle-bells-hands`, tempo `lightly-row-hands` at 66 bpm (optional).
- Melody checkpoint: `jingle-bells-hands`.

### 2.6 Unit 5 — Keys, accidentals and ledger lines

**L19 F sharp and the key of G**
- Goal: read a sharp; understand a one-sharp key signature.
- Teaches: treble F#4, bass F#3. Items: `n:t:66 n:b:54`. Features: `key1`.
- Concepts: (1) "A sharp is the next key to the right" — usually black; visual `accidental`
  {sign: '#', note: F4}. (2) "Key signature" — a sharp printed at the start of every line turns
  every F into F sharp, in every octave; visual `key-signature` {key: 1}.
- Technique: `find-key` "Find every F sharp" (4); `name-it` F4, F#4, F3, F#3, G4 x2;
  `landmark-distance` landmark G4, target F#4.
- Tip: "Black keys: slide the hand in towards the fallboard; do not reach with a flat finger."
- Songs: wait `g-major-walk`, wait `good-king-wenceslas`. Spare: `old-hundredth-g`.

**L20 B flat and the key of F**
- Goal: read a flat; understand a one-flat key signature.
- Teaches: treble Bb4, bass Bb3. Items: `n:t:70 n:b:58`. Features: `key-1`.
- Concepts: (1) "A flat is the next key to the left"; visual `accidental` {sign: 'b', note: B4}.
  (2) "One flat = key of F"; visual `key-signature` {key: -1}.
- Technique: `find-key` "Find every B flat" (4); `name-it` B4, Bb4, A4, B3, Bb3 x2.
- Tip: "In F position the fourth finger of the right hand plays B flat."
- Songs: wait `f-major-bass`, wait `ode-to-joy-f`, wait `frere-jacques`.

**L21 More accidentals and the natural sign**
- Goal: read any single sharp, flat or natural written in front of a note.
- Teaches: treble C#5, Eb5, G#4, F#5; bass Eb3, C#4, Ab3. Items: `n:t:73 n:t:75 n:t:68 n:b:51 n:b:61 n:b:56`
  (F#5 has no engine item; it is taught in guided steps only). passesStages: `accidentals`.
- Concepts: (1) "An accidental lasts to the bar line"; visual `accidental` {sign: '#', note: G4,
  carry: true}. (2) "The natural cancels"; visual `accidental` {sign: 'n', note: F4}.
- Technique: `find-key` "Find C sharp, E flat, G sharp, A flat"; `name-it` on the six items x2.
- Tip: "Read the letter first, then adjust by one key. Do not learn black keys as separate notes."
- Songs: wait `neighbours-rh`, wait `neighbours-lh`, wait `greensleeves`.

**L22 Ledger lines around middle C**
- Goal: read notes just outside each staff, where the hands overlap.
- Teaches: treble A3, B3, G3; bass D4, E4. Items: `n:t:57 n:t:59 n:b:62 n:b:64` (treble G3 has no
  engine item; guided steps only).
- Concepts: (1) "Ledger lines continue the ladder" — same line-space-line pattern; visual `ledger`
  {staff: treble, notes: [C4, B3, A3, G3]}. (2) "The staves overlap" — bass D4 and E4 are the same
  keys as treble D4 and E4; visual `staff-key-link` {notes: [bass D4, treble D4]}.
- Technique: `landmark-distance` landmark C4 (treble), targets B3 A3 G3; landmark C4 (bass),
  targets D4 E4; `name-it` x2.
- Tip: "Which hand? The staff decides, not the key."
- Songs: wait `yankee-doodle`, wait `hot-cross-buns-high-lh`, wait `auld-lang-syne`. Spare: `au-clair-high-lh`.

**L23 Ledger lines at the edges**
- Goal: read high treble and low bass ledger notes.
- Teaches: treble A5, B5, C6; bass E2, D2, C2. Items: `n:t:81 n:t:83 n:t:84 n:b:40 n:b:38 n:b:36`. passesStages: `ledger`.
- Concepts: (1) "Two more Cs" — C6 has two ledger lines above the treble staff, C2 two below the
  bass staff: the outer landmarks; visual `landmarks` {staff: grand, notes: [C2, C3, C4, C5, C6]}.
- Technique: `landmark-distance` landmark C6, targets B5 A5; landmark C2, targets D2 E2; `find-key` "Find all five Cs".
- Tip: "On a real organ the lowest notes usually go to the pedals; here the left hand takes them."
- Songs: wait `joy-to-the-world-high`, wait `deep-pipes`.

### 2.7 Unit 6 — Hymn lines

**L24 Two moving voices**
- Goal: play a moving bass against a moving melody.
- Teaches: no new notes. Items: `ht:52+60 ht:53+62 ht:55+64 ht:57+65 ht:53+60 ht:55+62 ht:57+64
  dy:t:6 dy:b:6 dy:t:8 dy:b:8 dy:t:2 dy:b:2 dy:t:4 dy:b:4 iv:t:+6 iv:t:-6 iv:t:+8 iv:t:-8 iv:b:+6 iv:b:-6 iv:b:+8 iv:b:-8`.
  passesStages: `intervals, dyads, hands-together`.
- Concepts: (1) "Sixths and octaves"; visual `interval-shapes` {sizes: [6, 8]}. (2) "Same,
  opposite, oblique" — hands can move together, apart, or one holds; visual `chord-stack` {motion: true}.
- Technique: `guided` scaffold `name` on the seven `ht` pairs; `flash` x6 two-pair patterns.
- Tip: "Practise hands separately once, then together slowly. Slow and right beats fast and wrong."
- Songs: wait `ode-tenths` (pass 1 left hand alone, pass 2 hands `both`).
- Quiz: 14 prompts.

**L25 Triads: three notes in one hand**
- Goal: read a root-position triad as one shape.
- Teaches: no new notes. Items: `ch:t:C:0 ch:t:F:0 ch:t:G:0 ch:b:C:0 ch:b:F:0 ch:b:G:0`. Features: `chord`.
- Concepts: (1) "The snowman" — three notes stacked line-line-line or space-space-space; visual
  `chord-stack` {triad: C}. (2) "C, F and G" — three chords harmonise most simple tunes; visual `chord-stack` {triads: [C, F, G]}.
- Technique: `guided` scaffold `glow` then `none` on the six triads.
- Tip: "Play all three notes at exactly the same instant: drop the hand as one unit, fingers 1-3-5 (left 5-3-1)."
- Songs: wait `mary-chords`.

**L26 Hymn chords: four parts**
- Goal: read a four-note hymn chord, two notes per hand.
- Teaches: no new notes. Items: `hy:C:I hy:C:IV hy:C:V`.
- Concepts: (1) "Four voices" — soprano and alto on the treble staff (right hand), tenor and bass
  on the bass staff (left hand); visual `chord-stack` {satb: 'hy:C:I'}. (2) "Home, away, home" — I,
  IV and V; the Amen is IV then I; visual `chord-stack` {satb: ['hy:C:IV', 'hy:C:I']}.
- Technique: `progression` [`hy:C:I hy:C:IV hy:C:I`] ("Amen"), then `progression`
  [`hy:C:I hy:C:IV hy:C:V hy:C:I`].
- Tip: "Change chords legato: move the fingers that must move, hold the notes the chords share."
- Songs: wait `silent-night` (right hand, plain, no names: sight-reading practice).

**L27 Old Hundredth, first half**
- Goal: play two phrases of a real hymn, melody and bass together.
- Teaches: nothing new. Items: `hy:G:I hy:G:IV hy:G:V`.
- Concepts: (1) "How to learn a hymn" — bass alone, melody alone, then together, one phrase at a time; visual `grand-staff` {song: old-hundredth-duet, bars: [1, 3]}.
- Songs: wait `old-hundredth-duet` bars 1-6: pass 1 left hand, pass 2 right hand, pass 3 hands `both`.
- Tip: "Breathe where a singer would: lift both hands together at the end of each phrase."
- Melody checkpoint: `old-hundredth-duet` bars 1-6, hands `both`.

**L28 Amazing Grace in F**
- Goal: hands together in 3/4 with a key signature.
- Teaches: nothing new. Items: `hy:F:I hy:F:IV hy:F:V`.
- Songs: wait `amazing-grace-hands` (pass 1 right hand, pass 2 hands `both`); tempo at 60 bpm (optional).
- Tip: "The left hand ties the bar together: hold each dotted half for all three beats."
- Melody checkpoint: `amazing-grace-hands`, hands `both`.

**L29 Silent Night**
- Goal: sight-read a familiar carol with a slow bass.
- Teaches: nothing new. Items: `hy:C:vi hy:C:V7`.
- Songs: wait `silent-night-hands` (pass 1 hands `both` with names, pass 2 plain); tempo at 60 bpm (optional).
- Tip: "Play it softer by playing it smoother: on the organ, touch is your only expression."
- Melody checkpoint: `silent-night-hands`.

**L30 Ode to Joy, complete**
- Goal: a 16-bar piece with a moving bass.
- Teaches: nothing new. Items: none.
- Songs: wait `ode-full` (pass 1 left hand, pass 2 hands `both`); tempo at 72 bpm (optional).
- Tip: "Spot repeats before you play: bars 1-4, 5-8 and 13-16 are nearly the same."
- Melody checkpoint: `ode-full`.

**L31 Old Hundredth, complete**
- Goal: a whole hymn tune, note against note.
- Teaches: nothing new. Items: `hy:G:vi hy:G:V7`.
- Songs: wait `old-hundredth-duet` bars 7-12 (pass 1 hands separately, pass 2 `both`), then wait the whole hymn; tempo at 60 bpm (optional).
- Tip: "Final chord: hold it a little longer, then release both hands together."
- Melody checkpoint: `old-hundredth-duet` (all bars).

**L32 Graduation: sight-reading**
- Goal: play two pieces you have not practised hands together before, first time, without names.
- Teaches: nothing new. Items: none.
- Concepts: (1) "Before you play" — check clefs, key signature, time signature, first note of each hand, highest and lowest note; visual `grand-staff` {song: first-noel, checklist: true}.
- Songs: wait `first-noel` (plain, hands `both`, no demo), wait `good-king-hands` (plain).
- Melody checkpoint: `good-king-hands`. After L32, Home's daily call to action becomes the generated
  "Daily piece" review lesson (4.3) so the habit continues.

### 2.8 Song library (authoritative source text)

Format, one song per block:
`@song id | title | credit | time | key N | bpm N | pickup N` then one line per hand (`rh:` is
drawn on the treble staff and played by the right hand, `lh:` on the bass staff, left hand).
Bars are separated by `|`. A token is `pitch:duration`; `r` is a rest; `C3+E3+G3` is a chord in
one hand. Durations: `w` 4 beats, `h.` 3, `h` 2, `q.` 1.5, `q` 1, `8` 0.5. `key` is the key
signature (+1 = one sharp, -1 = one flat); accidentals are still spelled in the token and the
renderer hides those the key signature already covers. `pickup N` = the first bar has N beats and
the last bar has (bar length - N).
`@derive id | from src | semis N | to rh|lh [| key N]` = the source song's single part transposed
by N semitones and assigned to that hand; title, credit, time, bpm and pickup are inherited.

All melodies are traditional or were first published before 1929; "Tutti study" pieces and all
bass lines marked "arranged for Tutti" are original to this project. Every block below has been
machine-checked: bar lengths add up, both hands have the same number of bars, each song uses only
pitches and rhythm features taught by the lesson that uses it, and every two-hand piece was
checked for vertical dissonance (only passing and neighbour tones on weak beats, and V7 sevenths,
remain). **Brief A must paste this block byte-for-byte into `src/songs.js`; do not retype it.**

```text
@song hot-cross-buns | Hot Cross Buns | English traditional | 4/4 | key 0 | bpm 80 | pickup 0
rh: E4:q D4:q C4:h | E4:q D4:q C4:h | C4:q C4:q C4:q C4:q | D4:q D4:q D4:q D4:q | E4:q D4:q C4:h

@song mary-lamb | Mary Had a Little Lamb | American traditional (1830s) | 4/4 | key 0 | bpm 88 | pickup 0
rh: E4:q D4:q C4:q D4:q | E4:q E4:q E4:h | D4:q D4:q D4:h | E4:q G4:q G4:h | E4:q D4:q C4:q D4:q | E4:q E4:q E4:q E4:q | D4:q D4:q E4:q D4:q | C4:w

@song lightly-row | Lightly Row | German traditional | 4/4 | key 0 | bpm 88 | pickup 0
rh: G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q D4:q E4:q F4:q | G4:q G4:q G4:h | G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q E4:q G4:q G4:q | E4:q E4:q E4:h | D4:q D4:q D4:q D4:q | D4:q E4:q F4:h | E4:q E4:q E4:q E4:q | E4:q F4:q G4:h | G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q E4:q G4:q G4:q | C4:w

@song au-clair | Au clair de la lune (first phrase, twice) | French traditional | 4/4 | key 0 | bpm 84 | pickup 0
rh: C4:q C4:q C4:q D4:q | E4:h D4:h | C4:q E4:q D4:q D4:q | C4:w | C4:q C4:q C4:q D4:q | E4:h D4:h | C4:q E4:q D4:q D4:q | C4:w

@song ode-to-joy | Ode to Joy (theme, simplified rhythm) | L. van Beethoven, 1824 | 4/4 | key 0 | bpm 92 | pickup 0
rh: E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q D4:q D4:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q C4:q C4:h

@song aunt-rhody | Go Tell Aunt Rhody | Traditional (tune by J.-J. Rousseau, 1752) | 4/4 | key 0 | bpm 88 | pickup 0
rh: E4:h E4:q D4:q | C4:h C4:h | D4:h D4:q F4:q | E4:q D4:q C4:h | G4:h G4:q F4:q | E4:h E4:h | D4:q C4:q D4:q E4:q | C4:w

@song jingle-bells | Jingle Bells (chorus, even rhythm) | J. L. Pierpont, 1857 | 4/4 | key 0 | bpm 100 | pickup 0
rh: E4:q E4:q E4:h | E4:q E4:q E4:h | E4:q G4:q C4:q D4:q | E4:w | F4:q F4:q F4:q F4:q | F4:q E4:q E4:q E4:q | E4:q D4:q D4:q E4:q | D4:h G4:h | E4:q E4:q E4:h | E4:q E4:q E4:h | E4:q G4:q C4:q D4:q | E4:w | F4:q F4:q F4:q F4:q | F4:q E4:q E4:q E4:q | G4:q G4:q F4:q D4:q | C4:w

@song low-pipes | Low Pipes | Tutti study (original) | 4/4 | key 0 | bpm 80 | pickup 0
lh: C3:h G3:h | F3:h G3:h | C3:q C3:q G3:q G3:q | F3:h C3:h | G3:q F3:q G3:h | C3:q F3:q G3:h | G3:q G3:q F3:q F3:q | C3:w

@derive hot-cross-buns-lh | from hot-cross-buns | semis -12 | to lh
@derive ode-to-joy-lh | from ode-to-joy | semis -12 | to lh
@derive au-clair-lh | from au-clair | semis -12 | to lh

@song middle-c-meeting | Middle C Meeting | Tutti study (original) | 4/4 | key 0 | bpm 80 | pickup 0
rh: C4:q D4:q E4:q D4:q | C4:h r:h | r:w | r:h C4:h | D4:q E4:q F4:q G4:q | E4:h C4:h | r:w | C4:w
lh: r:w | r:h G3:h | F3:q E3:q D3:q C3:q | G3:h r:h | r:w | r:w | G3:q F3:q E3:q D3:q | r:w

@song ode-relay | Ode to Joy (relay: right hand, then left hand) | L. van Beethoven, 1824 | 4/4 | key 0 | bpm 88 | pickup 0
rh: E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q D4:q D4:h | r:w | r:w | r:w | r:w
lh: r:w | r:w | r:w | r:w | E3:q E3:q F3:q G3:q | G3:q F3:q E3:q D3:q | C3:q C3:q D3:q E3:q | D3:q C3:q C3:h

@song mary-relay | Mary Had a Little Lamb (relay) | American traditional (1830s) | 4/4 | key 0 | bpm 88 | pickup 0
rh: E4:q D4:q C4:q D4:q | E4:q E4:q E4:h | r:w | r:w | E4:q D4:q C4:q D4:q | E4:q E4:q E4:q E4:q | r:w | C4:w
lh: r:w | r:w | D3:q D3:q D3:h | E3:q G3:q G3:h | r:w | r:w | D3:q D3:q E3:q D3:q | r:w

@song twinkle | Twinkle, Twinkle, Little Star | French traditional (1761) | 4/4 | key 0 | bpm 92 | pickup 0
rh: C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h

@song b-in-the-middle | B in the Middle | Tutti study (original) | 4/4 | key 0 | bpm 84 | pickup 0
rh: G4:q A4:q B4:h | B4:q A4:q G4:h | G4:q B4:q A4:q G4:q | A4:h G4:h | G4:q A4:q B4:q B4:q | A4:q G4:q A4:h | B4:q A4:q G4:q A4:q | G4:w

@song london-bridge | London Bridge (even rhythm) | English traditional | 4/4 | key 0 | bpm 96 | pickup 0
rh: G4:q A4:q G4:q F4:q | E4:q F4:q G4:h | D4:q E4:q F4:h | E4:q F4:q G4:h | G4:q A4:q G4:q F4:q | E4:q F4:q G4:h | D4:h G4:h | E4:h C4:h

@derive lightly-row-g | from lightly-row | semis 7 | to rh
@derive mary-lamb-g | from mary-lamb | semis 7 | to rh

@song old-hundredth-c | Old Hundredth (Doxology), melody in C | Genevan Psalter, 1551 | 4/4 | key 0 | bpm 80 | pickup 0
rh: C5:h C5:q B4:q | A4:q G4:q C5:h | D5:h E5:h | E5:h E5:q E5:q | D5:q C5:q F5:h | E5:h D5:h | C5:h D5:q E5:q | D5:q C5:q A4:h | B4:h C5:h | G5:h E5:q C5:q | D5:q F5:q E5:h | D5:h C5:h

@song lines-and-spaces | Lines and Spaces | Tutti study (original) | 4/4 | key 0 | bpm 84 | pickup 0
rh: E4:q G4:q B4:q D5:q | F5:h D5:h | F4:q A4:q C5:q E5:q | G5:h E5:h | F5:q D5:q B4:q G4:q | E4:h G4:h | E5:q C5:q A4:q F4:q | C5:w

@song joy-to-the-world | Joy to the World (opening) | ANTIOCH, arr. L. Mason, 1836 | 4/4 | key 0 | bpm 84 | pickup 0
rh: C5:h B4:q. A4:8 | G4:h. F4:q | E4:h D4:h | C4:h. G4:q | A4:h. A4:q | B4:h. B4:q | C5:w

@song silent-night | Silent Night | F. X. Gruber, 1818 | 3/4 | key 0 | bpm 84 | pickup 0
rh: G4:q. A4:8 G4:q | E4:h. | G4:q. A4:8 G4:q | E4:h. | D5:h D5:q | B4:h. | C5:h C5:q | G4:h. | A4:h A4:q | C5:q. B4:8 A4:q | G4:q. A4:8 G4:q | E4:h. | A4:h A4:q | C5:q. B4:8 A4:q | G4:q. A4:8 G4:q | E4:h. | D5:h D5:q | F5:q. D5:8 B4:q | C5:h. | E5:h. | C5:q G4:q E4:q | G4:q. F4:8 D4:q | C4:h. | C4:h.

@song amazing-grace | Amazing Grace | NEW BRITAIN, 1829 | 3/4 | key 0 | bpm 80 | pickup 1
rh: C4:q | F4:h A4:8 F4:8 | A4:h G4:q | F4:h D4:q | C4:h C4:q | F4:h A4:8 F4:8 | A4:h G4:q | C5:h. | C5:h A4:q | C5:q. A4:8 C5:8 A4:8 | F4:h C4:q | D4:q. F4:8 F4:8 D4:8 | C4:h C4:q | F4:h A4:8 F4:8 | A4:h G4:q | F4:h. | F4:h

@derive twinkle-lh | from twinkle | semis -12 | to lh
@derive b-in-the-middle-lh | from b-in-the-middle | semis -12 | to lh
@derive london-bridge-lh | from london-bridge | semis -12 | to lh

@song walking-down | Walking Down | Tutti study (original) | 4/4 | key 0 | bpm 80 | pickup 0
lh: C3:q B2:q A2:q G2:q | A2:q B2:q C3:h | G2:q A2:q B2:q C3:q | D3:h G2:h | C3:q G2:q A2:q B2:q | C3:q D3:q E3:h | F3:q E3:q D3:q G2:q | C3:w

@derive old-hundredth-lh | from old-hundredth-c | semis -24 | to lh

@song bottom-of-the-staff | Bottom of the Staff | Tutti study (original) | 4/4 | key 0 | bpm 80 | pickup 0
lh: F2:h A2:h | C3:h A2:h | G2:q A2:q B2:q C3:q | F2:w | F2:q G2:q A2:q B2:q | C3:h F3:h | E3:q D3:q C3:q G2:q | C3:w

@song twinkle-relay | Twinkle, Twinkle (relay) | French traditional (1761) | 4/4 | key 0 | bpm 88 | pickup 0
rh: C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h | r:w | r:w | r:w | r:w | C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h
lh: r:w | r:w | r:w | r:w | G3:q G3:q F3:q F3:q | E3:q E3:q D3:h | G3:q G3:q F3:q F3:q | E3:q E3:q D3:h | r:w | r:w | r:w | r:w

@song hot-cross-buns-drone | Hot Cross Buns with a held bass | English traditional | 4/4 | key 0 | bpm 76 | pickup 0
rh: E4:q D4:q C4:h | E4:q D4:q C4:h | C4:q C4:q C4:q C4:q | D4:q D4:q D4:q D4:q | E4:q D4:q C4:h
lh: C3:w | C3:w | C3:w | G3:w | C3:w

@song ode-drone | Ode to Joy with a held bass | L. van Beethoven, 1824 | 4/4 | key 0 | bpm 80 | pickup 0
rh: E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q D4:q D4:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q C4:q C4:h
lh: C3:w | G3:w | C3:w | G3:w | C3:w | G3:w | C3:w | G3:q C3:h.

@song twinkle-hands | Twinkle, Twinkle in tenths | French traditional (1761) | 4/4 | key 0 | bpm 80 | pickup 0
rh: C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h
lh: C3:w | F3:h E3:h | D3:h C3:h | B2:h C3:h | E3:h D3:h | C3:h B2:h | E3:h D3:h | C3:h B2:h | C3:w | F3:h E3:h | D3:h C3:h | B2:h C3:h

@song lightly-row-hands | Lightly Row, hands together | German traditional | 4/4 | key 0 | bpm 80 | pickup 0
rh: G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q D4:q E4:q F4:q | G4:q G4:q G4:h | G4:q E4:q E4:h | F4:q D4:q D4:h | C4:q E4:q G4:q G4:q | C4:w
lh: E3:h C3:h | D3:h G3:h | C3:w | E3:h C3:h | E3:h C3:h | D3:h G3:h | C3:w | C3:w

@song jingle-bells-hands | Jingle Bells, hands together | J. L. Pierpont, 1857 | 4/4 | key 0 | bpm 88 | pickup 0
rh: E4:q E4:q E4:h | E4:q E4:q E4:h | E4:q G4:q C4:q D4:q | E4:w | F4:q F4:q F4:q F4:q | F4:q E4:q E4:q E4:q | E4:q D4:q D4:q E4:q | D4:h G4:h | E4:q E4:q E4:h | E4:q E4:q E4:h | E4:q G4:q C4:q D4:q | E4:w | F4:q F4:q F4:q F4:q | F4:q E4:q E4:q E4:q | G4:q G4:q F4:q D4:q | C4:w
lh: C3:w | C3:w | C3:w | C3:w | F3:w | F3:q C3:h. | G3:w | G3:w | C3:w | C3:w | C3:w | C3:w | F3:w | F3:q C3:h. | G3:w | C3:w

@song good-king-wenceslas | Good King Wenceslas | Tempus adest floridum, Piae Cantiones 1582 | 4/4 | key 1 | bpm 96 | pickup 0
rh: G4:q G4:q G4:q A4:q | G4:q G4:q D4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | G4:q G4:q G4:q A4:q | G4:q G4:q D4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | D5:q C5:q B4:q A4:q | B4:q A4:q G4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | D4:q D4:q E4:q F#4:q | G4:q G4:q A4:h | D5:q C5:q B4:q A4:q | G4:h C5:h | G4:w

@derive old-hundredth-g | from old-hundredth-c | semis -5 | to rh | key 1

@song g-major-walk | G Major Walk | Tutti study (original) | 4/4 | key 1 | bpm 80 | pickup 0
lh: G3:q F#3:q E3:q D3:q | E3:q F#3:q G3:h | G2:q A2:q B2:q C3:q | D3:h G2:h | B2:q C3:q D3:q E3:q | F#3:h G3:h | E3:q D3:q C3:q D3:q | G2:w

@derive ode-to-joy-f | from ode-to-joy | semis 5 | to rh | key -1

@song frere-jacques | Frère Jacques | French traditional | 4/4 | key -1 | bpm 92 | pickup 0
rh: F4:q G4:q A4:q F4:q | F4:q G4:q A4:q F4:q | A4:q Bb4:q C5:h | A4:q Bb4:q C5:h | C5:8 D5:8 C5:8 Bb4:8 A4:q F4:q | C5:8 D5:8 C5:8 Bb4:8 A4:q F4:q | F4:q C4:q F4:h | F4:q C4:q F4:h

@song f-major-bass | F Major Bass | Tutti study (original) | 4/4 | key -1 | bpm 80 | pickup 0
lh: F3:q G3:q A3:q Bb3:q | C4:h A3:h | Bb3:q A3:q G3:q F3:q | C3:h F3:h | F3:q A3:q C4:q A3:q | Bb3:h G3:h | A3:q Bb3:q C4:q C3:q | F3:w

@song greensleeves | Greensleeves (first strain) | English traditional, 16th century | 3/4 | key 0 | bpm 92 | pickup 1
rh: A4:q | C5:h D5:q | E5:q. F#5:8 E5:q | D5:h B4:q | G4:q. A4:8 B4:q | C5:h A4:q | A4:q. G#4:8 A4:q | B4:h G#4:q | E4:h A4:q | C5:h D5:q | E5:q. F#5:8 E5:q | D5:h B4:q | G4:q. A4:8 B4:q | C5:q. B4:8 A4:q | G#4:q. F#4:8 G#4:q | A4:h. | A4:h

@song neighbours-rh | Sharp and Flat Neighbours (right hand) | Tutti study (original) | 4/4 | key 0 | bpm 76 | pickup 0
rh: D5:q C#5:q D5:q E5:q | F5:h D5:h | G4:q Bb4:q D5:q Eb5:q | D5:w

@song neighbours-lh | Sharp and Flat Neighbours (left hand) | Tutti study (original) | 4/4 | key 0 | bpm 76 | pickup 0
lh: C3:q Eb3:q G3:q Ab3:q | G3:h C3:h | A3:q B3:q C#4:q B3:q | A3:w

@song yankee-doodle | Yankee Doodle | Traditional, 18th century | 4/4 | key 0 | bpm 96 | pickup 0
rh: C4:q C4:q D4:q E4:q | C4:q E4:q D4:q G3:q | C4:q C4:q D4:q E4:q | C4:h B3:h | C4:q C4:q D4:q E4:q | F4:q E4:q D4:q C4:q | B3:q G3:q A3:q B3:q | C4:h C4:h

@song auld-lang-syne | Auld Lang Syne (verse) | Scottish traditional | 4/4 | key 0 | bpm 88 | pickup 1
rh: G3:q | C4:q. C4:8 C4:q E4:q | D4:q. C4:8 D4:q E4:q | C4:q. C4:8 E4:q G4:q | A4:h. A4:q | G4:q. E4:8 E4:q C4:q | D4:q. C4:8 D4:q E4:q | C4:q. A3:8 A3:q G3:q | C4:h.

@derive hot-cross-buns-high-lh | from hot-cross-buns | semis 0 | to lh
@derive au-clair-high-lh | from au-clair | semis 0 | to lh

@derive joy-to-the-world-high | from joy-to-the-world | semis 12 | to rh

@song deep-pipes | Deep Pipes | Tutti study (original) | 4/4 | key 0 | bpm 72 | pickup 0
lh: C3:h G2:h | E2:h G2:h | C2:q D2:q E2:q F2:q | G2:h C2:h | C2:h E2:h | D2:h G2:h | E2:q D2:q C2:q D2:q | C2:w

@song ode-tenths | Ode to Joy in tenths | L. van Beethoven, 1824 | 4/4 | key 0 | bpm 80 | pickup 0
rh: E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q. D4:8 D4:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q. C4:8 C4:h
lh: C3:h D3:q E3:q | E3:q D3:q C3:q B2:q | A2:h B2:q C3:q | G2:w | C3:h D3:q E3:q | E3:q D3:q C3:q B2:q | A2:h B2:q C3:q | G2:h C3:h

@song mary-chords | Mary Had a Little Lamb with chords | American traditional (1830s) | 4/4 | key 0 | bpm 80 | pickup 0
rh: E4:q D4:q C4:q D4:q | E4:q E4:q E4:h | D4:q D4:q D4:h | E4:q G4:q G4:h | E4:q D4:q C4:q D4:q | E4:q E4:q E4:q E4:q | D4:q D4:q E4:q D4:q | C4:w
lh: C3+E3+G3:w | C3+E3+G3:w | G2+B2+D3:w | C3+E3+G3:w | C3+E3+G3:w | C3+E3+G3:w | G2+B2+D3:w | C3+E3+G3:w

@song old-hundredth-duet | Old Hundredth, melody and bass | Genevan Psalter, 1551; bass line arranged for Tutti | 4/4 | key 1 | bpm 72 | pickup 0
rh: G4:h G4:q F#4:q | E4:q D4:q G4:h | A4:h B4:h | B4:h B4:q B4:q | A4:q G4:q C5:h | B4:h A4:h | G4:h A4:q B4:q | A4:q G4:q E4:h | F#4:h G4:h | D5:h B4:q G4:q | A4:q C5:q B4:h | A4:h G4:h
lh: G3:h E3:q D3:q | C3:q B2:q E3:h | D3:h G3:h | G3:h E3:q G3:q | F#3:q E3:q A2:h | D3:h D3:h | E3:h F#3:q G3:q | D3:q E3:q C3:h | D3:h G2:h | G3:h G3:q E3:q | F#3:q C3:q D3:h | D3:h G2:h

@song amazing-grace-hands | Amazing Grace, hands together | NEW BRITAIN, 1829; bass arranged for Tutti | 3/4 | key -1 | bpm 76 | pickup 1
rh: C4:q | F4:h A4:8 F4:8 | A4:h G4:q | F4:h D4:q | C4:h C4:q | F4:h A4:8 F4:8 | A4:h G4:q | C5:h. | C5:h A4:q | C5:q. A4:8 C5:8 A4:8 | F4:h C4:q | D4:q. F4:8 F4:8 D4:8 | C4:h C4:q | F4:h A4:8 F4:8 | A4:h G4:q | F4:h. | F4:h
lh: r:q | F3:h. | F3:h. | Bb3:h. | F3:h. | F3:h. | F3:h. | C3:h. | C3:h. | F3:h. | F3:h. | Bb3:h. | F3:h. | F3:h. | C3:h. | F3:h. | F3:h

@song silent-night-hands | Silent Night, hands together | F. X. Gruber, 1818; bass arranged for Tutti | 3/4 | key 0 | bpm 76 | pickup 0
rh: G4:q. A4:8 G4:q | E4:h. | G4:q. A4:8 G4:q | E4:h. | D5:h D5:q | B4:h. | C5:h C5:q | G4:h. | A4:h A4:q | C5:q. B4:8 A4:q | G4:q. A4:8 G4:q | E4:h. | A4:h A4:q | C5:q. B4:8 A4:q | G4:q. A4:8 G4:q | E4:h. | D5:h D5:q | F5:q. D5:8 B4:q | C5:h. | E5:h. | C5:q G4:q E4:q | G4:q. F4:8 D4:q | C4:h. | C4:h.
lh: C3:h. | C3:h. | C3:h. | C3:h. | G2:h. | G2:h. | C3:h. | C3:h. | F3:h. | F3:h. | C3:h. | C3:h. | F3:h. | F3:h. | C3:h. | C3:h. | G2:h. | G2:h. | C3:h. | C3:h. | C3:h. | G2:h. | C3:h. | C3:h.

@song ode-full | Ode to Joy, complete theme, hands together | L. van Beethoven, 1824; bass arranged for Tutti | 4/4 | key 0 | bpm 84 | pickup 0
rh: E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | E4:q. D4:8 D4:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q. C4:8 C4:h | D4:q D4:q E4:q C4:q | D4:q E4:8 F4:8 E4:q C4:q | D4:q E4:8 F4:8 E4:q D4:q | C4:q D4:q G3:h | E4:q E4:q F4:q G4:q | G4:q F4:q E4:q D4:q | C4:q C4:q D4:q E4:q | D4:q. C4:8 C4:h
lh: C3:h D3:q E3:q | E3:q D3:q C3:q B2:q | A2:h B2:q C3:q | G2:w | C3:h D3:q E3:q | E3:q D3:q C3:q B2:q | A2:h B2:q C3:q | G2:h C3:h | G2:h C3:h | G2:h C3:h | G2:h C3:q G2:q | C3:q B2:q G2:h | C3:h D3:q E3:q | E3:q D3:q C3:q B2:q | A2:h B2:q C3:q | G2:h C3:h

@song first-noel | The First Noel (first phrase), hands together | English traditional, publ. 1823; bass arranged for Tutti | 3/4 | key 0 | bpm 84 | pickup 1
rh: E4:8 D4:8 | C4:q. D4:8 E4:8 F4:8 | G4:h A4:8 B4:8 | C5:q B4:q A4:q | G4:h A4:8 B4:8 | C5:q B4:q A4:q | G4:q A4:q B4:q | C5:q G4:q F4:q | E4:h
lh: r:q | C3:h. | C3:h. | F3:h. | C3:h. | F3:h. | G2:h. | C3:h. | C3:h

@song good-king-hands | Good King Wenceslas, hands together | Piae Cantiones 1582; bass arranged for Tutti | 4/4 | key 1 | bpm 88 | pickup 0
rh: G4:q G4:q G4:q A4:q | G4:q G4:q D4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | G4:q G4:q G4:q A4:q | G4:q G4:q D4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | D5:q C5:q B4:q A4:q | B4:q A4:q G4:h | E4:q D4:q E4:q F#4:q | G4:h G4:h | D4:q D4:q E4:q F#4:q | G4:q G4:q A4:h | D5:q C5:q B4:q A4:q | G4:h C5:h | G4:w
lh: G3:w | G3:w | C3:h. D3:q | G2:w | G3:w | G3:w | C3:h. D3:q | G2:w | G3:w | D3:h G3:h | C3:h. D3:q | G2:w | B2:h C3:q D3:q | E3:h D3:h | G3:w | E3:h C3:h | G2:w
```

Expected `minLesson` per song (the first lesson number at which all of its pitches and features
are taught, computed by the rule in 4.2). Brief A's test must reproduce this map exactly:

```json
{"hot-cross-buns":1,"au-clair":1,"mary-lamb":2,"lightly-row":2,"ode-to-joy":2,"aunt-rhody":2,"jingle-bells":2,"low-pipes":5,"hot-cross-buns-lh":6,"ode-to-joy-lh":6,"au-clair-lh":6,"middle-c-meeting":7,"ode-relay":7,"mary-relay":7,"twinkle":9,"b-in-the-middle":9,"london-bridge":9,"twinkle-relay":9,"lightly-row-g":10,"mary-lamb-g":10,"old-hundredth-c":11,"lines-and-spaces":11,"joy-to-the-world":12,"silent-night":12,"amazing-grace":12,"twinkle-lh":13,"b-in-the-middle-lh":13,"london-bridge-lh":13,"walking-down":14,"old-hundredth-lh":14,"bottom-of-the-staff":15,"hot-cross-buns-drone":16,"ode-drone":16,"twinkle-hands":16,"lightly-row-hands":16,"jingle-bells-hands":16,"ode-tenths":16,"silent-night-hands":16,"first-noel":16,"good-king-wenceslas":19,"old-hundredth-g":19,"g-major-walk":19,"old-hundredth-duet":19,"good-king-hands":19,"ode-to-joy-f":20,"frere-jacques":20,"f-major-bass":20,"amazing-grace-hands":20,"greensleeves":21,"neighbours-rh":21,"neighbours-lh":21,"yankee-doodle":22,"auld-lang-syne":22,"hot-cross-buns-high-lh":22,"au-clair-high-lh":22,"ode-full":22,"joy-to-the-world-high":23,"deep-pipes":23,"mary-chords":25}
```

---------------------------------------------------------------------------------------------------

## 3. Lesson step types and data schemas

Every step: `{ id: 'L07.s04', type, title?: string, purpose?: string, optional?: boolean }`.
`purpose` is one short line shown under the step title ("Why: ..."). Step ids are stable
(`<lessonId>.s<2-digit index>`) so a lesson can be resumed.

```js
/** NoteRef */ { midi: number, staff: 'treble' | 'bass', finger?: 1|2|3|4|5 }
/** Target  */ NoteRef | { notes: NoteRef[] } /* sounded together */ | { itemId: string } /* engine chord/pair item */

{ type: 'concept', title, body: string[] /* 1-3 lines, each <= 110 chars */, visual: Visual }
{ type: 'tip',     title, body: string[] /* 1-2 lines */, visual?: Visual }
{ type: 'demo',    notes?: NoteRef[], songId?: string, bars?: [from, to], bpm: number, loops: 2, showNames: boolean }
{ type: 'guided',  scaffold: 'glow' | 'name' | 'none', targets: Target[], rounds: number, shuffle: boolean }
{ type: 'find-key', prompt: string, pcs: number[] /* pitch classes 0-11 */, count: number /* per pc; 0 = all in range */,
                    range: { lo, hi }, hintGroups: boolean, ordered?: boolean }
{ type: 'name-it', targets: NoteRef[], rounds: number, askHand?: boolean }
{ type: 'landmark-distance', landmark: NoteRef, targets: NoteRef[] }
{ type: 'mnemonic', phrase: string, words: string[], notes: NoteRef[] /* same length as words */ }
{ type: 'flash',   patterns: NoteRef[][], showMs: number /* default 1500 */ }
{ type: 'drill',   source: 'warmup' | 'today' | 'mixed' | 'items', itemIds?: string[], count: number, min: number,
                   hints: 'off' | 'auto', stopEarly: boolean }
{ type: 'melody-wait', songId, bars?: [from, to],
                   passes: Array<{ hands: 'rh' | 'lh' | 'both', names: boolean, glow: boolean, fingers: boolean }>,
                   pos?: { rh?: number /* midi under the thumb */, lh?: number /* midi under the pinky */ },
                   checkpoint?: boolean }
{ type: 'melody-tempo', songId, bars?: [from, to], hands: 'rh' | 'lh' | 'both', bpm: number, optional: boolean }
{ type: 'progression', itemIds: string[] /* engine chord items, played in order in wait mode */, scaffold: 'glow' | 'name' | 'none' }
{ type: 'quiz',    count: number, itemIds?: string[] /* omitted = pickQuiz() */, passAcc: 0.8 }
{ type: 'recap' }

/** Visual */ { kind, ...params } where kind is one of:
  'kb-groups'        {}                                  black-key groups of 2 and 3 pulse in turn
  'kb-names'         { letters: string[] }               named white keys relative to the black groups
  'staff-key-link'   { notes: NoteRef[] }                animated line from each notehead to its key
  'clef'             { clef, landmark: NoteRef }         clef drawn stroke by stroke, landmark line glows
  'line-space'       { from: midi, to: midi, staff }     notes climb line-space-line as keys light left to right
  'step-skip'        { size: 2 | 3, staff? }             two notes + two keys, the distance bracketed
  'interval-shapes'  { sizes?: number[], harmonic?, song?, bars? }
  'landmarks'        { staff: 'treble'|'bass'|'grand', notes?: NoteRef[] }
  'mnemonic'         { phrase, notes: NoteRef[] }
  'finger-numbers'   { hand: 'rh' | 'lh' }               hand outline with 1-5
  'hand-position'    { hand?, thumb?, pinky?, shift?, posture? }
  'note-values'      { rests?, eighths?, dots? }         bars filling over a 4-beat grid, with sound
  'time-sig'         { time: [n, d], pickup? }
  'grand-staff'      { song?, bars?, checklist? }
  'accidental'       { sign: '#'|'b'|'n', note: NoteRef, carry? }
  'key-signature'    { key: number }
  'ledger'           { staff, notes: NoteRef[] }
  'chord-stack'      { pairs?, triad?, triads?, satb?, motion? }
  'legato'           {}                                  two key-press bars: gap vs joined vs overlapped
```

Behaviour of each type (what the learner does, what counts, what is reported to the runner):

| type | interaction | result passed to `env.done()` |
|------|-------------|-------------------------------|
| concept, tip | read, watch the visual (auto-plays once, replay button), tap "Got it" | `{ seen: true }` |
| demo | app plays the notes with organ tone; key and notehead light together; the name appears; "Play it again" / "My turn" | `{ seen: true }` |
| guided | one target at a time, untimed. `glow`: target key pulses (`is-hint`) and name is printed. `name`: name only. `none`: nothing; after 2 wrong keys the key glows. Wrong key = soft shake, no penalty, never ends the step. Prompt line says "Say it, then play it". | `{ n, firstTry }` |
| find-key | keyboard only, no staff. Learner taps every key asked for; found keys stay lit and labelled. With `hintGroups` the relevant black-key group is outlined. | `{ n, firstTry }` |
| name-it | note on the staff, learner taps the letter on the name pad (and a hand icon first when `askHand`), then the key lights and sounds as confirmation | `{ n, firstTry }` |
| landmark-distance | landmark is drawn as a labelled ghost note and its key is lit. Target note appears. Stage 1: choose from "step up / skip up / step down / skip down / same" (or 2nd..5th when larger). Stage 2: play it. | `{ n, firstTry }` |
| mnemonic | phase 1: words appear one by one as each note lights, bottom to top. phase 2: notes light in order, learner taps the matching word chip. phase 3: 5 random notes from the set, learner taps the letter. | `{ n, firstTry }` |
| flash | pattern shown for `showMs`, then covered; learner plays it from memory; uncover on error and retry once | `{ n, firstTry }` |
| drill | the v1 prompt loop driven by an engine `lesson` session (4.4). Feeds the mastery model. | `{ n, correct, acc, medianRatio, missed: string[] }` |
| melody-wait | the score with a cursor; the cursor waits on each moment until the right key(s) are down; played notes turn green; a wrong key flashes red on the keyboard only. Runs each `passes` entry in turn. | `{ passes: [{ notes, firstTry, acc }], acc /* last pass */ }` |
| melody-tempo | one-bar count-in, metronome, cursor moves in time, graded by `gradeTempo` | `{ onsets, hit, acc, bpm }` |
| progression | engine chord items in order, wait mode, each realised once | `{ n, firstTry }` |
| quiz | drill with `hints: 'off'`, no retries, every item covered at least once | same as drill |
| recap | grade, notes learned (mini staff), best song score, streak, next-lesson preview, buttons | `{ seen: true }` |

Only `drill` and `quiz` write to the engine's item model. The scaffolded steps are deliberately
unscored so that hints never inflate mastery.

---------------------------------------------------------------------------------------------------

## 4. FROZEN contracts

New files only, plus the engine additions in 4.4 and the UI edits listed in 4.6. Pitches are MIDI
numbers. All new logic modules are pure ES modules (no DOM, no `Date.now`, no `Math.random`).

### 4.1 `src/songs.js` (Brief A)

```js
export const SONG_SOURCE;                 // the text block of 2.8, verbatim
export function parseSongs(text);         // -> Record<id, Song>; throws Error naming the song id and bar on bad input
export const SONGS;                       // parseSongs(SONG_SOURCE), frozen
export function getSong(id);              // Song | undefined
export function songBars(song, [from, to]); // -> Song containing only those bars (1-based, inclusive); pickup becomes 0 unless from === 1
export function songEvents(song, { hands = 'both', bars } = {}); // -> Event[] sorted by t, then lh before rh; rests omitted
export function songPitches(song);        // -> Array<{ midi, staff }> unique
export function songFeatures(song);       // -> string[] (rule in 4.2)

/** Song  */ { id, title, credit, original: boolean /* credit starts with 'Tutti study' */, time: [n, d], key: number,
               bpm, pickup, parts: { rh?: Bar[], lh?: Bar[] }, derived?: { from, semis, to } }
/** Bar   */ Token[]
/** Token */ { midis: number[] /* [] = rest */, accidentals: Array<'#'|'b'|null>, dur: 'w'|'h.'|'h'|'q.'|'q'|'8', beats: number }
/** Event */ { t: number /* beats from the start of the (sliced) song */, beats, midis: number[], hand: 'rh'|'lh',
               staff: 'treble'|'bass', bar: number /* 1-based */, idx: number /* token index within its part */ }
```
`rh` tokens are on the treble staff, `lh` tokens on the bass staff, always.

### 4.2 `src/lessons.js` (Brief A)

```js
export const UNITS;                       // [{ n, title, lessonIds }]
export const LESSONS;                     // Lesson[] L01..L32 in order
export function getLesson(id);
export function taughtThrough(n);         // -> { pitches: string[] /* 't:60' | 'b:48' */, features: string[], items: string[] } cumulative, lessons 1..n
export function songMinLesson(song);      // -> first n whose taughtThrough(n) covers songPitches + songFeatures, else Infinity
export function lessonSongIds(lesson);    // song ids referenced by its melody/demo steps plus `spares`

/** Lesson */ { id: 'L01', n: 1, unit: 1, title, goal, preview /* one line shown as "Tomorrow: ..." in the previous recap */,
  teaches: Array<NoteRef & { itemId?: string }>, items: string[], features: string[],
  passesStages: string[], placeOut: string[], spares: string[],
  checkpoint: { kind: 'quiz' | 'melody', stepId: string, passAcc: number, aceAcc: number },
  steps: Step[] }
```
Feature rule for `songFeatures`: every duration code used by a sounding token (`q h w h. q. 8`);
`rest` if any rest; `3/4` if time[0] === 3; `pickup` if pickup > 0; `key1` / `key-1` when key is
+1 / -1; `grand` if the song has both parts; `together` if any rh note and any lh note overlap in
time; `chord` if any token has more than one midi.

### 4.3 `src/lessonProgress.js` (Brief B) — pure lesson-progress logic

Takes lesson and song lists as arguments (no import of lessons.js, so it is testable with
fixtures and has no import cycle with the engine).

```js
export const LESSON_CONFIG = {
  passAcc: 0.8, aceAcc: 0.9, aceRatio: 1.0, aceMelody: 0.85,
  melodyPass: 0.8, melodyAce: 0.92,
  relaxedPassAcc: 0.6, maxFails: 2,
  weakMastery: 0.5, weakMinN: 3, weakBacklog: 4, warmupFloor: 0.7, warmupMinN: 6,
  awayDays: 3, awayMinDone: 3, warmupCount: 8, softCapPerDay: 3,
};
export function freshLessonState();                 // -> LessonState
export function sanitizeLessonState(any);           // -> LessonState | undefined (undefined when `any` is not an object); never throws
export function mergeLessonState(a, b);             // union of done (better grade wins, then later `at`), union of songs (max scores),
                                                    // cur/queue/fails/day fields from the one with the later updatedAt
export function gradeLesson(lesson, results, cfg);  // -> 'ace' | 'pass' | 'repeat'
export function nextUp(ls, lessons, { now, today, itemStats });
    // -> { kind: 'resume' | 'review' | 'core' | 'daily', lessonId, reason?, availability: 'now' | 'tomorrow', stepIndex, softCap: boolean }
export function beginLesson(ls, plan, { now, today });        // -> LessonState with `cur` set (plan = Lesson, core or generated)
export function recordStep(ls, stepIndex, result, { now });   // -> LessonState (cur.step = stepIndex + 1, cur.res[stepId] = result)
export function completeLesson(ls, lesson, { now, today, itemStats, lessons });
    // -> { state: LessonState, outcome: { grade, passed, advance, relaxed, insertedReview: null | QueueEntry,
    //      nextAvailability: 'now' | 'tomorrow', passesStages: string[], weakItems: string[] } }
export function abandonLesson(ls, { now });                   // clears `cur` (used by "Start over")
export function pickWarmup(lessonN, lessons, itemStats, { now, count });   // -> itemIds (may be fewer; [] = skip the warm-up)
export function pickQuiz(lesson, lessons, itemStats, count);  // -> itemIds, every one of lesson.items first (sampled if too many)
export function resolveDrillItems(step, lesson, lessons, itemStats, { now }); // -> itemIds for a drill step
export function buildReviewLesson(entry, lessons, songs, ls, itemStats, { now }); // -> Lesson with id 'R:<forLesson>:<attempt>' | 'D:<today>'
export function placeOut(ls, lessons, passedStageIds, { now });  // -> LessonState with leading lessons marked done (grade 'skip')
export function unlockedSongIds(ls, lessons, songs);          // songs whose minLesson <= (highest done n) + 1

/** LessonState (persisted as engineState.lessons) */ {
  v: 1, updatedAt: number,
  done: Record<lessonId, { at: number, grade: 'ace' | 'pass' | 'skip', attempts: number, acc: number }>,
  cur: null | { id: string, kind: 'core' | 'review' | 'daily', step: number, startedAt: number, res: Record<stepId, object>, entry?: QueueEntry },
  queue: QueueEntry[],                                 // review lessons to do before the next core lesson
  fails: Record<lessonId, number>,
  songs: Record<songId, { plays: number, bestAcc: number, bestTempo: number /* bpm passed at >= 0.8, 0 = none */ }>,
  lastDay: string /* 'YYYY-MM-DD' of the last completion */, doneToday: number, lastGrade: 'ace' | 'pass' | 'skip' | '',
  lastActive: number, override: string /* day on which "start anyway" was used */ }
/** QueueEntry */ { kind: 'review', reason: 'repeat' | 'weak' | 'away', forLesson: string, focus: string[], attempt: number }
/** itemStats  */ Record<itemId, { mastery, acc, n, box, due, mastered: boolean }>   // from engine.itemStats()
```

Rules (all thresholds from `LESSON_CONFIG`):

- **gradeLesson.** Quiz checkpoint: `repeat` if quiz acc < passAcc; `ace` if acc >= aceAcc and
  medianRatio <= aceRatio and the last melody-wait acc >= aceMelody; else `pass`. Melody
  checkpoint: `repeat` if acc < melodyPass; `ace` if acc >= melodyAce; else `pass`. A lesson whose
  `fails` count has reached maxFails is graded with relaxedPassAcc in place of passAcc/melodyPass
  (it can then only be `pass`, with `outcome.relaxed = true` and its missed items in `weakItems`).
- **completeLesson, core lesson.** `ace` / `pass`: write `done[id]`, clear `cur`, update
  `lastDay/doneToday/lastGrade`. `repeat`: do NOT write `done`; `fails[id]++`; unshift a
  `{ reason: 'repeat', forLesson: id, focus: missed items (or lesson.items when none recorded) }`
  entry; clear `cur`.
- **completeLesson, review lesson (reason `repeat`).** Passing it marks `done[forLesson]` with
  grade `pass` (the focused review replaces a full repeat) and shifts the entry off the queue.
  Failing it increments `fails[forLesson]` and leaves a new entry with `attempt + 1`; the generated
  lesson for attempt >= 2 uses `glow` scaffolding throughout and a 12-prompt drill.
- **Weak-backlog insert.** After a passed core lesson, if at least `weakBacklog` taught items have
  n >= weakMinN and mastery < weakMastery, or the lesson's warm-up result had n >= warmupMinN and
  acc < warmupFloor, push `{ reason: 'weak', forLesson: <next lesson id>, focus: the weakest 6 }`
  (at most one `weak` entry in the queue).
- **Away insert.** In `nextUp`, when `now - lastActive >= awayDays` and at least `awayMinDone`
  lessons are done and the queue has no `away` entry, the returned item is a review with reason
  `away` (focus = pickWarmup with count 10). `nextUp` is pure: the entry is materialised by
  `beginLesson`.
- **nextUp order.** `cur` set -> `resume`. Else first queue entry -> `review`, availability `now`.
  Else first core lesson not in `done` -> `core`. Else -> `daily`.
- **Availability of a core lesson.** `now` when nothing was completed today, or `lastGrade` is
  `ace` or `skip`, or `override === today`. Otherwise `tomorrow`. `softCap` is true when
  `doneToday >= softCapPerDay` (UI shows a one-line "spacing beats cramming" note; it never blocks).
  The UI's "Start anyway" sets `override = today` through `engine.setLessons`.
- **buildReviewLesson** (10 minutes or less): `concept` (visual `landmarks` for the staves the
  focus notes are on, body lists the focus notes) -> `guided` scaffold `name` on focus notes x2 ->
  `landmark-distance` for each focus note from its nearest taught landmark (C2 C3 C4 C5 C6, treble
  G4, F5, bass F3, G2) -> `drill` source `items` (focus + 4 strong neighbours, count 16, min 10) ->
  `melody-wait` (reason `repeat`: the first song of `forLesson`; otherwise the unlocked song with
  the fewest plays, ties to lowest bestAcc, then id) -> `quiz` (focus first, count 10) -> `recap`.
  Non-note focus items (shapes, chords) go to the drill and quiz only. Kind `daily` (after L32):
  `drill` warm-up 10 -> two `melody-wait` steps chosen by the same least-played rule, plain ->
  `recap`; melody checkpoint on the second song; never inserts reviews.
- **pickWarmup.** Candidates = items of lessons before `lessonN` with n > 0. Order: due
  (box >= 1 and due <= now, most overdue first), then mastery < 0.6 ascending, then smallest `box`.
  Fewer than 3 candidates -> `[]`.
- **placeOut.** Walk lessons in order; mark `done` (grade `skip`) while `lesson.placeOut` is
  non-empty and every id in it is in `passedStageIds`, or `lesson.placeOut` is empty and the
  previous lesson was marked; stop at the first lesson that fails the test. placeOut values:
  L01-L04 `treble-landmarks, treble-staff`; L05-L08 add `bass-landmarks, bass-staff`; L09-L11 as
  L01; L12 none; L13-L15 as L05; L16-L18 `hands-together`; L19-L21 `accidentals`; L22-L23 `ledger`;
  L24 `intervals, dyads, hands-together`; L25 `triads`; L26-L32 `hymn-chords`.

### 4.4 Engine additions (Brief B) — `src/engine.js`, additive only, `STATE_VERSION` stays 1

Existing behaviour and all existing tests must be unchanged.

```js
// persisted, optional, migrate-safe
State.lessons?: LessonState            // absent on v1 saves; migrate keeps it via sanitizeLessonState()
State.days[k].lessons?: number         // lessons completed that day

engine.getLessons()                    // -> LessonState (deep clone; freshLessonState() when absent)
engine.setLessons(ls, { now })         // stores sanitizeLessonState(ls), sets ls.updatedAt = state.updatedAt = now
engine.itemStats({ now })              // -> Record<itemId, { mastery, acc, n, box, due, mastered }> for items with a record
engine.passStages(stageIds, { now })   // marks each listed non-optional stage 'passed' (via: 'lesson') in curriculum order,
                                       // without seeding item records; a stage is only passed when every earlier
                                       // non-optional stage is passed or also listed; advances stageIdx; returns events[]
engine.addActiveMs(ms, { now })        // adds clamp(ms, 0, 180000) to today's `ms` (non-drill lesson steps)
engine.markLessonDay({ now })          // days[today].lessons += 1
engine.startSession({ mode: 'lesson', itemIds, count, min, hints: 'off' | 'auto' | 'on', stopEarly, retries, now, inputMode, tzOffsetMin })
```
- **`lesson` session.** Pool = `itemIds` that exist in the curriculum (unknown ids ignored; empty
  pool -> `{ ok: false, reason: 'empty' }`). `next()`: first a coverage pass through the pool in
  rng-shuffled order, then, when `retries !== false`, due entries of the +2/+5/+10 retry queue,
  then the existing weighted draw over the pool; never the same item twice in a row unless the
  pool has one item; never an intro card (`isIntro` false; the lesson UI does the teaching) but
  `intro` is stamped on first presentation. Hints: `off` -> `hintAfterMs = Infinity`, `on` -> 0,
  `auto` -> existing rule. Over when answers >= count, or when `stopEarly` and answers >= min and
  at least 7 of the last 8 answers were correct. No time limit.
- **Scoring in a `lesson` session** updates the item model, `totalAnswers`, `days`, session
  history exactly as `practice` does. It does not touch stage windows, pace, struggle flags,
  step-back or promotion.
- **Summary** from `endSession` gains, for every mode: `perItem: Record<itemId, { n, c }>`,
  `missed: string[]` (items answered wrong at least once), `medianRatio` (median of rt/goal over
  clean correct answers, 0 when none).
- **Streak.** A day counts when `ms >= dailyGoal` OR `lessons >= 1`. `progress().today` gains
  `lessons`. `migrate` keeps `days[k].lessons`.
- **mergeStates.** Winner chosen as today; then `winner.lessons = mergeLessonState(a.lessons,
  b.lessons)` and each day's `lessons` = max of the two.
- **reset()** clears `lessons`.

Persistence choice: lesson progress lives inside the engine State (one document, one merge, one
save path through the existing `ctx.save()`), not in a second storage key. `storage.js` is not
changed. Expected size of `lessons`: under 4 KB.

### 4.5 `src/songplay.js` (Brief B) — pure play-along logic

```js
export function momentsOf(events);        // group Events with equal t -> Moment[] { t, beats, midis: number[], events: Event[] }
export function createWaitPlayer(events, { pcMode = false } = {});
  // player.moment()  -> current Moment | null when finished
  // player.index     -> index of the current moment
  // player.push(midi) -> { status: 'pending' | 'advance' | 'wrong' | 'done', matched: number[], need: number[] }
  //    a moment advances when all its midis have been pushed (any order); a midi not in the moment = 'wrong'
  //    (does not advance, marks the moment as not first-try); repeated notes need a fresh push each moment
  // player.stats()   -> { moments, firstTry, wrong, acc /* firstTry / moments */ }
export function gradeTempo(events, played /* [{ midi, tMs }] */, { bpm, startMs, tolBeat = 0.25, tolMinMs = 130, pcMode = false });
  // -> { onsets, hit, missed, extra, acc /* hit / onsets */, meanAbsMs }
```

### 4.6 UI modules and routing (Brief C)

```
src/ui/score.js                 renderScore(song, opts) -> ScoreHandle     multi-system melody renderer
src/ui/promptRunner.js          the prompt/answer loop extracted from screens/practice.js (practice keeps working through it)
src/ui/lesson/visuals.js        renderVisual(visual, env) -> { el, play(), destroy() }
src/ui/lesson/steps/<type>.js   export function mount(step, env) -> StepHandle        one file per step type of section 3
src/ui/screens/lesson.js        renderLesson(ctx, mount) -> cleanup        the lesson runner
src/ui/screens/lessons.js       renderLessons(ctx, mount) -> cleanup       lesson path + song library
src/ui/screens/song.js          renderSong(ctx, mount) -> cleanup          free play of one unlocked song
```
```js
/** renderScore opts */ { hands: 'rh'|'lh'|'both', bars?, names: boolean, fingers: boolean, pos?, box: { w, h }, naming }
/** ScoreHandle */ { el, moments: Moment[], setState(momentIndex, 'is-target'|'is-correct'|'is-wrong'|''), setCursor(momentIndex),
                     setPlayhead(beats | null), reveal(momentIndex), destroy() }
/** StepHandle  */ { el, onNote?(midi, on, t, source), onCommand?(c), destroy() }
/** env */ { ctx, lesson, step, kb /* shared createKeyboard instance owned by the runner */, audio, settings,
             itemStats, done(result), later(fn, ms) /* auto-cancelled timers */, say(text) /* aria-live */ }
```
The score renderer draws clef(s), key signature, time signature, barlines, dotted notes, beamed
eighth pairs, whole/half/quarter rests, one-hand chords, ledger lines, optional note names above
and finger numbers below; it wraps into systems to fit `box.w` (2 bars per system at 390 px, 4 at
>= 880 px) and keeps the current system in view. It may reuse helpers from `staff.js`/`glyphs.js`
and may extend `staff.js` additively.

Routes (add to `ROUTES` in `app.js`): `lesson`, `lessons`, `song`.
- `#lesson` — resume `cur`, else begin whatever `nextUp` returns (ignoring `tomorrow` only when the
  learner arrived through "Start anyway").
- `#lesson/L07` — replay a completed lesson (does not change `done` except to improve grade and
  song scores) or start it if it is the next one; a locked lesson redirects to `#lessons` with a toast.
- `#lessons` — the path: units, 32 lesson nodes (done with grade mark / next / locked), inserted
  reviews shown inline, and a "Songs" section listing `unlockedSongIds`.
- `#song/<id>` — free play: wait mode and tempo mode for an unlocked song; updates `lessons.songs`.
- Tabs become: Today (`#home`), Lessons (`#lessons`), Progress, Settings. `lesson`, `song` and
  `practice` hide the tab bar the way `practice` does today (`is-practice` class).

Home ("Today") changes:
- Primary card "Today's lesson": lesson number and title, goal line, a mini staff of the notes it
  teaches, estimated minutes, step count, and the primary button. Button label by `nextUp`:
  `resume` -> "Continue lesson (step 5 of 12)"; `core`/`now` -> "Start lesson 7"; `review` ->
  "Start review: <reason line>"; `core`/`tomorrow` -> the card shows "Lesson 7 done for today" with
  a check, the next lesson title as "Tomorrow", a primary "Practice today's notes (5 min)" (a
  `practice`-style lesson session on today's items) and a quiet link "Start lesson 8 anyway";
  `daily` -> "Today's piece".
- Streak and the minutes ring stay. Under the ring: "Lesson done today" tick when `today.lessons >= 1`.
- Secondary row (smaller, below): "Free practice", "Quick review", "Test out" (v1 behaviours, unchanged).
- First launch: the placement card is replaced by "Start lesson 1" (primary) and "I can already
  read some music" (secondary; runs v1 placement, then `placeOut`). Starting lesson 1 calls
  `engine.skipPlacement()`.
- A learner with v1 progress and no `lessons` state gets `placeOut` applied once from the stages
  already passed.

Runner behaviour: top bar with close (confirm dialog; progress is kept), step dots, lesson title;
one step mounted at a time; `env.done(result)` -> `recordStep` -> `engine.setLessons` ->
`ctx.save()` -> next step with a short transition; active time of non-drill steps reported through
`engine.addActiveMs` (paused while the tab is hidden, capped per step); after the checkpoint step:
`completeLesson` -> `setLessons` -> `passStages(outcome.passesStages)` and `markLessonDay` when
passed -> `ctx.save({ flush: true })` -> recap. Recap buttons by outcome: ace -> "Next lesson"
(primary) + "Done for today"; pass -> "Done for today" (primary) + "Start next lesson anyway";
repeat -> "Start the 8-minute review" (primary) + "Later". Copy for `repeat` is encouraging and
specific ("B and D need one more pass"), never "failed".
`ctx.sessionRunning` is true while a lesson is open (remote merges wait, as in practice).

Debug hook (only with `&debug` in the hash): `window.__tutti.lesson = { id, stepIndex, step,
expected() /* midis the current step wants next, [] if none */, finishStep(result) /* complete the
current step with a synthetic result */ }`.

---------------------------------------------------------------------------------------------------

## 5. Agent briefs

```
 A  lesson + song data (sonnet) ──────────────┐
 B  progress logic + engine glue (sonnet) ────┴─> C  lesson UI (opus) ─> D  integration QA (sonnet) ─> parent review
```
A and B run in parallel: they touch disjoint files (A: `src/songs.js`, `src/lessons.js`, two test
files; B: `src/lessonProgress.js`, `src/songplay.js`, `src/engine.js`, three test files). C starts
when both report green tests. D starts when C reports. If the parent wants C to start earlier,
tell A and B to commit their full export surface with stub bodies first.

Rules for every brief: work in `/home/claude/tutti`; read `PLAN-LESSONS.md` sections 1-4 first;
another agent may have just finished QA edits, so read files before editing and do not rely on
line numbers; no new npm dependencies; no network resources; no `alert/confirm/prompt`; keep
`npm test` and `npm run build` green; do not deploy.

### Brief A — SONNET — lesson and song data

Create `src/songs.js`, `src/lessons.js`, `tests/songs.test.mjs`, `tests/lessons.test.mjs`. Do not
edit any other file. Both modules are pure ES modules; `lessons.js` may import `./songs.js` and
`./curriculum.js` only; `songs.js` imports nothing.

1. `songs.js`: export the surface of 4.1. `SONG_SOURCE` is the fenced `text` block of section 2.8
   copied byte-for-byte (use a template literal; the block contains no backticks). Implement the
   parser for the format described in 2.8, including `@derive`. Spell accidentals from the token
   (`F#4` -> midi 66, accidental '#'; `Bb3` -> 58, 'b'); derived songs re-spell black keys as
   sharps when the resulting key is >= 0 and as flats when it is < 0.
2. `lessons.js`: export the surface of 4.2. Encode all 32 lessons of section 2 as data. Build each
   lesson's `steps` from the standard skeleton (2.1) and the lesson's row: concepts in the order
   given, the technique activities, the tip, the songs (each "wait" song is one `melody-wait`
   step; default passes are `[{ hands, names: true, glow: false, fingers: !!pos }, { hands, names:
   false, glow: false, fingers: false }]` unless the row says otherwise; `hands` is the hand the
   song has, or `both`), then the checkpoint, then `recap`. Write concept and tip `body` text from
   the row's wording: plain, concrete, second person, at most 3 lines of 110 characters; no
   exclamation marks. `demo` uses the lesson's new notes at 60 bpm, 2 loops, names shown. Rows
   marked "melody checkpoint" get `checkpoint.kind = 'melody'` pointing at that `melody-wait` step
   (set `checkpoint: true` on the step) and no quiz step. Give every lesson a one-line `preview`.
   `find-key` ranges: `{ lo: 36, hi: 84 }` unless the row implies less. Mnemonic `words` are the
   words of the phrase (for "FACE": F, A, C, E).
3. Tests (`node --test`):
   - parser: all 59 songs parse; ids unique; every bar of every part sums to the bar length
     (first bar = pickup when pickup > 0, last bar = bar length - pickup); two-part songs have equal
     bar counts; a malformed token throws with the song id in the message.
   - `songMinLesson` of every song equals the expected map printed in section 2.8.
   - every song referenced by a lesson's steps or `spares` exists and has `songMinLesson <= lesson.n`
     (for steps with `bars`, test the sliced song).
   - every rh pitch has `staffStep(midi, 'treble')` and every lh pitch `staffStep(midi, 'bass')`
     within [-5, 13] (at most two ledger lines).
   - every id in every lesson's `items`, every drill/quiz/progression `itemIds`, exists in
     `curriculum.ITEMS`; no item id appears in two lessons' `items`; every single-note item in
     `items` matches a `teaches` entry and vice versa where `itemId` is set.
   - every NoteRef in guided / name-it / landmark-distance / mnemonic / flash / demo steps of
     lesson n is in `taughtThrough(n).pitches`.
   - `passesStages`: for each listed stage, every item of that stage (via `stageItems`) is in
     `taughtThrough(n).items`, except `grand-mixed` (no own items) and, for L24's `intervals`,
     `dyads`, `hands-together`, the full item lists must be covered.
   - step ids are unique and match `<lessonId>.sNN`; every lesson ends with `recap`; every lesson
     has exactly one checkpoint step; concept/tip bodies respect the length limits; every `visual.kind`
     is in the list of section 3.
   - L01 has no warm-up; every other lesson starts with a `warmup` drill.
4. Done when `npm test` passes. Report: lesson count, song count, steps per lesson (min/median/max),
   and any place where the plan was ambiguous and what you chose.

### Brief B — SONNET — lesson-progress logic, play-along logic, engine glue

Create `src/lessonProgress.js`, `src/songplay.js`, `tests/lessonProgress.test.mjs`,
`tests/songplay.test.mjs`, `tests/engine-lessons.test.mjs`; edit `src/engine.js` additively as
specified in 4.4 (it may import `sanitizeLessonState`, `mergeLessonState`, `freshLessonState` from
`./lessonProgress.js`; `lessonProgress.js` and `songplay.js` import nothing). Implement 4.3, 4.4,
4.5 exactly. No DOM, no `Date.now`, no `Math.random` (the engine's seeded rng only).

Tests:
- lessonProgress (use a 5-lesson fixture built in the test, plus one test that runs against the
  real `LESSONS`/`SONGS` if `src/lessons.js` exists, skipped otherwise):
  1. advance: ace -> `done` written, `nextUp` is the next core lesson with availability `now`;
  2. pass (not ace) -> next core lesson `tomorrow`; a later `today` value -> `now`; `override` -> `now`;
  3. repeat -> nothing in `done`, queue holds a `repeat` entry with the missed items, `nextUp` is
     `review`; passing the review marks the original lesson done and the next core lesson is returned;
  4. two failed reviews -> third attempt graded with `relaxedPassAcc`, `outcome.relaxed` true;
  5. weak backlog inserts exactly one `weak` review; warm-up accuracy below the floor does the same;
  6. away: 3+ days idle with 3+ lessons done -> review reason `away`, once;
  7. resume: `beginLesson` + two `recordStep` calls -> `nextUp` is `resume` at step 2; results survive
     `sanitizeLessonState(JSON.parse(JSON.stringify(state)))`;
  8. melody-checkpoint grading thresholds; quiz-checkpoint ace needs all three conditions;
  9. `mergeLessonState`: union of `done`, better grade wins, song bests are max, garbage input is safe;
  10. `placeOut` with the stage sets of 4.3; `pickWarmup` ordering and the fewer-than-3 rule;
  11. `buildReviewLesson`: step order, focus notes in guided steps, song choice rule, daily kind;
  12. after the last lesson `nextUp` is `daily`.
- songplay: single-line song advances note by note; wrong key does not advance and lowers `acc`;
  two-hand moment needs both midis in any order; repeated notes need separate pushes; `pcMode`
  accepts any octave; `gradeTempo` hit / late / missed / extra cases at 60 and 120 bpm.
- engine-lessons: a v1 state without `lessons` migrates unchanged (deep-equal to today's output
  apart from nothing added); a state with `lessons` survives `migrate` and `getState`;
  `mergeStates` keeps the union of lesson progress whichever side wins; `lesson` session covers
  every pool item once before repeats, respects `count`, `stopEarly`, `hints`, `retries: false`,
  updates item records and `totalAnswers`, leaves `stages[*].win`, `pace` and `stageIdx` untouched,
  and is deterministic for a fixed seed; `passStages` order rule and events; `addActiveMs` and
  `markLessonDay` feed `streakDays` (a day with one lesson and 2 minutes counts); `reset` clears
  lessons; every pre-existing test file still passes untouched.
Done when `npm test` passes. Report the final signatures and any deviation from 4.3-4.5.

### Brief C — OPUS — lesson UI

Build everything in 4.6: `src/ui/score.js`, `src/ui/promptRunner.js`, `src/ui/lesson/visuals.js`,
`src/ui/lesson/steps/*.js` (one per step type), `src/ui/screens/lesson.js`, `lessons.js`,
`song.js`; edit `src/ui/app.js` (routes, tabs, debug hook), `src/ui/screens/home.js` (redesign
around "Today's lesson"), `src/ui/screens/practice.js` (use `promptRunner.js`; behaviour
unchanged), `src/ui/screens/progress.js` (add a lessons-completed line and link to `#lessons`),
`src/styles.css`. Do not change `src/lessons.js`, `src/songs.js`, `src/lessonProgress.js`,
`src/songplay.js` or `src/engine.js`; if a contract is wrong or missing something, stop and report
it instead of working around it.

Product intent: v1 tested; v2 must teach. A lesson should feel like a patient teacher sitting
beside an adult beginner: one idea per screen, show before asking, never punish a wrong key
during guided steps, always say why a step exists. Mobile first (390 x 844), one-handed, the
keyboard always reachable at the bottom, the staff or score above it, text short.

Requirements:
1. Lesson runner and all 15 step components exactly as specified in section 3 and 4.6, sharing one
   keyboard instance. MIDI, mic and desktop-key input reach the active step through
   `ctx.noteHandler` / `ctx.commandHandler` the same way practice does. Sound: organ tone on every
   key press and in demos, through `ctx.audio` (respect the sound setting; audio unlock is already
   handled in `app.js`).
2. Teaching visuals (`visuals.js`), all 19 kinds, as inline SVG animated with CSS/WAAPI, each with a
   static end state for `prefers-reduced-motion` and a replay button. The centrepiece is
   `staff-key-link`: a staff above a keyboard slice, a line drawn from each notehead down to its
   key, key and notehead lighting together with the sound. Build it once and reuse it inside
   `demo`, `guided` (glow) and the wrong-answer reveal of drills.
3. Score renderer per 4.6. Verify by eye, at both sizes, at least: `hot-cross-buns` (one staff),
   `amazing-grace` (3/4, pickup, eighth pairs, dotted half), `greensleeves` (accidentals, dotted
   quarter), `mary-chords` (left-hand triads), `old-hundredth-duet` (two staves, key signature,
   F sharp not re-printed), `middle-c-meeting` (rests).
4. Wait mode: cursor on the current moment, target noteheads highlighted, optional names and finger
   numbers, key glow only when the pass says `glow`; correct notes turn green and stay green; the
   system scrolls so the cursor is never in the last 20% of the width. Tempo mode: one-bar count-in
   with the metronome click, a moving playhead, result summary with "Try slower" (-12 bpm) and
   "Again".
5. Home, Lessons path, Song screen and tab changes per 4.6. The lesson card is the single dominant
   element on Home; v1 actions are visibly secondary.
6. Recap: grade shown as a calm mark (no confetti), notes learned on a mini staff, song result,
   streak, "Tomorrow: <preview>", buttons by outcome (4.6).
7. Keep the v1 look (paper staff card, ink-blue dark theme, one brass accent, green/red for
   feedback only, Fraunces + grotesk with system fallbacks, safe-area insets, focus rings, 44 px
   touch targets, in-page dialogs only). Left rail navigation at >= 900 px.
8. Accessibility: every step is operable with a hardware keyboard; step changes are announced via
   the existing `announce()`; visuals have text alternatives (the `body` lines); colour is never
   the only cue (names, shapes, ring thickness).
9. Screenshots with Playwright into `screens/lessons/`, at 390x844 and 1280x800, light and dark
   (`colorScheme`), with zero console errors or page errors on every page visited: Home (first
   launch; lesson in progress; done-for-today; review pending), Lessons path, one screenshot of
   each of the 15 step types, each of the 19 visuals (a contact sheet per theme is fine), the six
   scores of point 3 in wait mode mid-song, tempo-mode result, recap for ace / pass / repeat, Song
   screen. Use `#...&debug` and `window.__tutti.lesson.finishStep()` to reach states quickly. Look at
   every screenshot yourself and fix clipping, overflow, overlapping labels and unreadable contrast
   before reporting.
10. `npm test` and `npm run build` pass; the build's forbidden-string and external-host checks
    still pass; note the new `dist/index.html` size.
Report: files added/changed, anything in the contracts you had to interpret, the screenshot list,
and known rough edges.

### Brief D — SONNET — integration QA

Write `tools/lessons-walk.mjs` (Playwright against `dist/index.html`, same style as
`tools/shoot.mjs`; exits 1 on failure) and run it. Do not change `src/` except for clear one-line
bug fixes, which must be listed in the report; anything larger is reported, not fixed.
Scenarios:
1. Fresh profile: Home shows "Start lesson 1"; walk L01 by playing `__tutti.lesson.expected()` keys
   for every interactive step (drills answered correctly through the keyboard) -> recap shows ace,
   Home offers lesson 2 immediately.
2. L02 with 3 wrong quiz answers out of 10 -> pass, Home shows done-for-today and "anyway" link.
3. L03 with 5 wrong quiz answers -> repeat; Home's button starts a review; pass the review ->
   L03 marked done, L04 next.
4. Reload mid-lesson (step 5) -> "Continue lesson" resumes at step 5 with earlier results intact.
5. Walk every lesson L01-L32 with synthetic `finishStep` results for teaching steps and real key
   presses for one drill and one melody per lesson: no console errors, no step that cannot be
   completed, every melody reaches its last note in wait mode, every score fits its container (no
   horizontal overflow at 390 px).
6. After L32: Home offers "Today's piece"; it runs and completes.
7. v1 regression: free practice session of 30 answers, test-out dialog, progress and settings
   screens, existing `tools/shoot.mjs` still green.
8. Persistence: lesson progress survives reload with localStorage, and with localStorage disabled
   the app still runs a lesson without errors.
9. Engine/lesson consistency: after L11 the engine reports `treble-landmarks` and `treble-staff`
   passed; `progress().today.lessons` and the streak reflect completed lessons.
Report a PASS/FAIL table and the list of defects with reproduction steps.

---------------------------------------------------------------------------------------------------

## 6. Acceptance checklist for the parent

- [ ] `npm test` green: all v1 test files untouched and passing, plus songs, lessons,
      lessonProgress, songplay, engine-lessons.
- [ ] `npm run build` green; `dist/index.html` still a single self-contained file.
- [ ] 32 lessons, 59 songs; the `minLesson` test matches the map in 2.8; no lesson uses an untaught
      pitch or rhythm feature; every melody is public domain or original (credits visible on the
      Song screen).
- [ ] Home's dominant element is "Today's lesson"; free practice, quick review and test-out are
      present but secondary.
- [ ] Lesson 1 from a fresh profile: keyboard geography visual, staff-to-key link, demo with sound,
      guided glow -> name -> none, drill, Hot Cross Buns in wait mode, checkpoint, recap. Under 15
      minutes at a relaxed pace.
- [ ] Ace -> next lesson available immediately. Pass -> "done for today" with a soft "start
      anyway". Miss -> a short review is inserted and passing it advances. Three attempts never
      leave the learner stuck.
- [ ] A lesson can be closed and resumed at the same step after a reload.
- [ ] Drill and quiz answers inside lessons move the same item mastery shown on the Progress
      heatmap; free practice answers change the next lesson's warm-up.
- [ ] Engine stages are passed by lessons at L11, L15, L21, L23, L24, so free practice and test-out
      stay in step with the lesson path.
- [ ] A lesson completed on a day counts for the streak even under the minutes goal.
- [ ] Wait mode works for one-hand, two-hand, chord, pickup and 3/4 songs; tempo mode is optional
      and never blocks progress.
- [ ] Existing v1 saves load without loss and are placed onto the lesson path from their passed stages.
- [ ] Screenshots at 390x844 and 1280x800, light and dark, reviewed; zero console errors in
      `tools/shoot.mjs` and `tools/lessons-walk.mjs`.
- [ ] Reduced-motion: every visual has a readable static state.
- [ ] Not deployed until the parent has reviewed; Vercel build settings are unchanged.

Known limits, stated plainly: triad inversions, minor triads and the F/G-key hymn chords beyond
I-IV-V-vi-V7 are introduced only as drill items or left to free practice; the `triads`,
`hymn-chords`, `rhythm` and `phrases` engine stages are not auto-passed by the lesson path. Bass
lines marked "arranged for Tutti" are simple two-part settings written for this app, not the
traditional hymnal harmonisations. Interval and dyad drill items are realised at random pitches
by the v1 engine, so an early interval drill (L03) can show a note not yet named; the first key is
always lit and the task is to read the distance.
