// O treinamento controla apenas cenários e instruções. Movimento e combate usam app.js/game-rules.js.
(() => {
  const byId = (id) => document.getElementById(id);
  const panel = byId('tutorial-panel');
  const overlay = byId('tutorial-overlay');
  const guideOverlay = byId('tutorial-guide-overlay');
  const feedback = byId('tutorial-feedback');
  let lesson = 0;
  let unit = null;
  let enemy = null;
  let advancing = false;

  const lessons = {
    1: ['SELECIONE SUA UNIDADE', 'Toque ou clique na peça destacada.'],
    2: ['MOVIMENTAÇÃO', 'Suas unidades podem avançar uma casa por vez. Mova sua unidade para a casa destacada.'],
    3: ['PEÇAS INIMIGAS OCULTAS', 'Você não conhece a identidade das tropas inimigas. Ela será revelada quando entrar em combate.'],
    4: ['COMBATE', 'Ataque a peça marcada. Na maioria dos confrontos, a patente mais alta vence.'],
    5: ['EMPATE', 'Quando duas unidades de mesma patente se enfrentam, ambas são eliminadas. Ataque a unidade marcada.'],
    6: ['ATAQUE SURPRESA', 'Quando o Rank 1 ATACA o Rank 10, consegue derrotá-lo. Faça o ataque.'],
    7: ['ARMADILHAS', 'Armadilhas eliminam atacantes. O Rank 3 é especialista em desarmamento: ataque a Armadilha com ele.'],
    8: ['OBJETIVO', 'Seu verdadeiro alvo não é destruir todas as tropas. Capture o Objetivo inimigo para vencer a batalha.'],
  };

  function put(playerIndex, roleKey, x, y) {
    const piece = state.players[playerIndex].pieces.find((candidate) => candidate.roleKey === roleKey);
    piece.x = x;
    piece.y = y;
    state.board[y][x].piece = piece;
    return piece;
  }

  function scenario(ownRole, enemyRole) {
    buildPlayers();
    state.board = buildInitialBoard();
    state.currentTurn = 0;
    state.winner = null;
    state.loser = null;
    state.started = true;
    state.phase = 'battle';
    state.battleStarted = true;
    state.selectedPiece = null;
    state.validMoves = [];
    state.combatReveal = null;
    state.log = [];
    unit = put(0, ownRole, 4, 6);
    enemy = enemyRole ? put(1, enemyRole, 4, 5) : null;
  }

  function markTargets() {
    els.board.querySelectorAll('.tutorial-piece, .tutorial-target').forEach((cell) =>
      cell.classList.remove('tutorial-piece', 'tutorial-target'));
    const ownCell = unit && motionCell(unit.x, unit.y);
    const target = lesson === 2 ? motionCell(4, 5) : enemy && motionCell(enemy.x, enemy.y);
    if (ownCell && lesson !== 3) ownCell.classList.add('tutorial-piece');
    if (target) target.classList.add('tutorial-target');
  }

  function enter(nextLesson, keepScenario = false) {
    lesson = nextLesson;
    advancing = false;
    feedback.textContent = '';
    if (!keepScenario) {
      if (lesson === 1) scenario('rank5');
      if (lesson === 3) scenario('rank6', 'rank4');
      if (lesson === 5) scenario('rank5', 'rank5');
      if (lesson === 6) scenario('rank1', 'rank10');
      if (lesson === 7) scenario('rank3', 'trap');
      if (lesson === 8) scenario('rank4', 'objective');
    }
    const [title, copy] = lessons[lesson];
    byId('tutorial-step').textContent = `LIÇÃO ${lesson} DE 8`;
    byId('tutorial-title').textContent = title;
    byId('tutorial-copy').textContent = copy;
    byId('tutorial-continue').hidden = lesson !== 3;
    render();
    markTargets();
  }

  function showOverlay(title, copy, actions) {
    byId('tutorial-overlay-title').textContent = title;
    byId('tutorial-overlay-copy').textContent = copy;
    const actionBox = byId('tutorial-overlay-actions');
    actionBox.replaceChildren();
    actions.forEach(([label, action]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', action);
      actionBox.appendChild(button);
    });
    overlay.classList.remove('hidden');
  }

  function start() {
    cancelVisualMotion();
    els.faction1.value = els.faction1.value || 'romanos';
    els.faction2.value = els.faction2.value || 'orcs';
    state.gameMode = 'tutorial';
    els.startScreen.classList.add('hidden');
    els.gameScreen.classList.remove('hidden');
    els.endScreen.classList.add('hidden');
    panel.classList.remove('hidden');
    document.body.classList.add('tutorial-active');
    enter(1);
    showOverlay('TREINAMENTO', 'Bem-vindo, Comandante. Antes de liderar um exército, você precisa conhecer suas tropas.', [
      ['COMEÇAR TREINAMENTO', () => overlay.classList.add('hidden')],
      ['SAIR DO TREINAMENTO', exit],
    ]);
  }

  function exit() {
    lesson = 0;
    advancing = false;
    overlay.classList.add('hidden');
    guideOverlay.classList.add('hidden');
    panel.classList.add('hidden');
    document.body.classList.remove('tutorial-active');
    restartGame();
  }

  function wrong(message) {
    feedback.textContent = message;
    panel.classList.remove('tutorial-nudge');
    void panel.offsetWidth;
    panel.classList.add('tutorial-nudge');
  }

  function handleCellClick(x, y) {
    if (!lesson || advancing || visualMotion.busy || !overlay.classList.contains('hidden') || !guideOverlay.classList.contains('hidden')) return;
    if (lesson === 3) return wrong('Observe a peça oculta e use PULAR INSTRUÇÃO para continuar.');
    if (lesson === 1) {
      if (x !== unit.x || y !== unit.y) return wrong('Primeiro selecione a unidade destacada.');
      selectPiece(unit);
      enter(2, true);
      feedback.textContent = 'Muito bem!';
      return;
    }
    if (lesson === 2) {
      if (x !== 4 || y !== 5 || state.selectedPiece !== unit || !state.validMoves.some((move) => move.x === x && move.y === y))
        return wrong('Mova a unidade para a casa destacada.');
      advancing = true;
      void performAnimatedAction(unit, x, y);
      return;
    }
    if (x === unit.x && y === unit.y) {
      selectPiece(unit);
      markTargets();
      feedback.textContent = 'Agora ataque a peça destacada.';
      return;
    }
    if (!enemy || x !== enemy.x || y !== enemy.y || state.selectedPiece !== unit ||
        !state.validMoves.some((move) => move.x === x && move.y === y && move.type === 'attack'))
      return wrong('Primeiro selecione sua unidade e ataque o alvo destacado.');
    advancing = true;
    void resolveCombat(unit, enemy);
  }

  function onActionComplete() {
    if (!advancing || !lesson) return;
    const completed = lesson;
    feedback.textContent = ({ 2: 'Muito bem!', 4: 'VITÓRIA! A unidade de maior patente venceu.',
      5: 'Ambas foram eliminadas.', 6: 'Excelente! O Rank 1 derrotou o Rank 10.',
      7: 'ARMADILHA DESATIVADA' })[completed] || '';
    window.setTimeout(() => {
      if (lesson !== completed) return;
      if (completed === 8) {
        lesson = 9;
        panel.classList.add('hidden');
        showOverlay('TREINAMENTO CONCLUÍDO', 'Você está pronto para comandar seu exército.', [
          ['JOGAR CONTRA O BOT', () => { exit(); els.gameMode.value = 'bot'; startGame(); }],
          ['VOLTAR AO MENU', exit],
        ]);
      } else enter(completed + 1);
    }, 650);
  }

  function openGuide() {
    const list = byId('tutorial-guide-list');
    list.replaceChildren();
    const faction = state.players[0]?.faction || 'romanos';
    for (let rank = 1; rank <= 10; rank += 1) {
      const role = `rank${rank}`;
      const card = document.createElement('div');
      card.className = 'tutorial-guide-piece';
      const image = document.createElement('img');
      image.src = `assets/${faction}/${FACTIONS[faction].images[role]}`;
      image.alt = FACTIONS[faction].names[role];
      const text = document.createElement('p');
      const rule = rank === 1 ? 'Pode derrotar Rank 10 quando ataca.'
        : rank === 2 ? 'Pode avançar em linha reta por várias casas livres.'
          : rank === 3 ? 'Pode desarmar Armadilhas.'
            : rank === 10 ? 'Maior patente normal; vulnerável ao ataque do Rank 1.'
              : 'Move uma casa por vez; patente maior vence o combate normal.';
      text.textContent = `RANK ${rank} · ${FACTIONS[faction].names[role]} — ${rule}`;
      card.append(image, text);
      list.appendChild(card);
    }
    for (const [role, rule] of [['trap', 'Elimina atacantes, exceto quando desarmada pelo Rank 3.'],
      ['objective', 'Se capturado, encerra a partida.']]) {
      const card = document.createElement('div');
      card.className = 'tutorial-guide-piece';
      const image = document.createElement('img');
      image.src = `assets/${faction}/${FACTIONS[faction].images[role]}`;
      image.alt = FACTIONS[faction].names[role];
      const text = document.createElement('p');
      text.textContent = `${role === 'trap' ? 'ARMADILHA' : 'OBJETIVO'} · ${FACTIONS[faction].names[role]} — ${rule}`;
      card.append(image, text);
      list.appendChild(card);
    }
    guideOverlay.classList.remove('hidden');
  }

  byId('training-entry').addEventListener('click', start);
  byId('tutorial-exit').addEventListener('click', exit);
  byId('tutorial-continue').addEventListener('click', () => { if (lesson === 3) enter(4, true); });
  byId('tutorial-guide').addEventListener('click', openGuide);
  byId('tutorial-guide-close').addEventListener('click', () => guideOverlay.classList.add('hidden'));
  window.dominiusTutorial = { start, exit, handleCellClick, onActionComplete, get lesson() { return lesson; } };
})();
