const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function fixture(t, width = 390, height = 844) {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'),
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:8000/' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.console = { ...console, groupCollapsed() {}, table() {}, groupEnd() {} };
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(w, 'innerHeight', { configurable: true, value: height });
  w.matchMedia = () => ({ matches: true });
  w.audioManager = {};
  for (const file of ['perf-debug.js', 'bot.js', 'game-rules.js', 'app.js'])
    vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext());
  w.eval(`els.faction1.value='romanos'; els.faction2.value='orcs'; buildPlayers();
    state.board=Array.from({length:10},(_,y)=>Array.from({length:10},(_,x)=>({x,y,blocked:false,piece:null})));
    state.gameMode='bot';state.phase='battle';state.started=true;state.currentTurn=0;state.winner=null;
    window.testPiece=state.players[0].pieces.find(p=>p.roleKey==='rank3');
    testPiece.x=2;testPiece.y=2;state.board[2][2].piece=testPiece;
    motionTween=async()=>true;motionPause=async()=>true;render();`);
  return w;
}

test('diagnostic is off by default and can be enabled and disabled without changing a move', async t => {
  const w = fixture(t);
  assert.equal(w.document.querySelector('#dominius-perf-panel'), null);
  w.dominiusPerf.enable();
  assert(w.document.querySelector('#dominius-perf-panel'));
  await w.eval('performAnimatedAction(testPiece,3,2)');
  await new Promise(resolve => setTimeout(resolve, 80));
  const report = w.dominiusPerf.last;
  assert(report);
  assert.equal(report.tipo, 'local');
  assert.equal(report.casasAtualizadas, 2);
  assert.equal(report.reconstrucoesCompletas, 0);
  assert(report.boardRenders >= 1);
  assert(report.renders >= 1);
  assert(report.stateMs >= 0);
  assert.equal(w.eval('state.board[2][3].piece.id'), w.testPiece.id);
  assert.equal(w.eval('state.currentTurn'), 1);
  w.dominiusPerf.disable();
  assert.equal(w.document.querySelector('#dominius-perf-panel'), null);
  assert.equal(w.DOMINIUS_PERF_DEBUG, false);
});

test('BOT and online signals produce separate readable reports at desktop size', async t => {
  const w = fixture(t, 1360, 768);
  w.dominiusPerf.enable();
  w.dominiusPerf.signal('realtime');
  w.dominiusPerf.signal('realtime');
  w.dominiusPerf.signal('poll');
  w.dominiusPerf.snapshotNetwork(12, w.performance.now() - 12);
  w.dominiusPerf.onlineRenderStart(7);
  w.dominiusPerf.render();
  w.dominiusPerf.board(2, false);
  w.dominiusPerf.onlineRendered();
  await new Promise(resolve => setTimeout(resolve, 80));
  const online = w.dominiusPerf.last;
  assert.equal(online.tipo, 'online');
  assert.equal(online.eventosOnline.realtime, 2);
  assert.equal(online.eventosOnline.poll, 1);
  assert.equal(online.networkMs, 12);
  assert.equal(online.casasAtualizadas, 2);
  w.eval(`state.gameMode='bot';state.currentTurn=1;state.players[1].pieces.forEach(p=>{p.lost=true;p.x=-1;p.y=-1});
    window.botPiece=state.players[1].pieces.find(p=>p.roleKey==='rank3');
    botPiece.lost=false;botPiece.x=6;botPiece.y=6;state.board[6][6].piece=botPiece;renderBoard();`);
  await w.botAI.takeTurn();
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(w.dominiusPerf.last.tipo, 'BOT');
  assert(w.dominiusPerf.last.botMs >= 0);
  assert.equal(w.eval('state.currentTurn'), 0);
});
