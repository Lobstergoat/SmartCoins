# Rulepets

Launch a Solana token that follows your rules. Every coin is a pocket pet living on a handheld. You slot in rule cartridges ("if market cap reaches $10k, change image", "if 24h volume drops below $8k, tweet") and the pet carries them out on its own.

This repo is the front end. It is plain HTML, CSS and JavaScript with no build step.

```
python3 -m http.server 8000   # then open http://localhost:8000
```

## How it works

| Control | What it does |
| --- | --- |
| D-pad | Moves a blinking cursor between things on the screen. Left/right nudges sliders. |
| A | Selects. On "Hold to hatch" it is a press-and-hold. |
| B | Back. Closes overlays. |
| C | Next screen: Hatchery, Pet-dex, Cartridges, Launch. |

Keyboard: arrows, Enter or Z, X or Esc, C. Everything on screen is also directly clickable and tappable.

Screens: **Hatchery** (live pets and a ticker of rules that just fired), **Pet page** (stats, chart with rule triggers, rule status, diary), **Pet-dex** (starter critters such as the market cap pump pet or the volume watchdog), **Cartridges** (the rule editor with a test bench), **Launch** (name, body, receipt, hold to hatch).

Each pet carries its own sprite, terrarium pattern, screen colour theme and voice. Deep links: `#hatchery`, `#dex`, `#rules`, `#launch`, `#pet/<id>`.

## Launching a real token

The Launch screen creates a real token on **pump.fun** from the connected Phantom wallet:

1. It reads the wallet balance and refuses if `dev buy + ~0.03 SOL` isn't there.
2. It uploads the image (the creator's file, or the species' pixel face rendered to a 512px PNG) and the name, ticker and description to pump.fun's metadata endpoint.
3. It asks PumpPortal (`/api/trade-local`) for an unsigned `create` transaction with the **exact** dev buy, co-signs with a freshly generated mint key, and hands it to Phantom.
4. Phantom shows the real amounts and the wallet owner approves. Nothing is spent before that.
5. It waits for confirmation, then shows the mint address, pump.fun and Solscan links.

Settings live in `js/config.js`. **Set `rpc` to your own endpoint** (Helius, QuickNode...): the public Solana RPC is rate-limited and will fail under real use. The Solana library is vendored in `vendor/` (`@solana/web3.js` 1.98.4).

Launched tokens are remembered in the creator's browser (`localStorage`) until your backend lists them.

**Tabs in the Hatchery:** *Newborn* lists real launches. *Examples* is a built-in simulation of eight sample pets and is labelled as such everywhere. *Biggest* mixes both. Real tokens show "—" for market cap, volume and holders until your backend reports them with `RulePets.pushStats(id, { mc, vol, holders, chg, age })`, which also runs that token's rules.

**Not done by the front end:** pump.fun tokens can't carry rules on-chain. The cartridges are saved in the creator's browser; something on your backend has to watch the token and act on them (tweeting, burning, buying back and airdropping all need keys or API access the browser doesn't have).

## Music

Drop your track in the repo root as `song.mp3`. It loops quietly (about 16% volume), fades in after the first click or key press (browsers block audio before that), and pauses when the tab is hidden. The round note button in the top bar mutes it, and the choice is remembered. If `song.mp3` is missing the button simply stays hidden.

## Files

- `index.html` – the handheld shell
- `css/styles.css` – shell, LCD, components, motion
- `js/sprites.js` – pixel art, species palettes and themes
- `js/engine.js` – rule model, evaluation, live pet world
- `js/api.js` – **the data adapter. Replace this to connect the backend**
- `js/pump.js` – the pump.fun launch flow; `js/config.js` – RPC and launch settings; `vendor/` – the Solana library
- `js/screens.js` – the five screens
- `js/app.js` – routing, D-pad cursor, buttons, sound

## Connecting the backend

All UI data goes through `window.RulePets` in `js/api.js`. The pet and rule shapes are documented at the top of that file.

- `pets()`, `pet(id)`, `events()` – current state
- `on('tick' | 'fire' | 'spawn', fn)` – push updates (websocket handler goes here)
- `launch(draft)` – called when the user finishes the hold-to-hatch. `draft` has `name, ticker, desc, species, color, image (data URL|null), devBuy, rules[]`. Resolve with the created pet.
- `wallet()` – the connected Phantom address (or `null`); `connectWallet()` / `disconnectWallet()` drive the status-bar button, and a `wallet` event fires on change. New pets store it as `pet.owner`.
- The Buy button dispatches a `rulepets:buy` window event with the pet in `detail`.

Rule vocabulary: metrics `mc | vol | holders | chg | age`, ops `>= | <=`, actions `image | tweet | burn | buyback | airdrop | rename`.
