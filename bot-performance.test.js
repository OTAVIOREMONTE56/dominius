const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

for (const viewport of [{ width: 390, height: 844 }, { width: 1360, height: 768 }]) {
test(`BOT completes one legal move with one board redraw at ${viewport.width}x${viewport.height}`, async t => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: viewport.width });
  Object.defineProperty(w, 'innerHeight', { configurable: true, value: viewport.height });
  w.matchMedia = () => ({ matches: true });
  w.audioManager = {};
  for (const file of ['bot.js', 'game-rules.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext());
  }
  w.eval(`els.faction1.value='romanos'; els.faction2.value='orcs'; buildPlayers();
    placeInitialArmies(); state.gameMode='bot'; state.botDifficulty='normal';
    state.phase='battle'; state.started=true; state.currentTurn=1; state.winner=null;
    motionTween=async()=>true; motionPause=async()=>true;
    render();
    window.beforeBot=JSON.stringify(state.board.map(row=>row.map(cell=>cell.piece?.id || null)));
    window.boardRenders=0; window.originalRenderBoard=renderBoard;
    renderBoard=()=>{boardRenders++; originalRenderBoard();};`);
  await w.botAI.takeTurn();
  assert.equal(w.eval('state.currentTurn'), 0);
  assert.equal(w.eval('state.botAnimation'), null);
  assert.equal(w.boardRenders, 1);
  assert.notEqual(w.eval('JSON.stringify(state.board.map(row=>row.map(cell=>cell.piece?.id || null)))'), w.beforeBot);
  assert.equal(w.document.querySelectorAll('#board > .cell').length, 100);
});
}
