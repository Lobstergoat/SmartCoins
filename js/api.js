/* Rulepets — data adapter.
   The interface reads and writes through window.RulePets only.
   - launch() really creates the token on pump.fun with the connected Phantom wallet (see pump.js).
   - Launched tokens are remembered in this browser (localStorage) until your backend lists them.
   - Real tokens have no market data of their own: call pushStats(id, {mc, vol, holders, chg, age}) as
     your backend learns them. Rules are evaluated when stats are pushed.
   - The Examples tab is a built-in simulation (engine.js) and is clearly labelled as such in the UI.

   Pet shape the UI expects:
   { id, name, ticker, species, color|null, desc, ca (mint address), mine (true if the viewer created it), owner (wallet address|null),
     real (launched on pump.fun) / example (built-in sample), signature,
     mc, vol, holders, chg, age,            // numbers: USD, USD, count, % over 1h, hours (null until known for real tokens)
     burned, looks[], mood, hist[],         // hist: recent market-cap samples, oldest first
     rules[{ id, metric, op, value, action, param, repeat, state }],
     log[{ t, kind, text, rule }], say }

   metric: mc | vol | holders | chg | age      op: >= | <=
   action: image | tweet | burn | buyback | airdrop | rename
*/
(function (g) {
  'use strict';
  const E = g.Engine;

  /* Phantom (Solana). window.phantom.solana is the injected provider; window.solana is the legacy alias. */
  let addr = null;
  const provider = () => {
    const p = (g.phantom && g.phantom.solana) || g.solana;
    return p && p.isPhantom ? p : null;
  };
  const setAddr = pk => { const next = pk ? pk.toString() : null; if (next !== addr) { addr = next; E.emit('wallet', addr); } };
  let hooked = false, inflight = null;
  const hook = p => {
    if (hooked) return; hooked = true;
    p.on && p.on('connect', pk => setAddr(pk));
    p.on && p.on('disconnect', () => setAddr(null));
    p.on && p.on('accountChanged', pk => setAddr(pk)); // pk is null if the user revoked access
  };

  /* Tokens launched from this browser, kept until the backend serves them. */
  const KEY = 'rulepets.launched';
  const ruleOut = r => ({ metric: r.metric, op: r.op, value: r.value, action: r.action, param: r.param, repeat: r.repeat });
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(E.world.pets.filter(p => p.real).map(p => ({
        mint: p.mint, signature: p.signature, name: p.name, ticker: p.ticker, desc: p.desc, species: p.species, color: p.color,
        owner: p.owner, looks: p.looks, createdAt: p.createdAt, rules: p.rules.map(ruleOut)
      }))));
    } catch (e) { /* storage unavailable */ }
  };
  try {
    (JSON.parse(localStorage.getItem(KEY) || '[]') || []).sort((a, b) => a.createdAt - b.createdAt)
      .forEach(rec => E.spawn(Object.assign({}, rec, { restored: true })));
  } catch (e) { /* ignore a corrupt save */ }
  E.on('spawn', persist); E.on('update', persist);

  const bodyPal = c => (c ? { b: c, d: g.Sprites.shade(c, -0.3), l: g.Sprites.shade(c, 0.45) } : null);

  g.RulePets = {
    /** Current pets, newest launches first. */
    pets: () => E.world.pets,
    pet: id => E.world.pets.find(p => p.id === id),
    /** Latest rule events across every pet. */
    events: () => E.world.events,
    /** Subscribe to 'tick' (world updated), 'fire' ({pet, rule, entry}), 'spawn' (pet), 'update' (pet, after rules change), 'wallet' (address|null). Returns unsubscribe. */
    on: E.on,
    connect: () => {
      E.start();
      const p = provider();
      if (p) { hook(p); p.connect({ onlyIfTrusted: true }).then(r => setAddr(r.publicKey)).catch(() => { /* not pre-approved */ }); }
    },
    /**
     * Launch a real token on pump.fun, signed by the connected Phantom wallet.
     * draft = { name, ticker, desc, species, color, imageFile (File|null), devBuy (SOL), rules[], onStep(step) }.
     * Uses imageFile, or the pixel face of the chosen species if there isn't one. Resolves with the new pet
     * (pet.ca / pet.mint is the real mint address). Rejects with Error whose .kind says why (see pump.js).
     */
    launch: async draft => {
      const p = provider();
      if (!p || !addr) { const e = new Error('Connect your Phantom wallet first.'); e.kind = 'no-wallet'; throw e; }
      const image = draft.imageFile || await g.Sprites.png(draft.species, { pal: bodyPal(draft.color) });
      const out = await g.Pump.launch({ provider: p, address: addr, name: draft.name.trim(), ticker: draft.ticker.trim().toUpperCase(), desc: draft.desc, image, devBuy: draft.devBuy, onStep: draft.onStep });
      return E.spawn({ name: draft.name.trim(), ticker: draft.ticker.trim(), desc: draft.desc, species: draft.species, color: draft.color, rules: draft.rules, devBuy: draft.devBuy, mint: out.mint, signature: out.signature, owner: addr });
    },
    /** SOL balance of the connected wallet (null if none). */
    balance: () => (addr ? g.Pump.balance(addr) : Promise.resolve(null)),
    /** Backend → UI: report a real token's stats (any subset of mc, vol, holders, chg, age). Evaluates its rules. */
    pushStats: (id, stats) => { const p = E.world.pets.find(x => x.id === id); if (p) E.pushStats(p, stats); },
    /** Can the current user rewrite this pet's rules? Only the wallet that launched it (never the examples). */
    canEdit: p => !!p.mine && !p.example && (!p.owner || p.owner === addr),
    /** Save new rules on a live pet. rules[] use the same shape as a launch draft. Resolve with the updated pet. */
    updateRules: (id, rules) => new Promise(resolve => setTimeout(() => resolve(E.updateRules(E.world.pets.find(p => p.id === id), rules)), 250)),
    /** Connected wallet address (base58) or null. Emits 'wallet' on change. */
    wallet: () => addr,
    hasWallet: () => !!provider(),
    /** Ask Phantom to connect. Rejects with Error('no-phantom') if it isn't installed, or Phantom's own error (code 4001 = user declined). */
    connectWallet: (force) => {
      const p = provider(); if (!p) return Promise.reject(new Error('no-phantom'));
      // Re-use a request that's still waiting on the user, so repeated clicks don't stack up approval popups in Phantom.
      if (inflight && !force) return inflight;
      hook(p);
      const mine = inflight = Promise.resolve().then(() => p.connect()).then(r => { setAddr(r.publicKey || p.publicKey); return addr; })
        .finally(() => { if (inflight === mine) inflight = null; });
      return mine;
    },
    /** True while a connect request is waiting for the user to approve it in Phantom. */
    walletPending: () => !!inflight,
    disconnectWallet: async () => { const p = provider(); if (p) await p.disconnect(); setAddr(null); }
  };
})(window);
