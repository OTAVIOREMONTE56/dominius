import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    const intro = document.getElementById('dominius-intro');
    if (intro && !intro.hidden) {
      if (intro.classList.contains('playing')) window.DominiusIntro?.skipDominiusIntro();
      return;
    }
    const dialog = document.querySelector('dialog[open]');
    if (dialog) {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
      if (dialog.open) dialog.close();
      return;
    }

    for (const id of ['tutorial-guide-overlay', 'tutorial-overlay']) {
      const overlay = document.getElementById(id);
      if (overlay && !overlay.classList.contains('hidden')) {
        const close = overlay.querySelector('#tutorial-guide-close, [data-tutorial-close]');
        if (close) close.click();
        return;
      }
    }

    const game = document.getElementById('game-screen');
    if (game && !game.classList.contains('hidden')) {
      if (!window.confirm('Minimizar DOMINIUS? A partida continuará aberta.')) return;
    }
    App.minimizeApp();
  });
}
