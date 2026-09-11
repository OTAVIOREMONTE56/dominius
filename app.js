const BOARD_SIZE = 10;
const PIECES_PER_PLAYER = 40;
const SETUP_ROWS = {
  0: [0, 1, 2, 3],
  1: [6, 7, 8, 9],
};

const OBSTACLE_POSITIONS = [
  { x: 2, y: 4 },
  { x: 3, y: 4 },
  { x: 6, y: 4 },
  { x: 7, y: 4 },
  { x: 2, y: 5 },
  { x: 3, y: 5 },
  { x: 6, y: 5 },
  { x: 7, y: 5 },
];

const PIECE_CONFIG = {
  objective: { label: 'Objetivo', short: 'OBJ', rank: 0, canMove: false, isObjective: true, image: '' },
  trap: { label: 'Armadilha', short: 'TRP', rank: 0, canMove: false, isTrap: true, image: '' },
  rank10: { label: 'Rank 10', short: '10', rank: 10, canMove: true, image: '' },
  rank9: { label: 'Rank 9', short: '9', rank: 9, canMove: true, image: '' },
  rank8: { label: 'Rank 8', short: '8', rank: 8, canMove: true, image: '' },
  rank7: { label: 'Rank 7', short: '7', rank: 7, canMove: true, image: '' },
  rank6: { label: 'Rank 6', short: '6', rank: 6, canMove: true, image: '' },
  rank5: { label: 'Rank 5', short: '5', rank: 5, canMove: true, image: '' },
  rank4: { label: 'Rank 4', short: '4', rank: 4, canMove: true, image: '' },
  rank3: { label: 'Rank 3', short: '3', rank: 3, canMove: true, image: '' },
  rank2: { label: 'Rank 2', short: '2', rank: 2, canMove: true, lineMove: true, image: '' },
  rank1: { label: 'Rank 1', short: '1', rank: 1, canMove: true, image: '' },
};

const PIECE_COUNTS = {
  objective: 1,
  trap: 6,
  rank10: 1,
  rank9: 1,
  rank8: 2,
  rank7: 3,
  rank6: 4,
  rank5: 4,
  rank4: 4,
  rank3: 5,
  rank2: 8,
  rank1: 1,
};

