/* ------------------------------------------------------------------
   Toy 05 — Sandbox

   Pour sand, pour water, draw stone, plant a seed, set it on fire.
   Nothing here is scripted: the pile shapes, the way water finds a
   level, where the moss climbs and how the weather turns all fall out
   of one rule per material.

   Those rules close into a loop. Fire burns moss and boils water into
   steam. Steam rises, collects under whatever is above it, and
   condenses back into rain. Rain feeds the moss. Moss feeds the fire.
   Nobody scripted the water cycle either; it is just what those rules
   do when you leave them alone.

   Everyone gets the same 120x160 world, letterboxed to fit, so a pile
   built on one phone looks like the pile on another.

   Drawn by writing pixels straight into an ImageData at grid
   resolution and blowing it up with smoothing off. Painting 24,000
   little rectangles a frame would not survive a phone; one bitmap
   does.
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  var COLS = 120, ROWS = 160;
  var EMPTY = 0, SAND = 1, WATER = 2, STONE = 3, PLANT = 4, FIRE = 5, STEAM = 6;

  var INK = {};
  INK[EMPTY] = [244, 240, 230];
  INK[SAND]  = [255, 199,  44];
  INK[WATER] = [ 43,  91, 232];
  INK[STONE] = [107,  97,  84];
  INK[PLANT] = [  0, 160, 107];
  INK[FIRE]  = [255,  77,  46];
  INK[STEAM] = [201, 214, 222];
  // a second, hotter tone so flames shimmer instead of sitting there flat
  var FIRE_HOT = [255, 199, 44];

  var MATS = [
    { id: SAND,  name: "Sand",  css: "#FFC72C", does: "piles up" },
    { id: WATER, name: "Water", css: "#2B5BE8", does: "finds a level" },
    { id: STONE, name: "Stone", css: "#6B6154", does: "holds still" },
    { id: PLANT, name: "Moss",  css: "#00A06B", does: "climbs when wet" },
    { id: FIRE,  name: "Fire",  css: "#FF4D2E", does: "burns moss" },
    { id: EMPTY, name: "Erase", css: "#F4F0E6", does: "rubs it out" }
  ];

  var state = null;

  function idx(x, y) { return y * COLS + x; }

  function mount(api) {
    var cv = document.createElement("canvas");
    api.stage.appendChild(cv);

    // the world is drawn here at 1px per cell, then scaled up
    var off = document.createElement("canvas");
    off.width = COLS; off.height = ROWS;
    var octx = off.getContext("2d");
    var img = octx.createImageData(COLS, ROWS);

    state = {
      api: api, canvas: cv, ctx: cv.getContext("2d"),
      off: off, octx: octx, img: img,
      cells: new Uint8Array(COLS * ROWS),
      mat: SAND,
      brush: 4,
      down: false,
      last: null,
      flip: false,
      frame: 0,
      raf: 0,
      view: null
    };

    buildTools(api);
    seed();

    cv.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      state.down = true; state.last = null; paint(e);
    });
    cv.addEventListener("pointermove", function (e) {
      if (!state.down) return;
      e.preventDefault(); paint(e);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
      cv.addEventListener(ev, function () { state.down = false; state.last = null; });
    });
    cv.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

    loop();
  }

  function unmount() {
    if (!state) return;
    cancelAnimationFrame(state.raf);
    state = null;
  }

  // Open mid-cascade rather than empty: sand is already falling past two
  // ledges, so the first frame shows what the toy does before a finger
  // touches it.
  function seed() {
    var c = state.cells, x, y;

    for (y = ROWS - 4; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) c[idx(x, y)] = STONE;
    }
    function ledge(x0, x1, yy) {
      for (var i = x0; i < x1; i++) {
        for (var j = yy; j < yy + 3; j++) c[idx(i, j)] = STONE;
      }
    }
    ledge(8, 68, 74);
    ledge(52, 112, 108);

    for (var i = 0; i < 2600; i++) {
      x = 18 + ((Math.random() * 44) | 0);
      y = 14 + ((Math.random() * 46) | 0);
      c[idx(x, y)] = SAND;
    }
    for (i = 0; i < 700; i++) {
      x = 70 + ((Math.random() * 38) | 0);
      y = 20 + ((Math.random() * 30) | 0);
      c[idx(x, y)] = WATER;
    }
  }

  /* --------------------------- geometry --------------------------- */

  function view() {
    var m = state.api.fit(state.canvas, state.ctx);
    var s = Math.min(m.w / COLS, m.h / ROWS);
    return { s: s, ox: (m.w - COLS * s) / 2, oy: (m.h - ROWS * s) / 2, w: m.w, h: m.h };
  }

  function paint(e) {
    var v = state.view || view();
    var r = state.canvas.getBoundingClientRect();
    var gx = Math.floor(((e.clientX - r.left) - v.ox) / v.s);
    var gy = Math.floor(((e.clientY - r.top) - v.oy) / v.s);
    // join to the previous point, or a fast swipe leaves dotted gaps
    if (state.last) line(state.last[0], state.last[1], gx, gy);
    else blob(gx, gy);
    state.last = [gx, gy];
  }

  function line(x0, y0, x1, y1) {
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    if (n === 0) return blob(x1, y1);
    for (var i = 0; i <= n; i++) {
      blob(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n));
    }
  }

  function blob(cx, cy) {
    var b = state.brush, c = state.cells, m = state.mat;
    for (var y = cy - b; y <= cy + b; y++) {
      if (y < 0 || y >= ROWS) continue;
      for (var x = cx - b; x <= cx + b; x++) {
        if (x < 0 || x >= COLS) continue;
        var dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > b * b) continue;
        // powders arrive scattered rather than as a solid slug
        if ((m === SAND || m === WATER) && Math.random() < 0.25) continue;
        c[idx(x, y)] = m;
      }
    }
  }

  /* --------------------------- the rules --------------------------- */

  function step() {
    state.flip = !state.flip;
    fall();
    rise();
  }

  // Everything that falls, scanned bottom row up, so a grain that drops
  // cannot be moved a second time in the same pass.
  function fall() {
    var c = state.cells;
    for (var y = ROWS - 2; y >= 0; y--) {
      for (var i = 0; i < COLS; i++) {
        var x = state.flip ? i : COLS - 1 - i;   // alternate scan, or piles lean
        var here = c[idx(x, y)];
        if (here === EMPTY || here === STONE || here === FIRE || here === STEAM) continue;

        if (here === SAND) {
          var below = c[idx(x, y + 1)];
          if (below === EMPTY || below === WATER) { swap(x, y, x, y + 1); continue; }
          if (!slide(x, y, SAND)) { /* at rest */ }
        } else if (here === WATER) {
          if (c[idx(x, y + 1)] === EMPTY) { swap(x, y, x, y + 1); continue; }
          if (slide(x, y, WATER)) continue;
          // find a level: creep sideways into empty space
          var d = Math.random() < 0.5 ? -1 : 1;
          if (x + d >= 0 && x + d < COLS && c[idx(x + d, y)] === EMPTY) swap(x, y, x + d, y);
        } else if (here === PLANT) {
          // Loose moss falls until it lands on something, so a sprinkle
          // settles onto the sand instead of hanging in mid-air. It sinks
          // through water rather than floating on it.
          var under = c[idx(x, y + 1)];
          if (under === EMPTY || under === WATER) { swap(x, y, x, y + 1); continue; }
          grow(x, y);
        }
      }
    }
  }

  // Everything that rises, scanned top row down for the same reason in
  // reverse: a cell moving up lands in a row already dealt with, so one
  // puff of steam climbs one cell per frame rather than the whole way.
  function rise() {
    var c = state.cells;
    // from y = 0, not y = 1: steam that reaches the top row still has to be
    // processed, or it sticks to the ceiling forever instead of raining back
    for (var y = 0; y < ROWS; y++) {
      for (var i = 0; i < COLS; i++) {
        var x = state.flip ? i : COLS - 1 - i;
        var here = c[idx(x, y)];
        if (here === FIRE) burn(x, y);
        else if (here === STEAM) steam(x, y);
      }
    }
  }

  function burn(x, y) {
    var c = state.cells, a = idx(x, y);

    // Water still wins, but not on the first touch. A flame boils what it
    // is against and takes its chances, so fire tipped into a pool throws
    // up a cloud before it drowns instead of vanishing with a hiss.
    var touchedWater = false;
    for (var k = 0; k < 4; k++) {
      var nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      var ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (c[idx(nx, ny)] === WATER) {
        c[idx(nx, ny)] = STEAM;
        touchedWater = true;
      }
    }
    if (touchedWater) {
      if (Math.random() < 0.35) { c[a] = EMPTY; return; }
    }

    // Moss catches, which is what makes a fire travel.
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var px = x + dx, py = y + dy;
        if (px < 0 || px >= COLS || py < 0 || py >= ROWS) continue;
        // Low on purpose. Higher and a spark flashes a whole bed in under a
        // second; at this rate you watch the front creep, which is the point.
        if (c[idx(px, py)] === PLANT && Math.random() < 0.055) c[idx(px, py)] = FIRE;
      }
    }

    if (Math.random() < 0.045) { c[a] = EMPTY; return; }  // burns out
    if (y > 0 && c[idx(x, y - 1)] === EMPTY && Math.random() < 0.4) swap(x, y, x, y - 1);
  }

  function steam(x, y) {
    var c = state.cells, a = idx(x, y);
    var up = y - 1;

    if (up >= 0 && c[idx(x, up)] === EMPTY) {
      if (Math.random() < 0.85) { swap(x, y, x, up); return; }
    } else {
      // Nowhere up to go means it is collecting against a ceiling, which
      // is exactly when real vapour gives up and turns back into water.
      if (Math.random() < 0.05) { c[a] = WATER; return; }
    }

    var d = Math.random() < 0.5 ? -1 : 1;
    for (var k = 0; k < 2; k++, d = -d) {
      var nx = x + d;
      if (nx < 0 || nx >= COLS) continue;
      if (up >= 0 && c[idx(nx, up)] === EMPTY) { swap(x, y, nx, up); return; }
      if (c[idx(nx, y)] === EMPTY) { swap(x, y, nx, y); return; }
    }

    if (Math.random() < 0.004) c[a] = WATER;   // a slow drizzle even in open air
  }

  function slide(x, y, what) {
    var c = state.cells;
    var d = Math.random() < 0.5 ? -1 : 1;
    for (var k = 0; k < 2; k++, d = -d) {
      var nx = x + d;
      if (nx < 0 || nx >= COLS) continue;
      var t = c[idx(nx, y + 1)];
      if (t === EMPTY || (what === SAND && t === WATER)) { swap(x, y, nx, y + 1); return true; }
    }
    return false;
  }

  // Moss climbs where it is wet, drinking the water as it goes. This is the
  // one rule that makes the box feel alive instead of merely physical.
  function grow(x, y) {
    if (Math.random() > 0.06) return;
    var c = state.cells;
    var wet = -1;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        if (c[idx(nx, ny)] === WATER) { wet = idx(nx, ny); break; }
      }
      if (wet >= 0) break;
    }
    if (wet < 0) return;
    // up, or up and to one side, so it comes out bushy instead of a column
    var up = y - 1;
    if (up < 0) return;
    var dirs = [0, -1, 1];
    var d = dirs[(Math.random() * 3) | 0];
    var nx = x + d;
    if (nx < 0 || nx >= COLS) nx = x;
    if (c[idx(nx, up)] === EMPTY) {
      c[idx(nx, up)] = PLANT;
      c[wet] = EMPTY;            // the water is drunk, not duplicated
    }
  }

  function swap(x0, y0, x1, y1) {
    var c = state.cells, a = idx(x0, y0), b = idx(x1, y1);
    var t = c[a]; c[a] = c[b]; c[b] = t;
  }

  /* --------------------------- drawing --------------------------- */

  function loop() {
    if (!state) return;
    step();

    var c = state.cells, d = state.img.data;
    state.frame++;
    for (var i = 0, p = 0; i < c.length; i++, p += 4) {
      var ink = INK[c[i]];
      // cheap shimmer: alternate two tones per cell, offset by position
      if (c[i] === FIRE && ((i * 7 + state.frame) % 3) === 0) ink = FIRE_HOT;
      d[p] = ink[0]; d[p + 1] = ink[1]; d[p + 2] = ink[2]; d[p + 3] = 255;
    }
    state.octx.putImageData(state.img, 0, 0);

    var v = state.view = view();
    var ctx = state.ctx;
    ctx.fillStyle = "#E9E3D4";
    ctx.fillRect(0, 0, v.w, v.h);
    ctx.imageSmoothingEnabled = false;   // crisp cells, not mush
    ctx.drawImage(state.off, v.ox, v.oy, COLS * v.s, ROWS * v.s);
    ctx.strokeStyle = "#14110F";
    ctx.lineWidth = 3;
    ctx.strokeRect(v.ox + 1.5, v.oy + 1.5, COLS * v.s - 3, ROWS * v.s - 3);

    state.raf = requestAnimationFrame(loop);
  }

  /* --------------------------- tools --------------------------- */

  function buildTools(api) {
    MATS.forEach(function (mat) {
      // The colour alone is a guessing game, so each one is named under its
      // chip and says what it does the moment you pick it.
      var b = document.createElement("button");
      b.className = "matbtn";
      b.type = "button";
      b.setAttribute("aria-label", mat.name + ", " + mat.does);
      b.setAttribute("aria-pressed", mat.id === state.mat ? "true" : "false");

      var chip = document.createElement("span");
      chip.className = "sw";
      chip.style.background = mat.css;
      if (mat.id === EMPTY) chip.style.borderStyle = "dashed";

      var lb = document.createElement("span");
      lb.className = "lb";
      lb.textContent = mat.name;

      b.appendChild(chip);
      b.appendChild(lb);

      b.addEventListener("click", function () {
        state.mat = mat.id;
        api.status(mat.name + " · " + mat.does);
        Array.prototype.forEach.call(api.tools.querySelectorAll(".matbtn"), function (s) {
          s.setAttribute("aria-pressed", s === b ? "true" : "false");
        });
      });
      api.tools.appendChild(b);
    });

    var clear = document.createElement("button");
    clear.className = "tbtn";
    clear.type = "button";
    clear.textContent = "Empty";
    clear.addEventListener("click", function () {
      state.cells.fill(EMPTY);
    });
    api.tools.appendChild(clear);

    api.status("Sand · piles up");
  }

  /* --------------------------- tile preview --------------------------- */

  function preview(ctx, w, h, t) {
    ctx.fillStyle = "#E9E3D4";
    ctx.fillRect(0, 0, w, h);
    // a pile growing and resetting, so the tile shows what the toy does
    var cycle = (t * 0.5) % 1;
    var cell = Math.max(2, Math.min(w, h) / 26);
    var cols = Math.ceil(w / cell);
    var peak = h * 0.92;
    for (var x = 0; x < cols; x++) {
      var u = (x + 0.5) / cols;
      var d = Math.abs(u - 0.5) * 2;
      var col = Math.max(0, (1 - d * 1.35)) * cycle * h * 0.62;
      for (var yy = 0; yy < col; yy += cell) {
        ctx.fillStyle = yy > col - cell * 3 ? "#2B5BE8" : "#FFC72C";
        ctx.fillRect(x * cell, peak - yy - cell, cell - 0.5, cell - 0.5);
      }
    }
    ctx.fillStyle = "#6B6154";
    ctx.fillRect(0, peak, w, Math.max(2, cell));
  }

  window.ARCADE.register({
    id: "sand",
    name: "Sandbox",
    hint: "pour it out",
    preview: preview,
    mount: mount,
    unmount: unmount
  });
})();
