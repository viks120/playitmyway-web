/* Stepping Stones: sounds, all synthesised with Web Audio, so there are no
 * audio files. Every sound is skipped while the site-wide sound toggle is off
 * (window.pimwMuted, owned by components.js). Sets window.Sfx. */
(function () {
  'use strict';

  let ac = null;
  function context() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(a, freq, dur, type, vol, slideTo, delay) {
    const t0 = a.currentTime + (delay || 0);
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // a burst of fading noise through a sweeping band-pass: splashes and puffs
  function noise(a, dur, vol, from, to) {
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource();
    const band = a.createBiquadFilter();
    const gain = a.createGain();
    src.buffer = buf;
    band.type = 'bandpass';
    band.frequency.setValueAtTime(from, a.currentTime);
    band.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur);
    gain.gain.value = vol;
    src.connect(band);
    band.connect(gain);
    gain.connect(a.destination);
    src.start();
  }

  /* An animal call: an oscillator through a band-pass "mouth", both able to
   * slide through a middle note, with an optional wobble (vibrato). Cartoon
   * moos, baas and neighs, all made on the spot. */
  function call(a, o) {
    const t0 = a.currentTime + (o.delay || 0);
    const end = t0 + o.dur;
    const osc = a.createOscillator();
    const mouth = a.createBiquadFilter();
    const gain = a.createGain();
    osc.type = o.type || 'sawtooth';
    osc.frequency.setValueAtTime(o.from, t0);
    if (o.mid) osc.frequency.linearRampToValueAtTime(o.mid, t0 + o.dur * 0.45);
    osc.frequency.linearRampToValueAtTime(o.to || o.from, end);
    if (o.wobble) {
      const lfo = a.createOscillator();
      const depth = a.createGain();
      lfo.frequency.value = o.wobble[0];
      depth.gain.value = o.wobble[1];
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(end + 0.05);
    }
    mouth.type = 'bandpass';
    mouth.Q.value = o.q || 2;
    mouth.frequency.setValueAtTime(o.f0, t0);
    if (o.fm) mouth.frequency.linearRampToValueAtTime(o.fm, t0 + o.dur * 0.45);
    mouth.frequency.linearRampToValueAtTime(o.f1 || o.f0, end);
    const vol = o.vol || 0.25;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.04));
    gain.gain.setValueAtTime(vol, t0 + o.dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(mouth);
    mouth.connect(gain);
    gain.connect(a.destination);
    osc.start(t0);
    osc.stop(end + 0.05);
  }

  const C5 = 523.25;
  const STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19];      // a pentatonic climb, one note per row
  const note = (step) => C5 * Math.pow(2, step / 12);

  const SOUNDS = {
    hop: (a) => tone(a, 330, 0.13, 'sine', 0.09, 560),
    good: (a, row) => tone(a, note(STEPS[Math.min(Math.max(row || 0, 0), STEPS.length - 1)]), 0.3, 'triangle', 0.13),
    uhoh: (a) => {
      tone(a, 494, 0.14, 'triangle', 0.1);
      tone(a, 370, 0.22, 'triangle', 0.1, null, 0.13);
    },
    splash: (a) => {
      noise(a, 0.45, 0.5, 1400, 300);
      tone(a, 220, 0.25, 'sine', 0.12, 110, 0.12);      // glub
    },
    win: (a) => [0, 4, 7, 12, 16].forEach((s, i) => tone(a, note(s), 0.35, 'triangle', 0.12, null, i * 0.1)),
    poof: (a) => {
      noise(a, 0.18, 0.25, 3000, 1200);
      tone(a, 880, 0.12, 'sine', 0.06, 1500);
    },
    pop: (a) => tone(a, 1200, 0.06, 'sine', 0.1, 400),
    voice: (a, pitch) => {
      const p = pitch || 1;
      tone(a, 620 * p, 0.09, 'sine', 0.1, 900 * p);
      tone(a, 900 * p, 0.12, 'sine', 0.08, 700 * p, 0.08);
    },
    // farm animals
    moo: (a) => call(a, { from: 125, mid: 118, to: 98, dur: 1.0, f0: 330, f1: 720, q: 1.4, vol: 0.4, attack: 0.18 }),
    oink: (a) => {
      call(a, { from: 270, to: 185, dur: 0.16, f0: 900, q: 3, vol: 0.32, attack: 0.01 });
      call(a, { from: 290, to: 195, dur: 0.15, f0: 950, q: 3, vol: 0.3, attack: 0.01, delay: 0.21 });
    },
    baa: (a) => call(a, { from: 390, to: 330, dur: 0.75, f0: 1100, f1: 900, q: 2.5, vol: 0.28, wobble: [8, 18], attack: 0.05 }),
    quack: (a) => {
      call(a, { type: 'square', from: 520, to: 400, dur: 0.16, f0: 1300, q: 5, vol: 0.2, attack: 0.01 });
      call(a, { type: 'square', from: 540, to: 410, dur: 0.16, f0: 1300, q: 5, vol: 0.2, attack: 0.01, delay: 0.22 });
    },
    woof: (a) => {
      call(a, { from: 240, to: 140, dur: 0.17, f0: 620, q: 1.5, vol: 0.4, attack: 0.008 });
      call(a, { from: 250, to: 145, dur: 0.17, f0: 640, q: 1.5, vol: 0.38, attack: 0.008, delay: 0.26 });
    },
    meow: (a) => call(a, { type: 'triangle', from: 470, mid: 720, to: 420, dur: 0.75, f0: 750, fm: 1600, f1: 850, q: 1.6, vol: 0.34, attack: 0.06 }),
    neigh: (a) => call(a, { from: 780, mid: 900, to: 420, dur: 0.95, f0: 1500, f1: 1000, q: 2, vol: 0.24, wobble: [11, 45], attack: 0.04 }),
    cluck: (a) => {
      [0, 0.13, 0.26].forEach((d) => call(a, { type: 'square', from: 900, to: 650, dur: 0.07, f0: 1500, q: 4, vol: 0.16, attack: 0.005, delay: d }));
      call(a, { type: 'square', from: 720, to: 520, dur: 0.18, f0: 1400, q: 4, vol: 0.17, attack: 0.01, delay: 0.42 });
    },
  };

  window.Sfx = {
    play(name, arg) {
      if (window.pimwMuted) return;
      const a = context();
      if (!a || !SOUNDS[name]) return;
      try {
        SOUNDS[name](a, arg);
      } catch (e) {
        // a sound must never break the game
      }
    },
  };
})();
