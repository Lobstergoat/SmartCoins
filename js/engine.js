/* Rulepets — rules engine and live pet world.
   A rule is: { id, metric, op, value, action, param, repeat }.
   The UI only talks to window.RulePets (see api.js); swap that adapter for real endpoints. */
(function (g) {
  'use strict';

  const fmtUsd = n => {
    const a = Math.abs(n);
    if (a >= 1e6) return '$' + trim(n / 1e6) + 'm';
    if (a >= 1e3) return '$' + trim(n / 1e3) + 'k';
    return '$' + Math.round(n);
  };
  const trim = n => (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
  const fmtNum = n => (Math.abs(n) >= 1e3 ? trim(n / 1e3) + 'k' : String(Math.round(n)));
  const fmtPct = n => (n > 0 ? '+' : '') + trim(n) + '%';
  const fmtHours = n => (n >= 24 && n % 24 === 0 ? n / 24 + 'd' : n + 'h');

  const METRICS = {
    mc: { label: 'market cap', fmt: fmtUsd, presets: [2500, 5000, 8000, 10000, 15000, 25000, 50000, 100000, 250000, 500000, 1000000], def: 10000 },
    vol: { label: '24h volume', fmt: fmtUsd, presets: [2000, 5000, 8000, 10000, 20000, 30000, 50000, 100000, 250000], def: 8000 },
    holders: { label: 'holders', fmt: fmtNum, presets: [50, 100, 250, 500, 1000, 2500, 5000], def: 250 },
    chg: { label: '1h price change', fmt: fmtPct, presets: [-50, -30, -20, -10, 10, 25, 50, 100], def: -20 },
    age: { label: 'age', fmt: fmtHours, presets: [1, 6, 12, 24, 48, 72], def: 24 }
  };
  const OPS = { '>=': 'reaches', '<=': 'drops below' };

  const LOOKS = ['sparkles', 'crown', 'shades', 'aura'];
  const LOOK_LABEL = { sparkles: 'sparkle face', crown: 'tiny crown', shades: 'cool shades', aura: 'golden aura' };
  const TWEETS = [
    'it is quiet. too quiet. woof.',
    'volume is back. good pet.',
    'we just crossed a milestone.',
    'new look, who dis',
    'rules are rules.',
    'a whole day old and still here.'
  ];
  const ACTIONS = {
    image: { label: 'change image', cls: 'pink', def: 'sparkles', presets: LOOKS, fmt: v => LOOK_LABEL[v] || v },
    tweet: { label: 'tweet', cls: 'sky', def: TWEETS[2], text: true },
    burn: { label: 'burn supply', cls: 'orange', def: 1, presets: [0.5, 1, 2, 5, 10], fmt: v => v + '%' },
    buyback: { label: 'buy back', cls: 'green', def: 1, presets: [0.5, 1, 2, 5], fmt: v => v + ' SOL' },
    airdrop: { label: 'airdrop', cls: 'yellow', def: 1, presets: [0.5, 1, 2, 5], fmt: v => v + ' SOL' },
    rename: { label: 'rename', cls: 'purple', def: 'Pet Prime', text: true }
  };

  const COOLDOWN_TICKS = 18;
  const MIN_PER_TICK = 2;
  const TICK_MS = 1900;

  let uid = 1;
  const nextId = p => p + (uid++).toString(36);

  function rule(o) {
    const m = METRICS[o.metric || 'mc'];
    const a = ACTIONS[o.action || 'image'];
    return {
      id: o.id || nextId('r'),
      metric: o.metric || 'mc',
      op: o.op || '>=',
      value: o.value != null ? o.value : m.def,
      action: o.action || 'image',
      param: o.param != null ? o.param : a.def,
      repeat: !!o.repeat,
      state: 'armed',
      lastTick: -999
    };
  }

  function describe(r) {
    const m = METRICS[r.metric];
    const a = ACTIONS[r.action];
    const cond = `${m.label} ${OPS[r.op]} ${m.fmt(r.value)}`;
    let then = a.label;
    if (r.action === 'image') then = `change image to ${a.fmt(r.param)}`;
    else if (r.action === 'tweet') then = `tweet “${r.param}”`;
    else if (r.action === 'rename') then = `rename to “${r.param}”`;
    else if (r.action === 'burn') then = `burn ${a.fmt(r.param)} of supply`;
    else if (r.action === 'buyback') then = `buy back ${a.fmt(r.param)}`;
    else if (r.action === 'airdrop') then = `airdrop ${a.fmt(r.param)} to holders`;
    return { cond, then, text: `If ${cond}, ${then}` };
  }

  const holds = (r, s) => {
    const v = s[r.metric];
    return r.op === '>=' ? v >= r.value : v <= r.value;
  };

  /** 0..1 — how close a rule is to firing (1 = condition true). */
  function progress(r, s) {
    const v = s[r.metric];
    if (holds(r, s)) return 1;
    if (r.metric === 'chg') {
      if (r.op === '<=') return v >= 0 ? 0 : Math.max(0, Math.min(1, v / r.value));
      return Math.max(0, Math.min(1, v / r.value));
    }
    if (r.op === '>=') return Math.max(0, Math.min(1, v / r.value));
    return Math.max(0, Math.min(1, r.value / Math.max(v, 1)));
  }

  /* ---------- world ---------- */
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const randn = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.7;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const caFor = () => { const c = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let s = ''; for (let i = 0; i < 44; i++) s += c[Math.floor(rnd() * c.length)]; return s + 'pump'; };

  const world = { pets: [], events: [], tick: 0, listeners: {} };
  const on = (ev, fn) => { (world.listeners[ev] = world.listeners[ev] || []).push(fn); return () => { world.listeners[ev] = world.listeners[ev].filter(f => f !== fn); }; };
  const emit = (ev, data) => (world.listeners[ev] || []).forEach(fn => fn(data));

  function makePet(o) {
    const mc = o.mc || 4000;
    return {
      id: o.id || nextId('p'),
      name: o.name, ticker: o.ticker, species: o.species, color: o.color || null,
      desc: o.desc || '',
      ca: o.ca || caFor(),
      mc, vol: o.vol || mc * 0.9, holders: o.holders || 12, chg: 0, age: o.age || 0,
      burned: 0, looks: [], mood: 'happy',
      hist: [mc],
      vola: o.vola || 0.05, drift: o.drift || 0.002,
      rules: (o.rules || []).map(rule),
      log: [], flash: 0, bornTick: world.tick, say: null
    };
  }

  function moodOf(p) {
    if (p.chg >= 12) return 'hyped';
    if (p.chg <= -14) return 'scared';
    if (p.vol < Math.max(3000, p.mc * 0.25)) return 'bored';
    return 'happy';
  }

  function voiceFor(p) {
    const v = Sprites.SPECIES[p.species].voice;
    return pick(v[p.mood] || v.idle);
  }

  function addLog(p, kind, text, t) {
    const entry = { t: t || Date.now(), kind, text };
    p.log.unshift(entry);
    if (p.log.length > 40) p.log.pop();
    const ev = { pet: p, kind, text, t: entry.t };
    world.events.unshift(ev);
    if (world.events.length > 60) world.events.pop();
    return entry;
  }

  function applyRule(p, r, silent, t) {
    const a = ACTIONS[r.action];
    let text;
    switch (r.action) {
      case 'image':
        if (!p.looks.includes(r.param)) p.looks.push(r.param);
        text = `Changed image: ${a.fmt(r.param)}`; break;
      case 'tweet': text = `Tweeted “${r.param}”`; break;
      case 'burn': p.burned += r.param; p.mc *= 1.01; text = `Burned ${r.param}% of supply`; break;
      case 'buyback': p.mc *= 1.025; text = `Bought back ${r.param} SOL`; break;
      case 'airdrop': p.holders += Math.round(6 + rnd() * 20); text = `Airdropped ${r.param} SOL to holders`; break;
      case 'rename': p.name = r.param; text = `Renamed itself “${r.param}”`; break;
    }
    const why = describe(r);
    const entry = addLog(p, r.action, `${text} because ${why.cond}`, t);
    entry.rule = r.id;
    p.flash = 6;
    p.say = r.action === 'tweet' ? r.param : voiceFor(p);
    if (!silent) emit('fire', { pet: p, rule: r, entry });
  }

  function step(p, silent, backdateMs) {
    p.mc = Math.max(1800, Math.min(3e6, p.mc * Math.exp(p.drift + p.vola * 0.5 * randn())));
    const target = p.mc * (0.7 + 0.5 * Math.abs(Math.sin(world.tick / 11 + p.bornTick)));
    p.vol = Math.max(900, p.vol * 0.85 + target * 0.15 * (0.8 + rnd() * 0.5));
    p.holders += rnd() < 0.35 + Math.min(0.4, p.chg / 100) ? Math.ceil(rnd() * 3) : 0;
    p.age += MIN_PER_TICK / 60;
    p.hist.push(p.mc);
    if (p.hist.length > 90) p.hist.shift();
    const ref = p.hist[Math.max(0, p.hist.length - 31)];
    p.chg = Math.round(((p.mc / ref) - 1) * 1000) / 10;
    p.rules.forEach(r => {
      if (!holds(r, p)) return;
      if (r.state === 'fired' && !r.repeat) return;
      if (r.repeat && world.tick - r.lastTick < COOLDOWN_TICKS) return;
      r.state = 'fired'; r.lastTick = world.tick;
      applyRule(p, r, silent, backdateMs);
    });
    p.mood = moodOf(p);
    if (!silent && rnd() < 0.05) p.say = voiceFor(p);
    if (p.flash > 0) p.flash--;
  }

  function tick() {
    world.tick++;
    world.pets.forEach(p => step(p, false));
    emit('tick', world);
  }

  /* ---------- seed ---------- */
  const S = (metric, op, value, action, param, repeat) => ({ metric, op, value, action, param, repeat });
  const TEMPLATES = [
    { key: 'pump', species: 'blob', title: 'Market cap pump pet', story: 'Waits for the market cap to reach 10k, then changes its face and tells everyone.',
      name: 'Pumpy', ticker: 'PUMPY', desc: 'A little critter that only cares about one number.',
      rules: [S('mc', '>=', 10000, 'image', 'sparkles'), S('mc', '>=', 10000, 'tweet', '10k. i grew a little.'), S('mc', '>=', 50000, 'image', 'crown')] },
    { key: 'watch', species: 'dog', title: 'Volume watchdog', story: 'Barks on Twitter whenever volume goes quiet, and celebrates when it comes back.',
      name: 'Barkley', ticker: 'BARKLY', desc: 'Guards the volume. Notices everything.',
      rules: [S('vol', '<=', 8000, 'tweet', 'it is quiet. too quiet. woof.', true), S('vol', '>=', 30000, 'tweet', 'volume is back. good pet.', true)] },
    { key: 'shape', species: 'frog', title: 'Shapeshifter', story: 'Gets a brand new look at every market cap milestone. Never the same coin twice.',
      name: 'Chroma', ticker: 'CHRMA', desc: 'Changes faces as it grows.',
      rules: [S('mc', '>=', 5000, 'image', 'sparkles'), S('mc', '>=', 20000, 'image', 'shades'), S('mc', '>=', 80000, 'image', 'aura')] },
    { key: 'owl', species: 'owl', title: 'Night shift owl', story: 'Watches the chart around the clock and steps in when the price falls off a cliff.',
      name: 'Nocturne', ticker: 'HOOT', desc: 'Never sleeps. Never sells.',
      rules: [S('age', '>=', 24, 'tweet', 'a whole day old and still here.'), S('chg', '<=', -20, 'buyback', 2, true), S('vol', '>=', 20000, 'image', 'shades')] },
    { key: 'turtle', species: 'turtle', title: 'Diamond hands turtle', story: 'Pays the community as it grows. The more holders, the bigger the gift.',
      name: 'Shellby', ticker: 'SHLBY', desc: 'Slow, steady, generous.',
      rules: [S('holders', '>=', 250, 'airdrop', 1), S('holders', '>=', 1000, 'airdrop', 5), S('chg', '<=', -30, 'burn', 1)] },
    { key: 'ghost', species: 'ghost', title: 'Dip guardian', story: 'Buys back automatically whenever the price drops, then haunts the chart quietly.',
      name: 'Wraith', ticker: 'BOO', desc: 'Floors are meant to be defended.',
      rules: [S('chg', '<=', -15, 'buyback', 1, true), S('mc', '<=', 4000, 'tweet', 'i am still here.', true)] },
    { key: 'whale', species: 'whale', title: 'Whale welcome wagon', story: 'Rolls out the welcome mat when the big money shows up.',
      name: 'Moby', ticker: 'MOBY', desc: 'Big buyers get a big hello.',
      rules: [S('vol', '>=', 50000, 'tweet', 'whale season.'), S('mc', '>=', 30000, 'airdrop', 2), S('holders', '>=', 300, 'image', 'crown')] },
    { key: 'burn', species: 'cat', title: 'Burn cat', story: 'Lights a match under the supply every time the price dips, and again at big milestones.',
      name: 'Ember', ticker: 'EMBR', desc: 'Supply only goes one direction.',
      rules: [S('chg', '<=', -10, 'burn', 1, true), S('mc', '>=', 15000, 'image', 'aura'), S('mc', '>=', 100000, 'burn', 5)] }
  ];

  const SEED = [
    { tpl: 'pump', mc: 9200, drift: 0.004, vola: 0.045, holders: 188 },
    { tpl: 'watch', mc: 14000, drift: -0.002, vola: 0.04, holders: 340, vol: 6800 },
    { tpl: 'shape', mc: 17500, drift: 0.003, vola: 0.06, holders: 260 },
    { tpl: 'owl', mc: 31000, drift: 0.001, vola: 0.05, holders: 512, age: 21 },
    { tpl: 'turtle', mc: 52000, drift: 0.0005, vola: 0.025, holders: 880 },
    { tpl: 'ghost', mc: 6400, drift: -0.002, vola: 0.06, holders: 96 },
    { tpl: 'whale', mc: 26000, drift: 0.002, vola: 0.055, holders: 290, vol: 42000 },
    { tpl: 'burn', mc: 12500, drift: 0.002, vola: 0.065, holders: 150 }
  ];

  function hydrate() {
    SEED.forEach((s, i) => {
      const t = TEMPLATES.find(x => x.key === s.tpl);
      const p = makePet({ name: t.name, ticker: t.ticker, species: t.species, desc: t.desc, rules: t.rules, mc: s.mc, vol: s.vol, holders: s.holders, age: s.age || (2 + i * 3), drift: s.drift, vola: s.vola, id: 'seed-' + t.key });
      p.mc = s.mc * 0.8;
      p.hist = [p.mc];
      world.pets.push(p);
    });
    const N = 70;
    for (let i = 0; i < N; i++) {
      world.tick++;
      world.pets.forEach(p => step(p, true, Date.now() - (N - i) * MIN_PER_TICK * 60000));
    }
    world.events.sort((a, b) => b.t - a.t);
    world.pets.forEach(p => { p.flash = 0; p.say = voiceFor(p); });
  }

  let timer = null;
  function start() { if (!timer) timer = setInterval(tick, TICK_MS); }

  function spawn(draft) {
    const p = makePet({
      name: draft.name, ticker: draft.ticker.toUpperCase(), species: draft.species, color: draft.color, desc: draft.desc,
      rules: draft.rules, mc: 3200, holders: 1, age: 0, vola: 0.06, drift: 0.004
    });
    p.hist = [p.mc];
    p.say = 'hello world. i have rules.';
    addLog(p, 'launch', `Hatched with ${p.rules.length} rule${p.rules.length === 1 ? '' : 's'}`);
    world.pets.unshift(p);
    emit('spawn', p);
    return p;
  }

  hydrate();

  g.Engine = { METRICS, OPS, ACTIONS, LOOKS, LOOK_LABEL, TWEETS, TEMPLATES, world, on, rule, describe, holds, progress, moodOf, voiceFor, fmtUsd, fmtNum, fmtPct, start, tick, spawn, pick: a => a[Math.floor(Math.random() * a.length)] };
})(window);
