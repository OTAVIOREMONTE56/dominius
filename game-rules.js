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
    color: '#2868b2',
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
      objective: 'objetivo.png',
      trap: 'armadilha.png',
      rank10: 'cesar.png',
      rank9: 'rank-9.png',
      rank8: 'rank-8.png',
      rank7: 'rank-7.png',
      rank6: 'rank-6.png',
      rank5: 'rank-5.png',
      rank4: 'rank-4.png',
      rank3: 'rank-3.png',
      rank2: 'rank-2.png',
      rank1: 'rank-1.png',
    },
  },
  orcs: {
    label: 'Orcs',
    color: '#b33240',
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
    color: '#299563',
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
    color: '#df812f',
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
    color: '#d6ad38',
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

function buildPlayers() {
  const factionKeys = [els.faction1.value, els.faction2.value];

  state.players = factionKeys.map((factionKey, playerIndex) => {
    const faction = FACTIONS[factionKey];
    const pieces = [];

    Object.entries(PIECE_COUNTS).forEach(([roleKey, count]) => {
      for (let index = 0; index < count; index += 1) {
        const config = PIECE_CONFIG[roleKey];
        const fileName = factionKey === 'romanos' ? faction.images?.[roleKey] || '' : '';

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
