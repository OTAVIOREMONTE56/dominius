const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

test('cinematic presentation keeps combat outcomes and resolves an attack once', async t => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = () => ({ matches: true });
  w.audioManager = {};
  for (const file of ['bot.js', 'game-rules.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext());
  }
  const outcomes = w.eval(`(() => {
    const make = (role) => ({...PIECE_CONFIG[role], roleKey:role, name:role});
    return [
      resolveBattle(make('rank1'), make('rank10')).outcome,
      resolveBattle(make('rank3'), make('trap')).outcome,
      resolveBattle(make('rank4'), make('trap')).outcome,
      resolveBattle(make('rank5'), make('rank5')).outcome,
      resolveBattle(make('rank2'), make('objective')).captureObjective,
      combatCaption(make('rank1'), make('rank10'), {outcome:'attacker'})[0],
      combatCaption(make('rank3'), make('trap'), {outcome:'attacker'})[0],
    ];
  })()`);
  assert.deepEqual(Array.from(outcomes), [
    'attacker', 'attacker', 'defender', 'tie', true,
    'ATAQUE SURPRESA', 'ARMADILHA DESATIVADA',
  ]);
  w.eval(`els.faction1.value='romanos'; els.faction2.value='orcs'; buildPlayers();
    state.board=buildInitialBoard(); state.gameMode='pvp'; state.phase='battle';
    state.started=true; state.currentTurn=0; state.winner=null;
    window.testAttacker=state.players[0].pieces.find(p=>p.roleKey==='rank3');
    window.testDefender=state.players[1].pieces.find(p=>p.roleKey==='trap');
    testAttacker.x=0; testAttacker.y=0; testDefender.x=1; testDefender.y=0;
    state.board[0][0].piece=testAttacker; state.board[0][1].piece=testDefender;
    window.combatCalls=0; window.originalResolveBattle=resolveBattle;
    resolveBattle=(a,d)=>{combatCalls++;return originalResolveBattle(a,d)};
    window.originalPlayCombatScene=playCombatScene;
    motionTween=async()=>true; motionPause=async()=>true; playCombatScene=async()=>{};
    render();`);
  await w.eval('animateCombatPresentation(testAttacker, testDefender, visualMotion.epoch)');
  assert.equal(w.combatCalls, 1);
  assert.equal(w.testDefender.lost, true);
  assert.equal(w.testAttacker.lost, false);
  assert.equal(w.testAttacker.x, 1);
  assert.equal(w.eval('state.currentTurn'), 1);
  w.eval('state.currentTurn=0; state.started=true; state.winner=null; render();');
  await w.eval('performAnimatedAction(testAttacker, 1, 1)');
  assert.equal(w.testAttacker.x, 1);
  assert.equal(w.testAttacker.y, 1);
  assert.equal(w.eval('state.board[1][1].piece.id'), w.testAttacker.id);
  assert.equal(w.eval('state.board[0][1].piece'), null);
  assert.equal(w.eval('state.currentTurn'), 1);
  const beforeOnlineEffect = w.eval('JSON.stringify({board:state.board,currentTurn:state.currentTurn,winner:state.winner})');
  w.matchMedia = () => ({ matches: false });
  w.audioManager.getState = () => ({ enabled: true, effectsVolume: 1 });
  w.eval('playCombatScene=originalPlayCombatScene');
  w.dominiusVisualizeOnlineAction({ kind: 'combat', seat: 0, attackerRole: 'rank3',
    defenderRole: 'trap', outcome: 'attacker' }, [{ faction: 'romanos' }, { faction: 'orcs' }]);
  assert(w.document.querySelector('.duel-scene'));
  assert.equal(w.eval('JSON.stringify({board:state.board,currentTurn:state.currentTurn,winner:state.winner})'), beforeOnlineEffect);
  w.eval('cancelVisualMotion()');
  assert.equal(w.document.querySelector('.duel-scene'), null);
});
