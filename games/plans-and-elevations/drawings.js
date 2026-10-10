/* Plans & Elevations: the drawings. Turns a view (a picture from
 * Views.picture) into a small SVG on squared paper, the way exam questions
 * draw plans and elevations, with the columns lettered (or the rows
 * numbered) underneath. With compare on, it also marks where a build's view
 * differs: amber for a square the build is missing, a red cross for an
 * extra one. Colours live in the page's CSS. Sets window.Drawings.
 */
(function () {
  'use strict';

  const CELL = 10;

  /* target: the picture to draw; mine: the build's picture of the same
   * view (same size) to compare with, or null. bare: no letters or numbers
   * (the quiz, where they would give the answer away). */
  function svg(target, mine, bare) {
    const { cols, rows } = target;
    const left = 1.5;
    const top = 1.5;
    const right = target.side && !bare ? 9 : 1.5;
    const bottom = bare ? 1.5 : 9;
    const w = cols * CELL + left + right;
    const h = rows * CELL + top + bottom;
    const out = [`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">`];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const want = target.on[i];
        const have = mine ? mine.on[i] : want;
        const x = left + c * CELL;
        const y = top + r * CELL;
        const cls = want && have ? 'sq on' : want ? 'sq miss' : have ? 'sq extra' : 'sq';
        out.push(`<rect class="${cls}" x="${x}" y="${y}" width="${CELL}" height="${CELL}"/>`);
        if (!want && have) {
          out.push(`<path class="cross" d="M${x + 2.5} ${y + 2.5}L${x + CELL - 2.5} ${y + CELL - 2.5}M${x + CELL - 2.5} ${y + 2.5}L${x + 2.5} ${y + CELL - 2.5}"/>`);
        }
      }
    }
    out.push(`<rect class="rim" x="${left}" y="${top}" width="${cols * CELL}" height="${rows * CELL}"/>`);
    if (!bare) {
      target.labels.forEach((t, c) => {
        out.push(`<text class="lab" x="${left + (c + 0.5) * CELL}" y="${top + rows * CELL + 6.4}">${t}</text>`);
      });
    }
    if (target.side && !bare) {
      target.side.forEach((t, r) => {
        out.push(`<text class="lab" x="${left + cols * CELL + 4.6}" y="${top + (r + 0.5) * CELL + 2.3}">${t}</text>`);
      });
    }
    out.push('</svg>');
    return out.join('');
  }

  window.Drawings = { svg };
})();
