const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const markup = '<!doctype html><html class="intro-pending"><body><div id="dominius-intro"><button id="intro-skip"></button></div><div id="app"></div></body></html>';
const script = fs.readFileSync(require.resolve('./intro.js'), 'utf8');
function load(options = {}) {
  const dom = new JSDOM(markup, { url: 'https://dominius.test/', runScripts: 'outside-only' });
  dom.window.audioManager = { getState: () => ({ enabled: Boolean(options.audio), effectsVolume: options.audio ? .8 : 0 }) };
  if (options.audio === true) dom.window.Audio = class { constructor() { throw new Error('arquivo ausente'); } };
  if (options.audio === 'mock') dom.window.Audio = options.Audio;
  dom.window.eval(script);
  return dom;
}
test('intro starts automatically before menu and skip reveals it', () => {
  const dom = load(), { document } = dom.window;
  const app = document.getElementById('app'), intro = document.getElementById('dominius-intro');
  assert.equal(intro.classList.contains('playing'), true);
  assert.equal(app.inert, true);
  document.getElementById('intro-skip').click();
  assert.equal(intro.hidden, true); assert.equal(app.inert, false);
  assert.equal(document.documentElement.classList.contains('intro-pending'), false);
  dom.window.DominiusIntro.playDominiusIntro();
  assert.equal(intro.hidden, true);
  dom.window.close();
});
test('a complete new page load plays intro again', () => {
  const first = load(); first.window.DominiusIntro.skipDominiusIntro(); first.window.close();
  const second = load();
  assert.equal(second.window.document.getElementById('dominius-intro').classList.contains('playing'), true);
  second.window.close();
});
test('missing or blocked audio does not interrupt the visual intro', () => {
  const dom = load({ audio: true });
  assert.doesNotThrow(() => dom.window.DominiusIntro.playIntroSound('theme'));
  assert.equal(dom.window.document.getElementById('dominius-intro').classList.contains('playing'), true);
  dom.window.close();
});
test('intro completes naturally and reveals the menu', async () => {
  const dom = load();
  await new Promise(resolve => setTimeout(resolve, 5750));
  assert.equal(dom.window.document.getElementById('dominius-intro').hidden, true);
  assert.equal(dom.window.document.getElementById('app').inert, false);
  dom.window.close();
});
test('only the theme plays, fades in to a louder safe level, then fades out', async () => {
  const tracks = [];
  class MockAudio {
    constructor(src) { this.src = src; this.volume = 0; this.paused = false; tracks.push(this); }
    addEventListener() {}
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const dom = load({ audio: 'mock', Audio: MockAudio });
  await new Promise(resolve => setTimeout(resolve, 1650));
  assert.equal(tracks.length, 1);
  assert.match(tracks[0].src, /intro-theme\.wav$/);
  assert.ok(tracks[0].volume >= .42 && tracks[0].volume <= .45);
  await new Promise(resolve => setTimeout(resolve, 3250));
  assert.equal(tracks.length, 1);
  assert.ok(tracks[0].volume < .35 && tracks[0].volume > 0);
  await new Promise(resolve => setTimeout(resolve, 650));
  assert.equal(tracks[0].volume, 0);
  assert.equal(tracks[0].paused, true);
  dom.window.close();
});
