(function () {
  const AUDIO_PATHS = {
    ambiente: 'assets/audio/ambiente/ambiente-guerra.mp3',
    passos: 'assets/audio/movimento/passos.mp3',
    espadas: 'assets/audio/combate/espadas.mp3',
    explosao: 'assets/audio/combate/explosao-bomba.mp3',
    desarme: 'assets/audio/combate/desarmar-bomba.mp3',
    vitoria: 'assets/audio/interface/vitoria.mp3',
    derrota: 'assets/audio/interface/derrota.mp3',
  };

  const state = {
    enabled: true,
    ambientVolume: 0.25,
    effectsVolume: 0.8,
    unlocked: false,
    ambientWanted: false,
    lastError: null,
  };
  const tracks = {};

  function emitDiagnostic(name, event) {
    const track = tracks[name];
    if (!track?.onDiagnostic) return;
    const audio = track.audio;
    track.onDiagnostic({
      path: AUDIO_PATHS[name],
      src: audio.src,
      currentSrc: audio.currentSrc,
      protocol: window.location.protocol,
      volume: audio.volume,
      muted: audio.muted,
      enabled: state.enabled,
      unlocked: state.unlocked,
      paused: audio.paused,
      currentTime: audio.currentTime,
      duration: audio.duration,
      readyState: audio.readyState,
      networkState: audio.networkState,
      support: audio.canPlayType('audio/mpeg'),
      playResult: track.playResult,
      playError: track.playError,
      mediaError: audio.error ? {
        code: audio.error.code, message: audio.error.message,
      } : null,
      event,
    });
  }

  function clampVolume(value) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(1, Math.max(0, value)) : 0;
  }

  function reportPlayFailure(name, error) {
    const sourceUrl = AUDIO_PATHS[name];
    const message = error?.message || String(error);
    state.lastError = { name, sourceUrl, message };
    console.error(`[DOMINIUS Audio] Falha em ${sourceUrl}: ${message}`, {
      sourceUrl, resolvedUrl: tracks[name]?.audio.src, error,
    });
    return false;
  }

  function getTrack(name) {
    if (!tracks[name]) {
      // URLs diretas permitem que o navegador carregue a mídia sem fetch/CORS.
      const audio = new Audio(AUDIO_PATHS[name]);
      audio.preload = 'auto';
      audio.loop = name === 'ambiente';
      const track = { audio, version: 0, primed: false, priming: false };
      tracks[name] = track;
      ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'playing',
        'waiting', 'stalled', 'timeupdate', 'pause', 'ended', 'volumechange']
        .forEach((event) => audio.addEventListener(event, () => emitDiagnostic(name, event)));
      audio.addEventListener('error', () => {
        const reasons = {
          1: 'Carregamento interrompido',
          2: 'Falha ao carregar o arquivo',
          3: 'Falha ao decodificar o MP3',
          4: 'Arquivo indisponível ou formato não suportado',
        };
        reportPlayFailure(name, new Error(
          `${reasons[audio.error?.code] || 'Erro de mídia'} (código ${audio.error?.code ?? 'desconhecido'}): ${audio.error?.message || 'Navegador não forneceu mensagem'}`
        ));
        emitDiagnostic(name, 'error');
      });
    }
    return tracks[name];
  }

  function stopTrack(track) {
    track.version += 1;
    track.priming = false;
    track.audio.pause();
    track.audio.currentTime = 0;
    track.audio.muted = !state.enabled;
  }

  function unlock() {
    // Só preparar a reprodução dentro de uma interação real do usuário.
    if (window.navigator?.userActivation && !window.navigator.userActivation.isActive) {
      return state.unlocked;
    }
    state.unlocked = true;
    if (!state.enabled) return true;

    Object.keys(AUDIO_PATHS).forEach((name) => {
      const track = getTrack(name);
      if (name === 'ambiente' || track.primed || track.priming || !track.audio.paused) return;
      const version = ++track.version;
      track.priming = true;
      track.audio.muted = true;
      // Os mesmos elementos serão reutilizados nos combates e turnos do BOT.
      try {
        Promise.resolve(track.audio.play()).then(() => {
          if (track.version !== version) return;
          track.primed = true;
          stopTrack(track);
        }).catch((error) => {
          if (track.version !== version) return;
          stopTrack(track);
          if (error.name !== 'AbortError') reportPlayFailure(name, error);
        });
      } catch (error) {
        stopTrack(track);
        reportPlayFailure(name, error);
      }
    });
    return true;
  }

  function playAudio(name) {
    if (!state.enabled || !state.unlocked) {
      if (tracks[name]) {
        tracks[name].playResult = 'não chamado';
        tracks[name].playError = !state.enabled ? 'Som desligado no jogo' : 'Áudio não desbloqueado por interação';
        emitDiagnostic(name, 'bloqueado pelo jogo');
      }
      return Promise.resolve(false);
    }
    const track = getTrack(name);
    const version = ++track.version;
    track.priming = false;
    track.audio.muted = false;
    track.audio.volume = name === 'ambiente' ? state.ambientVolume : state.effectsVolume;
    state.lastError = null;
    track.playResult = 'pendente';
    track.playError = '';
    try {
      track.audio.currentTime = 0;
      emitDiagnostic(name, 'chamando play()');
      // Não aguardar carregamento antes de play(): preservar a ativação do clique.
      return Promise.resolve(track.audio.play()).then(() => {
        if (track.version === version) {
          track.playResult = 'resolveu';
          emitDiagnostic(name, 'play() resolveu');
        }
        if (track.version !== version || !state.enabled) return false;
        track.primed = true;
        return true;
      }).catch((error) => {
        if (track.version !== version) return false;
        track.playResult = 'rejeitou';
        track.playError = `${error.name}: ${error.message}`;
        emitDiagnostic(name, 'play() rejeitou');
        return reportPlayFailure(name, error);
      });
    } catch (error) {
      track.playResult = 'exceção síncrona';
      track.playError = `${error.name}: ${error.message}`;
      emitDiagnostic(name, 'exceção');
      return Promise.resolve(reportPlayFailure(name, error));
    }
  }

  function playAmbient() {
    state.ambientWanted = true;
    return playAudio('ambiente');
  }

  function stopAmbient() {
    state.ambientWanted = false;
    if (tracks.ambiente) stopTrack(tracks.ambiente);
  }

  function setEnabled(value) {
    state.enabled = Boolean(value);
    if (!state.enabled) {
      Object.values(tracks).forEach(stopTrack);
    } else {
      unlock();
      if (state.ambientWanted) playAmbient();
    }
  }

  function toggleEnabled() {
    setEnabled(!state.enabled);
    return state.enabled;
  }

  function setAmbientVolume(value) {
    state.ambientVolume = clampVolume(value);
    if (tracks.ambiente) tracks.ambiente.audio.volume = state.ambientVolume;
  }

  function setEffectsVolume(value) {
    state.effectsVolume = clampVolume(value);
    Object.entries(tracks).forEach(([name, track]) => {
      if (name !== 'ambiente') track.audio.volume = state.effectsVolume;
    });
  }

  window.audioManager = {
    AUDIO_PATHS, unlock, setEnabled, toggleEnabled,
    setAmbientVolume, setEffectsVolume, playAmbient, stopAmbient,
    getState: () => ({
      enabled: state.enabled, ambientVolume: state.ambientVolume,
      effectsVolume: state.effectsVolume, unlocked: state.unlocked,
    }),
    getLastError: () => state.lastError,
    diagnoseEspadas: (onDiagnostic) => {
      const track = getTrack('espadas');
      track.onDiagnostic = onDiagnostic;
      return playAudio('espadas');
    },
    playPassos: () => playAudio('passos'),
    playEspadas: () => playAudio('espadas'),
    playExplosao: () => playAudio('explosao'),
    playDesarme: () => playAudio('desarme'),
    playVitoria: () => playAudio('vitoria'),
    playDerrota: () => playAudio('derrota'),
  };
})();
