(() => {
  const canvas = document.getElementById('matrix-rain');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const KATAKANA_START = 0xff66;
  const KATAKANA_END = 0xff9d;
  const KATAKANA_COUNT = KATAKANA_END - KATAKANA_START + 1;
  const SYMBOLS = ':.-*+<>|=/';
  const TOTAL_GLYPHS = KATAKANA_COUNT + 10 + SYMBOLS.length;

  function glyphAt(idx) {
    if (idx < KATAKANA_COUNT) {
      return { ch: String.fromCharCode(KATAKANA_START + idx), mirror: true };
    }
    idx -= KATAKANA_COUNT;
    if (idx < 10) return { ch: String.fromCharCode(0x30 + idx), mirror: false };
    idx -= 10;
    return { ch: SYMBOLS[idx % SYMBOLS.length], mirror: false };
  }

  function hash3(a, b, c) {
    let h = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 1274126177;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function mix(a, b, t) {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  const HEAD = [0xdd, 0xff, 0xdd];
  const C1 = [0x00, 0xff, 0x66];
  const C2 = [0x00, 0x88, 0x33];
  const C3 = [0x00, 0x33, 0x11];
  const C0 = [0, 0, 0];

  function trailColor(distance) {
    if (distance < 0.5) return `rgb(${HEAD[0]},${HEAD[1]},${HEAD[2]})`;
    if (distance <= 8) return mix(C1, C2, (distance - 0.5) / 7.5);
    if (distance <= 16) return mix(C2, C3, (distance - 8) / 8);
    if (distance <= 24) return mix(C3, C0, (distance - 16) / 8);
    return 'rgb(0,0,0)';
  }

  let dpr;
  let cellSize;
  let columns;
  let columnData;

  function init() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const targetRows = 30;
    cellSize = Math.max(12, Math.floor(rect.height / targetRows));
    columns = Math.max(1, Math.floor(rect.width / cellSize));

    columnData = [];
    for (let c = 0; c < columns; c++) {
      const seed = (hash3(c, 17, Math.floor(Math.random() * 1e9)) | 1) >>> 0;
      columnData.push({
        seed,
        y: Math.random() * (rect.height + cellSize * 20) - cellSize * 20,
        speed: 0.45 + (seed % 100) / 140, // ~0.45 to ~1.16
        length: 12 + (seed % 9),
      });
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }
  init();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(init, 200);
  });

  let frame = 0;

  function tick() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const fontSize = Math.floor(cellSize * 0.78);
    ctx.font = `${fontSize}px "Hiragino Sans", "Yu Gothic", "MS Gothic", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (let c = 0; c < columns; c++) {
      const col = columnData[c];
      const headRow = Math.floor(col.y / cellSize);
      const xCenter = c * cellSize + cellSize / 2;

      for (let i = 0; i < col.length; i++) {
        const row = headRow - i;
        if (row < 0) continue;
        const yCenter = row * cellSize + cellSize / 2;
        if (yCenter < -cellSize || yCenter > h + cellSize) continue;

        const seedKey = i === 0
          ? col.seed ^ Math.floor(frame / 3)
          : col.seed;
        const idx = hash3(c, row, seedKey) % TOTAL_GLYPHS;
        const g = glyphAt(idx);

        ctx.fillStyle = trailColor(i);

        if (g.mirror) {
          ctx.save();
          ctx.translate(xCenter, yCenter);
          ctx.scale(-1, 1);
          ctx.fillText(g.ch, 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(g.ch, xCenter, yCenter);
        }
      }

      col.y += col.speed * (cellSize * 0.45);
      if (col.y - col.length * cellSize > h) {
        col.y = -Math.random() * cellSize * 20;
        col.speed = 0.45 + (hash3(c, frame, col.seed) % 100) / 140;
        col.length = 12 + (hash3(c, frame + 1, col.seed) % 9);
      }
    }

    frame++;
  }

  if (reduceMotion) {
    for (let f = 0; f < 40; f++) tick();
    return;
  }

  let last = 0;
  const interval = 50;
  function loop(now) {
    if (now - last >= interval) {
      tick();
      last = now;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
