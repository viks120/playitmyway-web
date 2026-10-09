/* Number Line Hop: the ponds, their problems and every message.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Lines; in Node it
 * is a CommonJS module.
 */
(function (root) {
  'use strict';

  /* mulberry32: a tiny seedable generator, so any pond can be replayed */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(rand, list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  const LIST = [
    { id: 'add-10', title: 'Add to 10', max: 10, ops: ['+'], jumps: [1, 5], start: true },
    { id: 'sub-10', title: 'Take away from 10', max: 10, ops: ['-'], jumps: [1, 5] },
    { id: 'add-20', title: 'Add to 20', max: 20, ops: ['+'], jumps: [2, 9], crossing: 5 },
    { id: 'sub-20', title: 'Take away from 20', max: 20, ops: ['-'], jumps: [2, 9], crossing: 5 },
    { id: 'mix-20', title: 'Mix it up', max: 20, ops: ['+', '-'], jumps: [1, 9], eachOp: 3 },
  ];
  const BY_ID = Object.fromEntries(LIST.map((d) => [d.id, d]));
  const GROUPS = [
    { title: 'Within 10', ids: ['add-10', 'sub-10'] },
    { title: 'Within 20', ids: ['add-20', 'sub-20', 'mix-20'] },
  ];
  const STAGES = ['count', 'count', 'count', 'guess', 'guess', 'guess', 'gap', 'gap', 'gap'];

  // crossing ten means passing it on the way, not just landing on it
  const crossesTen = (op, start, end) => (op === '+' ? start < 10 && end > 10 : start > 10 && end < 10);

  /* Every problem a pond allows: on the line from start to end, and never
   * adding from 0, which is plain counting rather than counting on. */
  function candidates(def) {
    const out = [];
    for (const op of def.ops) {
      for (let start = 0; start <= def.max; start++) {
        for (let jump = def.jumps[0]; jump <= def.jumps[1]; jump++) {
          const end = op === '+' ? start + jump : start - jump;
          if (end < 0 || end > def.max) continue;
          if (op === '+' && start === 0) continue;
          out.push({ op, start, jump, end, crosses: crossesTen(op, start, end) });
        }
      }
    }
    return out;
  }

  /* Nine different problems: the pond's quotas first (crossing ten, or each
   * operation), then any. Stage 3 gets three with gaps of at least two hops. */
  function generate(id, seed) {
    const def = BY_ID[id];
    if (!def) throw new Error('Unknown pond: ' + id);
    const rand = rng(seed);
    const all = candidates(def);
    for (let attempt = 0; attempt < 100; attempt++) {
      const pool = shuffle(rand, all.slice());
      const chosen = [];
      const take = (wanted, n) => {
        for (const p of pool) {
          if (n <= 0 || chosen.length >= 9) return;
          if (!chosen.includes(p) && wanted(p)) {
            chosen.push(p);
            n--;
          }
        }
      };
      if (def.crossing) take((p) => p.crosses, def.crossing);
      if (def.eachOp) for (const op of def.ops) take((p) => p.op === op, def.eachOp);
      take(() => true, 9 - chosen.length);
      const gaps = chosen.filter((p) => p.jump >= 2);
      if (chosen.length < 9 || gaps.length < 3) continue;
      const gap = shuffle(rand, gaps.slice()).slice(0, 3);
      const rest = shuffle(rand, chosen.filter((p) => !gap.includes(p)));
      return {
        id: def.id,
        title: def.title,
        max: def.max,
        problems: rest.concat(gap).map((p, i) => Object.assign({}, p, { stage: STAGES[i] })),
      };
    }
    throw new Error('Could not build pond: ' + id);
  }

  /* Stage 3's buttons: 1 up to the pond's largest jump, minus any that would
   * hop off the end of the line. */
  function choices(id, p) {
    const def = BY_ID[id];
    const room = p.op === '+' ? def.max - p.start : p.start;
    return Array.from({ length: Math.min(def.jumps[1], room) }, (_, i) => i + 1);
  }

  /* ---------------------------------------------------------------- words */
  const SIGN = { '+': '+', '-': '−' };
  const landing = (p, hops) => (p.op === '+' ? p.start + hops : p.start - hops);
  const walk = (p, hops) => Array.from({ length: hops }, (_, i) => landing(p, i + 1));
  const hopWords = (n) => (n === 1 ? '1 hop' : `${n} hops`);

  function equation(p, hide) {
    return `${p.start} ${SIGN[p.op]} ${hide === 'jump' ? '?' : p.jump} = ${hide === 'end' ? '?' : p.end}`;
  }

  const say = {
    equation,
    prompt(p, name, friend) {
      if (p.stage === 'count') return `${name} is on ${p.start}. Hop ${p.jump} ${p.op === '+' ? 'more' : 'back'}!`;
      if (p.stage === 'guess') return `Where will ${name} land? Tap that pad.`;
      return `${friend} is on ${p.end}. How many hops${p.op === '+' ? '' : ' back'}?`;
    },
    counting(p, hops) {
      return walk(p, hops).join('… ') + (hops < p.jump ? '…' : '!');
    },
    counted(p) {
      return `You counted ${p.op === '+' ? 'on' : 'back'}: ${walk(p, p.jump).join(', ')}!`;
    },
    guessing(guess) {
      return `You think ${guess}. Let's hop and see!`;
    },
    guessRight(p) {
      return `Yes! You guessed ${p.end}.`;
    },
    guessWrong(p, guess, name) {
      return `${name} landed on ${p.end}, not ${guess}. Count the hops: ${walk(p, p.jump).join(', ')}.`;
    },
    gapRight(p) {
      return `${hopWords(p.jump)}! ${equation(p)}`;
    },
    gapShort(p, tried, name, friend) {
      const at = landing(p, tried);
      const left = Math.abs(p.end - at);
      return `${name} landed on ${at}. ${friend} is ${left} more ${left === 1 ? 'hop' : 'hops'} away! Try again.`;
    },
    gapFar(p, tried, friend) {
      return `Too far! ${p.start} ${SIGN[p.op]} ${tried} = ${landing(p, tried)}, past ${friend}. Try again.`;
    },
    gapShow(p) {
      return `Let's count together: ${walk(p, p.jump).join(', ')}. That's ${hopWords(p.jump)}! ${equation(p)}`;
    },
    line(max, name, at, friend, friendAt) {
      return `Number line from 0 to ${max}. ${name} is on ${at}.` + (friend ? ` ${friend} is on ${friendAt}.` : '');
    },
    doneSub(misses) {
      return misses === 0 ? 'Every answer right first time!' : `${6 - misses} of 6 right first time.`;
    },
  };

  // misses: stage-2 wrong guesses plus stage-3 problems not right first time (six chances)
  const stars = (misses) => (misses <= 1 ? 3 : misses <= 3 ? 2 : 1);

  const api = {
    LIST: LIST.map((d) => ({ id: d.id, title: d.title, max: d.max, start: !!d.start })),
    GROUPS,
    generate,
    choices,
    say,
    stars,
    rng,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Lines = api;
})(this);
