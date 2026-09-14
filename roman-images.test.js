const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');

test('Roman portraits map every role, preserve Caesar and never expose hidden identities', t => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = () => ({ matches: true });
  for (const file of ['bot.js', 'game-rules.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext());
  }
  const roles = { objective: 'optimized/objetivo.webp', trap: 'optimized/armadilha.webp', rank10: 'optimized/cesar.webp' };
  for (let rank = 1; rank <= 9; rank++) roles[`rank${rank}`] = `optimized/rank-${rank}.webp`;
  w.eval(`els.faction1.value='romanos'; els.faction2.value='romanos'; buildPlayers();`);
  for (const player of w.eval('state.players')) {
    assert.equal(player.pieces.length, 40);
    for (const piece of player.pieces) {
      assert.equal(piece.image, `assets/romanos/${roles[piece.roleKey]}`);
    }
  }
  for (const [role, file] of Object.entries(roles)) {
    assert.equal(w.eval(`FACTIONS.romanos.images.${role}`), file);
    const source = file.replace('optimized/', '').replace('.webp', '.png');
    const png = fs.readFileSync(`assets/romanos/${source}`);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), png.readUInt32BE(20), 'square source');
    const webp = fs.readFileSync(`assets/romanos/${file}`);
    assert.equal(webp.toString('ascii', 0, 4), 'RIFF');
    assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
    assert.equal(webp.readUInt16LE(26) & 16383, 512);
    assert.equal(webp.readUInt16LE(28) & 16383, 512);
    assert(webp.length < png.length);
    for (const seat of [0, 1]) for (const viewer of [0, 1]) for (const finished of [false, true]) {
      w.dominiusMultiplayer = { active: true, seat: viewer };
      w.eval(`state.gameMode='online'; state.phase='battle'; state.winner=${finished ? 0 : 'null'};
        state.players=[{faction:'romanos'},{faction:'romanos'}]; state.board=buildInitialBoard();
        state.board[0][0].piece={...PIECE_CONFIG.${role}, id:'roman', roleKey:'${role}',
          factionKey:'romanos', playerIndex:${seat}, name:FACTIONS.romanos.names.${role}, x:0, y:0};
        renderBoard();`);
      const piece = w.document.querySelector('#board .piece');
      if (seat === viewer) {
        assert.equal(piece.querySelector('img').getAttribute('src'), `assets/romanos/${file}`);
        assert.equal(piece.querySelector('.piece-art-viewport > img.piece-art').getAttribute('src'), `assets/romanos/${file}`);
        if (role === 'trap' || role === 'objective') {
          assert.equal(piece.querySelector('.roman-rank-badge'), null);
          assert.equal(piece.textContent.trim(), '');
        } else {
          assert.equal(piece.querySelector('.roman-rank-badge').textContent.trim(),
            w.eval(`PIECE_CONFIG.${role}.short`));
        }
      } else {
        assert.equal(piece.textContent, '?');
        assert.equal(piece.querySelector('img,svg'), null);
        assert.equal(piece.querySelector('.piece-art-viewport'), null);
        assert.equal(piece.dataset.kind, undefined);
        assert.equal(piece.getAttribute('aria-label'), null);
        assert.equal(piece.title, '');
        assert.equal(piece.style.getPropertyValue('--piece-image'), '');
        assert(!piece.classList.contains('roman-portrait'));
      }
    }
  }
  w.dominiusMultiplayer = null;
  for (const mode of ['pvp', 'bot']) for (const seat of [0, 1]) {
    for (const turn of [0, 1]) for (const [role, file] of Object.entries(roles)) {
      w.eval(`state.gameMode='${mode}';state.phase='battle';state.currentTurn=${turn};
        state.winner=null;state.combatReveal=null;state.board=buildInitialBoard();
        state.board[9][9].piece={...PIECE_CONFIG.${role},id:'roman',roleKey:'${role}',
          factionKey:'romanos',playerIndex:${seat},name:FACTIONS.romanos.names.${role},x:9,y:9};
        renderBoard();`);
      const visible = seat === (mode === 'bot' ? 0 : turn);
      const piece = w.document.querySelector('#board .piece');
      if (visible) assert.equal(piece.querySelector('img').getAttribute('src'), `assets/romanos/${file}`);
      else {
        assert.equal(piece.textContent, '?');
        assert.equal(piece.querySelector('img'), null);
        assert.equal(piece.dataset.kind, undefined);
        w.eval(`state.combatReveal={attackerId:'roman',defenderId:'other'};renderBoard();`);
        assert.equal(w.document.querySelector('#board .piece img').getAttribute('src'), `assets/romanos/${file}`);
        w.eval('state.combatReveal=null;renderBoard();');
        assert.equal(w.document.querySelector('#board .piece').textContent, '?');
      }
    }
  }
  w.eval(`state.gameMode='bot'; state.winner=null; state.combatReveal=null; renderBoard();`);
  assert.equal(w.document.querySelector('#board .piece').textContent, '?');
  w.eval(`state.combatReveal={attackerId:'roman',defenderId:'other'}; renderBoard();`);
  assert(w.document.querySelector('#board .piece img'));
  const reused = w.document.querySelector('#board .piece img');
  w.eval('renderBoard()');
  assert.equal(w.document.querySelector('#board .piece img'), reused, 'unchanged portraits keep the decoded image element');
  assert.equal(createHash('sha256').update(fs.readFileSync('assets/romanos/cesar.png')).digest('hex'),
    'e046a8d2bee3235998df6f625d91635f22898fa7ad8ef93f3afd50addbed1562');
});
