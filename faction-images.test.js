const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const factions = ['orcs', 'elfos', 'anoes', 'egipcios'];
const roles = ['objective', 'trap', ...Array.from({ length: 10 }, (_, i) => `rank${i + 1}`)];
const fileFor = role => role === 'objective' ? 'objetivo.png' : role === 'trap' ? 'armadilha.png' : `rank-${role.slice(4)}.png`;

test('all remaining faction images map to their own roles and stay hidden until visible', t => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = () => ({ matches: true });
  for (const file of ['bot.js', 'game-rules.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext());
  }

  for (const faction of factions) {
    w.eval(`els.faction1.value='${faction}'; els.faction2.value='${faction}'; buildPlayers();`);
    for (const player of w.eval('state.players')) {
      assert.equal(player.pieces.length, 40);
      for (const piece of player.pieces) {
        assert.equal(piece.image, `assets/${faction}/${fileFor(piece.roleKey)}`);
      }
    }

    for (const role of roles) {
      const file = fileFor(role);
      const path = `assets/${faction}/${file}`;
      assert.equal(w.eval(`FACTIONS.${faction}.images.${role}`), file);
      const png = fs.readFileSync(path);
      assert.equal(png.subarray(1, 4).toString(), 'PNG', path);
      assert.equal(png.readUInt32BE(16), png.readUInt32BE(20), path);

      for (const mode of ['pvp', 'bot', 'online']) {
        const viewer = mode === 'online' ? 1 : 0;
        const owner = mode === 'online' ? 0 : 1;
        w.dominiusMultiplayer = mode === 'online' ? { active: true, seat: viewer } : null;
        w.eval(`state.gameMode='${mode}'; state.phase='battle'; state.winner=null;
          state.currentTurn=0; state.combatReveal=null;
          state.players=[{faction:'${faction}'},{faction:'${faction}'}];
          state.board=buildInitialBoard();
          state.board[0][0].piece={...PIECE_CONFIG.${role},id:'hidden',roleKey:'${role}',
            factionKey:'${faction}',playerIndex:${owner},name:FACTIONS.${faction}.names.${role},x:0,y:0};
          state.board[0][1].piece={...PIECE_CONFIG.${role},id:'visible',roleKey:'${role}',
            factionKey:'${faction}',playerIndex:${viewer},name:FACTIONS.${faction}.names.${role},x:1,y:0};
          renderBoard();`);
        const [hidden, visible] = w.document.querySelectorAll('#board .piece');
        assert.equal(hidden.textContent.trim(), '?');
        assert.equal(hidden.querySelector('img,svg'), null);
        assert.equal(hidden.dataset.kind, undefined);
        assert.equal(hidden.getAttribute('aria-label'), null);
        assert.equal(hidden.title, '');
        assert.equal(visible.querySelector('img').getAttribute('src'), path);
        assert(visible.classList.contains('faction-portrait'));
        if (role === 'objective' || role === 'trap') {
          assert.equal(visible.textContent.trim(), '');
          assert.equal(visible.querySelector('.faction-rank-badge'), null);
        } else {
          assert.equal(visible.querySelector('.faction-rank-badge').textContent.trim(), role.slice(4));
        }
      }
    }
  }
});
