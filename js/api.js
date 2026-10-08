/* Rulepets — data adapter.
   The interface reads and writes through window.RulePets only. Everything below runs against the
   in-browser pet world in engine.js. To go live, replace the bodies of these functions with fetch /
   websocket calls and keep the shapes the same.

   Pet shape the UI expects:
   { id, name, ticker, species, color|null, desc, ca, mine (true if the viewer created it), owner (wallet address|null),
     mc, vol, holders, chg, age,            // numbers: USD, USD, count, % over 1h, hours
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
  let hooked = false;
  const hook = p => {
    if (hooked) return; hooked = true;
    p.on && p.on('connect', pk => setAddr(pk));
    p.on && p.on('disconnect', () => setAddr(null));
    p.on && p.on('accountChanged', pk => setAddr(pk)); // pk is null if the user revoked access
  };

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
     * Launch a token. draft = { name, ticker, desc, species, color, image|null, devBuy, rules[] }.
     * Resolve with the created pet (with a real mint address).
     */
    launch: draft => new Promise(resolve => setTimeout(() => resolve(E.spawn(Object.assign({}, draft, { owner: addr }))), 650)),
    /** Can the current user rewrite this pet's rules? Backend: compare pet.owner to the connected wallet. */
    canEdit: p => !!p.mine,
    /** Save new rules on a live pet. rules[] use the same shape as a launch draft. Resolve with the updated pet. */
    updateRules: (id, rules) => new Promise(resolve => setTimeout(() => resolve(E.updateRules(E.world.pets.find(p => p.id === id), rules)), 250)),
    /** Connected wallet address (base58) or null. Emits 'wallet' on change. */
    wallet: () => addr,
    hasWallet: () => !!provider(),
    /** Ask Phantom to connect. Rejects with Error('no-phantom') if it isn't installed, or Phantom's own error (code 4001 = user declined). */
    connectWallet: async () => {
      const p = provider(); if (!p) throw new Error('no-phantom');
      hook(p); const r = await p.connect(); setAddr(r.publicKey || p.publicKey); return addr;
    },
    disconnectWallet: async () => { const p = provider(); if (p) await p.disconnect(); setAddr(null); }
  };
})(window);
