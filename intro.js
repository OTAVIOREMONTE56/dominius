(() => {
  const overlay = document.getElementById('dominius-intro');
  if (!overlay) return;
  const app = document.getElementById('app');
  const skip = document.getElementById('intro-skip');
  const timers = [];
  let theme = null;
  let fadeTimer = null;
  let active = false;
  let done = false;
  const THEME_PATH = 'assets/audio/intro-theme.wav';
  const FADE_IN_MS = 650;
  const FADE_OUT_MS = 900;
  const themeVolume = () => {
    const state = window.audioManager?.getState?.();
    return state?.enabled === false ? 0 : Math.min(.7, (state?.effectsVolume ?? .8) * .56);
  };
  const schedule = (fn, delay) => timers.push(setTimeout(fn, delay));
  function fadeTheme(duration, fadeOut = false) {
    if (!theme) return;
    if (fadeTimer) clearInterval(fadeTimer);
    const started = performance.now();
    fadeTimer = setInterval(() => {
      if (!theme) { clearInterval(fadeTimer); fadeTimer = null; return; }
      const progress = Math.min(1, (performance.now() - started) / duration);
      theme.volume = themeVolume() * (fadeOut ? 1 - progress : progress);
      if (progress >= 1 || themeVolume() === 0) {
        clearInterval(fadeTimer); fadeTimer = null;
        if (fadeOut || themeVolume() === 0) theme.pause();
      }
    }, 40);
  }
  function playIntroSound() {
    if (done || themeVolume() === 0 || theme) return;
    try {
      theme = new Audio(THEME_PATH);
      theme.volume = 0;
      theme.addEventListener('error', () => { if (theme) theme.pause(); theme = null; }, { once: true });
      Promise.resolve(theme.play()).then(() => fadeTheme(FADE_IN_MS)).catch(() => { theme = null; });
    } catch (_) { theme = null; /* Autoplay pode ser bloqueado; a intro visual continua. */ }
  }
  function finishDominiusIntro(immediate = false) {
    if (done) return;
    done = true; active = false;
    timers.forEach(clearTimeout);
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
    if (theme) { theme.volume = 0; theme.pause(); theme.currentTime = 0; theme = null; }
    document.documentElement.classList.remove('intro-pending');
    app.inert = false;
    const hide = () => { overlay.hidden = true; overlay.classList.remove('playing', 'finishing'); };
    if (immediate) hide(); else { overlay.classList.add('finishing'); schedule(hide, 300); }
  }
  function skipDominiusIntro() { finishDominiusIntro(true); }
  function playDominiusIntro() {
    if (active || done) return;
    active = true; overlay.classList.add('playing');
    schedule(playIntroSound, 800);
    schedule(() => fadeTheme(FADE_OUT_MS, true), 4500);
    schedule(() => finishDominiusIntro(), 5400);
  }
  function initGameIntro() {
    app.inert = true;
    skip.addEventListener('click', skipDominiusIntro);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && active) { event.preventDefault(); skipDominiusIntro(); }
    });
    playDominiusIntro();
  }
  window.DominiusIntro = { initGameIntro, playDominiusIntro, skipDominiusIntro, finishDominiusIntro, playIntroSound };
  initGameIntro();
})();