const FACTIONS = {
  romanos: {
    label: 'Romanos',
    color: '#5eb5d6',
    names: {
      objective: 'Estandarte Imperial',
      trap: 'Barricada',
      rank10: 'César',
      rank9: 'General',
      rank8: 'Legado',
      rank7: 'Tribuno',
      rank6: 'Centurião',
      rank5: 'Optio',
      rank4: 'Legionário Veterano',
      rank3: 'Legionário',
      rank2: 'Explorador',
      rank1: 'Espião Imperial',
    },
    images: {
      objective: 'estandarte-imperial.png',
      trap: 'barricada.png',
      rank10: 'cesar.png',
      rank9: 'general.png',
      rank8: 'legado.png',
      rank7: 'tribuno.png',
      rank6: 'centuriao.png',
      rank5: 'optio.png',
      rank4: 'legionario-veterano.png',
      rank3: 'legionario.png',
      rank2: 'explorador.png',
      rank1: 'espiao-imperial.png',
    },
  },
  orcs: {
    label: 'Orcs',
    color: '#d6847c',
    names: {
      objective: 'Totem de Guerra',
      trap: 'Armadilha Orc',
      rank10: 'Senhor da Guerra',
      rank9: 'Chefe Orc',
      rank8: 'Campeão Orc',
      rank7: 'Berserker',
      rank6: 'Bruto',
      rank5: 'Guerreiro Orc',
      rank4: 'Saqueador',
      rank3: 'Guerreiro Tribal',
      rank2: 'Rastreador',
      rank1: 'Goblin Infiltrador',
    },
    images: {
      objective: 'totem-de-guerra.png',
      trap: 'armadilha-orc.png',
      rank10: 'senhor-da-guerra.png',
      rank9: 'chefe-orc.png',
      rank8: 'campeao-orc.png',
      rank7: 'berserker.png',
      rank6: 'bruto.png',
      rank5: 'guerreiro-orc.png',
      rank4: 'saqueador.png',
      rank3: 'guerreiro-tribal.png',
      rank2: 'rastreador.png',
      rank1: 'goblin-infiltrador.png',
    },
  },
  elfos: {
    label: 'Elfos',
    color: '#8fd7a6',
    names: {
      objective: 'Árvore Sagrada',
      trap: 'Raízes Encantadas',
      rank10: 'Alto Rei Élfico',
      rank9: 'Lorde Élfico',
      rank8: 'Guardião Real',
      rank7: 'Sentinela',
      rank6: 'Arqueiro Mestre',
      rank5: 'Arqueiro Élfico',
      rank4: 'Patrulheiro',
      rank3: 'Batedor',
      rank2: 'Explorador',
      rank1: 'Sombra Élfica',
    },
    images: {
      objective: 'arvore-sagrada.png',
      trap: 'raizes-encantadas.png',
      rank10: 'alto-rei-elfico.png',
      rank9: 'lorde-elfico.png',
      rank8: 'guardiao-real.png',
      rank7: 'sentinela.png',
      rank6: 'arqueiro-mestre.png',
      rank5: 'arqueiro-elfico.png',
      rank4: 'patrulheiro.png',
      rank3: 'batedor.png',
      rank2: 'explorador.png',
      rank1: 'sombra-elfica.png',
    },
  },
  anoes: {
    label: 'Anões',
    color: '#f0c780',
    names: {
      objective: 'Pedra Ancestral',
      trap: 'Carga Rúnica',
      rank10: 'Rei da Montanha',
      rank9: 'Senhor do Clã',
      rank8: 'Mestre de Guerra',
      rank7: 'Capitão de Ferro',
      rank6: 'Guerreiro Rúnico',
      rank5: 'Guerreiro do Clã',
      rank4: 'Machado de Ferro',
      rank3: 'Guerreiro',
      rank2: 'Batedor',
      rank1: 'Infiltrador',
    },
    images: {
      objective: 'pedra-ancestral.png',
      trap: 'carga-runica.png',
      rank10: 'rei-da-montanha.png',
      rank9: 'senhor-do-cla.png',
      rank8: 'mestre-de-guerra.png',
      rank7: 'capitao-de-ferro.png',
      rank6: 'guerreiro-runico.png',
      rank5: 'guerreiro-do-cla.png',
      rank4: 'machado-de-ferro.png',
      rank3: 'guerreiro.png',
      rank2: 'batedor.png',
      rank1: 'infiltrador.png',
    },
  },
  egipcios: {
    label: 'Egípcios',
    color: '#d0c06d',
    names: {
      objective: 'Olho de Rá',
      trap: 'Maldição',
      rank10: 'Faraó',
      rank9: 'Vizir',
      rank8: 'General Real',
      rank7: 'Comandante',
      rank6: 'Guardião',
      rank5: 'Guerreiro de Rá',
      rank4: 'Soldado Real',
      rank3: 'Soldado do Nilo',
      rank2: 'Explorador do Deserto',
      rank1: 'Sombra do Faraó',
    },
    images: {
      objective: 'olho-de-ra.png',
      trap: 'maldicao.png',
      rank10: 'farao.png',
      rank9: 'vizir.png',
      rank8: 'general-real.png',
      rank7: 'comandante.png',
      rank6: 'guardiao.png',
      rank5: 'guerreiro-de-ra.png',
      rank4: 'soldado-real.png',
      rank3: 'soldado-do-nilo.png',
      rank2: 'explorador-do-deserto.png',
      rank1: 'sombra-do-farao.png',
    },
  },
};

const INITIAL_LOG = [
  'A batalha foi iniciada. Os exércitos se posicionam em segredo.',
  'Peças inimigas são ocultadas até o confronto.',
  'As casas bloqueadas não permitem movimento.',
  'Capture o objetivo secreto do rival para vencer.',
];

const FactionOrder = Object.keys(FACTIONS);

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

