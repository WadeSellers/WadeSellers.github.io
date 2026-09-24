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

   Taps and drains turn it from a thing you pour into a thing you build:
   a tap keeps producing as long as there is room under it, a drain eats
   whatever touches it, and between the two you can run a loop that
   never needs topping up.

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
  var TAP_SAND = 7, TAP_WATER = 8, DRAIN = 9;

  var INK = {};
  INK[EMPTY] = [244, 240, 230];
  INK[SAND]  = [255, 199,  44];
  INK[WATER] = [ 43,  91, 232];
  INK[STONE] = [107,  97,  84];
  INK[PLANT] = [  0, 160, 107];
  INK[FIRE]  = [255,  77,  46];
  INK[STEAM] = [201, 214, 222];
  // devices read as darker versions of what they make, so a tap looks
  // related to its output without needing a second drawing pass
  INK[TAP_SAND]  = [176, 130,  20];
  INK[TAP_WATER] = [ 24,  56, 150];
  INK[DRAIN]     = [ 20,  17,  15];
  // a second, hotter tone so flames shimmer instead of sitting there flat
  var FIRE_HOT = [255, 199, 44];

  var MATS = [
    { id: SAND,  name: "Sand",  css: "#FFC72C", does: "piles up" },
    { id: WATER, name: "Water", css: "#2B5BE8", does: "finds a level" },
    { id: STONE, name: "Stone", css: "#6B6154", does: "holds still" },
    { id: PLANT, name: "Moss",  css: "#00A06B", does: "climbs when wet" },
    { id: FIRE,  name: "Fire",  css: "#FF4D2E", does: "burns moss" },
    // One chip, two devices. Tapping it again while it is already selected
    // switches what it pours, which costs no extra room in the row and
    // explains itself because the label changes as you do it.
    { name: "Tap", cycle: [
        { id: TAP_SAND,  name: "Sand tap",  css: "#B08214", does: "pours sand forever" },
        { id: TAP_WATER, name: "Water tap", css: "#183896", does: "pours water forever" }
      ] },
    { id: DRAIN, name: "Drain", css: "#14110F", does: "swallows it" },
    { id: EMPTY, name: "Erase", css: "#F4F0E6", does: "rubs it out" }
  ];

  function isDevice(m) { return m === TAP_SAND || m === TAP_WATER || m === DRAIN; }

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
      cap: null,
      world: -1,
      raf: 0,
      view: null
    };

    buildTools(api);
    newWorld(api, true);

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

  /* --------------------------- worlds --------------------------- */
  // Small painting helpers, so each world reads as a description of itself
  // rather than a page of nested loops.

  function box(x0, y0, x1, y1, m) {
    var c = state.cells;
    for (var y = Math.max(0, y0); y < Math.min(ROWS, y1); y++) {
      for (var x = Math.max(0, x0); x < Math.min(COLS, x1); x++) c[idx(x, y)] = m;
    }
  }
  function scatter(n, x0, y0, w, h, m) {
    var c = state.cells;
    for (var i = 0; i < n; i++) {
      var x = x0 + ((Math.random() * w) | 0);
      var y = y0 + ((Math.random() * h) | 0);
      if (x >= 0 && x < COLS && y >= 0 && y < ROWS) c[idx(x, y)] = m;
    }
  }
  function disc(cx, cy, r, m) {
    var c = state.cells;
    for (var y = cy - r; y <= cy + r; y++) {
      if (y < 0 || y >= ROWS) continue;
      for (var x = cx - r; x <= cx + r; x++) {
        if (x < 0 || x >= COLS) continue;
        var dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) c[idx(x, y)] = m;
      }
    }
  }
  function floor() { box(0, ROWS - 4, COLS, ROWS, STONE); }

  // Every world opens mid-something. A still first frame would not show
  // what the box does, and the whole point is that it is already running.
  var WORLDS = [
    { name: "Terraces", make: function () {
        floor();
        box(8, 74, 68, 77, STONE);
        box(52, 108, 112, 111, STONE);
        scatter(2600, 18, 14, 44, 46, SAND);
        scatter(700, 70, 20, 38, 30, WATER);
      } },

    { name: "Hourglass", make: function () {
        floor();
        for (var i = 0; i < 44; i++) {
          box(0, 60 + i, 44 - i, 61 + i, STONE);
          box(76 + i, 60 + i, COLS, 61 + i, STONE);
        }
        scatter(3200, 12, 6, 96, 48, SAND);
      } },

    { name: "Caves", make: function () {
        box(0, 40, COLS, ROWS, STONE);
        for (var i = 0; i < 26; i++) {
          disc(10 + ((Math.random() * 100) | 0), 55 + ((Math.random() * 90) | 0),
               6 + ((Math.random() * 11) | 0), EMPTY);
        }
        floor();
        scatter(900, 20, 46, 80, 14, WATER);
        scatter(260, 10, 120, 100, 30, PLANT);
      } },

    { name: "Downpour", make: function () {
        floor();
        for (var x = 8; x < COLS - 8; x += 14) box(x, 6, x + 2, 8, TAP_WATER);
        box(0, ROWS - 12, COLS, ROWS - 4, SAND);
        scatter(420, 4, ROWS - 16, COLS - 8, 4, PLANT);
        box(58, ROWS - 4, 62, ROWS, DRAIN);
      } },

    { name: "Islands", make: function () {
        floor();
        var ys = [46, 78, 110];
        for (var k = 0; k < ys.length; k++) {
          var x0 = 12 + ((Math.random() * 40) | 0);
          box(x0, ys[k], x0 + 40, ys[k] + 3, STONE);
        }
        box(30, 10, 32, 12, TAP_SAND);
        box(84, 10, 86, 12, TAP_WATER);
        box(0, ROWS - 4, 6, ROWS, DRAIN);
        box(COLS - 6, ROWS - 4, COLS, ROWS, DRAIN);
      } },

    { name: "Ember field", make: function () {
        floor();
        box(0, ROWS - 26, COLS, ROWS - 4, SAND);
        scatter(2400, 2, ROWS - 42, COLS - 4, 18, PLANT);
        scatter(500, 10, ROWS - 30, 30, 8, WATER);
        scatter(6, 90, ROWS - 40, 20, 6, FIRE);
      } }
  ];

  // Never the same one twice running, or "new world" lands on what is
  // already on screen and reads as a broken button.
  function newWorld(api, first) {
    var i = (Math.random() * WORLDS.length) | 0;
    if (!first && i === state.world) i = (i + 1 + ((Math.random() * (WORLDS.length - 1)) | 0)) % WORLDS.length;
    state.world = i;
    state.cells.fill(EMPTY);
    WORLDS[i].make();
    if (!first) say(api, WORLDS[i].name, "a fresh start");
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
    var c = state.cells, m = state.mat;
    // A fat brush of taps would flood the box in a second, so devices go
    // down small and deliberate while materials stay generous.
    var b = isDevice(m) ? 1 : state.brush;
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
        } else if (here === TAP_SAND || here === TAP_WATER) {
          // Only into empty space, so a backed-up tap simply stops rather
          // than pushing a column of sand through the floor.
          if (c[idx(x, y + 1)] === EMPTY && Math.random() < 0.13) {
            c[idx(x, y + 1)] = (here === TAP_SAND) ? SAND : WATER;
          }
        } else if (here === DRAIN) {
          suck(x, y);
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

  // A drain eats anything loose it touches, on all four sides, so water
  // running sideways into one disappears the way it would down a plughole.
  function suck(x, y) {
    var c = state.cells;
    for (var k = 0; k < 4; k++) {
      var nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      var ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      var t = c[idx(nx, ny)];
      if (t === SAND || t === WATER || t === PLANT || t === STEAM || t === FIRE) {
        c[idx(nx, ny)] = EMPTY;
      }
    }
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

  // Feedback belongs where the thumb is. The old status line lived in the
  // opposite corner of the screen from the chips, so picking a material
  // updated something you were not looking at. This sits directly above
  // them and flashes, and the chip itself pulses, so the answer to "what
  // did I just pick" arrives where the question was asked.
  function say(api, name, does) {
    if (!state || !state.cap) return;
    state.cap.querySelector(".cap-t").textContent = name;
    state.cap.querySelector(".cap-d").textContent = does;
    restart(state.cap, "flash");
    api.status(name);
  }

  // Removing the class and reading a layout property forces the browser to
  // settle before it goes back on, which is what makes the animation replay
  // when the same chip is tapped twice.
  function restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function buildTools(api) {
    api.tools.className = "tools stacked";

    var cap = document.createElement("div");
    cap.className = "matcap";
    cap.innerHTML = '<span class="cap-t"></span><span class="cap-d"></span>';

    var roll = document.createElement("button");
    roll.className = "tbtn tiny go";
    roll.type = "button";
    roll.textContent = "New world";
    roll.addEventListener("click", function () { newWorld(api, false); });
    cap.appendChild(roll);

    var clear = document.createElement("button");
    clear.className = "tbtn tiny";
    clear.type = "button";
    clear.textContent = "Empty";
    clear.addEventListener("click", function () { state.cells.fill(EMPTY); });
    cap.appendChild(clear);

    var row = document.createElement("div");
    row.className = "matrow";

    api.tools.appendChild(cap);
    api.tools.appendChild(row);
    state.cap = cap;

    MATS.forEach(function (mat) {
      var cyc = 0;
      function current() { return mat.cycle ? mat.cycle[cyc] : mat; }

      var b = document.createElement("button");
      b.className = "matbtn";
      b.type = "button";

      var chip = document.createElement("span");
      chip.className = "sw";
      var lb = document.createElement("span");
      lb.className = "lb";
      b.appendChild(chip);
      b.appendChild(lb);

      function render() {
        var m = current();
        chip.style.background = m.css;
        chip.style.borderStyle = (m.id === EMPTY) ? "dashed" : "solid";
        // The chip keeps the short name; the caption carries the long one,
        // which is the only place there is room for "Water tap".
        lb.textContent = mat.cycle ? mat.name : m.name;
        b.setAttribute("aria-label", m.name + ", " + m.does);
      }
      render();
      b.setAttribute("aria-pressed", current().id === state.mat ? "true" : "false");

      b.addEventListener("click", function () {
        var already = (state.mat === current().id);
        if (already && mat.cycle) { cyc = (cyc + 1) % mat.cycle.length; render(); }
        var m = current();
        state.mat = m.id;
        say(api, m.name, m.does);
        Array.prototype.forEach.call(row.querySelectorAll(".matbtn"), function (o) {
          o.setAttribute("aria-pressed", o === b ? "true" : "false");
        });
        restart(b, "pulse");
      });

      row.appendChild(b);
    });

    say(api, "Sand", "piles up");
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
