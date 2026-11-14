# Tutti

An adaptive sight-reading trainer for learning organ keyboard from sheet music. You see a note,
interval or chord on the staff, play it on the on-screen keyboard (or a USB/Bluetooth MIDI
keyboard, or your microphone), and the app tracks your accuracy and speed.

The adaptive engine paces the curriculum to you:

- **Fast learners:** a placement test on first launch, early promotion when you're accurate and
  fast, "test out" to skip a stage, and new notes introduced in bigger batches.
- **When it gets hard:** fewer new notes, more repetition of weak items, earlier hints, and a
  short step back to the previous stage if accuracy drops.
- **Fluency:** the response-time goal tightens as an item is mastered, so slow-but-correct
  isn't counted as "learned".

Curriculum: treble and bass anchors, full staves, grand staff, ledger lines, intervals,
accidentals, dyads, hands together, triads, hymn-style SATB chords, rhythm, short phrases, plus
optional pedal drills.

## Develop

```bash
npm install
npm test          # engine, curriculum, storage and pitch-detection tests
npm run build     # -> dist/index.html (single self-contained file)
```

Plain ES modules bundled with esbuild into one HTML file. The design and algorithm spec is in
[PLAN.md](PLAN.md).

Progress is saved in the browser (localStorage). MIDI and microphone input need a browser that
supports Web MIDI / getUserMedia (Chrome or Edge on desktop and Android, served over HTTPS).
