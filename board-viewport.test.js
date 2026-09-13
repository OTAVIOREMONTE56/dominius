const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

test('board height limit uses measured viewport space and leaves the 10x10 grid intact', t => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = () => ({ matches: true });
  for (const file of ['bot.js', 'game-rules.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext());
  }
  w.eval(`els.gameScreen.classList.remove('hidden');
    state.players=[{faction:'romanos'},{faction:'orcs'}];
    state.board=buildInitialBoard(); renderBoard();`);
  const board = w.document.getElementById('board');
  const summary = w.document.querySelector('#lost-pieces-panel > summary');
  board.getBoundingClientRect = () => ({ top: 120 });
  summary.getBoundingClientRect = () => ({ height: 40 });
  Object.defineProperty(w, 'innerHeight', { configurable: true, value: 800 });
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 1280 });
  w.eval('fitBoardToViewport()');
  assert.equal(w.document.getElementById('game-screen').style.getPropertyValue('--board-viewport-limit'), '636px');
  assert.equal(board.querySelectorAll(':scope > .cell').length, 100);
  assert.equal(board.querySelectorAll(':scope > .cell.blocked').length, 8);
  Object.defineProperty(w, 'innerWidth', { configurable: true, value: 390 });
  w.eval('fitBoardToViewport()');
  assert.equal(w.document.getElementById('game-screen').style.getPropertyValue('--board-viewport-limit'), '');
});
