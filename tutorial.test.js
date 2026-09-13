const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

test('eight tutorial lessons use real moves and combat, then leave or start BOT', async t => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = () => ({ matches: true });
  w.audioManager = {};
  for (const file of ['bot.js', 'game-rules.js', 'app.js', 'tutorial.js'])
    vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext());
  assert.equal(w.document.getElementById('account-profile-link'), null);
  assert(w.document.querySelector('#multiplayer-heading + #online-entry + #account-register-entry'));
  const battlePanel = w.document.querySelector('#battle-heading').closest('.menu-panel');
  assert.deepEqual([...battlePanel.querySelectorAll('.menu-button span')].map(label => label.textContent),
    ['Contra o BOT', 'Treinamento']);
  assert.equal(w.document.querySelector('[data-menu-mode="pvp"]'), null);
  assert.equal(w.document.getElementById('game-mode').closest('.selector-card').hidden, true);
  const preparation = w.document.getElementById('menu-preparation');
  preparation.showModal = () => { preparation.open = true; };
  preparation.close = () => { preparation.open = false; };
  battlePanel.querySelector('[data-menu-mode="bot"]').click();
  assert.equal(w.document.getElementById('game-mode').value, 'bot');
  assert.equal(preparation.open, true);
  preparation.close();
  w.eval('motionTween=async()=>true; motionPause=async()=>true; playCombatScene=async()=>{}');
  w.eval(`window.tutorialResults=[];
    const originalTutorialComplete=window.dominiusTutorial.onActionComplete;
    window.dominiusTutorial.onActionComplete=()=>{
      tutorialResults.push({lesson:window.dominiusTutorial.lesson,winner:state.winner,
        lost:state.players.map(player=>player.lostPieces.length),
        destination:state.board[5][4].piece?.roleKey||null});
      originalTutorialComplete();
    };`);
  const click = (x, y) => w.dominiusTutorial.handleCellClick(x, y);
  const waitLesson = async expected => {
    const deadline = Date.now() + 3500;
    while (w.dominiusTutorial.lesson !== expected && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(w.dominiusTutorial.lesson, expected);
  };
  w.document.getElementById('training-entry').click();
  assert.equal(w.dominiusTutorial.lesson, 1);
  assert.equal(w.eval('state.board.length'), 10);
  assert.equal(w.eval('state.board.flat().filter(cell=>cell.piece).length'), 1);
  assert(w.document.getElementById('tutorial-overlay').textContent.includes('Bem-vindo'));
  w.document.querySelector('#tutorial-overlay-actions button').click();
  click(0, 0);
  assert.equal(w.dominiusTutorial.lesson, 1);
  click(4, 6);
  assert.equal(w.dominiusTutorial.lesson, 2);
  assert(w.eval('state.validMoves.some(move=>move.x===4&&move.y===5)'));
  click(4, 5);
  await waitLesson(3);
  assert.equal(w.eval('state.board[5][4].piece.roleKey'), 'rank4');
  assert.equal(w.document.querySelector('.cell[data-x="4"][data-y="5"] .hidden-piece .piece-name')?.textContent, '?');
  w.document.getElementById('tutorial-guide').click();
  assert.equal(w.document.querySelectorAll('.tutorial-guide-piece').length, 12);
  w.document.getElementById('tutorial-guide-close').click();
  w.document.getElementById('tutorial-continue').click();
  assert.equal(w.dominiusTutorial.lesson, 4);
  click(4, 6); click(4, 5);
  await waitLesson(5);
  assert.equal(w.eval('state.players[1].lostPieces.length'), 0);
  click(4, 6); click(4, 5);
  await waitLesson(6);
  assert.equal(w.eval('state.players[0].lostPieces.length'), 0);
  assert.equal(w.eval('state.players[1].lostPieces.length'), 0);
  click(4, 6); click(4, 5);
  await waitLesson(7);
  click(4, 6); click(4, 5);
  await waitLesson(8);
  click(4, 6); click(4, 5);
  await waitLesson(9);
  assert.deepEqual(Array.from(w.tutorialResults, result => ({
    lesson: result.lesson, winner: result.winner, lost: Array.from(result.lost), destination: result.destination,
  })), [
    { lesson: 2, winner: null, lost: [0, 0], destination: 'rank5' },
    { lesson: 4, winner: null, lost: [0, 1], destination: 'rank6' },
    { lesson: 5, winner: null, lost: [1, 1], destination: null },
    { lesson: 6, winner: null, lost: [0, 1], destination: 'rank1' },
    { lesson: 7, winner: null, lost: [0, 1], destination: 'rank3' },
    { lesson: 8, winner: 0, lost: [0, 1], destination: 'rank4' },
  ]);
  assert.equal(w.eval('state.winner'), 0);
  assert(w.document.getElementById('tutorial-overlay-title').textContent.includes('CONCLUÍDO'));
  assert(w.document.getElementById('end-screen').classList.contains('hidden'));
  w.document.querySelector('#tutorial-overlay-actions button').click();
  assert.equal(w.eval('state.gameMode'), 'bot');
  assert.equal(w.eval('state.phase'), 'setup-player-1');
  w.dominiusTutorial.exit();
  assert(!w.document.getElementById('start-screen').classList.contains('hidden'));
});
