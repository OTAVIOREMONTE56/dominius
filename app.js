const state = {
  phase: 'setup-player-1',
  started: false,
  currentTurn: 0,
  selectedPiece: null,
  validMoves: [],
  players: [],
  board: [],
  log: INITIAL_LOG.map((text) => ({ text, type: '' })),
  winner: null,
  loser: null,
  readyPlayers: [false, false],
  transitionVisible: false,
  battleStarted: false,
  combatReveal: null,
  gameMode: 'pvp',
  botDifficulty: 'normal',
  botThinking: false,
  botTimer: null,
  botAnimation: null,
};

const els = {
  startScreen: document.getElementById('start-screen'),
  gameScreen: document.getElementById('game-screen'),
  turnLabel: document.getElementById('turn-label'),
  playersSummary: document.getElementById('players-summary'),
  board: document.getElementById('board'),
  pieceInfo: document.getElementById('piece-info'),
  lostPieces: document.getElementById('lost-pieces'),
  battleLog: document.getElementById('battle-log'),
  startBtn: document.getElementById('start-btn'),
  restartBtn: document.getElementById('restart-btn'),
  randomizeBtn: document.getElementById('randomize-btn'),
  confirmArmyBtn: document.getElementById('confirm-army-btn'),
  faction1: document.getElementById('faction-1'),
  faction2: document.getElementById('faction-2'),
  gameMode: document.getElementById('game-mode'),
  botDifficulty: document.getElementById('bot-difficulty'),
  setupControls: document.getElementById('setup-controls'),
  transitionScreen: document.getElementById('transition-screen'),
  continueBtn: document.getElementById('continue-btn'),
  audioToggle: document.getElementById('audio-toggle'),
  testAudioBtn: document.getElementById('test-audio-btn'),
  ambientVolume: document.getElementById('ambient-volume'),
  effectsVolume: document.getElementById('effects-volume'),
  audioStatus: document.getElementById('audio-status'),
  endScreen: document.getElementById('end-screen'),
  endScreenTitle: document.getElementById('end-screen-title'),
  endScreenSubtitle: document.getElementById('end-screen-subtitle'),
  endScreenImage: document.getElementById('end-screen-image'),
  playAgainBtn: document.getElementById('play-again-btn'),
  menuBtn: document.getElementById('menu-btn'),
};

function initSelectors() {
  FactionOrder.forEach((key) => {
    const option1 = document.createElement('option');
    option1.value = key;
    option1.textContent = FACTIONS[key].label;

    const option2 = document.createElement('option');
    option2.value = key;
    option2.textContent = FACTIONS[key].label;

    els.faction1.appendChild(option1);
    els.faction2.appendChild(option2);
  });

  els.faction1.value = 'romanos';
  els.faction2.value = 'orcs';
  els.gameMode.value = 'pvp';
  els.botDifficulty.value = 'normal';
}







function addLog(text, type = '') {
  state.log.unshift({ text, type });
  state.log = state.log.slice(0, 10);
}

function renderLog() {
  if (!els.battleLog) return;
  els.battleLog.innerHTML = '';

  state.log.forEach((entry) => {
    const item = document.createElement('div');
    item.className = `log-entry ${entry.type}`;
    item.textContent = entry.text;
    els.battleLog.appendChild(item);
  });
}

function getSetupPlayerIndex() {
  return state.phase === 'setup-player-2' ? 1 : 0;
}

function isSetupPhase() {
  return state.phase === 'setup-player-1' || state.phase === 'setup-player-2';
}

function getActivePlayerIndex() {
  return isSetupPhase() ? getSetupPlayerIndex() : state.currentTurn;
}

function getAvailableSetupCells(playerIndex) {
  return SETUP_ROWS[playerIndex].flatMap((row) =>
    Array.from({ length: BOARD_SIZE }, (_, column) => ({ x: column, y: row }))
  ).filter(({ x, y }) => !state.board[y][x].blocked);
}

const factionCrestSelectors = {
  romanos: '.realm-roman svg', orcs: '.realm-orc svg', elfos: '.realm-elf svg',
  anoes: '.realm-dwarf svg', egipcios: '.realm-egypt svg',
};
const factionStandardImages = {
  romanos: 'assets/faccoes/romanos.png', orcs: 'assets/faccoes/orcs.png',
  elfos: 'assets/faccoes/elfos.png', anoes: 'assets/faccoes/anoes.png',
  egipcios: 'assets/faccoes/egipcios.png',
};

function factionCrest(factionKey) {
  const art = document.createElement('span');
  art.className = 'faction-standard-art';
  const image = document.createElement('img');
  image.className = 'faction-standard-image';
  image.alt = '';
  image.decoding = 'async';
  const fallback = document.querySelector(factionCrestSelectors[factionKey])?.cloneNode(true);
  if (fallback) {
    fallback.classList.add('faction-crest-icon', 'faction-standard-fallback');
    fallback.setAttribute('aria-hidden', 'true');
    fallback.setAttribute('focusable', 'false');
    fallback.style.display = 'none';
    image.addEventListener('error', () => {
      image.style.display = 'none';
      fallback.style.display = 'block';
    }, { once: true });
  }
  art.appendChild(image);
  if (fallback) art.appendChild(fallback);
  image.src = factionStandardImages[factionKey];
  return art;
}

let renderedPlayersSummary = null;
function renderPlayersSummary() {
  const signature = JSON.stringify([state.phase, state.currentTurn,
    state.players.map(player => [player.faction, player.name, player.ready, player.lostPieces.length])]);
  if (renderedPlayersSummary === signature && els.playersSummary.children.length === state.players.length) return;
  const previousCardFactions = [...els.playersSummary.querySelectorAll('.player-card')]
    .map(card => card.dataset.faction);
  els.playersSummary.innerHTML = '';

  state.players.forEach((player, index) => {
    const faction = FACTIONS[player.faction];
    const activePlayerIndex = isSetupPhase() ? getSetupPlayerIndex() : state.currentTurn;
    // A preparação online oculta o exército rival, mas ele começa com 40 peças.
    const lost = player.lostPieces.length;
    const remaining = PIECES_PER_PLAYER - lost;
    const banner = document.querySelectorAll('.player-banner')[index];
    if (banner) {
      const factionChanged = banner.dataset.faction !== player.faction;
      banner.dataset.faction = player.faction;
      banner.style.setProperty('--commander-color', faction.color);
      banner.querySelector('.banner-kicker').textContent = player.name;
      banner.querySelector('.banner-counter').textContent = `${remaining} / ${PIECES_PER_PLAYER}`;
      banner.querySelector('.banner-name').textContent = faction.label;
      const bannerCrest = banner.querySelector('.banner-crest');
      if (factionChanged || !bannerCrest.querySelector('.faction-standard-image')) {
        bannerCrest.replaceChildren(factionCrest(player.faction));
        bannerCrest.classList.remove('crest-arrive');
        void bannerCrest.offsetWidth;
        bannerCrest.classList.add('crest-arrive');
      }
    }

    const card = document.createElement('div');
    card.className = `player-card ${index === activePlayerIndex ? 'active' : ''}`;
    card.dataset.faction = player.faction;
    card.style.setProperty('--commander-color', faction.color);

    const html = `
      <div class="player-card-header">
        <span class="player-card-emblem" aria-hidden="true"></span>
        <span class="player-card-identity"><strong>${player.name}</strong><span class="faction-tag">${faction.label}</span></span>
      </div>
      <ul>
        <li><span>Peças</span><strong>${remaining} / ${PIECES_PER_PLAYER}</strong></li>
        <li><span>Perdidas</span><strong>${lost}</strong></li>
        <li><span>Status</span><strong>${player.ready ? 'Confirmado' : 'Preparando'}</strong></li>
      </ul>
    `;

    card.innerHTML = html;
    const cardCrest = factionCrest(player.faction);
    const cardEmblem = card.querySelector('.player-card-emblem');
    cardEmblem.appendChild(cardCrest);
    if (previousCardFactions[index] !== player.faction) cardEmblem.classList.add('crest-arrive');
    els.playersSummary.appendChild(card);
  });
  renderedPlayersSummary = signature;
}

