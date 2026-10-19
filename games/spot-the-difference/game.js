/* Spot the Difference: the 7+ game on the shared spot kit. All the rules
 * live in ../shared/spot/play.js; this file is the band and the words. */
(function () {
  'use strict';
  const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const seedParam = new URLSearchParams(location.search).get('seed');
  window.spot = window.Spot.Play.start({
    band: 'big',
    seed: seedParam === null ? undefined : Number(seedParam),
    strings: {
      intro: (n) => 'Find all ' + n + ' differences. Tap them in either picture.',
      found: (name, k, n) => 'Found ' + name + '! ' + k + ' of ' + n + '.',
      miss: 'Not there.',
      hint: "Here's one.",
      doneTitle: (round) => 'Round ' + round + ' done!',
      doneSub: (stars, hints, gaveUp) =>
        '★'.repeat(stars) + '☆'.repeat(3 - stars) + ' ' +
        (gaveUp ? 'Shown.' : hints === 0 ? 'No hints!' : hints === 1 ? 'One hint used.' : (WORDS[hints] || hints) + ' hints used.'),
      round: (round) => 'Round ' + round,
      stars: (total) => '★ ' + total,
    },
  });
})();