function buildPlayers() {
  const factionKeys = [els.faction1.value, els.faction2.value];

  state.players = factionKeys.map((factionKey, playerIndex) => {
    const faction = FACTIONS[factionKey];
    const pieces = [];

    Object.entries(PIECE_COUNTS).forEach(([roleKey, count]) => {
      for (let index = 0; index < count; index += 1) {
        const config = PIECE_CONFIG[roleKey];
        const isCesarPiece = playerIndex === 0 && factionKey === 'romanos' && roleKey === 'rank10';
        const fileName = isCesarPiece ? faction.images?.[roleKey] || '' : '';

        pieces.push({
          id: `${playerIndex}-${roleKey}-${index}`,
          playerIndex,
          factionKey,
          roleKey,
          label: config.label,
          short: config.short,
          name: faction.names[roleKey],
          rank: config.rank,
          power: config.rank,
          image: fileName ? `assets/${factionKey}/${fileName}` : '',
          canMove: config.canMove,
          lineMove: Boolean(config.lineMove),
          isObjective: Boolean(config.isObjective),
          isTrap: Boolean(config.isTrap),
          x: -1,
          y: -1,
          initialX: -1,
          initialY: -1,
          hidden: false,
          revealed: false,
          setupMoved: false,
          lost: false,
        });
      }
    });

    return {
      name: `Jogador ${playerIndex + 1}`,
      faction: factionKey,
      color: faction.color,
      pieces,
      lostPieces: [],
      objective: null,
      ready: false,
    };
  });

  state.players.forEach((player) => {
    player.objective = player.pieces.find((piece) => piece.roleKey === 'objective') || null;
  });
}

function buildInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, (_, y) =>
    Array.from({ length: BOARD_SIZE }, (_, x) => ({
      x,
      y,
      blocked: false,
      piece: null,
    }))
  );

  OBSTACLE_POSITIONS.forEach(({ x, y }) => {
    board[y][x].blocked = true;
  });

  return board;
}

function placeInitialArmies() {
  const board = buildInitialBoard();

  state.players.forEach((player, playerIndex) => {
    const rows = SETUP_ROWS[playerIndex];
    let pieceIndex = 0;

    rows.forEach((row) => {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        const piece = player.pieces[pieceIndex];
        if (!piece) {
          break;
        }

        piece.x = column;
        piece.y = row;
        piece.initialX = column;
        piece.initialY = row;
        piece.setupMoved = false;
        board[row][column].piece = piece;
        pieceIndex += 1;
      }
    });
  });

  state.board = board;
}

function addLog(text, type = '') {
  state.log.unshift({ text, type });
  state.log = state.log.slice(0, 10);
}

function renderLog() {
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

function renderPlayersSummary() {
  els.playersSummary.innerHTML = '';

  state.players.forEach((player, index) => {
    const faction = FACTIONS[player.faction];
    const activePlayerIndex = isSetupPhase() ? getSetupPlayerIndex() : state.currentTurn;
    const remaining = isSetupPhase()
      ? player.pieces.filter((piece) => !piece.setupMoved).length
      : 0;

    const card = document.createElement('div');
    card.className = `player-card ${index === activePlayerIndex ? 'active' : ''}`;

    const html = `
      <div class="player-card-header">
        <strong>${player.name}</strong>
        <span class="faction-tag">
          <span class="faction-badge" style="background:${faction.color}"></span>
          ${faction.label}
        </span>
      </div>
      <ul>
        <li><span>Peças</span><strong>${PIECES_PER_PLAYER} / ${PIECES_PER_PLAYER}</strong></li>
        <li><span>Restantes</span><strong>${isSetupPhase() ? remaining : player.pieces.filter((piece) => !piece.lost).length}</strong></li>
        <li><span>Perdidas</span><strong>${player.lostPieces.length}</strong></li>
        <li><span>Status</span><strong>${player.ready ? 'Confirmado' : 'Preparando'}</strong></li>
      </ul>
    `;

    card.innerHTML = html;
    els.playersSummary.appendChild(card);
  });
}

function renderLostPieces() {
  if (!els.lostPieces) {
    return;
  }

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

    const items = player.lostPieces.length
      ? player.lostPieces.map((piece) => `<li>${piece.short || piece.label} · ${piece.name}</li>`).join('')
      : '<li class="empty">Nenhuma peça perdida</li>';

    list.innerHTML = items;

    section.appendChild(header);
    section.appendChild(list);
    els.lostPieces.appendChild(section);
  });
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