let renderedLostPieces = null;
function renderLostPieces() {
  if (!els.lostPieces) {
    return;
  }
  const signature = JSON.stringify(state.players.map(player => [player.faction,
    player.lostPieces.map(piece => [piece.roleKey, piece.name, piece.label])]));
  if (renderedLostPieces === signature && els.lostPieces.children.length === state.players.length) return;

  els.lostPieces.innerHTML = '';

  state.players.forEach((player) => {
    const section = document.createElement('div');
    section.className = 'lost-player-group';

    const header = document.createElement('div');
    header.className = 'lost-player-header';
    header.innerHTML = `
      <span class="faction-tag">
        <span class="faction-badge" style="background:${FACTIONS[player.faction].color}"></span>
        ${FACTIONS[player.faction].label}
      </span>
      <strong>${player.lostPieces.length}</strong>
    `;

    const list = document.createElement('ul');
    list.className = 'lost-piece-list';

    const groups = new Map();
    for (const piece of player.lostPieces) {
      const name = FACTIONS[player.faction].names[piece.roleKey] || piece.name || piece.label;
      groups.set(name, (groups.get(name) || 0) + 1);
    }
    for (const [name, count] of groups) {
      const item = document.createElement('li');
      item.textContent = `${name} x${count}`;
      list.appendChild(item);
    }
    if (!groups.size) {
      const item = document.createElement('li');
      item.className = 'empty';item.textContent = 'Nenhuma peça perdida';
      list.appendChild(item);
    }

    section.appendChild(header);
    section.appendChild(list);
    els.lostPieces.appendChild(section);
  });
  renderedLostPieces = signature;
}

function renderTurnLabel() {
  if (state.winner !== null) {
    const currentPlayer = state.players[state.winner];
    const faction = FACTIONS[currentPlayer.faction];
    els.turnLabel.textContent = `Vitória de ${currentPlayer.name} · ${faction.label}`;
    return;
  }

  if (state.botThinking && state.gameMode === 'bot' && state.currentTurn === 1) {
    els.turnLabel.textContent = 'BOT pensando...';
    return;
  }

  if (state.phase === 'setup-player-1') {
    els.turnLabel.textContent = 'Preparação do Jogador 1';
    return;
  }

  if (state.phase === 'setup-player-2') {
    els.turnLabel.textContent = state.gameMode === 'bot' ? 'Preparação do BOT' : 'Preparação do Jogador 2';
    return;
  }

  const currentPlayer = state.players[state.currentTurn];
  const faction = FACTIONS[currentPlayer.faction];
  els.turnLabel.textContent = `Turno do ${currentPlayer.name} · ${faction.label}`;
}

function renderSetupControls() {
  const showSetup = isSetupPhase();
  els.setupControls.classList.toggle('hidden', !showSetup);
  els.confirmArmyBtn.textContent = state.phase === 'setup-player-2' ? 'Confirmar Exército' : 'Confirmar Exército';
}

function renderTransitionScreen() {
  els.transitionScreen.classList.toggle('hidden', !state.transitionVisible);
}

function isCombatRevealed(piece) {
  if (!piece || !state.combatReveal) {
    return false;
  }

  return state.combatReveal.attackerId === piece.id || state.combatReveal.defenderId === piece.id;
}

function getVisiblePieceForCell(cellPiece) {
  if (window.dominiusMultiplayer?.active) return cellPiece?.playerIndex === window.dominiusMultiplayer.seat;
  if (!cellPiece) {
    return false;
  }

  if (state.gameMode === 'bot') {
    return cellPiece.playerIndex === 0 || isCombatRevealed(cellPiece);
  }

  const activePlayerIndex = getActivePlayerIndex();

  if (state.phase === 'battle') {
    return cellPiece.playerIndex === activePlayerIndex || isCombatRevealed(cellPiece);
  }

  return cellPiece.playerIndex === getSetupPlayerIndex();
}

// Ícones de apresentação. Só renderizados para peças cuja identidade está visível.
function medalIcon(piece) {
  const icons = {
    objective: '<path d="M8 27h24M11 25V10l7 6 6-10 6 10V25Z"/>',
    trap: '<path d="m9 10 22 22M31 10 9 32M10 7v8H6m24-8v8h4M8 27l5 5m14-5 5 5"/><circle cx="20" cy="21" r="5"/>',
    crown: '<path d="m7 12 7 6 6-10 6 10 7-6-4 17H11ZM11 33h18"/>',
    sword: '<path d="m27 5 5 2-1 6-15 15-4-4ZM8 22l12 12M8 32l5-5M5 35l3-3"/>',
    shield: '<path d="m20 5 13 5v11c0 7-8 12-13 15C15 33 7 28 7 21V10ZM20 10v19M13 16h14"/>',
    scout: '<path d="M12 5c19 8 19 22 0 30l6-15ZM6 20h28m-5-5 5 5-5 5"/>',
    spy: '<path d="M5 20s6-10 15-10 15 10 15 10-6 10-15 10S5 20 5 20Z"/><circle cx="20" cy="20" r="5"/>',
  };
  const kind = piece.isObjective ? 'objective' : piece.isTrap ? 'trap'
    : piece.rank >= 9 ? 'crown' : piece.rank === 2 ? 'scout' : piece.rank === 1 ? 'spy'
    : piece.rank >= 6 ? 'sword' : 'shield';
  return `<svg class="medal-symbol" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[kind]}</svg>`;
}

const boardCells = new Map();
const boardSnapshots = new Map();
let boardReversed = null;

