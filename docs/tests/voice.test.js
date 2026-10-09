/* Tests for games/shared/voice.js: only an on-device English voice is ever
 * chosen, so no spoken text can leave the device.   node --test docs/tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const Voice = require(path.join(__dirname, '..', '..', 'games', 'shared', 'voice.js'));
const v = (name, lang, localService, isDefault) => ({ name, lang, localService, default: !!isDefault });

test('never an online voice, however good it sounds', () => {
  assert.equal(Voice.choose([v('Online US', 'en-US', false, true), v('Online UK', 'en-GB', false)]), null);
  assert.equal(Voice.choose([]), null);
  assert.equal(Voice.choose(undefined), null);
  assert.equal(Voice.choose([v('Mystery', 'en-GB', undefined)]), null);
});

test('only English voices', () => {
  assert.equal(Voice.choose([v('Hindi', 'hi-IN', true, true), v('French', 'fr-FR', true)]), null);
  assert.equal(Voice.choose([v('Hindi', 'hi-IN', true, true), v('Indian English', 'en-IN', true)]).name, 'Indian English');
});

test('the device default first, then British, then American', () => {
  const list = [v('US', 'en-US', true), v('Online', 'en-GB', false, true), v('UK', 'en-GB', true), v('AU', 'en-AU', true)];
  assert.equal(Voice.choose(list).name, 'UK');
  assert.equal(Voice.choose(list.concat(v('Default AU', 'en_AU', true, true))).name, 'Default AU');
  assert.equal(Voice.choose([v('AU', 'en-AU', true), v('US', 'en-US', true)]).name, 'US');
});
