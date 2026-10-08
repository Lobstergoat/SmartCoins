/* PairPets — screens. Each screen: render(params) → html, mount(root, params), tick(root), unmount(). */
(function (g) {
  'use strict';
  const E = g.Engine, S = g.Sprites, API = g.PairPets;
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
    const d = { name: '', ticker: '', desc: '', species: 'blob', color: null, image: null, devBuy: 0.5, rules: DEFAULT_RULES() };
    try {
      const saved = JSON.parse(localStorage.getItem('pairpets.draft') || 'null');
      if (saved && Array.isArray(saved.rules)) { Object.assign(d, saved, { image: null }); d.rules = saved.rules.map(r => E.rule(r)); }
    } catch (e) { /* storage unavailable */ }
    return d;
  }
  const draft = loadDraft();
  let editing = null; // { id, name, species, color, rules } when rewriting a live pet's rules
  const T = () => editing || draft;
  const persist = () => { if (!editing) saveDraft(); };
  const saveDraft = () => {
    try { localStorage.setItem('pairpets.draft', JSON.stringify(Object.assign({}, draft, { image: null, rules: draft.rules.map(r => ({ metric: r.metric, op: r.op, value: r.value, action: r.action, param: r.param, repeat: r.repeat })) }))); } catch (e) { /* ignore */ }
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
          <p class="boot-live"><i></i><span id="bootCount">${API.pets().length} pets are following their rules right now.</span></p>
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
  let hatchState = { filter: 'hot' };
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
  function sortPets(list) {
    const l = list.slice();
    if (hatchState.filter === 'hot') l.sort((a, b) => b.chg - a.chg);
    else if (hatchState.filter === 'new') l.sort((a, b) => a.age - b.age);
    else l.sort((a, b) => b.mc - a.mc);
    return l;
  }
  function tileHtml(p, i) {
    const nx = nextHtml(p);
    const pal = palFor(p);
    return `<li><button class="tile" ${i === 0 ? 'data-primary' : ''} data-pet="${p.id}" data-sig="${esc(sig(p))}" aria-label="${esc(p.name)}, ticker ${esc(p.ticker)}">
      <span class="terrarium" ${terr(p.species)}>${spriteFor(p, 8)}<span class="mood-tag">${p.mood}</span>${p.mine ? '<span class="mood-tag mine-tag">yours</span>' : ''}</span>
      <span class="tile-info">
        <span class="tile-name"><b data-f="name">${esc(p.name)}</b><i>$${esc(p.ticker)}</i></span>
        <span class="tile-stats"><span data-f="mc">${E.fmtUsd(p.mc)}</span><span data-f="chg" class="${p.chg >= 0 ? 'up' : 'down'}">${E.fmtPct(p.chg)}</span><small>1h</small></span>
        <span class="tile-next" data-f="next">${esc(nx.text)}</span>
        <span class="bar" aria-hidden="true"><i data-f="bar" style="width:${nx.pct}%"></i></span>
      </span></button></li>`;
  }
  function tickerHtml() {
    const ev = API.events().slice(0, 10);
    if (!ev.length) return '<span>Waiting for the first rule to fire.</span>';
    const items = ev.map(e => `<span><b>${esc(e.pet.name)}</b> ${esc(e.text.split(' because ')[0])}</span>`).join('');
    return items + `<span aria-hidden="true"></span>` + ev.map(e => `<span aria-hidden="true"><b>${esc(e.pet.name)}</b> ${esc(e.text.split(' because ')[0])}</span>`).join('');
  }
  const hatchery = {
    render() {
      const pets = sortPets(API.pets());
      const f = hatchState.filter;
      return `<section>
        <div class="hatch-head">
          <div><h2>The hatchery</h2><p class="sub">${pets.length} pets, and each one does only what its creator’s rules say. Open one to read its rules and its diary.</p></div>
          <div class="chips" role="group" aria-label="Sort pets" style="margin:0">
            <button class="chip" data-filter="hot" aria-pressed="${f === 'hot'}">Hot</button>
            <button class="chip" data-filter="new" aria-pressed="${f === 'new'}">Newborn</button>
            <button class="chip" data-filter="big" aria-pressed="${f === 'big'}">Biggest</button>
          </div>
        </div>
        <div class="ticker" aria-label="Latest rules that fired"><div class="ticker-track" id="ticker">${tickerHtml()}</div></div>
        <ul class="tiles" id="tiles">${pets.map((p, i) => tileHtml(p, i)).join('')}
          <li><button class="tile new-egg" data-go="rules">${S.sprite('egg', { scale: 6 })}<b>Write the rules for yours</b><span>Pick cartridges, name it, hatch it.</span></button></li>
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
        q('mc').textContent = E.fmtUsd(p.mc);
        const c = q('chg'); c.textContent = E.fmtPct(p.chg); c.className = p.chg >= 0 ? 'up' : 'down';
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
            <div class="ca"><code title="${esc(p.ca)}">${esc(p.ca.slice(0, 6))}…${esc(p.ca.slice(-6))}</code><button class="btn sm alt" data-copy>Copy address</button></div>
            <div class="pet-actions">${API.canEdit(p) ? '<button class="btn hot" data-edit data-primary>Edit rules</button>' : ''}<button class="btn ${API.canEdit(p) ? 'alt' : 'hot'}" data-buy>Buy $${esc(p.ticker)}</button><button class="btn alt" data-clone>Clone these rules</button></div>
          </div>
          <div>
            <div class="stat-row">
              <div class="stat"><span>Market cap</span><b data-f="mc"></b></div>
              <div class="stat"><span>24h volume</span><b data-f="vol"></b></div>
              <div class="stat"><span>Holders</span><b data-f="holders"></b></div>
              <div class="stat"><span>1h change</span><b data-f="chg"></b></div>
            </div>
            <div class="section rules-sec"><h3>The rules ${esc(p.name)} follows</h3>
              <p class="creator-note">${API.canEdit(p) ? 'You wrote these. Rewrite them any time and the coin follows the new ones.' : 'Set by its creator. The coin does exactly this and nothing else.'}</p>
              <ul class="rule-list" id="rules">${p.rules.map(r => ruleCardHtml(r, p)).join('')}</ul></div>
            <div class="section"><div class="panel chart"><canvas id="chart" width="200" height="76" role="img" aria-label="Market cap over time with rule triggers marked"></canvas>
              <p class="chart-cap">Dashed lines mark the market cap triggers in its rules. They turn solid pink once fired.</p></div></div>
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
        if (e.target.closest('[data-buy]')) { window.dispatchEvent(new CustomEvent('pairpets:buy', { detail: p })); App.toast(`Opening $${p.ticker}`); }
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
      q('mc').textContent = E.fmtUsd(p.mc); q('vol').textContent = E.fmtUsd(p.vol); q('holders').textContent = E.fmtNum(p.holders);
      const c = q('chg'); c.textContent = E.fmtPct(p.chg); c.className = p.chg >= 0 ? 'up' : 'down';
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
      drawChart($('#chart', root), p);
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
  function receiptHtml() {
    const rl = draft.rules;
    return `<h3>Contract receipt</h3>
      ${rl.length ? `<ul style="list-style:none;margin:0;padding:0;display:grid;gap:7px">${rl.map(r => { const d = E.describe(r); return `<li>${esc(d.cond.replace(/^./, c => c.toUpperCase()))}<br><span>→ ${esc(d.then)}${r.repeat ? ', every time' : ''}</span></li>`; }).join('')}</ul>` : '<p>No cartridges yet.</p>'}
      <dl><dt>Network</dt><dd>Solana</dd><dt>Supply</dt><dd>1,000,000,000</dd><dt>Rules</dt><dd>${rl.length} of ${MAX_SLOTS}</dd><dt>Dev buy</dt><dd>${draft.devBuy} SOL</dd><dt>Rules editable by</dt><dd>You</dd></dl>`;
  }
  const launch = {
    render() {
      return `<section>
        <h2>Hatch your pet</h2>
        <p class="sub">Name it, pick its body, check the receipt, then hold the button. You can rewrite its rules any time after it hatches.</p>
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
              <div class="file"><label class="btn sm alt" for="f-img" id="f-img-l" tabindex="0">Choose image</label><input id="f-img" type="file" accept="image/*"><span id="imgnote" class="small">Optional. Skip it and the pet’s pixel face is used.</span></div></div>
            <div class="field"><span class="label">Dev buy at launch</span><div>${cyc('devBuy', 'dev buy', draft.devBuy + ' SOL', 'dev buy amount')}</div></div>
          </form>
          <aside>
            <div class="preview"><div class="terrarium" id="pTerr" ${terr(draft.species)}>${S.sprite(draft.species, { scale: 9, mood: 'happy', pal: palFor(draftPet()) })}</div>
              <p class="tagname"><span id="pName">${esc(draft.name || 'Your pet')}</span> <small id="pTick">$${esc(draft.ticker || 'TICKER')}</small></p></div>
            <div class="receipt" id="receipt">${receiptHtml()}</div>
            <p class="err" id="lerr" role="alert"></p>
            <button class="btn big hot hold" id="hold" data-hold type="button"><span>Hold to hatch</span></button>
          </aside>
        </div></section>`;
    },
    themeFor() { return draft.species; },
    mount(root) {
      const err = msg => { $('#lerr', root).textContent = msg || ''; };
      const refreshPreview = () => {
        $('#pName', root).textContent = draft.name || 'Your pet'; $('#pTick', root).textContent = '$' + (draft.ticker || 'TICKER');
        const t = $('#pTerr', root), tr = S.SPECIES[draft.species].terrarium;
        t.dataset.pat = tr.pat; t.style.setProperty('--tbg', tr.bg); t.style.setProperty('--tfg', tr.fg);
        $('.sprite', t).outerHTML = S.sprite(draft.species, { scale: 9, mood: 'happy', pal: palFor(draftPet()) });
        const first = $('[data-color=""]', root); if (first) first.style.background = S.SPECIES[draft.species].pal.b;
        $('#receipt', root).innerHTML = receiptHtml();
      };
      root.addEventListener('input', e => {
        if (e.target.id === 'f-name') draft.name = e.target.value;
        if (e.target.id === 'f-tick') { e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); draft.ticker = e.target.value; }
        if (e.target.id === 'f-desc') draft.desc = e.target.value;
        saveDraft(); $('#pName', root).textContent = draft.name || 'Your pet'; $('#pTick', root).textContent = '$' + (draft.ticker || 'TICKER'); err('');
      });
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-body]');
        if (b) { draft.species = b.dataset.body; draft.color = null; saveDraft(); $$('[data-body]', root).forEach(x => x.setAttribute('aria-checked', x === b)); $$('[data-color]', root).forEach(x => x.setAttribute('aria-checked', x.dataset.color === '')); applyTheme(draft.species); App.sfx('tick'); refreshPreview(); }
        const c = e.target.closest('[data-color]');
        if (c) { draft.color = c.dataset.color || null; saveDraft(); $$('[data-color]', root).forEach(x => x.setAttribute('aria-checked', x === c)); App.sfx('tick'); refreshPreview(); }
        const cb = e.target.closest('.cyc-b[data-step]');
        if (cb) {
          const list = [0, 0.5, 1, 2, 5]; const i = list.indexOf(draft.devBuy);
          draft.devBuy = list[(i + (+cb.dataset.step) + list.length) % list.length];
          $('.cyc-v', cb.parentNode).textContent = draft.devBuy + ' SOL'; $('#receipt', root).innerHTML = receiptHtml(); saveDraft(); App.sfx('tick');
        }
      });
      $('#f-img-l', root).addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#f-img', root).click(); } });
      $('#f-img', root).addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => { draft.image = rd.result; $('#imgnote', root).innerHTML = `<img class="thumb" alt="Chosen token image" src="${rd.result}"> ${esc(f.name)}`; };
        rd.readAsDataURL(f);
      });
      const hold = $('#hold', root);
      let start = 0, raf = 0;
      const cancel = () => { start = 0; cancelAnimationFrame(raf); hold.classList.remove('go'); hold.style.setProperty('--p', 0); };
      const loop = () => {
        const p = Math.min(1, (performance.now() - start) / 1000); hold.style.setProperty('--p', p);
        if (p >= 1) { cancel(); finish(); } else raf = requestAnimationFrame(loop);
      };
      const begin = () => { if (start) return; start = performance.now(); hold.classList.add('go'); App.sfx('charge'); loop(); };
      hold.addEventListener('pointerdown', begin);
      ['pointerup', 'pointerleave', 'pointercancel', 'blur', 'keyup'].forEach(ev => hold.addEventListener(ev, cancel));
      hold.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); begin(); } });
      hold.addEventListener('abutton', e => (e.detail === 'down' ? begin() : cancel()));
      hold.addEventListener('click', () => { /* holding is required */ });

      function finish() {
        const name = draft.name.trim(), tick = draft.ticker.trim();
        const bad = (msg, sel) => { err(msg); App.shake(); App.sfx('back'); const f = $(sel, root); if (f) f.focus(); };
        if (!name) return bad('Give your pet a name.', '#f-name');
        if (tick.length < 2) return bad('Tickers need 2 to 8 letters or numbers.', '#f-tick');
        if (!draft.rules.length) return bad('Slot in at least one cartridge first.', '#hold');
        err(''); runHatch();
      }
      async function runHatch() {
        const ov = $('#overlay');
        ov.hidden = false;
        ov.innerHTML = `<div class="hatch"><span class="egg">${S.sprite('egg', { scale: 12, crack: 1 })}</span><h2>Writing ${draft.rules.length} rule${draft.rules.length === 1 ? '' : 's'} into the shell…</h2></div>`;
        App.sfx('charge');
        const eggEl = $('.egg', ov);
        const t1 = setTimeout(() => { eggEl.innerHTML = S.sprite('egg', { scale: 12, crack: 2 }); App.sfx('crack'); }, 420);
        const t2 = setTimeout(() => { eggEl.innerHTML = S.sprite('egg', { scale: 12, crack: 3 }); App.sfx('crack'); }, 840);
        const [pet] = await Promise.all([API.launch(Object.assign({}, draft, { rules: draft.rules.map(r => Object.assign({}, r)) })), new Promise(r => setTimeout(r, 1300))]);
        clearTimeout(t1); clearTimeout(t2);
        App.sfx('hatch'); App.led();
        ov.innerHTML = `<div class="hatch"><div class="confetti">${Array.from({ length: 26 }, () => `<i style="--x:${Math.round(Math.random() * 440 - 220)}px;--y:${Math.round(-Math.random() * 240 - 20)}px;--k:${COLORS[Math.floor(Math.random() * 6)]}"></i>`).join('')}</div>
          ${S.sprite(pet.species, { scale: 10, mood: 'hyped', pal: palFor(pet), label: pet.name })}
          <h2>${esc(pet.name)} hatched.</h2><p class="sub">$${esc(pet.ticker)} is live and following ${pet.rules.length} rule${pet.rules.length === 1 ? '' : 's'}.</p><code>${esc(pet.ca)}</code>
          <div class="boot-actions" style="justify-content:center"><button class="btn big hot" data-view="${pet.id}" data-primary>Meet ${esc(pet.name)}</button><button class="btn big alt" data-edit-rules="${pet.id}">Edit its rules</button><button class="btn big alt" data-close>Back to the hatchery</button></div></div>`;
        draft.name = ''; draft.ticker = ''; draft.desc = ''; draft.image = null; saveDraft();
        App.focusFirst(ov);
        ov.onclick = e => {
          const v = e.target.closest('[data-view]'), c = e.target.closest('[data-close]');
          if (v) { ov.hidden = true; ov.innerHTML = ''; App.go('pet', { id: v.dataset.view }); }
          const ed = e.target.closest('[data-edit-rules]');
          if (ed) { ov.hidden = true; ov.innerHTML = ''; App.go('rules', { edit: ed.dataset.editRules }); }
          if (c) { ov.hidden = true; ov.innerHTML = ''; App.go('hatchery'); }
        };
      }
    }
  };

  g.Screens = { boot, hatchery, pet, dex, rules, launch, applyTheme, order: ['hatchery', 'dex', 'rules', 'launch'], labels: { hatchery: 'Hatchery', dex: 'Pet-dex', rules: 'Cartridges', launch: 'Launch' }, icons: { hatchery: 'egg', dex: 'book', rules: 'chip', launch: 'rocket' }, draft };
})(window);