function renderBoard() {
  if (visualMotion.freeze) return;
  if (!state.board || state.board.length === 0) {
    els.board.replaceChildren();
    boardCells.clear();
    boardSnapshots.clear();
    boardReversed = null;
    return;
  }

  const reversed = state.gameMode === 'bot'
    || (state.gameMode === 'online' && window.dominiusMultiplayer?.seat === 0);
  const rebuild = els.board.children.length !== BOARD_SIZE * BOARD_SIZE
    || boardCells.size !== BOARD_SIZE * BOARD_SIZE || boardReversed !== reversed;
  const validMoves = new Map(state.validMoves.map(move => [`${move.x},${move.y}`, move]));
  const dirty = [];
  const rowIndexes = Array.from({ length: BOARD_SIZE }, (_, index) => reversed ? BOARD_SIZE - 1 - index : index);
  rowIndexes.forEach(rowIndex => state.board[rowIndex].forEach(cell => {
    const piece = cell.piece;
    const selected = state.selectedPiece?.x === cell.x && state.selectedPiece?.y === cell.y;
    const validMove = validMoves.get(`${cell.x},${cell.y}`);
    const origin = state.botAnimation?.origin?.x === cell.x && state.botAnimation?.origin?.y === cell.y;
    const destination = state.botAnimation?.destination?.x === cell.x && state.botAnimation?.destination?.y === cell.y;
    const hidden = piece && !getVisiblePieceForCell(piece) && (state.winner === null || state.gameMode === 'online');
    const signature = JSON.stringify([cell.blocked, selected, validMove?.type, origin, destination,
      piece?.id, piece?.playerIndex, piece?.factionKey, piece?.roleKey, piece?.rank,
      piece?.short, piece?.label, piece?.name, piece?.image, piece?.isTrap, piece?.isObjective,
      piece && state.players[piece.playerIndex]?.faction, hidden]);
    const key = `${cell.x},${cell.y}`;
    if (rebuild || boardSnapshots.get(key) !== signature) dirty.push({ cell, key, signature, selected, validMove, origin, destination });
  }));

  const reusableArtwork = new Map();
  const oldCells = rebuild ? Array.from(els.board.children) : dirty.map(({ key }) => boardCells.get(key)).filter(Boolean);
  oldCells.forEach(cellEl => cellEl.querySelectorAll('img.piece-art').forEach(image => {
    const path = image.getAttribute('src');
    if (!reusableArtwork.has(path)) reusableArtwork.set(path, []);
    reusableArtwork.get(path).push(image);
  }));
  if (rebuild) {
    els.board.replaceChildren();
    boardCells.clear();
    boardSnapshots.clear();
    boardReversed = reversed;
  }
  const fragment = rebuild ? document.createDocumentFragment() : null;
  dirty.forEach(({ cell, key, signature, selected, validMove, origin, destination }) => {
      const cellEl = boardCells.get(key) || document.createElement('button');
      if (!boardCells.has(key)) cellEl.type = 'button';
      cellEl.className = 'cell';
      cellEl.dataset.x = String(cell.x);
      cellEl.dataset.y = String(cell.y);
      cellEl.replaceChildren();

      if (cell.blocked) {
        cellEl.classList.add('blocked');
      }

      if (selected) {
        cellEl.classList.add('selected');
      }

      if (validMove) {
        cellEl.classList.add('valid-move');

        if (validMove.type === 'attack') {
          cellEl.classList.add('attack-move');
        }
      }

      if (origin) {
        cellEl.classList.add('bot-origin');
      }

      if (destination) {
        cellEl.classList.add('bot-destination');
      }

      if (cell.piece) {
        const pieceEl = document.createElement('div');
        const isSelected = state.selectedPiece && state.selectedPiece.x === cell.x && state.selectedPiece.y === cell.y;
        pieceEl.className = `piece${isSelected ? ' selected-piece' : ''}`;
        pieceEl.dataset.faction = cell.piece.factionKey || state.players[cell.piece.playerIndex].faction;

        if (!getVisiblePieceForCell(cell.piece) && (state.winner === null || state.gameMode === 'online')) {
          pieceEl.classList.add('hidden-piece');
          pieceEl.style.removeProperty('--piece-image');
          pieceEl.innerHTML = '<span class="piece-name">?</span>';
        } else {
          // Atributo apenas visual; nunca revela o tipo das peças ocultas.
          pieceEl.dataset.kind = cell.piece.isObjective ? 'objective' : cell.piece.isTrap ? 'trap' : 'warrior';
          pieceEl.setAttribute('aria-label', cell.piece.name);
          pieceEl.title = cell.piece.name;
          const portraitImage = FACTIONS[pieceEl.dataset.faction]?.images[cell.piece.roleKey];

          if (portraitImage) {
            pieceEl.classList.add('faction-portrait');
            pieceEl.dataset.role = cell.piece.roleKey;
            if (pieceEl.dataset.faction === 'romanos') pieceEl.classList.add('roman-portrait');
            if (pieceEl.dataset.faction === 'romanos' && cell.piece.roleKey === 'rank10') pieceEl.classList.add('roman-rank10');
            pieceEl.style.removeProperty('--piece-image');
            pieceEl.innerHTML = cell.piece.isTrap || cell.piece.isObjective ? '' : `
              <span class="faction-rank-badge roman-rank-badge" aria-hidden="true">
                ${cell.piece.short}
              </span>
            `;
            // Elemento real, criado somente depois da verificação de visibilidade.
            const imagePath = `assets/${pieceEl.dataset.faction}/${portraitImage}`;
            const artwork = reusableArtwork.get(imagePath)?.pop() || document.createElement('img');
            artwork.className = 'piece-art';
            if (artwork.getAttribute('src') !== imagePath) artwork.src = imagePath;
            artwork.decoding = 'async';
            artwork.alt = cell.piece.name;
            artwork.draggable = false;
            const portraitViewport = document.createElement('span');
            portraitViewport.className = 'piece-art-viewport';
            portraitViewport.appendChild(artwork);
            pieceEl.prepend(portraitViewport);
          } else {
            pieceEl.style.setProperty('--piece-image', cell.piece.image ? `url("${cell.piece.image}")` : 'none');
            pieceEl.innerHTML = `
              ${medalIcon(cell.piece)}
              <span class="piece-name">
                ${cell.piece.short}
                <span class="piece-role">${cell.piece.label}</span>
              </span>
            `;
          }
        }

        cellEl.appendChild(pieceEl);
      }

      if (!boardCells.has(key)) {
        cellEl.addEventListener('click', () => handleCellClick(cell.x, cell.y));
        boardCells.set(key, cellEl);
        fragment.appendChild(cellEl);
      }
      boardSnapshots.set(key, signature);
  });
  if (fragment) els.board.appendChild(fragment);
}

