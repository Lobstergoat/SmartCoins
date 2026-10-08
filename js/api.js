/* Rulepets — data adapter.
   The interface reads and writes through window.RulePets only. Everything below runs against the
   in-browser pet world in engine.js. To go live, replace the bodies of these functions with fetch /
   websocket calls and keep the shapes the same.

   Pet shape the UI expects:
   { id, name, ticker, species, color|null, desc, ca, mine (true if the viewer created it),
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

  g.RulePets = {
    /** Current pets, newest launches first. */
    pets: () => E.world.pets,
    pet: id => E.world.pets.find(p => p.id === id),
    /** Latest rule events across every pet. */
    events: () => E.world.events,
    /** Subscribe to 'tick' (world updated), 'fire' ({pet, rule, entry}), 'spawn' (pet), 'update' (pet, after rules change). Returns unsubscribe. */
    on: E.on,
    connect: () => E.start(),
    /**
     * Launch a token. draft = { name, ticker, desc, species, color, image|null, devBuy, rules[] }.
     * Resolve with the created pet (with a real mint address).
     */
    launch: draft => new Promise(resolve => setTimeout(() => resolve(E.spawn(draft)), 650)),
    /** Can the current user rewrite this pet's rules? Backend: compare pet.owner to the connected wallet. */
    canEdit: p => !!p.mine,
    /** Save new rules on a live pet. rules[] use the same shape as a launch draft. Resolve with the updated pet. */
    updateRules: (id, rules) => new Promise(resolve => setTimeout(() => resolve(E.updateRules(E.world.pets.find(p => p.id === id), rules)), 250)),
    /** Wallet hook — return the connected address or null. */
    wallet: () => null
  };
})(window);