function renderBoard() {
  if (visualMotion.freeze) return;
  els.board.innerHTML = '';

  if (!state.board || state.board.length === 0) {
    return;
  }

  const rowIndexes = state.gameMode === 'bot'
    ? Array.from({ length: BOARD_SIZE }, (_, index) => BOARD_SIZE - 1 - index)
    : Array.from({ length: BOARD_SIZE }, (_, index) => index);

  rowIndexes.forEach((rowIndex) => {
    const row = state.board[rowIndex];

    row.forEach((cell) => {
      const cellEl = document.createElement('button');
      cellEl.type = 'button';
      cellEl.className = 'cell';
      cellEl.dataset.x = String(cell.x);
      cellEl.dataset.y = String(cell.y);

      if (cell.blocked) {
        cellEl.classList.add('blocked');
      }

      if (state.selectedPiece && state.selectedPiece.x === cell.x && state.selectedPiece.y === cell.y) {
        cellEl.classList.add('selected');
      }

      const validMove = state.validMoves.find((move) => move.x === cell.x && move.y === cell.y);

      if (validMove) {
        cellEl.classList.add('valid-move');

        if (validMove.type === 'attack') {
          cellEl.classList.add('attack-move');
        }
      }

      if (state.botAnimation && state.botAnimation.origin && state.botAnimation.origin.x === cell.x && state.botAnimation.origin.y === cell.y) {
        cellEl.classList.add('bot-origin');
      }

      if (state.botAnimation && state.botAnimation.destination && state.botAnimation.destination.x === cell.x && state.botAnimation.destination.y === cell.y) {
        cellEl.classList.add('bot-destination');
      }

      if (cell.piece) {
        const pieceEl = document.createElement('div');
        const isSelected = state.selectedPiece && state.selectedPiece.x === cell.x && state.selectedPiece.y === cell.y;
        pieceEl.className = `piece player-${cell.piece.playerIndex + 1}${isSelected ? ' selected-piece' : ''}`;

        if (!getVisiblePieceForCell(cell.piece) && state.winner === null) {
          pieceEl.classList.add('hidden-piece');
          pieceEl.style.removeProperty('--piece-image');
          pieceEl.innerHTML = '<span class="piece-name">?</span>';
        } else {
          const isRomanCesar = cell.piece.factionKey === 'romanos' && cell.piece.roleKey === 'rank10';

          if (isRomanCesar) {
            pieceEl.classList.add('roman-rank10');
            pieceEl.style.removeProperty('--piece-image');
            pieceEl.innerHTML = `
              <img class="piece-art" src="${cell.piece.image}" alt="${cell.piece.name}" />
              <span class="piece-name" aria-hidden="true">
                ${cell.piece.short}
                <span class="piece-role">${cell.piece.label}</span>
              </span>
            `;
          } else {
            pieceEl.style.setProperty('--piece-image', cell.piece.image ? `url("${cell.piece.image}")` : 'none');
            pieceEl.innerHTML = `
              <span class="piece-name">
                ${cell.piece.short}
                <span class="piece-role">${cell.piece.label}</span>
              </span>
            `;
          }
        }

        cellEl.appendChild(pieceEl);
      }

      cellEl.addEventListener('click', () => handleCellClick(cell.x, cell.y));
      els.board.appendChild(cellEl);
    });
  });
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

  const piecePreviewMarkup = state.selectedPiece.image
    ? `
        <div class="piece-preview">
          <img src="${state.selectedPiece.image}" alt="${state.selectedPiece.name}" />
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

  const hasWinner = state.winner !== null;
  const winner = hasWinner ? state.players[state.winner] : null;

  if (!hasWinner || !winner || visualMotion.endPending) {
    els.endScreen.classList.add('hidden');
    els.endScreenImage.style.display = 'none';
    els.endScreenImage.removeAttribute('src');
    els.endScreenImage.classList.remove('fallback');
    return;
  }

  const isHumanWinner = state.winner === 0;
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
}

function isInsideBoard(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function getValidMoves(piece) {
  if (!piece || piece.isObjective || piece.isTrap) {
    return [];
  }

  if (piece.lineMove) {
    return getLineMoves(piece);
  }

  const moves = [];
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  directions.forEach(([dx, dy]) => {
    const targetX = piece.x + dx;
    const targetY = piece.y + dy;

    if (!isInsideBoard(targetX, targetY)) {
      return;
    }

    const targetCell = state.board[targetY][targetX];
    if (targetCell.blocked) {
      return;
    }

    if (!targetCell.piece) {
      moves.push({ x: targetX, y: targetY, type: 'move' });
      return;
    }

    if (targetCell.piece.playerIndex !== piece.playerIndex) {
      moves.push({ x: targetX, y: targetY, type: 'attack', target: targetCell.piece });
    }
  });

  return moves;
}

function getLineMoves(piece) {
  const moves = [];
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  directions.forEach(([dx, dy]) => {
    let step = 1;

    while (true) {
      const targetX = piece.x + dx * step;
      const targetY = piece.y + dy * step;

      if (!isInsideBoard(targetX, targetY)) {
        break;
      }

      const targetCell = state.board[targetY][targetX];

      if (targetCell.blocked) {
        break;
      }

      if (!targetCell.piece) {
        moves.push({ x: targetX, y: targetY, type: 'move' });
        step += 1;
        continue;
      }

      if (targetCell.piece.playerIndex !== piece.playerIndex) {
        moves.push({ x: targetX, y: targetY, type: 'attack', target: targetCell.piece });
      }

      break;
    }
  });

  return moves;
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
  animations: new Set(), timers: new Map(), controls: [],
};
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const motionCell = (x, y) => els.board.querySelector(`[data-x="${x}"][data-y="${y}"]`);

function motionPause(ms, epoch) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      visualMotion.timers.delete(timer);
      resolve(epoch === visualMotion.epoch);
    }, reducedMotion() ? Math.min(ms, 40) : ms);
    visualMotion.timers.set(timer, resolve);
  });
}

async function motionTween(element, frames, duration, epoch) {
  if (!element?.animate) return motionPause(duration, epoch);
  const animation = element.animate(frames, {
    duration: reducedMotion() ? 1 : duration,
    easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'forwards',
  });
  visualMotion.animations.add(animation);
  await animation.finished.catch(() => {});
  return epoch === visualMotion.epoch;
}

function clearMotionEffects() {
  visualMotion.animations.forEach((animation) => animation.cancel());
  visualMotion.animations.clear();
  visualMotion.controls.forEach(([control, disabled]) => { control.disabled = disabled; });
  visualMotion.controls = [];
  els.board.classList.remove('motion-busy');
  els.board.removeAttribute('aria-busy');
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
  destination.classList.add('motion-destination');
  return { origin, destination, element: origin.querySelector('.piece'),
    dx: to.left - from.left, dy: to.top - from.top, size: from.width };
}

async function animateCombatPresentation(attacker, defender, epoch) {
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
  const lunge = `translate(${route.dx / distance * route.size * .22}px, ${route.dy / distance * route.size * .22}px)`;
  if (!await motionTween(route.element, [{ transform: 'none' }, { transform: lunge }], 180, epoch)) return;

  const disarm = defender.isTrap && attacker.rank === 3;
  route.destination.classList.add(disarm ? 'motion-disarm' : defender.isTrap ? 'motion-explosion' : 'motion-impact');
  // Mesmos efeitos sonoros, agora disparados junto ao impacto visual.
  if (!battle.captureObjective) {
    if (disarm) audioManager?.playDesarme?.();
    else if (defender.isTrap) audioManager?.playExplosao?.();
    else audioManager?.playEspadas?.();
  }
  if (!await motionTween(target, disarm
    ? [{ opacity: 1 }, { opacity: .75 }, { opacity: 1 }]
    : [{ transform: 'none' }, { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' }, { transform: 'none' }], 140, epoch)) return;

  const fade = (element, transform = 'none') => motionTween(element,
    [{ opacity: 1, transform }, { opacity: 0, transform: `${transform === 'none' ? '' : transform} scale(.78)` }], 360, epoch);
  const effects = [];
  if (battle.outcome !== 'attacker') effects.push(fade(route.element, lunge));
  if (battle.outcome !== 'defender') effects.push(fade(target));
  if (battle.outcome === 'attacker') effects.push(motionTween(route.element,
    [{ transform: lunge }, { transform: `translate(${route.dx}px, ${route.dy}px)` }], 360, epoch));
  await Promise.all(effects);
  if (epoch !== visualMotion.epoch) return;

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
    return;
  }
  if (state.gameMode === 'bot' && state.currentTurn === 1 && !await motionPause(180, epoch)) return;
  finishTurn();
}

function performAnimatedAction(piece, x, y, target = null, bot = false) {
  return runVisualMotion(async (epoch) => {
    state.selectedPiece = null;
    state.validMoves = [];
    if (bot) state.botAnimation = { origin: { x: piece.x, y: piece.y }, destination: null };
    render();
    visualMotion.freeze = true;
    if (bot && !await motionPause(300, epoch)) return;
    if (target) return animateCombatPresentation(piece, target, epoch);
    const route = motionRoute(piece, x, y);
    if (!await motionTween(route.element, [{ transform: 'none' },
      { transform: `translate(${route.dx}px, ${route.dy}px)` }], 420, epoch)) return;
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
      render();
    }, 1500 + Math.random() * 500);
  }

  render();
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

function swapSetupPieces(firstPiece, secondPiece) {
  const firstX = firstPiece.x;
  const firstY = firstPiece.y;
  const secondX = secondPiece.x;
  const secondY = secondPiece.y;

  state.board[firstY][firstX].piece = secondPiece;
  state.board[secondY][secondX].piece = firstPiece;

  firstPiece.x = secondX;
  firstPiece.y = secondY;
  secondPiece.x = firstX;
  secondPiece.y = firstY;

  firstPiece.setupMoved = true;
  secondPiece.setupMoved = true;
}

function moveSetupPiece(piece, targetX, targetY) {
  const fromX = piece.x;
  const fromY = piece.y;

  state.board[fromY][fromX].piece = null;
  piece.x = targetX;
  piece.y = targetY;
  state.board[targetY][targetX].piece = piece;
  piece.setupMoved = true;
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
}

function resolveBattle(attacker, defender) {
  const attackerRank = attacker.rank;
  const defenderRank = defender.rank;

  if (defender.isObjective) {
    return {
      outcome: 'attacker',
      reason: `${attacker.name} capturou o objetivo ${defender.name}.`,
      captureObjective: true,
    };
  }

  if (defender.isTrap) {
    if (attackerRank === 3) {
      return {
        outcome: 'attacker',
        reason: `${attacker.name} derrotou a armadilha ${defender.name}.`,
        captureObjective: false,
      };
    }

    return {
      outcome: 'defender',
      reason: `${defender.name} derrubou ${attacker.name}.`,
      captureObjective: false,
    };
  }

  if (attackerRank === 1 && defenderRank === 10) {
    return {
      outcome: 'attacker',
      reason: `${attacker.name} aproveitou a vantagem especial para derrotar ${defender.name}.`,
      captureObjective: false,
    };
  }

  if (attackerRank === defenderRank) {
    return {
      outcome: 'tie',
      reason: `${attacker.name} e ${defender.name} se anularam em empate.`,
      captureObjective: false,
    };
  }

  return attackerRank > defenderRank
    ? {
        outcome: 'attacker',
        reason: `${attacker.name} venceu ${defender.name} (${attackerRank} x ${defenderRank}).`,
        captureObjective: false,
      }
    : {
        outcome: 'defender',
        reason: `${defender.name} venceu ${attacker.name} (${defenderRank} x ${attackerRank}).`,
        captureObjective: false,
      };
}

function registerLostPiece(piece) {
  if (!piece || piece.lost) {
    return;
  }

  piece.lost = true;
  piece.x = -1;
  piece.y = -1;

  const player = state.players[piece.playerIndex];
  if (player) {
    player.lostPieces.push(piece);
  }
}

function applyBattleResult(attacker, defender, outcome) {
  const attackerFromX = attacker.x;
  const attackerFromY = attacker.y;
  const defenderX = defender.x;
  const defenderY = defender.y;

  state.board[attackerFromY][attackerFromX].piece = null;

  if (outcome === 'attacker') {
    attacker.x = defenderX;
    attacker.y = defenderY;
    state.board[defenderY][defenderX].piece = attacker;
    registerLostPiece(defender);
    return;
  }

  if (outcome === 'tie') {
    registerLostPiece(attacker);
    registerLostPiece(defender);
    state.board[defenderY][defenderX].piece = null;
    return;
  }

  registerLostPiece(attacker);
  state.board[defenderY][defenderX].piece = defender;
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