function renderPieceInfo() {
  if (!state.selectedPiece) {
    els.pieceInfo.innerHTML = `
      <div class="info-card">
        <h3>Nenhuma peça selecionada</h3>
        <p>Escolha uma peça do exército ativo para ver detalhes, movimentos válidos e capacidades.</p>
      </div>
    `;
    return;
  }

  const player = state.players[state.selectedPiece.playerIndex];
  const pieceTexts = [
    { label: 'Facção', value: FACTIONS[player.faction].label },
    { label: 'Função', value: state.selectedPiece.label },
    { label: 'Força', value: state.selectedPiece.rank },
    { label: 'Posição', value: `${state.selectedPiece.x + 1}, ${state.selectedPiece.y + 1}` },
  ];

  const previewFile = FACTIONS[player.faction]?.images[state.selectedPiece.roleKey];
  const previewImage = previewFile ? `assets/${player.faction}/${previewFile}` : state.selectedPiece.image;
  const piecePreviewMarkup = previewImage
    ? `
        <div class="piece-preview">
          <img src="${previewImage}" alt="${state.selectedPiece.name}" decoding="async" />
        </div>
      `
    : '';

  els.pieceInfo.innerHTML = `
    <div class="info-card">
      <h3>${state.selectedPiece.name}</h3>
      ${piecePreviewMarkup}
      <div class="info-grid">
        ${pieceTexts
          .map(
            (item) => `
              <div>
                <span>${item.label}</span><br>
                <strong>${item.value}</strong>
              </div>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderAudioHud() {
  if (!els.audioToggle || !els.ambientVolume || !els.effectsVolume) {
    return;
  }

  const audioState = window.audioManager?.getState?.() || { enabled: true, ambientVolume: 0.25, effectsVolume: 0.8 };

  els.audioToggle.textContent = `Som: ${audioState.enabled ? 'Ligado' : 'Desligado'}`;
  els.ambientVolume.value = String(audioState.ambientVolume);
  els.effectsVolume.value = String(audioState.effectsVolume);
}

function showAudioStatus(message, isError = false, duration = 2000) {
  if (!els.audioStatus) {
    return;
  }

  els.audioStatus.textContent = message;
  els.audioStatus.classList.toggle('error', isError);

  window.clearTimeout(showAudioStatus.timeoutId);
  if (duration === 0) return;
  showAudioStatus.timeoutId = window.setTimeout(() => {
    els.audioStatus.textContent = '';
    els.audioStatus.classList.remove('error');
  }, duration);
}

function renderEndScreen() {
  if (!els.endScreen || !els.endScreenTitle || !els.endScreenSubtitle || !els.endScreenImage) {
    return;
  }

  if (state.gameMode === 'tutorial') {
    els.endScreen.classList.add('hidden');
    return;
  }
  const hasWinner = state.winner !== null;
  const winner = hasWinner ? state.players[state.winner] : null;

  if (!hasWinner || !winner || visualMotion.endPending) {
    els.endScreen.classList.add('hidden');
    els.endScreenImage.style.display = 'none';
    els.endScreenImage.removeAttribute('src');
    els.endScreenImage.classList.remove('fallback');
    return;
  }

  const isHumanWinner = state.winner === (window.dominiusMultiplayer?.active ? window.dominiusMultiplayer.seat : 0);
  const title = isHumanWinner ? 'VITÓRIA' : 'DERROTA';
  const imageUrl = isHumanWinner ? 'assets/interface/vitoria.png' : 'assets/interface/derrota.png';

  els.endScreenTitle.textContent = title;
  els.endScreenSubtitle.textContent = `Facção vencedora: ${FACTIONS[winner.faction].label}`;

  els.endScreenImage.classList.add('fallback');
  els.endScreenImage.style.display = 'block';
  els.endScreenImage.src = imageUrl;
  els.endScreenImage.alt = title;

  els.endScreenImage.onerror = () => {
    els.endScreenImage.style.display = 'none';
    els.endScreenImage.classList.add('fallback');
  };

  els.endScreen.classList.remove('hidden');
}

function render() {
  renderTurnLabel();
  renderPlayersSummary();
  renderBoard();
  renderPieceInfo();
  renderLostPieces();
  renderLog();
  renderSetupControls();
  renderTransitionScreen();
  renderAudioHud();
  renderEndScreen();
  fitBoardToViewport();
}

function fitBoardToViewport() {
  if (window.innerWidth <= 760 || els.gameScreen.classList.contains('hidden')) {
    els.gameScreen.style.removeProperty('--board-viewport-limit');
    return;
  }

  const boardTop = els.board.getBoundingClientRect().top + window.scrollY;
  const lostPanel = document.getElementById('lost-pieces-panel');
  const lostSummaryHeight = lostPanel.querySelector('summary').getBoundingClientRect().height;
  if (!boardTop || !lostSummaryHeight) return;

  const shellGap = parseFloat(window.getComputedStyle(els.board.parentElement).gap) || 0;
  const lostMargin = parseFloat(window.getComputedStyle(lostPanel).marginTop) || 0;
  const screenPadding = parseFloat(window.getComputedStyle(els.gameScreen).paddingBottom) || 0;
  const bodyPadding = parseFloat(window.getComputedStyle(document.body).paddingBottom) || 0;
  const available = Math.max(0, Math.floor(window.innerHeight - boardTop
    - lostSummaryHeight - lostMargin - shellGap - screenPadding - bodyPadding - 4));
  els.gameScreen.style.setProperty('--board-viewport-limit', `${available}px`);
}







function getSetupValidMoves(piece) {
  const moves = [];
  const rows = SETUP_ROWS[piece.playerIndex];

  rows.forEach((row) => {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const currentCell = state.board[row][column];
      if (currentCell.blocked) {
        continue;
      }

      if (column === piece.x && row === piece.y) {
        continue;
      }

      moves.push({ x: column, y: row });
    }
  });

  return moves;
}

// Apresentação apenas: regras e mutações continuam nas funções originais.
const visualMotion = {
  busy: false, freeze: false, endPending: false, epoch: 0,
  animations: new Set(), timers: new Map(), controls: [], scene: null, overlays: new Set(),
};
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const visualEffectsEnabled = () => {
  const effects = window.audioManager?.getState?.();
  return effects?.enabled !== false && effects?.effectsVolume !== 0;
};
const cinematicMotion = () => !reducedMotion() && visualEffectsEnabled();
const motionCell = (x, y) => els.board.querySelector(`[data-x="${x}"][data-y="${y}"]`);

function motionPause(ms, epoch) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      visualMotion.timers.delete(timer);
      resolve(epoch === visualMotion.epoch);
    }, cinematicMotion() ? ms : Math.min(ms, 40));
    visualMotion.timers.set(timer, resolve);
  });
}

async function motionTween(element, frames, duration, epoch) {
  if (!element?.animate) return motionPause(duration, epoch);
  const animation = element.animate(frames, {
    duration: cinematicMotion() ? duration : 1,
    easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'forwards',
  });
  visualMotion.animations.add(animation);
  await animation.finished.catch(() => {});
  return epoch === visualMotion.epoch;
}

function clearMotionEffects() {
  visualMotion.scene?.remove();
  visualMotion.scene = null;
  visualMotion.overlays.forEach((overlay) => overlay.remove());
  visualMotion.overlays.clear();
  els.board.classList.remove('motion-battle-zoom');
  visualMotion.animations.forEach((animation) => animation.cancel());
  visualMotion.animations.clear();
  visualMotion.controls.forEach(([control, disabled]) => { control.disabled = disabled; });
  visualMotion.controls = [];
  els.board.classList.remove('motion-busy');
  els.board.removeAttribute('aria-busy');
  // O tabuleiro incremental mantém as casas: limpe os efeitos transitórios
  // que antes desapareciam quando todas elas eram recriadas.
  els.board.querySelectorAll('.cell[class*="motion-"]').forEach(cell => {
    Array.from(cell.classList).filter(name => name.startsWith('motion-'))
      .forEach(name => cell.classList.remove(name));
  });
}

function motionOverlay(element) {
  document.body.appendChild(element);
  visualMotion.overlays.add(element);
  return element;
}

function removeMotionOverlay(element) {
  element?.remove();
  visualMotion.overlays.delete(element);
}

async function playEnemyRevealAnimation(piece, cell, epoch, confirmedCombat = false) {
  if (!visualEffectsEnabled() || !cell || (!confirmedCombat && !cell.querySelector('.hidden-piece'))) return true;
  const bounds = (cell.querySelector('.piece') || cell).getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.className = 'enemy-reveal';
  overlay.dataset.faction = piece.factionKey || state.players[piece.playerIndex]?.faction;
  overlay.style.cssText = `left:${bounds.left}px;top:${bounds.top}px;width:${bounds.width}px;height:${bounds.height}px`;
  overlay.innerHTML = '<span class="reveal-back">?</span>';
  motionOverlay(overlay);
  overlay.classList.add('reveal-flipping');
  if (!await motionPause(300, epoch)) return false;
  overlay.innerHTML = '';
  const image = document.createElement('img');
  image.src = `assets/${overlay.dataset.faction}/${FACTIONS[overlay.dataset.faction].images[piece.roleKey]}`;
  image.alt = '';
  overlay.appendChild(image);
  if (!piece.isTrap && !piece.isObjective) {
    const rank = document.createElement('span');
    rank.className = 'reveal-rank';
    rank.textContent = piece.rank;
    overlay.appendChild(rank);
  }
  overlay.classList.add('reveal-front');
  if (!await motionPause(330, epoch)) return false;
  removeMotionOverlay(overlay);
  return true;
}

