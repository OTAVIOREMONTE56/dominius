const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function game(t, width, height, portraits = true) {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(w, 'innerHeight', { configurable: true, value: height });
  w.matchMedia = () => ({ matches: true });
  w.audioManager = {};
  w.DOMINIUS_BOARD_PORTRAITS_ENABLED = portraits;
  for (const file of ['bot.js', 'game-rules.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext());
  }
  w.eval(`els.faction1.value='romanos'; els.faction2.value='orcs'; buildPlayers();
    state.board=Array.from({length:10},(_,y)=>Array.from({length:10},(_,x)=>({x,y,blocked:false,piece:null})));
    state.gameMode='bot'; state.phase='battle'; state.started=true; state.currentTurn=0;
    state.winner=null; state.selectedPiece=null; state.validMoves=[];
    window.attacker=state.players[0].pieces.find(p=>p.roleKey==='rank3');
    window.defender=state.players[1].pieces.find(p=>p.roleKey==='rank4');
    attacker.x=2; attacker.y=2; defender.x=4; defender.y=2;
    state.board[2][2].piece=attacker; state.board[2][4].piece=defender;
    renderBoard();`);
  return w;
}

test('temporary mobile test renders identifiable pieces without loading board portraits', t => {
  const w = game(t, 390, 844, false);
  const visible = w.document.querySelector('[data-x="2"][data-y="2"] .piece');
  const hidden = w.document.querySelector('[data-x="4"][data-y="2"] .piece');
  assert.equal(w.document.querySelectorAll('#board img.piece-art').length, 0);
  assert(visible.querySelector('.medal-symbol'));
  assert(visible.textContent.includes(w.attacker.short));
  assert.equal(hidden.textContent.trim(), '?');
  assert.equal(hidden.querySelector('img,svg'), null);
});

for (const [width, height] of [[390, 844], [1360, 768]]) {
  test(`movement updates only two cells and reuses portrait at ${width}x${height}`, t => {
    const w = game(t, width, height);
    const board = w.document.getElementById('board');
    const before = Array.from(board.children);
    const source = board.querySelector('[data-x="2"][data-y="2"]');
    const destination = board.querySelector('[data-x="3"][data-y="2"]');
    const portrait = source.querySelector('img.piece-art');
    const untouched = board.querySelector('[data-x="0"][data-y="0"]');
    const untouchedChild = untouched.firstChild;
    const touched = [];
    const observer = new w.MutationObserver(records => records.forEach(record => {
      if (record.type === 'childList' && record.target.classList?.contains('cell')) touched.push(record.target);
    }));
    observer.observe(board, { childList: true, subtree: true });
    w.eval('movePiece(attacker,3,2); renderBoard()');
    observer.takeRecords().forEach(record => {
      if (record.type === 'childList' && record.target.classList?.contains('cell')) touched.push(record.target);
    });
    observer.disconnect();
    assert.deepEqual(Array.from(board.children), before);
    assert.deepEqual(new Set(touched), new Set([source, destination]));
    assert.equal(source.querySelector('.piece'), null);
    assert.equal(destination.querySelector('img.piece-art'), portrait);
    assert.equal(untouched.firstChild, untouchedChild);
    assert.equal(board.scrollWidth <= width || board.scrollWidth === 0, true);
    w.eval('finishTurn()');
    assert.equal(w.eval('state.currentTurn'), 1);
    assert.equal(board.querySelectorAll('.cell').length, 100);
  });
}

for (const outcome of ['attacker', 'defender', 'tie']) {
  test(`combat outcome ${outcome} updates only involved cells`, t => {
    const w = game(t, 390, 844);
    const board = w.document.getElementById('board');
    const source = board.querySelector('[data-x="2"][data-y="2"]');
    const destination = board.querySelector('[data-x="4"][data-y="2"]');
    const untouched = board.querySelector('[data-x="0"][data-y="0"]');
    const untouchedChild = untouched.firstChild;
    w.eval(`applyBattleResult(attacker,defender,'${outcome}'); renderBoard()`);
    assert.equal(source.querySelector('.piece'), null);
    assert.equal(destination.querySelector('.piece')?.getAttribute('aria-label') || null,
      outcome === 'tie' ? null : outcome === 'attacker' ? w.attacker.name : null);
    assert.equal(untouched.firstChild, untouchedChild);
    assert.equal(board.querySelectorAll('.cell').length, 100);
    assert.equal(w.eval('state.board[2][4].piece?.id || null'), outcome === 'tie' ? null
      : outcome === 'attacker' ? w.attacker.id : w.defender.id);
  });
}

test('unchanged side panels keep their DOM and refresh when their data changes', t => {
  const w = game(t, 390, 844);
  w.eval('render()');
  const summary = w.document.getElementById('players-summary');
  const lost = w.document.getElementById('lost-pieces');
  const before = [summary.firstChild, lost.firstChild];
  w.eval('render()');
  assert.deepEqual([summary.firstChild, lost.firstChild], before);
  w.eval(`state.currentTurn=1;
    state.players[0].lostPieces.push(state.players[0].pieces.find(p=>p.roleKey==='rank1'));
    render()`);
  assert.notEqual(summary.firstChild, before[0]);
  assert.notEqual(lost.firstChild, before[1]);
});
