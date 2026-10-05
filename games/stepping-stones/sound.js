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
