import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SONG_SOURCE, parseSongs, SONGS, getSong, songBars, songEvents, songPitches, songFeatures } from '../src/songs.js';
import { songMinLesson } from '../src/lessons.js';
import { staffStep } from '../src/curriculum.js';

const EXPECTED_MIN = {"hot-cross-buns":1,"au-clair":1,"mary-lamb":2,"lightly-row":2,"ode-to-joy":2,"aunt-rhody":2,"jingle-bells":2,"low-pipes":5,"hot-cross-buns-lh":6,"ode-to-joy-lh":6,"au-clair-lh":6,"middle-c-meeting":7,"ode-relay":7,"mary-relay":7,"twinkle":9,"b-in-the-middle":9,"london-bridge":9,"twinkle-relay":9,"lightly-row-g":10,"mary-lamb-g":10,"old-hundredth-c":11,"lines-and-spaces":11,"joy-to-the-world":12,"silent-night":12,"amazing-grace":12,"twinkle-lh":13,"b-in-the-middle-lh":13,"london-bridge-lh":13,"walking-down":14,"old-hundredth-lh":14,"bottom-of-the-staff":15,"hot-cross-buns-drone":16,"ode-drone":16,"twinkle-hands":16,"lightly-row-hands":16,"jingle-bells-hands":16,"ode-tenths":16,"silent-night-hands":16,"first-noel":16,"good-king-wenceslas":19,"old-hundredth-g":19,"g-major-walk":19,"old-hundredth-duet":19,"good-king-hands":19,"ode-to-joy-f":20,"frere-jacques":20,"f-major-bass":20,"amazing-grace-hands":20,"greensleeves":21,"neighbours-rh":21,"neighbours-lh":21,"yankee-doodle":22,"auld-lang-syne":22,"hot-cross-buns-high-lh":22,"au-clair-high-lh":22,"ode-full":22,"joy-to-the-world-high":23,"deep-pipes":23,"mary-chords":25};

test('all 59 songs parse and ids are unique', () => {
  assert.equal(Object.keys(SONGS).length, 59);
  const ids = SONG_SOURCE.split('\n').filter((l) => /^@(song|derive)/.test(l)).map((l) => l.replace(/^@\w+\s+/, '').split('|')[0].trim());
  assert.equal(ids.length, 59);
  assert.equal(new Set(ids).size, 59);
  assert.deepEqual(Object.keys(SONGS).sort(), [...ids].sort());
  assert.throws(() => parseSongs('@song a | A | x | 4/4 | key 0 | bpm 80 | pickup 0\nrh: C4:w\n@song a | A | x | 4/4 | key 0 | bpm 80 | pickup 0\nrh: C4:w'), /"a"/);
});

test('SONG_SOURCE matches the plan block byte for byte (when the plan is present)', (t) => {
  const planPath = new URL('../PLAN-LESSONS.md', import.meta.url);
  if (!fs.existsSync(planPath)) return t.skip('plan not present');
  const plan = fs.readFileSync(planPath, 'utf8');
  const start = plan.indexOf('```text\n') + 8;
  assert.equal(SONG_SOURCE, plan.slice(start, plan.indexOf('\n```', start)));
});

test('bar lengths sum correctly and two-part songs have equal bar counts', () => {
  for (const song of Object.values(SONGS)) {
    const barLen = (song.time[0] * 4) / song.time[1];
    const counts = [];
    for (const [hand, bars] of Object.entries(song.parts)) {
      counts.push(bars.length);
      bars.forEach((bar, i) => {
        const sum = bar.reduce((s, tok) => s + tok.beats, 0);
        let want = barLen;
        if (song.pickup > 0 && i === 0) want = song.pickup;
        else if (song.pickup > 0 && i === bars.length - 1) want = barLen - song.pickup;
        assert.equal(sum, want, `${song.id} ${hand} bar ${i + 1}`);
      });
    }
    assert.equal(new Set(counts).size, 1, `${song.id} part lengths`);
  }
});

test('malformed input throws with the song id in the message', () => {
  const head = '@song bad-one | Bad | x | 4/4 | key 0 | bpm 80 | pickup 0\n';
  assert.throws(() => parseSongs(head + 'rh: H4:q C4:h.'), /bad-one/);
  assert.throws(() => parseSongs(head + 'rh: C4:x C4:h.'), /bad-one/);
  assert.throws(() => parseSongs(head + 'rh: C4:q C4:q C4:q'), /bad-one/);
  assert.throws(() => parseSongs(head + 'rh: C4:w | C4:q'), /bad-one.*bar 2/);
  assert.throws(() => parseSongs(head + 'rh: C4:w | C4:w\nlh: C3:w'), /bad-one/);
  assert.throws(() => parseSongs('@derive d | from nothing | semis 0 | to lh'), /"d"/);
});

