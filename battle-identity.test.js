const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

test('official standards follow every faction and either player seat', t => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = () => ({ matches: true });
  w.audioManager = {};
  for (const file of ['bot.js', 'game-rules.js', 'app.js'])
    vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext());
  const factions = ['romanos', 'orcs', 'elfos', 'anoes', 'egipcios'];
  for (const first of factions) for (const second of factions) {
    w.document.getElementById('faction-1').value = first;
    w.document.getElementById('faction-2').value = second;
    w.eval('buildPlayers(); renderPlayersSummary()');
    [first, second].forEach((faction, seat) => {
      const banner = w.document.querySelectorAll('.player-banner')[seat];
      const card = w.document.querySelectorAll('.player-card')[seat];
      assert.equal(banner.dataset.faction, faction);
      assert.equal(card.dataset.faction, faction);
      assert.equal(banner.style.getPropertyValue('--commander-color'), card.style.getPropertyValue('--commander-color'));
      assert.equal(banner.querySelector('.banner-name').textContent, w.eval(`FACTIONS.${faction}.label`));
      assert.equal(card.querySelector('.faction-tag').textContent, w.eval(`FACTIONS.${faction}.label`));
      assert.equal(banner.querySelector('.banner-counter').textContent, '40 / 40');
      assert.equal(card.querySelector('li strong').textContent, '40 / 40');
      assert.equal(banner.querySelector('.faction-standard-image').getAttribute('src'), `assets/faccoes/${faction}.png`);
      assert.equal(card.querySelector('.faction-standard-image').getAttribute('src'), `assets/faccoes/${faction}.png`);
      assert.equal(banner.querySelectorAll('.faction-crest-icon').length, 1);
      assert.equal(card.querySelectorAll('.faction-crest-icon').length, 1);
      assert.equal(banner.querySelector('.faction-crest-icon').innerHTML,
        card.querySelector('.faction-crest-icon').innerHTML);
      const image = banner.querySelector('.faction-standard-image');
      w.eval('renderPlayersSummary()');
      assert.equal(w.document.querySelectorAll('.player-banner')[seat].querySelector('.faction-standard-image'), image);
    });
  }
  const image = w.document.querySelector('.player-banner .faction-standard-image');
  const fallback = w.document.querySelector('.player-banner .faction-standard-fallback');
  image.dispatchEvent(new w.Event('error'));
  assert.equal(image.style.display, 'none');
  assert.equal(fallback.style.display, 'block');
});
