/* The shared voice: says short words aloud for children who cannot read
 * yet, using only a voice that runs on the device itself. Online voices are
 * never used, so no text ever leaves the device. With no local English
 * voice, Voice.ready() is false and the games lean on their picture clues.
 * Skipped while the site-wide sound toggle is off (window.pimwMuted).
 *
 * choose() is pure, so the tests load this exact file in Node. In the page
 * it is a classic script that sets window.Voice.
 */
(function (root) {
  'use strict';

  const ENGLISH = /^en([-_]|$)/i;

  /* The voice to use: on-device English only. The device's default comes
   * first, then British, then American, then any other English voice. */
  function choose(voices) {
    const local = (voices || []).filter((v) => v && v.localService === true && ENGLISH.test(v.lang || ''));
    const rank = (v) => (v.default ? 0 : /^en[-_]GB/i.test(v.lang) ? 1 : /^en[-_]US/i.test(v.lang) ? 2 : 3);
    return local.sort((a, b) => rank(a) - rank(b))[0] || null;
  }

  const api = { choose };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }

  const synth = root.speechSynthesis;
  let voice = null;
  function pick() {
    try {
      voice = choose(synth.getVoices());
    } catch (e) {
      voice = null;
    }
  }
  if (synth && root.SpeechSynthesisUtterance) {
    pick();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', pick);
    else synth.onvoiceschanged = pick;
  }

  api.ready = () => !!voice;
  // say a few words; returns false when there is no local voice or sound is off
  api.say = (text) => {
    if (!voice || root.pimwMuted) return false;
    try {
      synth.cancel();
      const u = new root.SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.9;
      u.pitch = 1.15;
      synth.speak(u);
      return true;
    } catch (e) {
      return false;                     // a voice must never break a game
    }
  };
  api.stop = () => {
    try {
      if (synth) synth.cancel();
    } catch (e) {
      // nothing to do
    }
  };
  root.Voice = api;
})(this);