async function playTurnIntroAnimation(factionKey, epoch = visualMotion.epoch) {
  if (!visualEffectsEnabled() || !FACTIONS[factionKey]) return;
  const banner = document.createElement('div');
  banner.className = 'motion-turn-banner';
  banner.style.setProperty('--motion-color', FACTIONS[factionKey].color);
  banner.textContent = `TURNO DOS ${FACTIONS[factionKey].label.toUpperCase()}`;
  els.board.parentElement.appendChild(banner);
  visualMotion.overlays.add(banner);
  if (await motionPause(850, epoch)) removeMotionOverlay(banner);
}

async function playBattleStartAnimation(epoch = visualMotion.epoch) {
  if (!visualEffectsEnabled()) return;
  const intro = document.createElement('div');
  intro.className = 'motion-battle-intro';
  intro.innerHTML = '<strong>A BATALHA COMEÇA</strong><span>Que vença o melhor estrategista.</span>';
  els.board.parentElement.appendChild(intro);
  visualMotion.overlays.add(intro);
  els.board.classList.add('motion-battle-zoom');
  if (await motionPause(1250, epoch)) {
    els.board.classList.remove('motion-battle-zoom');
    removeMotionOverlay(intro);
  }
}

function pulseLostPiecesCounter(playerIndex) {
  const panel = document.getElementById('lost-pieces-panel');
  const counter = panel?.open
    ? els.lostPieces?.children[playerIndex]?.querySelector('.lost-player-header strong')
    : panel?.querySelector('summary');
  if (!counter) return;
  counter.style.setProperty('--lost-glow', FACTIONS[state.players[playerIndex]?.faction]?.color || '#eab862');
  counter.classList.remove('motion-lost-pulse');
  void counter.offsetWidth;
  counter.classList.add('motion-lost-pulse');
  window.setTimeout(() => counter.classList.remove('motion-lost-pulse'), 500);
}

