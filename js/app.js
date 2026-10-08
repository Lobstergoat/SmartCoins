/* Rulepets — the handheld. Routing, D-pad spatial cursor, A/B/C buttons, sound, toasts. */
(function (g) {
  'use strict';
  const S = g.Screens, API = g.RulePets, Sp = g.Sprites;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const view = $('#view'), bar = $('#statusbar'), overlay = $('#overlay'), device = $('#device');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const App = {};
  let cur = { name: null, params: null, mod: null };
  const stack = [];
  let root = view; // fresh container per screen so its listeners are dropped on navigation
  function mountScreen() {
    view.textContent = '';
    root = document.createElement('div'); root.className = 'screen-root';
    root.innerHTML = cur.mod.render(cur.params);
    view.appendChild(root);
    cur.mod.mount && cur.mod.mount(root, cur.params);
  }

  /* ---------- sound ---------- */
  let actx = null, muted = false;
  try { muted = localStorage.getItem('rulepets.muted') === '1'; } catch (e) { /* ignore */ }
  function tone(freq, dur, type, vol, when, slideTo) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime + (when || 0), o = actx.createOscillator(), gn = actx.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gn.gain.setValueAtTime(vol || 0.035, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  const SFX = {
    move: () => tone(440, 0.04, 'square', 0.02),
    tick: () => tone(700, 0.05, 'square', 0.03),
    ok: () => { tone(660, 0.07); tone(990, 0.09, 'square', 0.035, 0.07); },
    back: () => tone(330, 0.1, 'square', 0.035, 0, 200),
    clunk: () => { tone(140, 0.14, 'triangle', 0.12, 0, 50); tone(900, 0.03, 'square', 0.03, 0.12); },
    eject: () => tone(520, 0.15, 'square', 0.03, 0, 240),
    crack: () => { tone(180, 0.05, 'square', 0.05); tone(120, 0.07, 'square', 0.05, 0.05); },
    hatch: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.04, i * 0.09)),
    charge: () => tone(180, 1, 'sawtooth', 0.02, 0, 900),
    fire: () => { tone(880, 0.06, 'square', 0.025); tone(1175, 0.08, 'square', 0.025, 0.06); }
  };
  App.sfx = n => SFX[n] && SFX[n]();

  const speaker = $('#speaker');
  const syncSpeaker = () => { speaker.setAttribute('aria-pressed', String(!muted)); speaker.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on'); };
  speaker.addEventListener('click', () => { muted = !muted; try { localStorage.setItem('rulepets.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ } syncSpeaker(); App.sfx('ok'); });
  syncSpeaker();

  /* ---------- small helpers ---------- */
  App.toast = msg => {
    const box = $('#toasts'); while (box.children.length > 1) box.firstChild.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  };
  App.shake = () => { if (reduced.matches || !device.animate) return; device.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-9px)' }, { transform: 'translateX(9px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }], { duration: 300, easing: 'steps(6)' }); };
  let ledT = 0;
  App.led = () => { const l = $('#ledFire'); l.classList.add('on'); clearTimeout(ledT); ledT = setTimeout(() => l.classList.remove('on'), 280); };

  /* ---------- status bar ---------- */
  const short = a => a.slice(0, 4) + '…' + a.slice(-4);
  const walletHtml = () => {
    const a = API.wallet();
    return a
      ? `<button class="wallet on" data-wallet aria-label="Phantom connected as ${a}. Select to disconnect."><i></i><span>${short(a)}</span></button>`
      : `<button class="wallet" data-wallet aria-label="Connect Phantom wallet">Connect<span class="w-long">&nbsp;Phantom</span></button>`;
  };
  function drawBar() {
    const active = cur.name === 'pet' ? 'hatchery' : cur.name;
    bar.innerHTML = S.order.map(k => `<button class="tab" data-go="${k}" ${active === k ? 'aria-current="page"' : ''}>${Sp.icon(S.icons[k], 2)}<span>${S.labels[k]}</span></button>`).join('') +
      walletHtml() +
      `<span class="live" aria-label="${API.pets().length} pets live"><i></i><span>${API.pets().length} live</span></span>`;
  }

  /* ---------- routing ---------- */
  function hashFor(name, params) { return name === 'boot' ? ' ' : '#' + name + (name === 'pet' && params ? '/' + params.id : ''); }
  App.go = function (name, params, opts) {
    opts = opts || {};
    if (!S[name]) name = 'hatchery';
    if (cur.mod && cur.mod.unmount) cur.mod.unmount();
    if (!opts.back && cur.name && !(cur.name === 'rules' && cur.params.edit) && !(cur.name === name && !params)) stack.push({ name: cur.name, params: cur.params });
    cur = { name, params: params || {}, mod: S[name] };
    overlay.hidden = true; overlay.innerHTML = '';
    mountScreen();
    S.applyTheme(cur.mod.themeFor ? cur.mod.themeFor(cur.params) : null);
    view.scrollTop = 0; drawBar();
    try { history.replaceState(null, '', name === 'boot' ? location.pathname : hashFor(name, cur.params)); } catch (e) { /* file:// */ }
    const first = $('[data-primary]', view) || focusables().find(el => view.contains(el));
    if (first && !opts.silentFocus) first.focus({ preventScroll: true });
    if (!opts.silent) App.sfx('ok');
  };
  App.refresh = function (focusSel) {
    const top = view.scrollTop;
    mountScreen();
    view.scrollTop = top; drawBar();
    const f = focusSel && $(focusSel, view); if (f) f.focus({ preventScroll: true });
  };
  App.focusFirst = root => { const f = $('[data-primary]', root) || $('button, input', root); if (f) f.focus({ preventScroll: true }); };

  function route() {
    const h = location.hash.replace('#', '').trim();
    if (!h) return App.go('boot', null, { silent: true });
    const [name, id] = h.split('/');
    if (name === 'pet' && id) return App.go('pet', { id }, { silent: true });
    App.go(S[name] ? name : 'boot', null, { silent: true });
  }

  /* ---------- D-pad cursor ---------- */
  const SKIP = '.dpad, .pbtns, .speaker, [hidden]';
  function focusables() {
    const scope = overlay.hidden ? [bar, view] : [overlay];
    const list = [];
    scope.forEach(root => $$('button, a[href], input:not([type="file"]), textarea, [tabindex]:not([tabindex="-1"])', root).forEach(el => {
      if (el.disabled || el.closest(SKIP) || el.getAttribute('aria-hidden') === 'true' || el.tabIndex < 0) return;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      list.push(el);
    }));
    return list;
  }
  const mark = el => { $$('.cur').forEach(x => x.classList.remove('cur')); el.classList.add('cur'); };
  function move(dir) {
    const list = focusables(); if (!list.length) return;
    let a = document.activeElement;
    if (!list.includes(a)) { const f = $('[data-primary]', overlay.hidden ? view : overlay) || list[0]; f.focus({ preventScroll: true }); mark(f); App.sfx('move'); return; }
    if (a.type === 'range' && (dir === 'left' || dir === 'right')) {
      a.value = +a.value + (dir === 'right' ? 1 : -1) * (+a.step || 3); a.dispatchEvent(new Event('input', { bubbles: true })); App.sfx('tick'); return;
    }
    const ra = a.getBoundingClientRect(), ax = ra.left + ra.width / 2, ay = ra.top + ra.height / 2;
    let best = null, bs = Infinity;
    list.forEach(el => {
      if (el === a) return;
      const r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
      let ok, score;
      if (dir === 'right') { ok = dx > 4 && Math.abs(dy) < Math.max(ra.height, r.height) * 0.9; score = dx + 3 * Math.abs(dy); }
      else if (dir === 'left') { ok = dx < -4 && Math.abs(dy) < Math.max(ra.height, r.height) * 0.9; score = -dx + 3 * Math.abs(dy); }
      else if (dir === 'down') { ok = dy > 4; score = dy + 2.2 * Math.abs(dx); }
      else { ok = dy < -4; score = -dy + 2.2 * Math.abs(dx); }
      if (ok && score < bs) { bs = score; best = el; }
    });
    if (best) {
      best.focus({ preventScroll: true }); mark(best);
      best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
      App.sfx('move');
    } else if (dir === 'down' || dir === 'up') view.scrollBy({ top: dir === 'down' ? 140 : -140, behavior: reduced.matches ? 'auto' : 'smooth' });
  }

  /* ---------- A / B / C ---------- */
  function aDown() {
    let el = document.activeElement;
    if (!el || el === document.body || !list_has(el)) { const f = $('[data-primary]', view) || focusables()[0]; if (f) { f.focus({ preventScroll: true }); mark(f); } return; }
    el.dispatchEvent(new CustomEvent('abutton', { detail: 'down' }));
  }
  const list_has = el => focusables().includes(el);
  function aUp() {
    const el = document.activeElement;
    if (!el || !list_has(el)) return;
    el.dispatchEvent(new CustomEvent('abutton', { detail: 'up' }));
    if (el.hasAttribute('data-hold')) return;
    if (el.tagName === 'INPUT' && el.type === 'text' || el.tagName === 'TEXTAREA') return;
    if (el.tagName === 'INPUT' && el.type === 'range') return;
    el.click(); App.sfx('ok');
  }
  function bPress() {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) { el.blur(); return; }
    if (!overlay.hidden) { overlay.hidden = true; overlay.innerHTML = ''; App.go('hatchery'); return; }
    if (cur.name === 'boot') return App.shake();
    App.sfx('back');
    const prev = stack.pop();
    if (prev && prev.name !== 'boot') App.go(prev.name, prev.params, { back: true, silent: true });
    else App.go('hatchery', null, { back: true, silent: true });
  }
  function cPress() {
    if (!overlay.hidden) return;
    const here = cur.name === 'pet' ? 'hatchery' : cur.name;
    const i = S.order.indexOf(here);
    App.sfx('tick');
    App.go(S.order[(i + 1) % S.order.length], null, { silent: true });
  }

  const noFocusSteal = e => e.preventDefault();
  $$('.dp').forEach(b => { b.tabIndex = -1; b.addEventListener('mousedown', noFocusSteal); b.addEventListener('pointerdown', () => move(b.dataset.dir)); });
  $$('.pbtn').forEach(b => {
    b.tabIndex = -1; b.addEventListener('mousedown', noFocusSteal);
    const k = b.dataset.btn;
    b.addEventListener('pointerdown', e => { b.classList.add('down'); if (k === 'a') aDown(); else if (k === 'b') bPress(); else cPress(); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { if (b.classList.contains('down')) { b.classList.remove('down'); if (k === 'a' && ev !== 'pointerleave') aUp(); else if (k === 'a') document.activeElement && document.activeElement.dispatchEvent(new CustomEvent('abutton', { detail: 'up' })); } }));
  });

  /* keyboard */
  const typing = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'file', 'button'].includes(el.type)));
  const KEYDIR = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const lit = k => { const b = $(`.pbtn-${k}`); b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 110); };
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (typing(t)) { if (e.key === 'Escape') { t.blur(); e.preventDefault(); } return; }
    if (KEYDIR[e.key]) { e.preventDefault(); move(KEYDIR[e.key]); return; }
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.repeat) { e.preventDefault(); lit('a'); aDown(); }
    else if (k === 'x' || e.key === 'Escape' || e.key === 'Backspace') { if (!e.repeat) { e.preventDefault(); lit('b'); bPress(); } }
    else if (k === 'c' && !e.repeat) { e.preventDefault(); lit('c'); cPress(); }
  });
  document.addEventListener('keyup', e => { if (e.key.toLowerCase() === 'z') { const el = document.activeElement; if (el && el.hasAttribute('data-hold')) el.dispatchEvent(new CustomEvent('abutton', { detail: 'up' })); else aUp(); } });

  /* mouse/touch use clears the d-pad cursor; data-go links route */
  view.addEventListener('pointerdown', () => $$('.cur').forEach(x => x.classList.remove('cur')));
  $('#lcd').addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) App.go(go.dataset.go);
    if (e.target.closest('[data-wallet]')) toggleWallet();
  });

  /* ---------- live world ---------- */
  API.on('tick', () => { if (cur.mod && cur.mod.tick && overlay.hidden) cur.mod.tick(root); });
  API.on('fire', ({ pet }) => { App.led(); if (cur.name === 'pet' && cur.params.id === pet.id) App.sfx('fire'); });
  API.on('spawn', () => drawBar());
  API.on('wallet', a => { drawBar(); if (a) App.toast('Phantom connected: ' + short(a)); });

  let walletBusy = false;
  async function toggleWallet() {
    if (walletBusy) return; walletBusy = true;
    try {
      if (API.wallet()) { await API.disconnectWallet(); App.toast('Phantom disconnected'); }
      else { await API.connectWallet(); App.sfx('ok'); }
    } catch (err) {
      if (err && err.message === 'no-phantom') { App.toast('Phantom isn’t installed. Opening phantom.app'); window.open('https://phantom.app/', '_blank', 'noopener'); }
      else if (err && err.code === 4001) App.toast('Connection cancelled');
      else App.toast('Couldn’t reach Phantom. Try again.');
      App.sfx('back');
    } finally { walletBusy = false; drawBar(); }
  }

  /* ---------- mouse canvas: wheel zooms toward the cursor, drag pans, double-click the backdrop resets ---------- */
  (function () {
    if (!matchMedia('(pointer: fine)').matches) return; // touch keeps native pan and pinch
    const body = document.body;
    body.classList.add('canvas');
    let x = 0, y = 0, k = 1, pan = null;
    const reset = $('#resetView');
    const apply = () => {
      device.style.translate = `${x}px ${y}px`; device.style.scale = String(k);
      reset.hidden = x === 0 && y === 0 && k === 1;
      reset.textContent = `Reset view (${Math.round(k * 100)}%)`;
    };
    const home = () => { x = y = 0; k = 1; apply(); };
    reset.addEventListener('click', home);

    window.addEventListener('wheel', e => {
      // over the screen, let the wheel scroll its content until it hits an end
      const v = e.target.closest && e.target.closest('#view');
      if (v && !e.ctrlKey && v.scrollHeight > v.clientHeight + 1) {
        const atTop = v.scrollTop <= 0, atEnd = v.scrollTop + v.clientHeight >= v.scrollHeight - 1;
        if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atTop)) return;
      }
      e.preventDefault();
      const r = device.getBoundingClientRect();
      const L = r.left - x, T = r.top - y;
      const nk = Math.max(0.3, Math.min(3, k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016))));
      const ux = (e.clientX - L - x) / k, uy = (e.clientY - T - y) / k;
      x = e.clientX - L - nk * ux; y = e.clientY - T - nk * uy; k = nk;
      apply();
    }, { passive: false });

    const free = e => !e.target.closest('button, input, textarea, label, a, select, canvas, .speaker') &&
      !(e.target.id === 'view' && e.offsetX > e.target.clientWidth); // not on the screen's scrollbar
    window.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' || e.button !== 0 || !free(e)) return;
      pan = { sx: e.clientX - x, sy: e.clientY - y };
      body.classList.add('panning');
    });
    window.addEventListener('pointermove', e => { if (pan) { x = e.clientX - pan.sx; y = e.clientY - pan.sy; apply(); } });
    const stop = () => { pan = null; body.classList.remove('panning'); };
    window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); window.addEventListener('blur', stop);
    window.addEventListener('dblclick', e => { if (free(e)) home(); });
  })();

  window.App = App;
  API.connect();
  window.addEventListener('hashchange', route);
  route();
})(window);
