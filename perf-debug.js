/* Diagnóstico temporário; não altera estado, decisões ou temporização do jogo. */
(() => {
  const queryEnabled = new URLSearchParams(location.search).get('perf') === '1';
  if (window.DOMINIUS_PERF_DEBUG === undefined) window.DOMINIUS_PERF_DEBUG = queryEnabled;
  const clock = () => performance.now();
  let trace = null;
  let panel = null;
  let pendingOnline = null;
  let sequence = 0;
  const history = [];

  function active() { return window.DOMINIUS_PERF_DEBUG === true; }
  function ensurePanel() {
    if (!active() || panel) return;
    panel = document.createElement('aside');
    panel.id = 'dominius-perf-panel';
    panel.setAttribute('aria-label', 'Diagnóstico de performance');
    panel.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:2147483647;max-width:min(280px,calc(100vw - 16px));max-height:42vh;overflow:auto;padding:8px 10px;border:1px solid #a88946;border-radius:6px;background:rgba(12,11,9,.94);color:#f5e6bd;font:11px/1.4 ui-monospace,Consolas,monospace;white-space:pre-wrap;pointer-events:none;box-shadow:0 4px 20px #0008';
    panel.textContent = 'PERFORMANCE · aguardando jogada';
    document.body.appendChild(panel);
  }
  function stopObservers(item) {
    item.mutations?.takeRecords().forEach(record => countMutation(item, record));
    item.mutations?.disconnect();
    item.longTasks?.takeRecords().forEach(entry => {
      item.longTaskCount++;
      item.longTaskMs += entry.duration;
    });
    item.longTasks?.disconnect();
    if (item.frameHandle) cancelAnimationFrame(item.frameHandle);
  }
  function countMutation(item, record) {
    if (record.target === panel || panel?.contains(record.target)) return;
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (target) item.changedElements.add(target);
    if (record.type === 'childList') {
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (node.nodeType === 1) item.changedElements.add(node);
      }
    }
    item.domMutations++;
  }
  function frameLoop(item, timestamp) {
    if (trace !== item) return;
    if (item.lastFrame !== null) {
      const delta = timestamp - item.lastFrame;
      if (delta > 34) item.slowFrames++;
      if (delta > item.maxFrameMs) item.maxFrameMs = delta;
    }
    item.lastFrame = timestamp;
    item.frames++;
    item.rafCalls++;
    if (panel && (!item.lastPanelAt || timestamp - item.lastPanelAt >= 250)) {
      item.lastPanelAt = timestamp;
      panel.textContent = `PERFORMANCE · ${item.kind}\nJogada: ${fixed(clock() - item.start)} ms (em curso)\nBOT: ${fixed(item.stages.bot)} ms\nTabuleiro: ${fixed(item.stages.board)} ms\nPainéis: ${fixed(item.stages.panels)} ms\nRenders: ${item.renders}\nCasas: ${item.cellsUpdated}\nFrames lentos: ${item.slowFrames}\nLong tasks: ${item.longTasks ? item.longTaskCount : 'n/d'}`;
    }
    item.frameHandle = requestAnimationFrame(time => frameLoop(item, time));
  }
  function begin(kind, meta = {}, startedAt = clock()) {
    if (!active()) return null;
    ensurePanel();
    if (trace) return trace;
    const item = trace = {
      id: ++sequence, kind, meta, start: startedAt, stages: Object.create(null), renders: 0,
      boardRenders: 0, emptyBoardRenders: 0, cellsUpdated: 0, fullBoardBuilds: 0,
      domMutations: 0, changedElements: new Set(), slowFrames: 0, frames: 0,
      rafCalls: 0, lastFrame: null, maxFrameMs: 0, longTaskCount: 0, longTaskMs: 0,
      onlineSignals: Object.create(null), holds: 0, finishRequested: false,
    };
    if (typeof MutationObserver === 'function') {
      item.mutations = new MutationObserver(records => records.forEach(record => countMutation(item, record)));
      item.mutations.observe(document.getElementById('game-screen') || document.body,
        { subtree: true, childList: true, attributes: true, characterData: true });
    }
    if (typeof PerformanceObserver === 'function'
      && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      item.longTasks = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          item.longTaskCount++;
          item.longTaskMs += entry.duration;
        }
      });
      item.longTasks.observe({ type: 'longtask', buffered: false });
    }
    if (typeof requestAnimationFrame === 'function')
      item.frameHandle = requestAnimationFrame(time => frameLoop(item, time));
    panel.textContent = `PERFORMANCE · ${kind}\nmedindo jogada…`;
    return item;
  }
  function add(name, duration) {
    if (!active() || !trace || !Number.isFinite(duration)) return;
    trace.stages[name] = (trace.stages[name] || 0) + duration;
  }
  function span(name) {
    if (!active() || !trace) return null;
    const item = trace;
    const start = clock();
    let ended = false;
    return () => { if (!ended) { ended = true; if (trace === item) add(name, clock() - start); } };
  }
  function render() { if (active() && trace) trace.renders++; }
  function board(updated, full) {
    if (!active() || !trace) return;
    trace.boardRenders++;
    trace.cellsUpdated += updated;
    if (!updated) trace.emptyBoardRenders++;
    if (full) trace.fullBoardBuilds++;
  }
  function signal(source) {
    if (!active()) return;
    const time = clock();
    if (!pendingOnline || time - pendingOnline.firstAt > 10000)
      pendingOnline = { firstAt: time, counts: Object.create(null) };
    pendingOnline.counts[source] = (pendingOnline.counts[source] || 0) + 1;
    if (trace) trace.onlineSignals[source] = (trace.onlineSignals[source] || 0) + 1;
  }
  function snapshotNetwork(duration, startedAt) {
    if (!active()) return;
    if (trace) { add('network', duration); return; }
    if (!pendingOnline) pendingOnline = { firstAt: startedAt, counts: Object.create(null) };
    pendingOnline.networkMs = (pendingOnline.networkMs || 0) + duration;
  }
  function onlineRenderStart(version) {
    if (!active()) return;
    const pending = pendingOnline;
    pendingOnline = null;
    const item = begin(trace?.kind || 'online', { version }, pending?.firstAt || clock());
    if (!item) return;
    item.meta.version = version;
    if (pending) {
      if (pending.networkMs) add('network', pending.networkMs);
      for (const [source, count] of Object.entries(pending.counts))
        item.onlineSignals[source] = Math.max(item.onlineSignals[source] || 0, count);
      item.eventReceivedAt ??= pending.firstAt;
    }
  }
  function onlineRendered() {
    if (!active() || !trace) return;
    if (trace.eventReceivedAt !== undefined)
      add('eventToRender', clock() - trace.eventReceivedAt);
    finish();
  }
  function hold() { if (active() && trace) trace.holds++; }
  function release() {
    if (!trace) return;
    trace.holds = Math.max(0, trace.holds - 1);
    if (!trace.holds && trace.finishRequested) settle(trace);
  }
  function finish() {
    if (!active() || !trace) return;
    trace.finishRequested = true;
    if (!trace.holds) settle(trace);
  }
  function settle(item) {
    if (item.settling) return;
    item.settling = true;
    // Dois frames após o último render: inclui a oportunidade de pintura da UI.
    if (typeof requestAnimationFrame !== 'function') return finalize(item);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (item.holds) { item.settling = false; return; }
      finalize(item);
    }));
  }
  const fixed = value => Number(value || 0).toFixed(1);
  function finalize(item) {
    if (trace !== item) return;
    const end = clock();
    stopObservers(item);
    trace = null;
    const imageResources = (performance.getEntriesByType?.('resource') || []).filter(entry =>
      entry.startTime >= item.start && entry.startTime <= end
      && /\.(webp|png|jpe?g|gif|svg)(\?|$)/i.test(entry.name));
    const imageMs = imageResources.reduce((sum, entry) => sum + entry.duration, 0);
    const imageBytes = imageResources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
    const report = {
      id: item.id, tipo: item.kind, ...item.meta,
      totalMs: +(end - item.start).toFixed(1), ...Object.fromEntries(Object.entries(item.stages)
        .map(([key, value]) => [`${key}Ms`, +value.toFixed(1)])),
      renders: item.renders, boardRenders: item.boardRenders,
      rendersSemCasasAlteradas: item.emptyBoardRenders,
      casasAtualizadas: item.cellsUpdated, reconstrucoesCompletas: item.fullBoardBuilds,
      mutacoesDOM: item.domMutations, elementosDOMAlterados: item.changedElements.size,
      frames: item.frames, framesLentos: item.slowFrames,
      fpsAproximado: item.maxFrameMs ? +(1000 / item.maxFrameMs).toFixed(1) : null,
      longTasks: item.longTaskCount, longTaskMs: +item.longTaskMs.toFixed(1),
      longTasksSuportadas: Boolean(item.longTasks),
      rafObservados: item.rafCalls, imagensCarregadas: imageResources.length,
      imagensMs: +imageMs.toFixed(1), imagensBytes: imageBytes,
      eventosOnline: item.onlineSignals,
    };
    history.push(report); if (history.length > 20) history.shift();
    api.last = report;
    if (panel) panel.textContent = [
      `PERFORMANCE · ${report.tipo}`,
      `Jogada total: ${fixed(report.totalMs)} ms`,
      `BOT/lógica: ${fixed(report.botMs)} ms`,
      `Estado: ${fixed(report.stateMs)} ms`,
      `Tabuleiro: ${fixed(report.boardMs)} ms`,
      `Painéis: ${fixed(report.panelsMs)} ms`,
      `Peça: ${fixed(report.pieceAnimationMs)} ms`,
      `Combate: ${fixed(report.combatAnimationMs)} ms`,
      `CSS/animações*: ${fixed(report.cssAnimationMs)} ms`,
      `Imagens/rede: ${report.imagensCarregadas} · ${fixed(report.imagensMs)} ms`,
      `Snapshot/rede: ${fixed(report.networkMs)} ms`,
      `Renders: ${report.renders} (${report.rendersSemCasasAlteradas} sem casas)`,
      `Casas: ${report.casasAtualizadas} · DOM: ${report.elementosDOMAlterados}`,
      `FPS mínimo aprox.: ${report.fpsAproximado ?? 'n/d'}`,
      `Frames lentos: ${report.framesLentos} · Long tasks: ${report.longTasksSuportadas ? report.longTasks : 'n/d'}`,
      `rAF: ${report.rafObservados} · Eventos: ${JSON.stringify(report.eventosOnline)}`,
      '* Duração de parede; não equivale a uso de CPU.',
    ].join('\n');
    console.groupCollapsed(`[DOMINIUS PERF] ${report.tipo} #${report.id} · ${report.totalMs} ms`);
    console.table(report);
    console.groupEnd();
  }
  function enable() { window.DOMINIUS_PERF_DEBUG = true; ensurePanel(); }
  function disable() {
    window.DOMINIUS_PERF_DEBUG = false;
    if (trace) stopObservers(trace);
    trace = null; pendingOnline = null;
    panel?.remove(); panel = null;
  }
  const api = window.dominiusPerf = {
    enable, disable, begin, add, span, render, board, signal, snapshotNetwork, onlineRenderStart,
    onlineRendered, hold, release, finish, now: clock, last: null, history,
  };
  if (active()) {
    if (document.body) ensurePanel();
    else document.addEventListener('DOMContentLoaded', ensurePanel, { once: true });
  }
})();
