const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

test('visual reveal, turn intro and battle intro do not change game state', async t => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  w.audioManager = { getState: () => ({ enabled: true, effectsVolume: 1 }) };
  for (const file of ['bot.js', 'game-rules.js', 'app.js'])
    vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext());
  w.eval(`
    els.faction1.value='romanos'; els.faction2.value='orcs'; buildPlayers();
    state.board=buildInitialBoard(); state.phase='battle'; state.started=true;
    state.currentTurn=0; state.winner=null;
    window.hiddenEnemy=state.players[1].pieces.find(piece => piece.roleKey==='rank4');
    hiddenEnemy.x=1; hiddenEnemy.y=1; state.board[1][1].piece=hiddenEnemy;
    render();
    window.beforeVisual=JSON.stringify({turn:state.currentTurn, phase:state.phase,
      hidden:!getVisiblePieceForCell(hiddenEnemy), lost:state.players.map(p=>p.lostPieces.length)});
    window.visualSteps=[];
    motionPause=()=>new Promise(resolve=>visualSteps.push(resolve));
    window.revealDone=playEnemyRevealAnimation(hiddenEnemy,motionCell(1,1),visualMotion.epoch);
  `);
  assert.equal(w.document.querySelector('.enemy-reveal .reveal-back')?.textContent, '?');
  assert.equal(w.document.querySelector('.enemy-reveal img'), null);
  w.visualSteps.shift()(true);
  await new Promise(setImmediate);
  assert(w.document.querySelector('.enemy-reveal img'));
  assert.equal(w.document.querySelector('.cell[data-x="1"][data-y="1"] .hidden-piece .piece-name')?.textContent, '?');
  w.visualSteps.shift()(true);
  await w.revealDone;
  assert.equal(w.document.querySelector('.enemy-reveal'), null);
  w.eval('motionPause=async()=>true');
  await w.eval('playTurnIntroAnimation("orcs")');
  await w.eval('playBattleStartAnimation()');
  assert.equal(w.eval(`JSON.stringify({turn:state.currentTurn, phase:state.phase,
    hidden:!getVisiblePieceForCell(hiddenEnemy), lost:state.players.map(p=>p.lostPieces.length)})`), w.beforeVisual);
  await w.eval(`animateLostPiece(hiddenEnemy,{left:10,top:10,width:40,height:40},visualMotion.epoch)`);
  assert.deepEqual(Array.from(w.eval('state.players.map(p=>p.lostPieces.length)')), [0, 0]);
  const tied = w.eval(`(() => {
    const attacker=state.players[0].pieces.find(p=>p.roleKey==='rank5');
    const defender=state.players[1].pieces.find(p=>p.roleKey==='rank5');
    attacker.x=0; attacker.y=0; defender.x=1; defender.y=0;
    state.board[0][0].piece=attacker; state.board[0][1].piece=defender;
    applyBattleResult(attacker,defender,'tie');
    return [attacker.lost,defender.lost,state.board[0][0].piece,state.board[0][1].piece,
      state.players[0].lostPieces.length,state.players[1].lostPieces.length];
  })()`);
  assert.deepEqual(Array.from(tied), [true, true, null, null, 1, 1]);
});
