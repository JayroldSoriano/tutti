import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yin } from '../src/input/mic.js';
import { createAudio } from '../src/audio.js';
import { createMidiInput } from '../src/input/midi.js';
import { createMicInput } from '../src/input/mic.js';
import { createKeyInput } from '../src/input/keys.js';

const SR = 44100, N = 2048;
const f = (midi) => 440 * 2 ** ((midi - 69) / 12);
const cents = (a, b) => 1200 * Math.log2(a / b);

function synth(freq, harm = [1], sr = SR) {
  const b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    harm.forEach((g, k) => { v += g * Math.sin(2 * Math.PI * freq * (k + 1) * i / sr); });
    b[i] = v * 0.3;
  }
  return b;
}

const notes = { A2: 45, C4: 60, A4: 69, C6: 84 };
for (const [name, midi] of Object.entries(notes)) {
  for (const [label, harm] of [['sine', [1]], ['sine+harmonics', [1, 0.55, 0.3, 0.22]]]) {
    test(`yin ${name} ${label}`, () => {
      const r = yin(synth(f(midi), harm), SR);
      assert.ok(r, 'detected');
      assert.ok(Math.abs(cents(r.freq, f(midi))) < 20, `got ${r.freq} want ${f(midi)}`);
      assert.ok(r.clarity > 0.9, `clarity ${r.clarity}`);
    });
  }
}

test('yin works at 48 kHz', () => {
  const r = yin(synth(f(60), [1, 0.5], 48000), 48000);
  assert.ok(Math.abs(cents(r.freq, f(60))) < 20);
});

test('yin returns null on noise and silence', () => {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const b = new Float32Array(N).map(() => rnd() * 0.3);
  assert.equal(yin(b, SR), null);
  assert.equal(yin(new Float32Array(N), SR), null);
});

test('modules import and construct in node without touching browser APIs', async () => {
  const a = createAudio();
  assert.equal(a.available, false);
  assert.equal(a.unlock(), false);
  a.noteOn(60); a.noteOff(60); a.allOff(); a.blip('ok'); a.click(true); a.setEnabled(false);
  assert.equal(typeof a.now(), 'number');
  for (const ad of [createMidiInput({}), createMicInput({}), createKeyInput({})]) {
    assert.equal(ad.available, false);
    assert.deepEqual(await ad.start(), { ok: false, reason: 'unsupported' });
    ad.stop();
  }
});
