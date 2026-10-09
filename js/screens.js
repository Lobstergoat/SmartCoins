/* Rulepets — screens. Each screen: render(params) → html, mount(root, params), tick(root), unmount(). */
(function (g) {
  'use strict';
  const E = g.Engine, S = g.Sprites, API = g.RulePets;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#FF8A3D', '#6EA8FF', '#5DD39E', '#B07CFF', '#FF4FA3', '#F2C94C'];

  /* ---------- helpers ---------- */
  function palFor(p) {
    return p.color ? { b: p.color, d: S.shade(p.color, -0.3), l: S.shade(p.color, 0.45) } : null;
  }
  const spriteFor = (p, scale, label) => S.sprite(p.species, { scale, mood: p.mood, looks: p.looks, pal: palFor(p), label });
  const terr = (species) => { const t = S.SPECIES[species].terrarium; return `data-pat="${t.pat}" style="--tbg:${t.bg};--tfg:${t.fg}"`; };
  const ago = t => { const s = (Date.now() - t) / 1000; if (s < 45) return 'just now'; if (s < 3600) return Math.round(s / 60) + 'm ago'; return Math.round(s / 3600) + 'h ago'; };
  const sig = p => [p.species, p.looks.join(), p.color].join('|');
  const stat = (v, fmt) => (v == null ? '—' : fmt(v)); // real tokens have no numbers until the backend reports them
  const fmtSol = n => (Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : '—');
  const swapMood = (el, mood) => { if (el) el.className = el.className.replace(/mood-\w+/, 'mood-' + mood); };

  function applyTheme(species) {
    const lcd = $('#lcd');
    if (!species) { ['--bg', '--hi', '--lo', '--ink'].forEach(k => lcd.style.removeProperty(k)); lcd.removeAttribute('data-dark'); return; }
    const t = S.SPECIES[species].lcd;
    lcd.style.setProperty('--bg', t.bg); lcd.style.setProperty('--hi', t.hi); lcd.style.setProperty('--lo', t.lo); lcd.style.setProperty('--ink', t.ink);
    const n = parseInt(t.bg.slice(1), 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    if (lum < 0.4) lcd.setAttribute('data-dark', ''); else lcd.removeAttribute('data-dark');
  }

  /* ---------- draft (the pet you're building) ---------- */
  const DEFAULT_RULES = () => [
    E.rule({ metric: 'mc', op: '>=', value: 10000, action: 'image', param: 'crown' }),
    E.rule({ metric: 'vol', op: '<=', value: 8000, action: 'tweet', param: E.TWEETS[0], repeat: true })
  ];
  function loadDraft() {
    const d = { name: '', ticker: '', desc: '', species: 'blob', color: null, imageFile: null, devBuy: 0.5, rules: DEFAULT_RULES() };
    try {
      const saved = JSON.parse(localStorage.getItem('rulepets.draft') || 'null');
      if (saved && Array.isArray(saved.rules)) { Object.assign(d, saved, { image: null }); d.rules = saved.rules.map(r => E.rule(r)); }
    } catch (e) { /* storage unavailable */ }
    return d;
  }
  const draft = loadDraft();
  let editing = null; // { id, name, species, color, rules } when rewriting a live pet's rules
  const T = () => editing || draft;
  const persist = () => { if (!editing) saveDraft(); };
  const saveDraft = () => {
    try { localStorage.setItem('rulepets.draft', JSON.stringify(Object.assign({}, draft, { image: null, rules: draft.rules.map(r => ({ metric: r.metric, op: r.op, value: r.value, action: r.action, param: r.param, repeat: r.repeat })) }))); } catch (e) { /* ignore */ }
  };
  const draftPet = () => ({ species: draft.species, color: draft.color, looks: [], mood: 'happy', name: draft.name || 'Your pet' });

  /* ================= BOOT ================= */
  const boot = {
    render() {
      return `<section class="boot">
        <div>
          <h2 class="hero">Launch a token that follows your rules.</h2>
          <p class="lede">Every coin here is a pet. Slot in rule cartridges like “if market cap reaches $10k, change the image” or “if volume drops below $8k, tweet,” and your pet carries them out on Solana, on its own.</p>
          <div class="reel" aria-hidden="true"><span class="reel-k">If</span><span class="reel-c" id="reelIf"></span><span class="reel-k">then</span><span class="reel-c reel-t" id="reelThen"></span></div>
          <p class="reel-cap">You write the rules. The coin follows them, and only them.</p>
          <div class="boot-actions">
            <button class="btn big hot" data-go="hatchery" data-primary>Enter the hatchery</button>
            <button class="btn big alt" id="hatchEgg">Hatch an egg</button>
          </div>
          <p class="boot-live"><i></i><span>Tokens launch for real on pump.fun. The pets under Examples only show how rules work.</span></p>
        </div>
        <div class="egg-stage"><button class="egg-btn" id="egg" aria-label="Hatch a random pet">${S.sprite('egg', { scale: 14 })}</button></div>
      </section>`;
    },
    mount(root) {
      const REEL = [['market cap reaches $10k', 'change its image'], ['24h volume drops below $8k', 'tweet “woof”'], ['1h change drops below -20%', 'buy back 2 SOL'], ['holders reach 1,000', 'airdrop 5 SOL to everyone'], ['age reaches 24h', 'rename itself']];
      let ri = 0;
      const showReel = () => {
        const a = $('#reelIf', root), b = $('#reelThen', root); if (!a) return;
        a.textContent = REEL[ri][0]; b.textContent = REEL[ri][1];
        [a, b].forEach(x => { x.style.animation = 'none'; void x.offsetWidth; x.style.animation = ''; });
        ri = (ri + 1) % REEL.length;
      };
      showReel(); this.reel = setInterval(showReel, 2800);
      const stage = $('.egg-stage', root);
      let busy = false;
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const confetti = () => {
        const c = document.createElement('div'); c.className = 'confetti';
        c.innerHTML = Array.from({ length: 22 }, () => `<i style="--x:${Math.round(Math.random() * 360 - 180)}px;--y:${Math.round(-Math.random() * 200 - 20)}px;--k:${COLORS[Math.floor(Math.random() * 6)]}"></i>`).join('');
        stage.appendChild(c); setTimeout(() => c.remove(), 1100);
      };
      async function hatch() {
        if (busy) return; busy = true;
        const btn = $('#egg', root);
        for (let i = 1; i <= 3; i++) {
          btn.innerHTML = S.sprite('egg', { scale: 14, crack: i }); btn.classList.add('cracking'); App.sfx('crack'); await sleep(330);
        }
        const key = E.pick(S.KEYS), sp = S.SPECIES[key];
        confetti(); App.sfx('hatch');
        btn.classList.remove('cracking');
        btn.innerHTML = `<span class="egg-pop"><span class="bubble">${esc(E.pick(sp.voice.idle))}</span>${S.sprite(key, { scale: 12, mood: 'hyped', label: sp.label })}</span>`;
        btn.setAttribute('aria-label', `A ${sp.label} hatched. Tap to hatch another.`);
        busy = false;
      }
      $('#egg', root).addEventListener('click', () => {
        const btn = $('#egg', root);
        if ($('.egg-pop', btn)) { btn.innerHTML = S.sprite('egg', { scale: 14 }); setTimeout(hatch, 120); } else hatch();
      });
      $('#hatchEgg', root).addEventListener('click', () => $('#egg', root).click());
    },
    unmount() { clearInterval(this.reel); }
  };

  /* ================= HATCHERY ================= */
  const hatchState = { filter: null }; // null = pick a sensible default each time (Newborn once something has really launched)
  const curFilter = () => hatchState.filter || (API.pets().some(p => !p.example) ? 'new' : 'examples');
  function nextRule(p) {
    let best = null;
    p.rules.forEach(r => {
      if (r.state === 'fired' && !r.repeat) return;
      const pr = E.progress(r, p);
      if (pr < 1 && (!best || pr > best.pr)) best = { r, pr };
    });
    return best;
  }
  function nextHtml(p) {
    const n = nextRule(p);
    const cnt = `${p.rules.length} rule${p.rules.length === 1 ? '' : 's'}`;
    if (!n) return { text: `${cnt} · every one has fired`, pct: 100 };
    const d = E.describe(n.r);
    const then = d.then.length > 44 ? d.then.slice(0, 43) + '…' : d.then;
    return { text: `${cnt} · next: ${d.cond} → ${then}`, pct: Math.round(n.pr * 100) };
  }
  /** The pets shown for the current tab. */
  function poolFor(f) {
    const all = API.pets();
    if (f === 'new') return all.filter(p => !p.example).sort((x, y) => y.createdAt - x.createdAt);
    if (f === 'examples') return all.filter(p => p.example).sort((x, y) => y.chg - x.chg);
    return all.slice().sort((x, y) => (y.mc == null ? -1 : y.mc) - (x.mc == null ? -1 : x.mc));
  }
  function tileHtml(p, i) {
    const nx = nextHtml(p);
    const pal = palFor(p);
    return `<li><button class="tile" ${i === 0 ? 'data-primary' : ''} data-pet="${p.id}" data-sig="${esc(sig(p))}" aria-label="${esc(p.name)}, ticker ${esc(p.ticker)}">
      <span class="terrarium" ${terr(p.species)}>${spriteFor(p, 8)}<span class="mood-tag">${p.mood}</span>${p.example ? '<span class="mood-tag mine-tag example-tag">example</span>' : (p.mine ? '<span class="mood-tag mine-tag">yours</span>' : '')}</span>
      <span class="tile-info">
        <span class="tile-name"><b data-f="name">${esc(p.name)}</b><i>$${esc(p.ticker)}</i></span>
        <span class="tile-stats"><span data-f="mc">${stat(p.mc, E.fmtUsd)}</span><span data-f="chg" class="${p.chg == null ? '' : p.chg >= 0 ? 'up' : 'down'}">${stat(p.chg, E.fmtPct)}</span><small>1h</small></span>
        <span class="tile-next" data-f="next">${esc(nx.text)}</span>
        <span class="bar" aria-hidden="true"><i data-f="bar" style="width:${nx.pct}%"></i></span>
      </span></button></li>`;
  }
  function tickerHtml() {
    const set = new Set(poolFor(curFilter()));
    const ev = API.events().filter(e => set.has(e.pet)).slice(0, 10);
    if (!ev.length) return '<span>Waiting for the first rule to fire.</span>';
    const items = ev.map(e => `<span><b>${esc(e.pet.name)}</b> ${esc(e.text.split(' because ')[0])}</span>`).join('');
    return items + `<span aria-hidden="true"></span>` + ev.map(e => `<span aria-hidden="true"><b>${esc(e.pet.name)}</b> ${esc(e.text.split(' because ')[0])}</span>`).join('');
  }
  const SUBS = {
    new: n => (n ? `${n} real token${n === 1 ? '' : 's'} launched here. Each one does only what its creator’s rules say.` : 'No tokens have launched here yet.'),
    examples: n => `${n} example pets that show how rules work. They aren’t real tokens and have no market.`,
    big: n => `Every pet, biggest market cap first. Pets tagged “example” are samples, not real tokens.`
  };
  const hatchery = {
    render() {
      const f = curFilter(), pets = poolFor(f);
      return `<section>
        <div class="hatch-head">
          <div><h2>The hatchery</h2><p class="sub">${SUBS[f](pets.length)}</p></div>
          <div class="chips" role="group" aria-label="Show" style="margin:0">
            <button class="chip" data-filter="new" aria-pressed="${f === 'new'}">Newborn</button>
            <button class="chip" data-filter="examples" aria-pressed="${f === 'examples'}">Examples</button>
            <button class="chip" data-filter="big" aria-pressed="${f === 'big'}">Biggest</button>
          </div>
        </div>
        ${pets.length ? `<div class="ticker" aria-label="Latest rules that fired"><div class="ticker-track" id="ticker">${tickerHtml()}</div></div>` : ''}
        <ul class="tiles" id="tiles">${pets.map((p, i) => tileHtml(p, i)).join('')}
          <li><button class="tile new-egg" ${pets.length ? '' : 'data-primary'} data-go="${f === 'new' ? 'launch' : 'rules'}">${S.sprite('egg', { scale: 6 })}<b>${f === 'new' ? 'Launch the first one' : 'Write the rules for yours'}</b><span>Pick cartridges, name it, launch it on pump.fun.</span></button></li>
        </ul>
      </section>`;
    },
    mount(root) {
      let unsub = [];
      root.addEventListener('click', e => {
        const t = e.target.closest('[data-pet]');
        if (t) return App.go('pet', { id: t.dataset.pet });
        const f = e.target.closest('[data-filter]');
        if (f) { hatchState.filter = f.dataset.filter; App.refresh('[data-filter="' + f.dataset.filter + '"]'); }
      });
      unsub.push(API.on('fire', ({ pet }) => {
        const el = $(`[data-pet="${pet.id}"]`, root);
        if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
        const tk = $('#ticker', root); if (tk) tk.innerHTML = tickerHtml();
      }));
      unsub.push(API.on('spawn', () => App.refresh()));
      unsub.push(API.on('update', () => App.refresh()));
      this.off = () => unsub.forEach(f => f());
    },
    tick(root) {
      API.pets().forEach(p => {
        const el = $(`[data-pet="${p.id}"]`, root); if (!el) return;
        const q = k => $(`[data-f="${k}"]`, el);
        q('name').textContent = p.name;
        q('mc').textContent = stat(p.mc, E.fmtUsd);
        const c = q('chg'); c.textContent = stat(p.chg, E.fmtPct); c.className = p.chg == null ? '' : p.chg >= 0 ? 'up' : 'down';
        const nx = nextHtml(p); q('next').textContent = nx.text; q('bar').style.width = nx.pct + '%';
        $('.mood-tag', el).textContent = p.mood;
        if (el.dataset.sig !== sig(p)) { $('.sprite', el).outerHTML = spriteFor(p, 8); el.dataset.sig = sig(p); }
        else swapMood($('.sprite', el), p.mood);
      });
    },
    unmount() { this.off && this.off(); }
  };

  /* ================= PET ================= */
  const ACTION_HEX = { pink: '#FF4FA3', sky: '#5CC8FF', orange: '#FF8A3D', green: '#6CD46C', yellow: '#FFD23F', purple: '#A98BFF' };
  function drawChart(canvas, p) {
    const W = canvas.width, H = canvas.height, c = canvas.getContext('2d');
    const cs = getComputedStyle($('#lcd'));
    const bg = cs.getPropertyValue('--bg').trim() || '#9BAA6B', lo = cs.getPropertyValue('--lo').trim() || '#7F8F52', ink = cs.getPropertyValue('--ink').trim() || '#232A12';
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = lo; for (let y = 8; y < H; y += 12) for (let x = 0; x < W; x += 4) c.fillRect(x, y, 1, 1);
    const mcR = p.rules.filter(r => r.metric === 'mc');
    const vals = p.hist.concat(mcR.map(r => r.value));
    const mn = Math.min.apply(null, vals) * 0.85, mx = Math.max.apply(null, vals) * 1.12;
    const y = v => Math.round(H - 8 - (Math.log(v) - Math.log(mn)) / (Math.log(mx) - Math.log(mn)) * (H - 16));
    const n = p.hist.length;
    let lastY = 0;
    for (let x = 0; x < W - 8; x++) {
      const f = (x / (W - 9)) * (n - 1), i = Math.floor(f), t = f - i;
      const v = p.hist[i] + ((p.hist[Math.min(n - 1, i + 1)] - p.hist[i]) * t);
      const yy = y(v); lastY = yy;
      c.fillStyle = lo; c.fillRect(x, yy, 1, H - yy);
      c.fillStyle = ink; c.fillRect(x, yy - 1, 1, 2);
    }
    mcR.forEach(r => {
      const yy = y(r.value), fired = r.state === 'fired';
      c.fillStyle = fired ? '#FF4FA3' : ink;
      for (let x = 0; x < W - 8; x += fired ? 2 : 5) c.fillRect(x, yy, fired ? 2 : 3, 1);
      c.fillStyle = ACTION_HEX[E.ACTIONS[r.action].cls]; c.fillRect(W - 7, yy - 3, 7, 7);
      c.fillStyle = ink; c.fillRect(W - 7, yy - 3, 7, 1); c.fillRect(W - 7, yy + 3, 7, 1); c.fillRect(W - 7, yy - 3, 1, 7); c.fillRect(W - 1, yy - 3, 1, 7);
    });
    if (Math.floor(Date.now() / 450) % 2) { c.fillStyle = '#FF4FA3'; c.fillRect(W - 14, lastY - 2, 5, 5); }
  }
  function ruleCardHtml(r, p) {
    const d = E.describe(r), a = E.ACTIONS[r.action];
    const fired = r.state === 'fired';
    const pr = Math.round(E.progress(r, p) * 100);
    const label = fired ? (r.repeat && E.world.tick - r.lastTick < 18 ? 'Cooling' : (r.repeat ? 'Armed' : 'Fired')) : 'Armed';
    return `<li class="rule-card" data-rule="${r.id}">
      <span class="cart cart-${a.cls}">${S.icon(r.action, 3)}</span>
      <div><p><b>If</b> ${esc(d.cond)}</p><p><b>Then</b> ${esc(d.then)}${r.repeat ? ' <span class="small">(every time)</span>' : ''}</p><div class="bar" aria-hidden="true"><i data-f="bar" style="width:${fired && !r.repeat ? 100 : pr}%"></i></div></div>
      <span class="state ${fired && label !== 'Armed' ? 'fired' : ''}" data-f="state">${label}</span></li>`;
  }
  function logHtml(p) {
    if (!p.log.length) return '<li class="empty">Nothing yet. The first rule to fire shows up here.</li>';
    return p.log.slice(0, 12).map(l => `<li><time>${ago(l.t)}</time><span>${esc(l.text)}</span></li>`).join('');
  }
  const pet = {
    petId: null,
    render(params) {
      const p = API.pet(params.id); this.petId = p && p.id;
      if (!p) return `<section><button class="btn sm back" data-go="hatchery">Back to the hatchery</button><h2>That pet is gone.</h2><p class="sub">It may have been renamed or removed. Head back and pick another.</p></section>`;
      return `<section>
        <button class="btn sm alt back" data-go="hatchery">Back to the hatchery</button>
        <div class="petpage">
          <div class="pet-hero">
            <div class="terrarium" ${terr(p.species)}><p class="bubble" id="say">${esc(p.say || '...')}</p>${spriteFor(p, 11, p.name)}</div>
            <h2 class="pet-name"><span data-f="name">${esc(p.name)}</span><small>$${esc(p.ticker)}</small></h2>
            <p class="pet-desc">${esc(p.desc || '')}</p>
            ${p.example ? '<p class="example-note">Example pet. It shows how rules work and isn’t a real token.</p>' : ''}
            <div class="ca"><code title="${esc(p.ca)}">${esc(p.ca.slice(0, 6))}…${esc(p.ca.slice(-6))}</code><button class="btn sm alt" data-copy>Copy address</button>${p.signature ? `<a class="btn sm alt" href="${Pump.links.tx(p.signature)}" target="_blank" rel="noopener">Solscan</a>` : ''}</div>
            <div class="pet-actions">${API.canEdit(p) ? '<button class="btn hot" data-edit data-primary>Edit rules</button>' : ''}${p.example ? '<button class="btn alt" disabled>Example only</button>' : `<button class="btn ${API.canEdit(p) ? 'alt' : 'hot'}" data-buy>${p.real ? `Trade $${esc(p.ticker)} on pump.fun` : `Buy $${esc(p.ticker)}`}</button>`}<button class="btn alt" data-clone>Clone these rules</button></div>
          </div>
          <div>
            <div class="stat-row">
              <div class="stat"><span>Market cap</span><b data-f="mc"></b></div>
              <div class="stat"><span>24h volume</span><b data-f="vol"></b></div>
              <div class="stat"><span>Holders</span><b data-f="holders"></b></div>
              <div class="stat"><span>1h change</span><b data-f="chg"></b></div>
            </div>
            <div class="section rules-sec"><h3>The rules ${esc(p.name)} follows</h3>
              <p class="creator-note">${API.canEdit(p) ? 'You wrote these. Rewrite them any time and the coin follows the new ones.' : (p.mine && p.real ? 'Only the wallet that launched this token can change these. Connect it to edit.' : 'Set by its creator. The coin does exactly this and nothing else.')}</p>
              <ul class="rule-list" id="rules">${p.rules.map(r => ruleCardHtml(r, p)).join('')}</ul></div>
            <div class="section"><div class="panel chart">${p.hist.length > 1 ? `<canvas id="chart" width="200" height="76" role="img" aria-label="Market cap over time with rule triggers marked"></canvas>
              <p class="chart-cap">Dashed lines mark the market cap triggers in its rules. They turn solid pink once fired.</p>` : '<p class="chart-empty">No market data yet. The chart and stats fill in once the token trades.</p>'}</div></div>
            <div class="section"><h3>Diary</h3><ul class="log" id="log">${logHtml(p)}</ul></div>
          </div>
        </div></section>`;
    },
    themeFor(params) { const p = API.pet(params.id); return p ? p.species : null; },
    mount(root, params) {
      const p = API.pet(params.id); if (!p) return;
      this.sig = sig(p); this.logN = -1;
      root.addEventListener('click', e => {
        if (e.target.closest('[data-copy]')) {
          try { navigator.clipboard.writeText(p.ca); } catch (err) { /* clipboard blocked */ }
          App.toast('Address copied');
        }
        if (e.target.closest('[data-edit]')) App.go('rules', { edit: p.id });
        if (e.target.closest('[data-buy]')) {
          window.dispatchEvent(new CustomEvent('rulepets:buy', { detail: p }));
          if (p.real) window.open(Pump.links.coin(p.mint), '_blank', 'noopener');
          App.toast(`Opening $${p.ticker}`);
        }
        if (e.target.closest('[data-clone]')) {
          draft.species = p.species; draft.color = p.color; draft.rules = p.rules.map(r => E.rule({ metric: r.metric, op: r.op, value: r.value, action: r.action, param: r.param, repeat: r.repeat }));
          saveDraft(); App.toast(`${p.name}’s cartridges are in your slots`); App.go('rules');
        }
      });
      this.tick(root);
    },
    tick(root) {
      const p = API.pet(this.petId); if (!p) return;
      const q = k => $(`[data-f="${k}"]`, root);
      q('name').textContent = p.name;
      q('mc').textContent = stat(p.mc, E.fmtUsd); q('vol').textContent = stat(p.vol, E.fmtUsd); q('holders').textContent = stat(p.holders, E.fmtNum);
      const c = q('chg'); c.textContent = stat(p.chg, E.fmtPct); c.className = p.chg == null ? '' : p.chg >= 0 ? 'up' : 'down';
      const sp = $('.pet-hero .sprite', root);
      if (this.sig !== sig(p)) { sp.outerHTML = spriteFor(p, 11, p.name); this.sig = sig(p); } else swapMood(sp, p.mood);
      $('#say', root).textContent = p.say || '...';
      p.rules.forEach(r => {
        const card = $(`[data-rule="${r.id}"]`, root); if (!card) return;
        const fresh = ruleCardHtml(r, p);
        const tmp = document.createElement('div'); tmp.innerHTML = fresh;
        const nw = tmp.firstElementChild;
        $('[data-f="bar"]', card).style.width = $('[data-f="bar"]', nw).style.width;
        if (r.state === 'fired' && r.lastTick === E.world.tick) { card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
        const st = $('[data-f="state"]', card); st.textContent = $('[data-f="state"]', nw).textContent; st.className = $('[data-f="state"]', nw).className;
      });
      if (this.logN !== p.log.length + ':' + (p.log[0] && p.log[0].t)) {
        this.logN = p.log.length + ':' + (p.log[0] && p.log[0].t);
        const lg = $('#log', root); lg.innerHTML = logHtml(p); if (lg.firstElementChild) lg.firstElementChild.classList.add('fresh');
      }
      const cv = $('#chart', root); if (cv) drawChart(cv, p);
    }
  };

  /* ================= PET-DEX ================= */
  const dex = {
    render() {
      return `<section>
        <h2>Pet-dex</h2>
        <p class="sub">Starter critters. Adopt one and its cartridges drop into your slots, ready to change.</p>
        <ul class="dex">${E.TEMPLATES.map((t, i) => {
          const sp = S.SPECIES[t.species];
          return `<li class="dexcard">
            <div class="terrarium" ${terr(t.species)}><span class="mood-tag dexno">#${String(i + 1).padStart(3, '0')}</span>${S.sprite(t.species, { scale: 9, mood: 'happy', label: t.name })}</div>
            <div class="dex-body">
              <h3 class="dex-kind">${esc(t.title)}</h3><p class="dex-who">${esc(t.name)} · $${esc(t.ticker)}</p>
              <p class="dex-story">${esc(t.story)}</p>
              <ul class="dex-rules">${t.rules.map(r => { const rr = E.rule(r), d = E.describe(rr), a = E.ACTIONS[rr.action]; return `<li><span class="cart cart-${a.cls}">${S.icon(rr.action, 2)}</span><span>${esc(d.text)}</span></li>`; }).join('')}</ul>
            </div>
            <footer><button class="btn" data-adopt="${t.key}">Adopt ${esc(t.name)}</button></footer></li>`;
        }).join('')}</ul></section>`;
    },
    mount(root) {
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-adopt]'); if (!b) return;
        const t = E.TEMPLATES.find(x => x.key === b.dataset.adopt);
        draft.species = t.species; draft.color = null;
        draft.rules = t.rules.map(r => E.rule(r));
        saveDraft(); App.sfx('ok'); App.toast(`${t.name}’s cartridges are in your slots`); App.go('rules');
      });
    }
  };

  /* ================= CARTRIDGES (editor) ================= */
  const MAX_SLOTS = 5;
  const SHELF = [
    ['image', 'Change image', 'swap its face'], ['tweet', 'Tweet', 'post to X'], ['burn', 'Burn supply', 'shrink the pile'],
    ['buyback', 'Buy back', 'defend the dip'], ['airdrop', 'Airdrop', 'gift holders'], ['rename', 'Rename', 'new name']
  ];
  const BENCH = [
    ['mc', 'Market cap', x => Math.round(1000 * Math.pow(10, 3 * x / 100) / 100) * 100 || 1000],
    ['vol', '24h volume', x => Math.round(1000 * Math.pow(10, 2.7 * x / 100) / 100) * 100],
    ['holders', 'Holders', x => Math.round(Math.pow(10, 3.7 * x / 100))],
    ['chg', '1h change', x => Math.round(-50 + x * 1.5)],
    ['age', 'Age', x => Math.round(x * 0.72)]
  ];
  const bench = { mc: 55, vol: 40, holders: 45, chg: 34, age: 30 };
  const benchStats = () => { const s = {}; BENCH.forEach(([k, , fn]) => { s[k] = fn(bench[k]); }); return s; };

  function parseValue(str, metric) {
    let s = String(str).trim().toLowerCase().replace(/[$,%\s]/g, '');
    let mult = 1;
    if (s.endsWith('k')) { mult = 1e3; s = s.slice(0, -1); } else if (s.endsWith('m')) { mult = 1e6; s = s.slice(0, -1); }
    else if (s.endsWith('d')) { mult = 24; s = s.slice(0, -1); } else if (s.endsWith('h')) s = s.slice(0, -1);
    const n = parseFloat(s) * mult;
    return isFinite(n) ? n : NaN;
  }
  function cyc(field, label, text, aria) {
    return `<span class="cyc" data-field="${field}"><button class="cyc-b" data-step="-1" aria-label="Previous ${aria || label}"></button><span class="cyc-v" aria-hidden="true">${esc(text)}</span><button class="cyc-b" data-step="1" aria-label="Next ${aria || label}"></button></span>`;
  }
  function slotHtml(r, i) {
    const m = E.METRICS[r.metric], a = E.ACTIONS[r.action];
    let param = '';
    if (a.text) param = `<input class="txt" data-field="param" value="${esc(r.param)}" maxlength="100" aria-label="${r.action === 'tweet' ? 'Tweet text' : 'New name'}">` + (r.action === 'tweet' ? `<button class="btn sm alt" data-remix aria-label="Suggest another tweet">Remix</button>` : '');
    else param = cyc('param', 'detail', a.fmt(r.param), 'option');
    return `<li class="slot" data-rule="${r.id}">
      <div class="cart cart-${a.cls}">${S.icon(r.action, 3)}</div>
      <div class="slot-body">
        <div class="slot-line"><span class="kw">If</span>${cyc('metric', 'condition', m.label)}${cyc('op', 'comparison', E.OPS[r.op])}
          <span class="cyc" data-field="value"><button class="cyc-b" data-step="-1" aria-label="Lower value"></button><input class="num" value="${esc(m.fmt(r.value))}" aria-label="Value" inputmode="decimal" autocomplete="off"><button class="cyc-b" data-step="1" aria-label="Higher value"></button></span></div>
        <div class="slot-line"><span class="kw">then</span>${cyc('action', 'action', a.label)}${param}</div>
        <div class="slot-meta">${cyc('repeat', 'repeat setting', r.repeat ? 'every time' : 'once', 'repeat setting')}</div>
      </div>
      <div class="slot-end"><span class="hit-badge" aria-hidden="true">fires</span><button class="btn sm alt" data-eject aria-label="Eject cartridge">Eject</button></div></li>`;
  }
  const emptySlot = `<li class="slot empty">Empty slot. Pick a cartridge below.</li>`;
  const slotsHtml = () => T().rules.map(slotHtml).join('') + Array.from({ length: MAX_SLOTS - T().rules.length }, () => emptySlot).join('');

  const rules = {
    render(params) {
      params = params || {};
      const target = params.edit && API.pet(params.edit);
      editing = target && API.canEdit(target) ? { id: target.id, name: target.name, species: target.species, color: target.color, rules: target.rules.map(r => E.rule({ metric: r.metric, op: r.op, value: r.value, action: r.action, param: r.param, repeat: r.repeat })) } : null;
      const sp = S.SPECIES[T().species];
      return `<section>
        ${editing
          ? `<h2>Rewrite ${esc(editing.name)}’s rules</h2><p class="sub">Changes go live on the coin the moment you save. Each change is written in its diary.</p>
             <div class="editbar"><button class="btn hot" data-save data-primary>Save to ${esc(editing.name)}</button><button class="btn alt" data-cancel>Cancel</button></div>`
          : `<h2>Cartridge bay</h2><p class="sub">Each cartridge is one rule: an if and a then. Slot up to ${MAX_SLOTS}. Your pet does exactly these things and nothing else.</p>`}
        <div class="editor">
          <div>
            <ul class="slots" id="slots">${slotsHtml()}</ul>
            <h3 style="margin-top:22px">Cartridge shelf</h3>
            <ul class="shelf">${SHELF.map(([k, t, d]) => `<li><button class="cart cart-${E.ACTIONS[k].cls}" data-add="${k}">${S.icon(k, 3)}<b>${t}</b><small>${d}</small></button></li>`).join('')}</ul>
          </div>
          <aside class="bench panel" aria-label="Test bench">
            <h3>Test bench</h3>
            <div class="picker"${editing ? ' hidden' : ''}><button class="btn sm" data-species="-1" aria-label="Previous pet body">Prev</button><output id="spName" aria-live="polite">${sp.label}</output><button class="btn sm" data-species="1" aria-label="Next pet body">Next</button></div>
            <div class="terrarium" id="bTerr" ${terr(T().species)}><p class="bubble" id="bSay">…</p>${S.sprite(T().species, { scale: 8, pal: palFor(T()) })}</div>
            ${BENCH.map(([k, t]) => `<label class="slide"><span>${t}</span><output data-out="${k}"></output><input type="range" min="0" max="100" value="${bench[k]}" data-bench="${k}"></label>`).join('')}
            <p class="bench-note">Drag the numbers. Any cartridge whose “if” becomes true lights up, and the pet acts it out.</p>
          </aside>
        </div></section>`;
    },
    themeFor() { return T().species; },
    mount(root) {
      const slots = $('#slots', root);
      const ruleOf = el => T().rules.find(r => r.id === el.closest('[data-rule]').dataset.rule);
      const listFor = (r, field) => {
        if (field === 'metric') return Object.keys(E.METRICS);
        if (field === 'op') return ['>=', '<='];
        if (field === 'action') return Object.keys(E.ACTIONS);
        if (field === 'repeat') return [false, true];
        if (field === 'param') return E.ACTIONS[r.action].presets;
        if (field === 'value') return E.METRICS[r.metric].presets;
      };
      function step(r, field, dir) {
        const list = listFor(r, field);
        if (field === 'value') {
          const l = list.slice().sort((a, b) => a - b);
          let idx = l.findIndex(v => v >= r.value);
          if (dir > 0) idx = l[idx] === r.value ? idx + 1 : idx; else idx = idx < 0 ? l.length - 1 : idx - 1;
          r.value = l[Math.max(0, Math.min(l.length - 1, idx))];
          return;
        }
        let i = list.indexOf(r[field]); if (i < 0) i = 0;
        r[field] = list[(i + dir + list.length) % list.length];
        if (field === 'metric') r.value = E.METRICS[r.metric].def;
        if (field === 'action') r.param = E.ACTIONS[r.action].def;
      }
      function redrawSlot(r, focusSel) {
        const el = $(`[data-rule="${r.id}"]`, slots);
        const i = T().rules.indexOf(r);
        const tmp = document.createElement('div'); tmp.innerHTML = slotHtml(r, i);
        el.replaceWith(tmp.firstElementChild);
        if (focusSel) { const f = $(`[data-rule="${r.id}"] ${focusSel}`, slots); if (f) f.focus({ preventScroll: true }); }
        persist(); refreshBench();
      }
      slots.addEventListener('click', e => {
        const r = e.target.closest('[data-rule]') && ruleOf(e.target);
        if (!r) return;
        const cycEl = e.target.closest('.cyc');
        if (e.target.closest('[data-remix]')) {
          r.param = E.TWEETS[(E.TWEETS.indexOf(r.param) + 1) % E.TWEETS.length]; App.sfx('tick'); return redrawSlot(r, '[data-remix]');
        }
        if (e.target.closest('[data-eject]')) {
          const el = e.target.closest('.slot'); App.sfx('eject');
          el.classList.add('ejecting');
          setTimeout(() => { T().rules = T().rules.filter(x => x !== r); persist(); slots.innerHTML = slotsHtml(); refreshBench(); const f = $('[data-add]', root); if (f) f.focus({ preventScroll: true }); }, 300);
          return;
        }
        if (!cycEl) return;
        const field = cycEl.dataset.field;
        const btn = e.target.closest('.cyc-b');
        const dir = btn ? +btn.dataset.step : (e.target.closest('.cyc-v') ? 1 : 0);
        if (!dir) return;
        step(r, field, dir); App.sfx('tick');
        redrawSlot(r, `[data-field="${field}"] .cyc-b[data-step="${dir}"]`);
      });
      slots.addEventListener('change', e => {
        const r = ruleOf(e.target); if (!r) return;
        if (e.target.classList.contains('num')) {
          const n = parseValue(e.target.value, r.metric);
          if (isFinite(n)) r.value = n;
          redrawSlot(r);
        }
      });
      slots.addEventListener('input', e => {
        if (e.target.classList.contains('txt')) { const r = ruleOf(e.target); r.param = e.target.value; persist(); refreshBench(); }
      });
      slots.addEventListener('keydown', e => {
        if (e.target.classList.contains('num') && e.key === 'Enter') e.target.blur();
      });

      root.addEventListener('click', e => {
        if (e.target.closest('[data-save]')) {
          const id = editing.id, name = editing.name;
          if (!T().rules.length) { App.toast('Keep at least one cartridge.'); App.sfx('back'); return; }
          API.updateRules(id, T().rules).then(() => { editing = null; App.sfx('hatch'); App.toast(`${name} follows the new rules`); App.go('pet', { id }, { silent: true }); });
          return;
        }
        if (e.target.closest('[data-cancel]')) { const id = editing.id; editing = null; App.go('pet', { id }, { silent: true }); return; }
        const add = e.target.closest('[data-add]');
        if (add) {
          if (T().rules.length >= MAX_SLOTS) { App.toast(`All ${MAX_SLOTS} slots are full. Eject one first.`); App.sfx('back'); return; }
          const r = E.rule({ action: add.dataset.add, metric: 'mc', value: 10000 });
          T().rules.push(r); persist(); App.sfx('clunk');
          slots.innerHTML = slotsHtml();
          const el = $(`[data-rule="${r.id}"]`, slots); el.classList.add('inserting');
          el.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          refreshBench(); return;
        }
        const sp = e.target.closest('[data-species]');
        if (sp) {
          const k = S.KEYS, i = k.indexOf(T().species);
          T().species = k[(i + (+sp.dataset.species) + k.length) % k.length]; T().color = null; persist(); App.sfx('tick');
          $('#spName', root).textContent = S.SPECIES[T().species].label;
          const tt = $('#bTerr', root);
          const tr = S.SPECIES[T().species].terrarium; tt.dataset.pat = tr.pat; tt.style.setProperty('--tbg', tr.bg); tt.style.setProperty('--tfg', tr.fg);
          applyTheme(T().species); benchSig = ''; refreshBench();
        }
      });
      root.addEventListener('input', e => {
        const k = e.target.dataset && e.target.dataset.bench; if (!k) return;
        bench[k] = +e.target.value; refreshBench();
      });

      let benchSig = '';
      function refreshBench() {
        const st = benchStats();
        BENCH.forEach(([k]) => { const o = $(`[data-out="${k}"]`, root); if (o) o.textContent = E.METRICS[k].fmt(st[k]); });
        const looks = []; let say = null, anyHit = false;
        T().rules.forEach(r => {
          const hit = E.holds(r, st);
          const el = $(`[data-rule="${r.id}"]`, slots); if (el) el.classList.toggle('hit', hit);
          if (!hit) return; anyHit = true;
          if (r.action === 'image' && !looks.includes(r.param)) looks.push(r.param);
          if (r.action === 'tweet') say = `“${r.param}”`;
          else if (!say) say = { image: 'new look!', burn: 'burning supply.', buyback: 'buying the dip.', airdrop: 'gift time!', rename: `call me ${r.param}.` }[r.action];
        });
        const mood = st.chg >= 12 ? 'hyped' : st.chg <= -14 ? 'scared' : st.vol < Math.max(3000, st.mc * 0.25) ? 'bored' : 'happy';
        const s = T().species + looks.join() + mood + T().color;
        const sp = $('#bTerr .sprite', root);
        if (s !== benchSig && sp) { sp.outerHTML = S.sprite(T().species, { scale: 8, mood, looks, pal: palFor(T()) }); benchSig = s; }
        $('#bSay', root).textContent = say || (anyHit ? '…' : E.pick(S.SPECIES[T().species].voice.idle));
      }
      refreshBench();
    }
  };

  /* ================= LAUNCH ================= */
  const cfgFee = () => (window.RulePetsConfig && window.RulePetsConfig.costBuffer) || 0.03;
  const shortAddr = a => a.slice(0, 4) + '…' + a.slice(-4);
  function receiptHtml() {
    const rl = draft.rules, w = API.wallet();
    return `<h3>Contract receipt</h3>
      ${rl.length ? `<ul style="list-style:none;margin:0;padding:0;display:grid;gap:7px">${rl.map(r => { const d = E.describe(r); return `<li>${esc(d.cond.replace(/^./, c => c.toUpperCase()))}<br><span>→ ${esc(d.then)}${r.repeat ? ', every time' : ''}</span></li>`; }).join('')}</ul>` : '<p>No cartridges yet.</p>'}
      <dl><dt>Launches on</dt><dd>pump.fun (Solana)</dd><dt>Supply</dt><dd>1,000,000,000</dd><dt>Rules</dt><dd>${rl.length} of ${MAX_SLOTS}</dd>
      <dt>Dev buy</dt><dd>${fmtSol(draft.devBuy)} SOL</dd><dt>Fee buffer</dt><dd>${cfgFee()} SOL</dd>
      <dt>Wallet</dt><dd>${w ? shortAddr(w) : 'not connected'}</dd></dl>`;
  }
  const STEPS = [
    ['balance', 'Checking your balance'], ['upload', 'Uploading image and details'], ['build', 'Building the transaction'],
    ['sign', 'Waiting for you to approve in Phantom'], ['confirm', 'Confirming on Solana']
  ];
  const launch = {
    render() {
      return `<section>
        <h2>Hatch your pet</h2>
        <p class="sub">Name it, pick its body, set your dev buy, then hold the button to launch it on pump.fun. You can rewrite its rules any time after it hatches.</p>
        <div class="launch">
          <form id="lform" novalidate onsubmit="return false">
            <div class="row2">
              <div class="field"><label for="f-name">Name</label><input id="f-name" type="text" maxlength="24" autocomplete="off" placeholder="Pumpy" value="${esc(draft.name)}"></div>
              <div class="field"><label for="f-tick">Ticker</label><input id="f-tick" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="PUMPY" value="${esc(draft.ticker)}"></div>
            </div>
            <div class="field"><label for="f-desc">What is it about?</label><textarea id="f-desc" rows="2" maxlength="140" placeholder="A little critter that only cares about one number.">${esc(draft.desc)}</textarea></div>
            <div class="field"><span class="label" id="l-body">Body</span>
              <div class="species" role="radiogroup" aria-labelledby="l-body">${S.KEYS.map(k => `<button type="button" role="radio" aria-checked="${draft.species === k}" aria-label="${S.SPECIES[k].label}" data-body="${k}">${S.sprite(k, { scale: 3 })}</button>`).join('')}</div></div>
            <div class="field"><span class="label" id="l-col">Colour</span>
              <div class="swatches" role="radiogroup" aria-labelledby="l-col"><button type="button" role="radio" aria-checked="${!draft.color}" aria-label="Original colour" data-color="" style="background:${S.SPECIES[draft.species].pal.b}"></button>${COLORS.map(c => `<button type="button" role="radio" aria-checked="${draft.color === c}" aria-label="Colour ${c}" data-color="${c}" style="background:${c}"></button>`).join('')}</div></div>
            <div class="field"><span class="label">Token image</span>
              <div class="file"><label class="btn sm alt" for="f-img" id="f-img-l" tabindex="0">Choose image</label><input id="f-img" type="file" accept="image/png,image/jpeg,image/gif,image/webp"><span id="imgnote" class="small">Optional, up to 4 MB. Skip it and the pet’s pixel face is used as the token image.</span></div></div>
            <div class="field"><label for="f-dev">Dev buy (SOL)</label>
              <div class="devbuy"><input id="f-dev" type="text" inputmode="decimal" autocomplete="off" value="${esc(String(draft.devBuy == null ? '' : draft.devBuy))}" aria-describedby="dev-help">
                <span class="dev-quick">${[0.1, 0.5, 1, 2].map(v => `<button type="button" class="chip" data-dev="${v}">${v}</button>`).join('')}<button type="button" class="chip" data-dev="max">Max</button></span></div>
              <small id="dev-help">The exact amount your wallet spends buying its own token at launch. Wallet balance: <b id="bal">${API.wallet() ? '…' : 'connect Phantom'}</b></small></div>
          </form>
          <aside>
            <div class="preview"><div class="terrarium" id="pTerr" ${terr(draft.species)}>${S.sprite(draft.species, { scale: 9, mood: 'happy', pal: palFor(draftPet()) })}</div>
              <p class="tagname"><span id="pName">${esc(draft.name || 'Your pet')}</span> <small id="pTick">$${esc(draft.ticker || 'TICKER')}</small></p></div>
            <div class="receipt" id="receipt">${receiptHtml()}</div>
            <p class="err" id="lerr" role="alert"></p>
            <button class="btn big hot hold" id="hold" data-hold type="button"><span>Hold to launch</span></button>
            <p class="hold-note small" id="holdnote"></p>
          </aside>
        </div></section>`;
    },
    themeFor() { return draft.species; },
    unmount() { this.off && this.off(); },
    mount(root) {
      const err = msg => { $('#lerr', root).textContent = msg || ''; };
      let balance = null;
      const notes = () => {
        const n = $('#holdnote', root); if (!n) return;
        n.textContent = `Holding opens Phantom to approve spending ${fmtSol(draft.devBuy)} SOL plus about ${cfgFee()} SOL in fees. Nothing is sent until you approve there.`;
      };
      const refreshBalance = () => {
        const b = $('#bal', root); if (!b) return;
        if (!API.wallet()) { balance = null; b.textContent = 'connect Phantom'; return; }
        b.textContent = '…';
        API.balance().then(v => { balance = v; if ($('#bal', root)) $('#bal', root).textContent = fmtSol(Math.round(v * 1e4) / 1e4) + ' SOL'; })
          .catch(() => { balance = null; if ($('#bal', root)) $('#bal', root).textContent = 'couldn’t load'; });
      };
      const refreshPreview = () => {
        $('#pName', root).textContent = draft.name || 'Your pet'; $('#pTick', root).textContent = '$' + (draft.ticker || 'TICKER');
        const t = $('#pTerr', root), tr = S.SPECIES[draft.species].terrarium;
        t.dataset.pat = tr.pat; t.style.setProperty('--tbg', tr.bg); t.style.setProperty('--tfg', tr.fg);
        $('.sprite', t).outerHTML = S.sprite(draft.species, { scale: 9, mood: 'happy', pal: palFor(draftPet()) });
        const first = $('[data-color=""]', root); if (first) first.style.background = S.SPECIES[draft.species].pal.b;
        $('#receipt', root).innerHTML = receiptHtml(); notes();
      };
      notes(); refreshBalance();
      this.off = API.on('wallet', () => { refreshBalance(); $('#receipt', root).innerHTML = receiptHtml(); });

      const setDev = v => { draft.devBuy = v; saveDraft(); $('#receipt', root).innerHTML = receiptHtml(); notes(); err(''); };
      root.addEventListener('input', e => {
        if (e.target.id === 'f-name') draft.name = e.target.value;
        if (e.target.id === 'f-tick') { e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); draft.ticker = e.target.value; }
        if (e.target.id === 'f-desc') draft.desc = e.target.value;
        if (e.target.id === 'f-dev') {
          e.target.value = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
          const n = e.target.value === '' ? null : parseFloat(e.target.value); return setDev(Number.isFinite(n) ? n : null);
        }
        saveDraft(); $('#pName', root).textContent = draft.name || 'Your pet'; $('#pTick', root).textContent = '$' + (draft.ticker || 'TICKER'); err('');
      });
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-body]');
        if (b) { draft.species = b.dataset.body; draft.color = null; saveDraft(); $$('[data-body]', root).forEach(x => x.setAttribute('aria-checked', x === b)); $$('[data-color]', root).forEach(x => x.setAttribute('aria-checked', x.dataset.color === '')); applyTheme(draft.species); App.sfx('tick'); refreshPreview(); }
        const c = e.target.closest('[data-color]');
        if (c) { draft.color = c.dataset.color || null; saveDraft(); $$('[data-color]', root).forEach(x => x.setAttribute('aria-checked', x === c)); App.sfx('tick'); refreshPreview(); }
        const d = e.target.closest('[data-dev]');
        if (d) {
          let v = d.dataset.dev === 'max' ? (balance == null ? null : Math.max(0, Math.floor((balance - cfgFee()) * 1e4) / 1e4)) : +d.dataset.dev;
          if (v == null) return App.toast('Connect Phantom to use Max');
          $('#f-dev', root).value = String(v); setDev(v); App.sfx('tick');
        }
      });
      $('#f-img-l', root).addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#f-img', root).click(); } });
      $('#f-img', root).addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { e.target.value = ''; return err('Use a PNG, JPG, GIF or WebP image.'); }
        if (f.size > 4 * 1024 * 1024) { e.target.value = ''; return err('That image is over 4 MB. Pick a smaller one.'); }
        draft.imageFile = f; err('');
        $('#imgnote', root).innerHTML = `<img class="thumb" alt="Chosen token image" src="${URL.createObjectURL(f)}"> ${esc(f.name)}`;
      });
      if (draft.imageFile) $('#imgnote', root).innerHTML = `<img class="thumb" alt="Chosen token image" src="${URL.createObjectURL(draft.imageFile)}"> ${esc(draft.imageFile.name)}`;

      const hold = $('#hold', root);
      let start = 0, raf = 0, launching = false;
      const cancel = () => { start = 0; cancelAnimationFrame(raf); hold.classList.remove('go'); hold.style.setProperty('--p', 0); };
      const loop = () => {
        const p = Math.min(1, (performance.now() - start) / 1000); hold.style.setProperty('--p', p);
        if (p >= 1) { cancel(); finish(); } else raf = requestAnimationFrame(loop);
      };
      const begin = () => { if (start || launching) return; start = performance.now(); hold.classList.add('go'); App.sfx('charge'); loop(); };
      hold.addEventListener('pointerdown', begin);
      ['pointerup', 'pointerleave', 'pointercancel', 'blur', 'keyup'].forEach(ev => hold.addEventListener(ev, cancel));
      hold.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); begin(); } });
      hold.addEventListener('abutton', e => (e.detail === 'down' ? begin() : cancel()));
      hold.addEventListener('click', () => { /* holding is required */ });

      async function finish() {
        if (launching) return;
        const name = draft.name.trim(), tick = draft.ticker.trim();
        const bad = (msg, sel) => { err(msg); App.shake(); App.sfx('back'); const f = $(sel, root); if (f) f.focus(); };
        if (!name) return bad('Give your pet a name.', '#f-name');
        if (tick.length < 2) return bad('Tickers need 2 to 8 letters or numbers.', '#f-tick');
        if (!draft.rules.length) return bad('Slot in at least one cartridge first.', '#hold');
        if (!Number.isFinite(draft.devBuy) || draft.devBuy < 0) return bad('Enter your dev buy in SOL. Use 0 for none.', '#f-dev');
        err('');
        if (!API.wallet()) {
          try { await API.connectWallet(); } catch (e) {
            return bad(e && e.message === 'no-phantom' ? 'Phantom isn’t installed. Get it at phantom.app, then try again.' : 'Connect your Phantom wallet to launch.', '#hold');
          }
        }
        launching = true;
        try { await runLaunch(); } finally { launching = false; }
      }

      async function runLaunch() {
        const ov = $('#overlay'), n = draft.rules.length;
        const close = () => { ov.hidden = true; ov.innerHTML = ''; };
        ov.hidden = false;
        ov.innerHTML = `<div class="hatch"><span class="egg">${S.sprite('egg', { scale: 11 })}</span><h2>Launching ${esc(draft.name.trim())}…</h2>
          <ol class="steps" aria-live="polite">${STEPS.map(([k, t]) => `<li data-step="${k}">${t}</li>`).join('')}</ol>
          <p class="small">Keep this tab open. Nothing is spent unless you approve in Phantom.</p></div>`;
        App.sfx('charge');
        const onStep = k => {
          let seen = false;
          $$('.steps li', ov).forEach(li => { if (li.dataset.step === k) { seen = true; li.className = 'now'; } else li.className = seen ? '' : 'done'; });
          if (k === 'sign') $('.egg', ov).innerHTML = S.sprite('egg', { scale: 11, crack: 1 });
          if (k === 'confirm') $('.egg', ov).innerHTML = S.sprite('egg', { scale: 11, crack: 2 });
        };
        let pet;
        try {
          pet = await API.launch(Object.assign({}, draft, { rules: draft.rules.map(r => Object.assign({}, r)), onStep }));
        } catch (e) {
          App.sfx('back');
          const sent = ['send-failed', 'tx-failed', 'unconfirmed'].includes(e.kind);
          ov.innerHTML = `<div class="hatch"><span class="egg">${S.sprite('egg', { scale: 11 })}</span><h2>It didn’t launch</h2>
            <p class="sub" role="alert">${esc(e.message || 'Something went wrong.')}</p>
            <p class="small">${sent ? 'Check the transaction before trying again, in case it went through.' : 'Nothing was spent.'}</p>
            <div class="boot-actions" style="justify-content:center">${e.signature ? `<a class="btn big alt" href="${Pump.links.tx(e.signature)}" target="_blank" rel="noopener">View on Solscan</a>` : ''}<button class="btn big hot" data-close data-primary>Back to the form</button></div></div>`;
          ov.onclick = ev => { if (ev.target.closest('[data-close]')) close(); };
          App.focusFirst(ov); return;
        }
        $('.egg', ov).innerHTML = S.sprite('egg', { scale: 11, crack: 3 }); App.sfx('crack');
        await new Promise(r => setTimeout(r, 450));
        App.sfx('hatch'); App.led();
        ov.innerHTML = `<div class="hatch"><div class="confetti">${Array.from({ length: 26 }, () => `<i style="--x:${Math.round(Math.random() * 440 - 220)}px;--y:${Math.round(-Math.random() * 240 - 20)}px;--k:${COLORS[Math.floor(Math.random() * 6)]}"></i>`).join('')}</div>
          ${S.sprite(pet.species, { scale: 10, mood: 'hyped', pal: palFor(pet), label: pet.name })}
          <h2>${esc(pet.name)} is live.</h2><p class="sub">$${esc(pet.ticker)} launched on pump.fun with ${n} rule${n === 1 ? '' : 's'}.</p><code>${esc(pet.mint)}</code>
          <div class="hatch-links"><a href="${Pump.links.coin(pet.mint)}" target="_blank" rel="noopener">pump.fun</a><a href="${Pump.links.tx(pet.signature)}" target="_blank" rel="noopener">Solscan</a></div>
          <div class="boot-actions" style="justify-content:center"><button class="btn big hot" data-view="${pet.id}" data-primary>Meet ${esc(pet.name)}</button><button class="btn big alt" data-edit-rules="${pet.id}">Edit its rules</button><button class="btn big alt" data-close>Back to the hatchery</button></div></div>`;
        draft.name = ''; draft.ticker = ''; draft.desc = ''; draft.imageFile = null; saveDraft();
        App.focusFirst(ov);
        ov.onclick = ev => {
          const v = ev.target.closest('[data-view]'), c = ev.target.closest('[data-close]'), ed = ev.target.closest('[data-edit-rules]');
          if (v) { close(); App.go('pet', { id: v.dataset.view }); }
          if (ed) { close(); App.go('rules', { edit: ed.dataset.editRules }); }
          if (c) { close(); App.go('hatchery'); }
        };
      }
    }
  };

  g.Screens = { boot, hatchery, pet, dex, rules, launch, applyTheme, order: ['hatchery', 'dex', 'rules', 'launch'], labels: { hatchery: 'Hatchery', dex: 'Pet-dex', rules: 'Cartridges', launch: 'Launch' }, icons: { hatchery: 'egg', dex: 'book', rules: 'chip', launch: 'rocket' }, draft };
})(window);
