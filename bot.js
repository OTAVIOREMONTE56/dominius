(function () {
  const BOT_AI = {
    takeTurn() {
      if (!state || !state.players || state.gameMode !== 'bot' || state.currentTurn !== 1 || state.winner !== null || visualMotion.busy) {
        return;
      }

      const actions = getBotActions();

      if (!actions.length) {
        state.botThinking = false;
        finishTurn();
        return;
      }

      const action = chooseBotAction(actions);

      if (!action) {
        state.botThinking = false;
        finishTurn();
        return;
      }

      state.botThinking = false;
      state.selectedPiece = null;
      state.validMoves = [];
      return performAnimatedAction(action.piece, action.move.x, action.move.y,
        action.move.type === 'attack' ? action.target : null, true);
    },

    autoPlaceBotArmy() {
      if (!state || !state.players || !state.players[1]) {
        return;
      }

      randomizeArmy();
      render();
    },
  };

  function getBotActions() {
    const botPlayer = state.players?.[1];

    if (!botPlayer) {
      return [];
    }

    const actions = [];

    botPlayer.pieces.forEach((piece) => {
      if (piece.lost || piece.x < 0 || piece.y < 0 || piece.isObjective || piece.isTrap) {
        return;
      }

      const moves = typeof getValidMoves === 'function' ? getValidMoves(piece) : [];

      moves.forEach((move) => {
        const target = state.board?.[move.y]?.[move.x]?.piece || null;
        actions.push({
          piece,
          move,
          target,
          score: scoreAction(piece, move, target),
        });
      });
    });

    return actions;
  }

  function scoreAction(piece, move, target) {
    const boardCenterBias = 12 - (Math.abs(4 - move.x) + Math.abs(4 - move.y));
    let score = boardCenterBias * 3;

    if (move.type === 'attack' && target) {
      if (target.isObjective) {
        score += 10000;
      }

      if (target.isTrap) {
        score += piece.rank === 3 ? 4000 : 1500;
      }

      const rankDelta = piece.rank - target.rank;
      score += rankDelta * 250;

      if (piece.rank === 1 && target.rank === 10) {
        score += 8000;
      }

      if (target.rank >= 8) {
        score += 350;
      }
    }

    if (piece.isObjective) {
      score -= 9999;
    }

    if (piece.isTrap) {
      score -= 9999;
    }

    if (state.botDifficulty === 'facil') {
      score += Math.random() * 150;
    } else if (state.botDifficulty === 'dificil') {
      score += 80;
    }

    return score;
  }

  function chooseBotAction(actions) {
    const difficultySettings = {
      facil: 0.45,
      normal: 0.18,
      dificil: 0.08,
    };

    const bestScore = Math.max(...actions.map((action) => action.score));
    const threshold = bestScore * (1 - (difficultySettings[state.botDifficulty] || difficultySettings.normal));

    const candidates = actions.filter((action) => action.score >= threshold);

    if (!candidates.length) {
      return actions[0];
    }

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    return selected;
  }

  window.botAI = BOT_AI;
})();
