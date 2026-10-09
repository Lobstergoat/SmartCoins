/* Rulepets — pixel art. Every critter is a character grid rendered to SVG.
   Legend: o outline · b body · d shade · l light · a accent · e eye · p cheek · w white · k dark · g gold */
(function (g) {
  'use strict';

  const ROWS = {
    egg: [
      '....oooooo....',
      '...ollbbbbo...',
      '..ollbbabbbo..',
      '..olbbbbbbbo..',
      '.olbbbbbbabbo.',
      '.obbabbbbbbbo.',
      '.obbbbbbbbbdo.',
      '.obbbbbabbbdo.',
      '.obbbbbbbbddo.',
      '..obbbbbbddo..',
      '..oddbbbdddo..',
      '...ooddddoo...'
    ],
    blob: [
      '......aa......',
      '.....aaaa.....',
      '....oooooo....',
      '...obbbbbbo...',
      '..obblbbbbbo..',
      '.obbbbbbbbbbo.',
      '.obbebbbbebbo.',
      '.obbbbbbbbbbo.',
      '.obpbbooobbpo.',
      '.obbbbbbbbbbo.',
      '..odddddddddo.',
      '...oooooooooo.'
    ],
    dog: [
      '.oo........oo.',
      'oddo.oooo.oddo',
      'oddbobbbbobddo',
      '.obbbbbbbbbbo.',
      '.obbebbbbebbo.',
      '.obbbbooobbbo.',
      '.obbbolllobbo.',
      '.obbbbolobbbo.',
      '..obbbbbbbbo..',
      '...oooooooo...'
    ],
    frog: [
      '.oooo....oooo.',
      'owweo....oewwo',
      'owwwoooooowwwo',
      '.obbbbbbbbbbo.',
      'obbbbbbbbbbbbo',
      'obbaabbbbaabbo',
      'obbbbbbbbbbbbo',
      'obblllllllllbo',
      '.obbbbbbbbbbo.',
      '.oaao.oo.oaao.',
      '..oo......oo..'
    ],
    owl: [
      '.o..........o.',
      '.ob........bo.',
      '.obbooooooobbo',
      'obbbbbbbbbbbbo',
      'obwwwwbbwwwwbo',
      'obweewbbweewbo',
      'obwwwwbbwwwwbo',
      '.obbbbaabbbbo.',
      '.obllbbbbllbo.',
      '.obllbbbbllbo.',
      '..obbbbbbbbo..',
      '...aa....aa...'
    ],
    turtle: [
      '....oooooo....',
      '..ooddaaddoo..',
      '.oddaddddaddo.',
      'oddddaddaddddo',
      'oooooooooooooo',
      '.obbbbbbbbbbo.',
      '.obebbbbbbebo.',
      '.obbbbaabbbbo.',
      '..oobbbbbboo..',
      '..oo.oooo.oo..'
    ],
    ghost: [
      '...oooooooo...',
      '..obbbbbbbbo..',
      '.obbllbbbbbbo.',
      '.obbeebbbeebo.',
      '.obbeebbbeebo.',
      '.obbbbbbbbbbo.',
      '.obbbbooooobo.',
      '.obpbbbbbbpbo.',
      '.obbbbbbbbbbo.',
      '.obobbobbobbo.',
      '..o.ooo.ooo.o.'
    ],
    whale: [
      '.......a.a......',
      '........a.......',
      '..oooooooooo..oo',
      '.obbbbbbbbbbo.ob',
      'obbebbbbbbbbbobo',
      'obbbbbbbbbbbbbbo',
      'obpbbbbbbbbbbbo.',
      'obllllllllllbo..',
      '.oblllllllllbo..',
      '..oooooooooo....'
    ],
    cat: [
      '.oo........oo.',
      'obbo......obbo',
      'obpboooooobpbo',
      'obbbbbbbbbbbbo',
      'obbebbbbbbebbo',
      'obbbbbbbbbbbbo',
      '.obbbbaabbbbo.',
      '.obbaabbaabbo.',
      '..obbbbbbbbo..',
      '..oddaddaddo..',
      '...oooooooo...'
    ]
  };

  /* Species: sprite palette, terrarium backdrop, LCD theme used on its pet page, and a voice. */
  const SPECIES = {
    blob: {
      label: 'Blobby',
      pal: { o: '#3B1608', b: '#FF8A3D', d: '#D9531E', l: '#FFC27A', a: '#FFE14D', e: '#2A0E05', p: '#FF4FA3', w: '#fff' },
      terrarium: { bg: '#FFD9A8', fg: '#F2A45A', pat: 'stripes' },
      lcd: { bg: '#F0A65E', hi: '#F8C88F', lo: '#C97B33', ink: '#3B1608' },
      voice: { idle: ['feed me volume.', 'i can feel the candles.', '10k and i am a legend.'], hyped: ['LOOK AT ME GO', 'green. so green.'], bored: ['wake me at 10k.', 'is anyone buying?'], scared: ['it is just a dip. right?'], happy: ['i grew a little.'] }
    },
    dog: {
      label: 'Watchdog',
      pal: { o: '#101E4A', b: '#6EA8FF', d: '#3F6FD1', l: '#BBD6FF', a: '#FFD84D', e: '#101E4A', p: '#FF9EC4', w: '#fff' },
      terrarium: { bg: '#CFE1FF', fg: '#8FB6F5', pat: 'dots' },
      lcd: { bg: '#8FB4F0', hi: '#B7D0F8', lo: '#5E86CC', ink: '#101E4A' },
      voice: { idle: ['i watch the volume.', 'sniffing the chart.', 'woof?'], hyped: ['ZOOMIES!', 'volume is back!'], bored: ['quiet. too quiet.', '*stares at the door*'], scared: ['i heard a sell.'], happy: ['good boy detected.'] }
    },
    frog: {
      label: 'Shapeshifter',
      anim: 'hue',
      pal: { o: '#0D3B28', b: '#5DD39E', d: '#2E9C70', l: '#B8F5D8', a: '#FF4FA3', e: '#0D3B28', w: '#fff', p: '#FF4FA3' },
      terrarium: { bg: '#C8F2DC', fg: '#7DD3A8', pat: 'checker' },
      lcd: { bg: '#7FD6A8', hi: '#A9EBC8', lo: '#4FA67B', ink: '#0D3B28' },
      voice: { idle: ['i am between faces.', 'new look loading.', 'blink and i changed.'], hyped: ['NEW LOOK UNLOCKED'], bored: ['same face for hours.'], scared: ['hiding in the background.'], happy: ['how do i look now?'] }
    },
    owl: {
      label: 'Night owl',
      pal: { o: '#1B1042', b: '#7B5BD6', d: '#4B33A3', l: '#CBB8FF', a: '#FFC93C', e: '#1B1042', w: '#F2EBDD', p: '#FF4FA3' },
      terrarium: { bg: '#2F2554', fg: '#6A58B0', pat: 'stars' },
      lcd: { bg: '#2F2554', hi: '#45387A', lo: '#1D1738', ink: '#EDE6FF' },
      voice: { idle: ['still up.', 'the chart never sleeps.', 'hoo is buying?'], hyped: ['HOOT HOOT'], bored: ['counting candles.'], scared: ['something moved in the dark.'], happy: ['a whole day old.'] }
    },
    turtle: {
      label: 'Shellby',
      pal: { o: '#1D3A18', b: '#8BC34A', d: '#3E7D3A', l: '#C5E88A', a: '#D9B04E', e: '#1D3A18', w: '#fff', p: '#FF9EC4' },
      terrarium: { bg: '#D8EBB0', fg: '#A9CC6B', pat: 'bricks' },
      lcd: { bg: '#A8C46A', hi: '#C3DA8C', lo: '#7C9A3E', ink: '#1D3A18' },
      voice: { idle: ['slow and steady.', 'i am not selling.', 'holders get gifts.'], hyped: ['fast for a turtle!'], bored: ['no rush.'], scared: ['into the shell.'], happy: ['more friends in the pond.'] }
    },
    ghost: {
      label: 'Dip guardian',
      pal: { o: '#2B3A67', b: '#E8F0FF', d: '#B9C6EA', l: '#FFFFFF', a: '#FF4FA3', e: '#2B3A67', w: '#fff', p: '#FFB3D1' },
      terrarium: { bg: '#E3E9F8', fg: '#BAC6E6', pat: 'waves' },
      lcd: { bg: '#C9D3EE', hi: '#E3E9F8', lo: '#98A6CF', ink: '#2B3A67' },
      voice: { idle: ['i buy the dips.', 'boo.', 'floor is mine.'], hyped: ['nothing to buy, wow'], bored: ['haunting quietly.'], scared: ['DIP DETECTED. ON IT.'], happy: ['bag secured.'] }
    },
    whale: {
      label: 'Welcome wagon',
      pal: { o: '#0B3C5D', b: '#4FC3F7', d: '#1E88C9', l: '#E1F5FE', a: '#FFFFFF', e: '#0B3C5D', w: '#fff', p: '#FF9EC4' },
      terrarium: { bg: '#BDE8FA', fg: '#79CCEF', pat: 'tide' },
      lcd: { bg: '#6FC5EC', hi: '#A0DBF5', lo: '#3C97C4', ink: '#0B3C5D' },
      voice: { idle: ['big buyers welcome.', 'making waves.', 'gifts for the pod.'], hyped: ['WHALE SEASON'], bored: ['calm seas.'], scared: ['the tide is going out.'], happy: ['the pod is growing.'] }
    },
    cat: {
      label: 'Burn cat',
      pal: { o: '#120F18', b: '#4A4458', d: '#2E2A38', l: '#7A7090', a: '#FF7A1A', e: '#FFB020', w: '#fff', p: '#FF4FA3' },
      terrarium: { bg: '#2A2433', fg: '#FF7A1A', pat: 'embers' },
      lcd: { bg: '#2A2433', hi: '#3E3548', lo: '#17131D', ink: '#FFB020' },
      voice: { idle: ['supply goes down.', 'i like fire.', 'strike a match.'], hyped: ['BURN IT ALL'], bored: ['nothing to burn.'], scared: ['good. burn the dip.'], happy: ['smells like progress.'] }
    }
  };

  const ICONS = {
    image: ['xxxxxxx', 'x.....x', 'x..x..x', 'x.xxx.x', 'xxxxxxx'],
    tweet: ['xxxxxxx', 'x.....x', 'x.....x', 'xxxx.xx', '...xx..'],
    burn: ['...x...', '..xx...', '.xxxx..', 'xxxxxx.', 'xxxxxxx', '.xxxxx.'],
    buyback: ['.xxxxx.', 'x.....x', 'x.xxx.x', 'x.....x', '.xxxxx.'],
    airdrop: ['.xxxxx.', 'xxxxxxx', 'x.x.x.x', '.x.x.x.', '..xxx..'],
    rename: ['..xxxxx', '.x....x', 'x..x..x', '.x....x', '..xxxxx'],
    note: ['.xxxxxx', '.x....x', '.x....x', '.x....x', 'xx...xx', 'xx...xx'],
    egg: ['.xxx.', 'xxxxx', 'xxxxx', 'xxxxx', '.xxx.'],
    book: ['xxxxx.', 'x...xx', 'x.x.xx', 'x...xx', 'xxxxx.'],
    chip: ['xxxxxxx', 'x.....x', 'x.xxx.x', 'x.....x', 'xxxxxxx', '.x.x.x.'],
    rocket: ['..xx...', '.xxxx..', '.xxxx..', 'xxxxxx.', 'x.xx.x.', '..xx...']
  };

  const CROWN = ['g.g.g', 'ggggg', 'ggogg'];
  const CRACKS = [
    [[3, 6]],
    [[3, 6], [4, 7], [5, 6]],
    [[2, 7], [3, 6], [4, 7], [5, 6], [6, 7], [7, 6]]
  ];

  const PAL_FALLBACK = { k: '#111', g: '#FFD23F', w: '#fff' };

  function rects(grid, colorOf) {
    let out = '';
    grid.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        if (c === '.' || c === undefined) { x++; continue; }
        if (c === 'e') { out += `<rect class="eye c-e" x="${x}" y="${y}" width="1" height="1"/>`; x++; continue; }
        let run = 1;
        while (row[x + run] === c) run++;
        out += `<rect class="c-${c}" x="${x}" y="${y}" width="${run}" height="1"/>`;
        x += run;
      }
    });
    return out;
  }

  function buildGrid(key, opts) {
    const rows = ROWS[key].map(r => r.split(''));
    const looks = opts.looks || [];
    if (key === 'egg' && opts.crack) CRACKS[Math.min(opts.crack, 3) - 1].forEach(([r, c]) => { if (rows[r]) rows[r][c] = 'o'; });
    if (looks.includes('shades')) {
      rows.forEach(row => {
        const idx = row.map((c, i) => (c === 'e' ? i : -1)).filter(i => i >= 0);
        if (!idx.length) return;
        for (let x = Math.min(...idx) - 1; x <= Math.max(...idx) + 1; x++) if (row[x] && row[x] !== '.' && row[x] !== 'o') row[x] = 'k';
      });
    }
    let grid = rows;
    if (looks.includes('crown')) {
      const W = Math.max(...grid.map(r => r.length));
      const off = Math.floor((W - 5) / 2);
      const crown = CROWN.map(s => { const r = new Array(W).fill('.'); s.split('').forEach((c, i) => { r[off + i] = c; }); return r; });
      grid = crown.concat(grid);
    }
    return grid;
  }

  function palStyle(key, over) {
    const base = Object.assign({}, PAL_FALLBACK, key === 'egg' ? { o: '#232A12', b: '#F2EBDD', d: '#D8CCB4', l: '#fff', a: '#FF4FA3' } : SPECIES[key].pal, over || {});
    return Object.keys(base).map(k => `--c-${k}:${base[k]}`).join(';');
  }

  /** Returns a ready-to-insert sprite element string. */
  function sprite(key, opts) {
    opts = opts || {};
    const grid = buildGrid(key, opts);
    const W = Math.max(...grid.map(r => r.length));
    const H = grid.length;
    const s = opts.scale || 6;
    const mood = opts.mood || 'happy';
    const looks = (opts.looks || []).filter(l => l === 'sparkles' || l === 'aura').map(l => 'look-' + l).join(' ');
    const anim = key !== 'egg' && SPECIES[key].anim === 'hue' ? 'anim-hue' : '';
    const label = opts.label ? ` role="img" aria-label="${opts.label}"` : ' aria-hidden="true"';
    return `<span class="sprite mood-${mood} ${looks} ${anim}" style="${palStyle(key, opts.pal)};--w:${W * s}px"${label}>` +
      `<svg viewBox="0 0 ${W} ${H}" width="${W * s}" height="${H * s}" shape-rendering="crispEdges" focusable="false">${rects(grid)}</svg></span>`;
  }

  function icon(name, scale) {
    const rows = ICONS[name].map(r => r.split('').map(c => (c === 'x' ? 'x' : '.')));
    const W = Math.max(...rows.map(r => r.length));
    const s = scale || 3;
    let body = '';
    rows.forEach((row, y) => row.forEach((c, x) => { if (c === 'x') body += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
    return `<svg class="pxicon" viewBox="0 0 ${W} ${rows.length}" width="${W * s}" height="${rows.length * s}" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor">${body}</svg>`;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
    const r = f(n >> 16), gg = f((n >> 8) & 255), b = f(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1);
  }

  /** Standalone square SVG of a critter on its terrarium colour, for use as a token image. */
  function standaloneSvg(key, opts) {
    opts = opts || {};
    const grid = buildGrid(key, opts);
    const W = Math.max.apply(null, grid.map(r => r.length)), H = grid.length, pad = 2;
    const N = Math.max(W, H) + pad * 2, ox = Math.floor((N - W) / 2), oy = Math.floor((N - H) / 2);
    const pal = Object.assign({}, PAL_FALLBACK, SPECIES[key].pal, opts.pal || {});
    let body = `<rect width="${N}" height="${N}" fill="${SPECIES[key].terrarium.bg}"/>`;
    grid.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        if (c === '.' || !pal[c]) { x++; continue; }
        let run = 1; while (row[x + run] === c) run++;
        body += `<rect x="${x + ox}" y="${y + oy}" width="${run}" height="1" fill="${pal[c]}"/>`;
        x += run;
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="512" height="512" shape-rendering="crispEdges">${body}</svg>`;
  }
  /** PNG Blob (512x512) of the pixel face — used when the creator doesn't upload an image. */
  function png(key, opts) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 512;
        const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, 512, 512);
        c.toBlob(b => (b ? resolve(b) : reject(new Error('Couldn’t render the pixel face'))), 'image/png');
      };
      img.onerror = () => reject(new Error('Couldn’t render the pixel face'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(standaloneSvg(key, opts));
    });
  }

  g.Sprites = { png, standaloneSvg, sprite, icon, shade, SPECIES, KEYS: Object.keys(SPECIES) };
})(window);
