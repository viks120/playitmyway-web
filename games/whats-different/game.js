/* What's Different?: the 3+ game on the shared spot kit. All the rules live
 * in ../shared/spot/play.js; this file is the band and the words. */
(function () {
  'use strict';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const seedParam = new URLSearchParams(location.search).get('seed');
  window.spot = window.Spot.Play.start({
    band: 'little',
    seed: seedParam === null ? undefined : Number(seedParam),
    voice: window.Voice || null,
    strings: {
      intro: () => "Tap what's different!",
      start: "Find what's different!",
      found: (name, k, n) => 'Found ' + name + '! ' + k + ' of ' + n + '.',
      spoken: (name) => cap(name) + '!',
      miss: 'Not there.',
      hint: 'Look here!',
      done: 'You found them all!',
    },
  });
})();