async function animateLostPiece(piece, origin, epoch) {
  if (!visualEffectsEnabled() || !origin) return;
  const panel = document.getElementById('lost-pieces-panel');
  const destination = panel?.open
    ? els.lostPieces?.children[piece.playerIndex]?.querySelector('.lost-player-header strong')
    : panel?.querySelector('summary');
  if (!destination) return;
  const from = origin.getBoundingClientRect ? origin.getBoundingClientRect() : origin;
  const to = destination.getBoundingClientRect();
  const image = document.createElement('img');
  image.className = 'motion-lost-portrait';
  image.src = `assets/${piece.factionKey}/${FACTIONS[piece.factionKey].images[piece.roleKey]}`;
  image.alt = '';
  image.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;--lost-x:${to.left + to.width / 2 - from.left - from.width / 2}px;--lost-y:${to.top + to.height / 2 - from.top - from.height / 2}px`;
  motionOverlay(image);
  image.classList.add('motion-lost-flying');
  if (await motionPause(550, epoch)) {
    removeMotionOverlay(image);
    pulseLostPiecesCounter(piece.playerIndex);
  }
}

function cancelVisualMotion() {
  visualMotion.epoch += 1;
  visualMotion.timers.forEach((resolve, timer) => {
    window.clearTimeout(timer);
    resolve(false);
  });
  visualMotion.timers.clear();
  clearMotionEffects();
  visualMotion.busy = visualMotion.freeze = visualMotion.endPending = false;
  window.clearTimeout(state.botTimer);
  state.botTimer = null;
}

async function runVisualMotion(task) {
  if (visualMotion.busy) return;
  const epoch = visualMotion.epoch;
  visualMotion.busy = true;
  visualMotion.controls = [els.randomizeBtn, els.confirmArmyBtn, els.continueBtn]
    .filter(Boolean).map((control) => [control, control.disabled]);
  visualMotion.controls.forEach(([control]) => { control.disabled = true; });
  els.board.classList.add('motion-busy');
  els.board.setAttribute('aria-busy', 'true');
  try {
    await task(epoch);
  } finally {
    if (epoch === visualMotion.epoch) {
      clearMotionEffects();
      visualMotion.busy = visualMotion.freeze = visualMotion.endPending = false;
      render();
    }
  }
}

function motionRoute(piece, x, y) {
  const origin = motionCell(piece.x, piece.y);
  const destination = motionCell(x, y);
  const from = origin.getBoundingClientRect();
  const to = destination.getBoundingClientRect();
  origin.classList.add('motion-origin');
  if (cinematicMotion()) origin.classList.add('motion-dust', `motion-${piece.factionKey}`);
  destination.classList.add('motion-destination', `motion-${piece.factionKey}`);
  return { origin, destination, element: origin.querySelector('.piece'),
    dx: to.left - from.left, dy: to.top - from.top, size: from.width };
}

function combatCaption(attacker, defender, battle) {
  if (battle.captureObjective) return ['OBJETIVO CAPTURADO', 'Vitória'];
  if (defender.isTrap) return attacker.rank === 3
    ? ['ARMADILHA DESATIVADA', `Rank ${attacker.rank} permanece`]
    : ['ARMADILHA ATIVADA', 'Atacante eliminado'];
  if (attacker.rank === 1 && defender.rank === 10) return ['ATAQUE SURPRESA', 'Rank 1 vence'];
  if (battle.outcome === 'tie') return ['EMPATE', 'AMBOS ELIMINADOS'];
  const winner = battle.outcome === 'attacker' ? attacker : defender;
  return ['VITÓRIA', `RANK ${winner.rank}`];
}

function combatPortrait(piece, side) {
  const card = document.createElement('div');
  card.className = `duel-card duel-${side}`;
  card.dataset.faction = piece.factionKey;
  const image = document.createElement('img');
  image.src = `assets/${piece.factionKey}/${FACTIONS[piece.factionKey].images[piece.roleKey]}`;
  image.alt = piece.name;
  const caption = document.createElement('span');
  caption.textContent = `${FACTIONS[piece.factionKey].label} · ${piece.isTrap ? 'Armadilha' : piece.isObjective ? 'Objetivo' : `Rank ${piece.rank}`}`;
  card.append(image, caption);
  return card;
}

async function playCombatScene(attacker, defender, battle, epoch) {
  if (!cinematicMotion()) return;
  visualMotion.scene?.remove();
  const scene = document.createElement('div');
  scene.className = `duel-scene${battle.captureObjective ? ' duel-objective' : ''}`;
  scene.dataset.outcome = battle.outcome;
  scene.dataset.type = battle.captureObjective ? 'objective' : defender.isTrap
    ? (attacker.rank === 3 ? 'disarm' : 'trap')
    : attacker.rank === 1 && defender.rank === 10 ? 'surprise'
      : battle.outcome === 'tie' ? 'tie' : 'combat';
  scene.setAttribute('aria-live', 'polite');
  const stage = document.createElement('div');
  stage.className = 'duel-stage';
  if (!battle.captureObjective) stage.appendChild(combatPortrait(attacker, 'attacker'));
  stage.appendChild(combatPortrait(defender, 'defender'));
  const result = document.createElement('div');
  result.className = 'duel-result';
  const [heading, detail] = combatCaption(attacker, defender, battle);
  const title = document.createElement('strong');
  title.textContent = heading;
  const sub = document.createElement('span');
  sub.textContent = detail;
  result.append(title, sub);
  scene.append(stage, result);
  document.body.appendChild(scene);
  visualMotion.scene = scene;
  if (!await motionPause(260, epoch)) return;
  scene.classList.add('duel-clash');
  if (!await motionPause(battle.captureObjective ? 340 : 520, epoch)) return;
  if (!battle.captureObjective) {
    const attackerCard = stage.querySelector('.duel-attacker');
    const defenderCard = stage.querySelector('.duel-defender');
    if (battle.outcome !== 'attacker') attackerCard?.classList.add('is-defeated');
    if (battle.outcome !== 'defender') defenderCard?.classList.add('is-defeated');
    if (battle.outcome === 'attacker') attackerCard?.classList.add('is-victor');
    if (battle.outcome === 'defender') defenderCard?.classList.add('is-victor');
  }
  scene.classList.add('duel-finished');
  if (!await motionPause(720, epoch)) return;
  scene.classList.add('duel-settle');
  if (!await motionPause(130, epoch)) return;
  scene.classList.add('duel-closing');
  if (!await motionPause(220, epoch)) return;
  scene.remove();
  if (visualMotion.scene === scene) visualMotion.scene = null;
}

window.dominiusVisualizeOnlineAction = (event, players) => {
  if (!event || !visualEffectsEnabled()) return;
  const epoch = visualMotion.epoch;
  if (event.kind === 'move') {
    const destination = motionCell(event.x, event.y);
    if (!destination) return;
    destination.classList.add('motion-destination', 'motion-dust');
    window.setTimeout(() => destination.classList.remove('motion-destination', 'motion-dust'), 460);
    void playTurnIntroAnimation(players[1 - event.seat]?.faction, epoch);
    return;
  }
  if (event.kind !== 'combat') return;
  const attackerFaction = players[event.seat]?.faction;
  const defenderFaction = players[1 - event.seat]?.faction;
  const attackerConfig = PIECE_CONFIG[event.attackerRole];
  const defenderConfig = PIECE_CONFIG[event.defenderRole];
  if (!attackerFaction || !defenderFaction || !attackerConfig || !defenderConfig) return;
  const actor = (factionKey, roleKey, config, playerIndex) => ({
    factionKey, roleKey, rank: config.rank, playerIndex,
    isTrap: Boolean(config.isTrap), isObjective: Boolean(config.isObjective),
    name: FACTIONS[factionKey].names[roleKey],
  });
  const attacker = actor(attackerFaction, event.attackerRole, attackerConfig, event.seat);
  const defender = actor(defenderFaction, event.defenderRole, defenderConfig, 1 - event.seat);
  void (async () => {
    const cell = motionCell(event.x, event.y);
    if (cell && !await playEnemyRevealAnimation(defender, cell, epoch, true)) return;
    await playCombatScene(attacker, defender,
      { outcome: event.outcome, captureObjective: Boolean(event.captureObjective) }, epoch);
    if (epoch !== visualMotion.epoch || event.captureObjective) return;
    const origin = cell?.getBoundingClientRect();
    const lost = [event.outcome !== 'attacker' && attacker,
      event.outcome !== 'defender' && defender].filter(Boolean);
    await Promise.all(lost.map((piece) => animateLostPiece(piece, origin, epoch)));
    if (epoch === visualMotion.epoch && state.winner === null)
      void playTurnIntroAnimation(players[1 - event.seat]?.faction, epoch);
  })();
};

window.dominiusVisualizeOnlineBattleStart = (factionKey) => {
  const epoch = visualMotion.epoch;
  void playBattleStartAnimation(epoch).then(() => {
    if (epoch === visualMotion.epoch) return playTurnIntroAnimation(factionKey, epoch);
  });
};

async function animateCombatPresentation(attacker, defender, epoch) {
  if (!await playEnemyRevealAnimation(defender, motionCell(defender.x, defender.y), epoch)) return;
  state.selectedPiece = null;
  state.validMoves = [];
  state.combatReveal = { attackerId: attacker.id, defenderId: defender.id };
  visualMotion.freeze = false;
  render();
  visualMotion.freeze = true;
  const route = motionRoute(attacker, defender.x, defender.y);
  const target = route.destination.querySelector('.piece');
  const battle = resolveBattle(attacker, defender);
  const distance = Math.hypot(route.dx, route.dy) || 1;
  const lunge = `translate(${route.dx * .82}px, ${route.dy * .82}px) scale(1.08)`;
  if (!await motionTween(route.element, [
    { transform: 'translate(0, 0) scale(1)' },
    { transform: `translate(${-route.dx / distance * route.size * .12}px, ${-route.dy / distance * route.size * .12}px) scale(.97)`, offset: .18 },
    { transform: lunge, offset: 1 },
  ], 240, epoch)) return;

  const disarm = defender.isTrap && attacker.rank === 3;
  route.destination.classList.add(battle.captureObjective ? 'motion-victory'
    : disarm ? 'motion-disarm' : defender.isTrap ? 'motion-explosion' : 'motion-impact');
  // Mesmos efeitos sonoros, agora disparados junto ao impacto visual.
  if (!battle.captureObjective) {
    if (disarm) audioManager?.playDesarme?.();
    else if (defender.isTrap) audioManager?.playExplosao?.();
    else audioManager?.playEspadas?.();
  }
  if (!battle.captureObjective && !await motionTween(target, disarm
    ? [{ opacity: 1 }, { opacity: .75 }, { opacity: 1 }]
    : [{ transform: 'none' }, { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' }, { transform: 'none' }], 140, epoch)) return;
  await playCombatScene(attacker, defender, battle, epoch);
  if (epoch !== visualMotion.epoch) return;

  const fade = (element, transform = 'none') => motionTween(element,
    [{ opacity: 1, transform }, { opacity: 0, transform: `${transform === 'none' ? '' : transform} scale(.78)` }], 360, epoch);
  const effects = [];
  if (battle.outcome !== 'attacker') effects.push(fade(route.element, lunge));
  if (battle.outcome !== 'defender') effects.push(fade(target));
  if (battle.outcome === 'attacker') effects.push(motionTween(route.element,
    [{ transform: lunge }, { transform: `translate(${route.dx}px, ${route.dy}px)` }], 360, epoch));
  await Promise.all(effects);
  if (epoch !== visualMotion.epoch) return;

  const lostOrigins = [
    battle.outcome !== 'attacker' && [attacker, route.element.getBoundingClientRect()],
    battle.outcome !== 'defender' && [defender, target.getBoundingClientRect()],
  ].filter(Boolean);
  state.combatReveal = null;
  applyBattleResult(attacker, defender, battle.outcome);
  addLog(battle.reason, battle.outcome === 'attacker' ? 'success' : 'alert');
  if (battle.captureObjective) {
    visualMotion.endPending = true;
    state.winner = attacker.playerIndex;
    state.loser = attacker.playerIndex === 0 ? 1 : 0;
    state.started = false;
    visualMotion.freeze = false;
    render();
    visualMotion.freeze = true;
    motionCell(attacker.x, attacker.y)?.classList.add('motion-victory');
    if (!await motionPause(700, epoch)) return;
    if (state.winner === 0) audioManager?.playVitoria?.();
    else audioManager?.playDerrota?.();
    if (state.gameMode === 'tutorial') window.dominiusTutorial?.onActionComplete?.();
    return;
  }
  renderLostPieces();
  await Promise.all(lostOrigins.map(([piece, origin]) => animateLostPiece(piece, origin, epoch)));
  if (epoch !== visualMotion.epoch) return;
  if (state.gameMode === 'bot' && state.currentTurn === 1 && !await motionPause(180, epoch)) return;
  finishTurn();
}

function performAnimatedAction(piece, x, y, target = null, bot = false) {
  return runVisualMotion(async (epoch) => {
    state.selectedPiece = null;
    state.validMoves = [];
    if (bot) {
      state.botAnimation = { origin: { x: piece.x, y: piece.y }, destination: null };
      // O tabuleiro já representa esta posição: apenas marque a origem do BOT.
      // Reconstruir as 100 casas aqui bloqueia o primeiro frame da animação.
      els.board.querySelector(`.cell[data-x="${piece.x}"][data-y="${piece.y}"]`)?.classList.add('bot-origin');
      renderTurnLabel();
    } else {
      render();
    }
    visualMotion.freeze = true;
    if (bot && !await motionPause(300, epoch)) return;
    if (target) return animateCombatPresentation(piece, target, epoch);
    const route = motionRoute(piece, x, y);
    if (!await motionTween(route.element, [
      { transform: 'translate(0, 0) scale(1)', offset: 0 },
      { transform: `translate(${-route.dx * .06}px, ${-route.dy * .06}px) scale(.97)`, offset: .12 },
      { transform: `translate(${route.dx * .78}px, ${route.dy * .78}px) scale(1.07)`, offset: .7 },
      { transform: `translate(${route.dx * 1.04}px, ${route.dy * 1.04}px) scale(1.03)`, offset: .9 },
      { transform: `translate(${route.dx}px, ${route.dy}px) scale(1)`, offset: 1 },
    ], 460, epoch)) return;
    route.destination.classList.add('motion-landing');
    if (!await motionPause(35, epoch)) return;
    movePiece(piece, x, y);
    if (bot && !await motionPause(180, epoch)) return;
    finishTurn();
  });
}

function selectPiece(piece) {
  if (!piece || piece.playerIndex !== getActivePlayerIndex()) {
    return;
  }

  state.selectedPiece = piece;
  state.validMoves = isSetupPhase() ? getSetupValidMoves(piece) : getValidMoves(piece);
  render();
}

function finishTurn() {
  if (state.gameMode === 'tutorial') {
    state.selectedPiece = null;
    state.validMoves = [];
    render();
    window.dominiusTutorial?.onActionComplete?.();
    return;
  }
  state.currentTurn = state.currentTurn === 0 ? 1 : 0;
  state.selectedPiece = null;
  state.validMoves = [];
  state.botAnimation = null;

  if (state.gameMode === 'bot' && state.currentTurn === 1 && state.started && state.winner === null) {
    window.clearTimeout(state.botTimer);
    state.botThinking = true;
    state.botTimer = window.setTimeout(() => {
      state.botThinking = false;
      if (window.botAI && typeof window.botAI.takeTurn === 'function') {
        window.botAI.takeTurn();
      }
      // takeTurn inicia a apresentação (ou finishTurn se não houver ação).
      // Evita uma segunda reconstrução síncrona do tabuleiro no mesmo frame.
      renderTurnLabel();
    }, 1500 + Math.random() * 500);
  }

  if (!visualMotion.busy) render();
  void playTurnIntroAnimation(state.players[state.currentTurn].faction);
}

function movePiece(piece, targetX, targetY) {
  const fromX = piece.x;
  const fromY = piece.y;

  state.board[fromY][fromX].piece = null;
  piece.x = targetX;
  piece.y = targetY;
  state.board[targetY][targetX].piece = piece;

  audioManager?.playPassos?.();
  addLog(`${piece.name} moveu-se para ${targetX + 1}, ${targetY + 1}.`, 'success');
}





function shuffleArray(array) {
  const shuffled = [...array];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function randomizeArmy() {
  const playerIndex = getSetupPlayerIndex();
  const player = state.players[playerIndex];
  const cells = shuffleArray(getAvailableSetupCells(playerIndex));

  player.pieces.forEach((piece) => {
    const currentCell = state.board[piece.y]?.[piece.x];
    if (currentCell) {
      currentCell.piece = null;
    }
  });

  player.pieces.forEach((piece, index) => {
    const cell = cells[index];
    piece.x = cell.x;
    piece.y = cell.y;
    piece.setupMoved = true;
    state.board[cell.y][cell.x].piece = piece;
  });

  state.selectedPiece = null;
  state.validMoves = [];
  render();
}

function confirmArmy() {
  const playerIndex = getSetupPlayerIndex();
  const player = state.players[playerIndex];
  player.ready = true;
  state.readyPlayers[playerIndex] = true;
  state.selectedPiece = null;
  state.validMoves = [];

  if (playerIndex === 0) {
    if (state.gameMode === 'bot') {
      state.transitionVisible = false;
      state.phase = 'setup-player-2';
      addLog('Jogador 1 confirmou o exército. O BOT está posicionando o exército...', 'success');

      if (window.botAI && typeof window.botAI.autoPlaceBotArmy === 'function') {
        window.botAI.autoPlaceBotArmy();
      } else {
        randomizeArmy();
      }

      startBattle();
      return;
    }

    state.transitionVisible = true;
    state.phase = 'setup-player-2';
    addLog('Jogador 1 confirmou o exército. Passe o dispositivo para o Jogador 2.', 'success');
    render();
    return;
  }

  startBattle();
}

function continueToNextPlayer() {
  state.transitionVisible = false;
  state.phase = 'setup-player-2';
  state.selectedPiece = null;
  state.validMoves = [];
  render();
}

function startBattle() {
  state.phase = 'battle';
  state.started = true;
  state.battleStarted = true;
  state.currentTurn = 0;
  state.selectedPiece = null;
  state.validMoves = [];
  state.transitionVisible = false;
  state.botThinking = false;
  state.readyPlayers = [true, true];
  state.players.forEach((player) => {
    player.ready = true;
  });
  addLog('A batalha começou. Os exércitos se enfrentam em segredo.', 'success');
  render();
  const firstFaction = state.players[0]?.faction;
  void playBattleStartAnimation().then(() => playTurnIntroAnimation(firstFaction));
}







function resolveCombat(attacker, defender) { return performAnimatedAction(attacker, defender.x, defender.y, defender); }

async function handleSetupCellClick(x, y) {
  const playerIndex = getSetupPlayerIndex();
  const cell = state.board[y]?.[x];
  if (!cell || cell.blocked) {
    return;
  }

  if (!isInsideBoard(x, y) || !SETUP_ROWS[playerIndex].includes(y)) {
    return;
  }

  const clickedPiece = cell.piece;

  if (state.selectedPiece) {
    if (clickedPiece && clickedPiece.playerIndex !== playerIndex) return;
    const piece = state.selectedPiece;
    await runVisualMotion(async (epoch) => {
      visualMotion.freeze = true;
      const routes = [motionRoute(piece, x, y)];
      if (clickedPiece && clickedPiece !== piece) routes.push(motionRoute(clickedPiece, piece.x, piece.y));
      await Promise.all(routes.map((route) => motionTween(route.element,
        [{ transform: 'none' }, { transform: `translate(${route.dx}px, ${route.dy}px)` }], 420, epoch)));
      if (epoch !== visualMotion.epoch) return;
      if (clickedPiece) swapSetupPieces(piece, clickedPiece);
      else moveSetupPiece(piece, x, y);
      state.selectedPiece = null;
      state.validMoves = [];
    });
    return;
  }

  if (clickedPiece && clickedPiece.playerIndex === playerIndex) {
    selectPiece(clickedPiece);
  }
}

function handleBattleCellClick(x, y) {
  if (!state.started || state.winner !== null || state.combatReveal) {
    return;
  }

  if (state.gameMode === 'bot' && state.currentTurn === 1) {
    return;
  }

  const cell = state.board[y]?.[x];
  if (!cell || cell.blocked) {
    return;
  }

  const clickedPiece = cell.piece;

  if (state.selectedPiece) {
    const isValidMove = state.validMoves.some((move) => move.x === x && move.y === y);

    if (!isValidMove) {
      if (clickedPiece && clickedPiece.playerIndex === state.currentTurn) {
        selectPiece(clickedPiece);
      }
      return;
    }

    const piece = state.selectedPiece;

    if (clickedPiece) {
      if (clickedPiece.playerIndex === piece.playerIndex) {
        selectPiece(clickedPiece);
        return;
      }

      resolveCombat(piece, clickedPiece);
      return;
    }

    performAnimatedAction(piece, x, y);
    return;
  }

  if (clickedPiece && clickedPiece.playerIndex === state.currentTurn) {
    selectPiece(clickedPiece);
  }
}

function handleCellClick(x, y) {
  if (state.gameMode === 'tutorial') return window.dominiusTutorial?.handleCellClick(x, y);
  if (window.dominiusMultiplayer?.active) return window.dominiusMultiplayer.click(x, y);
  if (visualMotion.busy) return;
  if (isSetupPhase()) {
    handleSetupCellClick(x, y);
    return;
  }

  handleBattleCellClick(x, y);
}

function startGame() {
  cancelVisualMotion();
  if (window.audioManager?.unlock) {
    window.audioManager.unlock();
  }

  state.gameMode = els.gameMode.value || 'pvp';
  state.botDifficulty = els.botDifficulty.value || 'normal';

  buildPlayers();
  placeInitialArmies();
  state.phase = 'setup-player-1';
  state.started = false;
  state.currentTurn = 0;
  state.selectedPiece = null;
  state.validMoves = [];
  state.winner = null;
  state.readyPlayers = [false, false];
  state.transitionVisible = false;
  state.battleStarted = false;
  state.combatReveal = null;
  state.botThinking = false;
  state.botAnimation = null;
  state.players.forEach((player) => {
    player.ready = false;
  });
  state.log = INITIAL_LOG.map((text) => ({ text, type: '' }));

  els.endScreen.classList.add('hidden');
  els.endScreenImage.classList.remove('fallback');
  els.endScreenImage.style.display = 'none';
  els.endScreenImage.removeAttribute('src');

  audioManager?.playAmbient?.();

  els.startScreen.classList.add('hidden');
  els.gameScreen.classList.remove('hidden');

  render();
}

function restartGame() {
  cancelVisualMotion();
  if (window.audioManager?.unlock) {
    window.audioManager.unlock();
  }

  state.phase = 'setup-player-1';
  state.started = false;
  state.currentTurn = 0;
  state.selectedPiece = null;
  state.validMoves = [];
  state.winner = null;
  state.loser = null;
  state.readyPlayers = [false, false];
  state.transitionVisible = false;
  state.battleStarted = false;
  state.combatReveal = null;
  state.botThinking = false;
  state.botAnimation = null;
  state.players = [];
  state.log = INITIAL_LOG.map((text) => ({ text, type: '' }));

  if (state.botTimer) {
    window.clearTimeout(state.botTimer);
    state.botTimer = null;
  }

  audioManager?.stopAmbient?.();

  els.endScreen.classList.add('hidden');
  els.endScreenImage.classList.remove('fallback');
  els.endScreenImage.style.display = 'none';
  els.endScreenImage.removeAttribute('src');

  els.gameScreen.classList.add('hidden');
  els.startScreen.classList.remove('hidden');
}

els.startBtn.addEventListener('click', startGame);
els.restartBtn.addEventListener('click', restartGame);
els.randomizeBtn.addEventListener('click', randomizeArmy);
els.confirmArmyBtn.addEventListener('click', confirmArmy);
els.continueBtn.addEventListener('click', continueToNextPlayer);
els.playAgainBtn.addEventListener('click', () => {
  els.endScreen.classList.add('hidden');
  startGame();
});
els.menuBtn.addEventListener('click', () => {
  restartGame();
});
els.audioToggle.addEventListener('click', () => {
  if (window.audioManager?.unlock) {
    window.audioManager.unlock();
  }

  const enabled = audioManager?.toggleEnabled?.() ?? true;
  els.audioToggle.textContent = `Som: ${enabled ? 'Ligado' : 'Desligado'}`;
});
els.testAudioBtn.addEventListener('click', async () => {
  const manager = window.audioManager;
  if (!manager) {
    console.error('[DOMINIUS Audio] audioManager.js não foi carregado.');
    showAudioStatus('Gerenciador de áudio indisponível', true);
    return;
  }
  manager.unlock();
  await manager.diagnoseEspadas((diagnostic) => {
    const mediaError = diagnostic.mediaError
      ? `código ${diagnostic.mediaError.code}: ${diagnostic.mediaError.message || '(sem mensagem do navegador)'}`
      : 'nenhum';
    const number = (value) => Number.isFinite(value) ? value.toFixed(2) : String(value);
    const message = [
      `Arquivo: ${diagnostic.path}`,
      `URL tentada: ${diagnostic.src}`,
      `URL selecionada: ${diagnostic.currentSrc || '(ainda não selecionada)'}`,
      `Protocolo: ${diagnostic.protocol}`,
      `Volume aplicado: ${diagnostic.volume}; mute: ${diagnostic.muted}; som ligado: ${diagnostic.enabled}`,
      `play(): ${diagnostic.playResult}`,
      `Erro de play(): ${diagnostic.playError || 'nenhum'}`,
      `Erro de mídia: ${mediaError}`,
      `Carregamento: readyState=${diagnostic.readyState}; networkState=${diagnostic.networkState}`,
      `Suporte MP3: ${diagnostic.support || '(não declarado)'}`,
      `Pausado: ${diagnostic.paused}; tempo: ${number(diagnostic.currentTime)} / ${number(diagnostic.duration)} s`,
      `Evento: ${diagnostic.event}`,
    ].join(' | ');
    showAudioStatus(message, Boolean(diagnostic.playError || diagnostic.mediaError), 0);
  });
});
els.ambientVolume.addEventListener('input', (event) => {
  audioManager?.setAmbientVolume?.(Number(event.target.value));
});
els.effectsVolume.addEventListener('input', (event) => {
  audioManager?.setEffectsVolume?.(Number(event.target.value));
});
window.addEventListener('resize', fitBoardToViewport);
document.fonts?.ready?.then(fitBoardToViewport);

initSelectors();
renderPlayersSummary();
renderLog();
render();

// Menu inicial: somente apresentação e acesso aos seletores existentes.
// startGame, regras, facções e áudio continuam nos fluxos originais.
(() => {
  const preparation = document.getElementById('menu-preparation');
  document.querySelectorAll('[data-menu-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      els.gameMode.value = button.dataset.menuMode;
      preparation.showModal();
    });
  });
  document.getElementById('menu-preparation-close').addEventListener('click', () => preparation.close());
  // O listener original de Jogar inicia a partida; este apenas fecha o diálogo.
  els.startBtn.addEventListener('click', () => preparation.close());
})();