test('pitch, accidental and derive spelling', () => {
  const gk = getSong('good-king-wenceslas');
  const sharp = gk.parts.rh[2][3];
  assert.deepEqual(sharp.midis, [66]);
  assert.deepEqual(sharp.accidentals, ['#']);
  const f = getSong('ode-to-joy-f');
  assert.equal(f.key, -1);
  assert.equal(f.parts.rh[0][2].midis[0], 70);
  assert.equal(f.parts.rh[0][2].accidentals[0], 'b');
  const g = getSong('old-hundredth-g');
  assert.deepEqual(g.derived, { from: 'old-hundredth-c', semis: -5, to: 'rh' });
  assert.equal(g.parts.rh[0][2].midis[0], 66);
  assert.equal(g.parts.rh[0][2].accidentals[0], '#');
  assert.ok(getSong('greensleeves').parts.rh.flat().some((tk) => tk.midis[0] === 68 && tk.accidentals[0] === '#'));
  assert.ok(getSong('neighbours-lh').parts.lh.flat().some((tk) => tk.midis[0] === 56 && tk.accidentals[0] === 'b'));
  const lh = getSong('ode-to-joy-lh');
  assert.ok(lh.parts.lh && !lh.parts.rh);
  assert.equal(lh.title, getSong('ode-to-joy').title);
  assert.equal(lh.bpm, getSong('ode-to-joy').bpm);
  assert.equal(getSong('mary-chords').parts.lh[0][0].midis.length, 3);
  assert.equal(getSong('low-pipes').original, true);
  assert.equal(getSong('twinkle').original, false);
  assert.equal(getSong('nope'), undefined);
});

test('songBars slices bars and pickup rules', () => {
  const ag = getSong('amazing-grace');
  const mid = songBars(ag, [2, 4]);
  assert.equal(mid.parts.rh.length, 3);
  assert.equal(mid.pickup, 0);
  const first = songBars(ag, [1, 2]);
  assert.equal(first.pickup, 1);
  assert.equal(first.parts.rh[0].length, 1);
  assert.throws(() => songBars(ag, [0, 2]), RangeError);
  assert.throws(() => songBars(ag, [3, 99]), RangeError);
  const duet = songBars(getSong('old-hundredth-duet'), [1, 6]);
  assert.equal(duet.parts.rh.length, 6);
  assert.equal(duet.parts.lh.length, 6);
});

test('songEvents: ordering, rests omitted, slicing, hand filter', () => {
  const mcm = getSong('middle-c-meeting');
  const ev = songEvents(mcm);
  assert.ok(ev.every((e) => e.midis.length > 0));
  for (let i = 1; i < ev.length; i++) {
    assert.ok(ev[i].t >= ev[i - 1].t);
    if (ev[i].t === ev[i - 1].t) assert.ok(!(ev[i].hand === 'lh' && ev[i - 1].hand === 'rh'));
  }
  assert.equal(ev[0].t, 0);
  assert.equal(ev[0].hand, 'rh');
  assert.equal(ev[0].staff, 'treble');
  assert.equal(songEvents(mcm, { hands: 'lh' }).every((e) => e.hand === 'lh' && e.staff === 'bass'), true);
  const drone = songEvents(getSong('ode-drone'));
  assert.equal(drone[0].hand, 'lh'); // lh before rh at t = 0
  assert.equal(drone[1].hand, 'rh');
  const sliced = songEvents(getSong('ode-to-joy'), { bars: [3, 4] });
  assert.equal(sliced[0].t, 0);
  assert.equal(sliced[0].bar, 1);
  assert.equal(sliced.length, 7);
  const ag = songEvents(getSong('amazing-grace'));
  assert.equal(ag[0].t, 0);
  assert.equal(ag[0].beats, 1);
  assert.equal(ag[1].t, 1);
  const total = songEvents(getSong('ode-to-joy')).at(-1);
  assert.equal(total.t + total.beats, 32);
});

test('songPitches and songFeatures', () => {
  assert.deepEqual(songPitches(getSong('hot-cross-buns')).map((p) => p.midi), [60, 62, 64]);
  assert.ok(songPitches(getSong('hot-cross-buns')).every((p) => p.staff === 'treble'));
  assert.ok(songPitches(getSong('low-pipes')).every((p) => p.staff === 'bass'));
  assert.deepEqual(songFeatures(getSong('hot-cross-buns')), ['q', 'h']);
  assert.deepEqual(songFeatures(getSong('amazing-grace')), ['q', 'h', 'h.', 'q.', '8', '3/4', 'pickup']);
  assert.ok(songFeatures(getSong('mary-chords')).includes('chord'));
  assert.ok(songFeatures(getSong('good-king-hands')).includes('key1'));
  assert.ok(songFeatures(getSong('amazing-grace-hands')).includes('key-1'));
  assert.ok(songFeatures(getSong('middle-c-meeting')).includes('rest'));
  assert.ok(songFeatures(getSong('middle-c-meeting')).includes('grand'));
  assert.ok(!songFeatures(getSong('middle-c-meeting')).includes('together'));
  assert.ok(!songFeatures(getSong('ode-relay')).includes('together'));
  assert.ok(songFeatures(getSong('ode-drone')).includes('together'));
});

test('songMinLesson equals the plan map exactly', () => {
  const got = {};
  for (const s of Object.values(SONGS)) got[s.id] = songMinLesson(s);
  assert.deepEqual(got, EXPECTED_MIN);
});

test('every pitch sits within two ledger lines of its staff', () => {
  for (const song of Object.values(SONGS)) {
    for (const { midi, staff } of songPitches(song)) {
      const step = staffStep(midi, staff);
      assert.ok(step >= -5 && step <= 13, `${song.id} ${staff} ${midi} step ${step}`);
    }
  }
});

test('rh tokens are treble and lh tokens bass in events', () => {
  for (const song of Object.values(SONGS)) {
    for (const e of songEvents(song)) assert.equal(e.staff, e.hand === 'rh' ? 'treble' : 'bass');
  }
});

test('SONGS is frozen', () => {
  assert.throws(() => { 'use strict'; SONGS['hot-cross-buns'].bpm = 1; });
});
