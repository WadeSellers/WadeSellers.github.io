/* ------------------------------------------------------------------
   Toy 02 — Bubble Wrap

   A fixed 10 by 16 sheet so the same bubbles are in the same places on
   every phone, and your half-popped sheet is still half-popped when you
   come back. No sound: the iPhone ringer switch would silence it for
   half of everybody, and a pop you cannot hear is a disappointment.
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  var COLS = 10, ROWS = 16, N = COLS * ROWS;
  var KEY = "wrap.sheet";
  var state = null;

  function load(api) {
    var s = api.lsGet(KEY, "");
    var arr = new Array(N);
    for (var i = 0; i < N; i++) arr[i] = s.charAt(i) === "1";
    return arr;
  }
  function save(api, popped) {
    var s = "";
    for (var i = 0; i < N; i++) s += popped[i] ? "1" : "0";
    api.lsSet(KEY, s);
  }

  function mount(api) {
    var cv = document.createElement("canvas");
    api.stage.appendChild(cv);

    state = {
      api: api, canvas: cv, ctx: cv.getContext("2d"),
      popped: load(api),
      down: false,
      // per-bubble pop animation clock, 0 means resting
      anim: new Float32Array(N),
      raf: 0
    };

    var clear = document.createElement("button");
    clear.className = "tbtn go";
    clear.type = "button";
    clear.textContent = "Fresh sheet";
    clear.addEventListener("click", function () {
      for (var i = 0; i < N; i++) { state.popped[i] = false; state.anim[i] = 0; }
      save(api, state.popped);
      count();
    });
    api.tools.appendChild(clear);

    var note = document.createElement("span");
    note.className = "note";
    note.textContent = "your sheet is saved on this phone";
    api.tools.appendChild(note);

    cv.addEventListener("pointerdown", function (e) {
      state.down = true; hit(e);
    });
    cv.addEventListener("pointermove", function (e) { if (state.down) hit(e); });
    cv.addEventListener("pointerup", function () { state.down = false; });
    cv.addEventListener("pointercancel", function () { state.down = false; });
    cv.addEventListener("pointerleave", function () { state.down = false; });
    cv.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

    count();
    loop();
  }

  function unmount() {
    if (!state) return;
    cancelAnimationFrame(state.raf);
    save(state.api, state.popped);
    state = null;
  }

  function count() {
    var n = 0;
    for (var i = 0; i < N; i++) if (state.popped[i]) n++;
    state.api.status(n + " of " + N + " popped");
  }

  function geom() {
    var m = state.api.fit(state.canvas, state.ctx);
    var cell = Math.min(m.w / (COLS + 0.6), m.h / (ROWS + 0.6));
    return {
      m: m, cell: cell,
      ox: (m.w - cell * COLS) / 2,
      oy: (m.h - cell * ROWS) / 2
    };
  }

  function hit(e) {
    e.preventDefault();
    var g = geom();
    var r = state.canvas.getBoundingClientRect();
    var c = Math.floor(((e.clientX - r.left) - g.ox) / g.cell);
    var row = Math.floor(((e.clientY - r.top) - g.oy) / g.cell);
    if (c < 0 || c >= COLS || row < 0 || row >= ROWS) return;
    var i = row * COLS + c;
    if (state.popped[i]) return;
    state.popped[i] = true;
    state.anim[i] = 1;
    save(state.api, state.popped);
    count();
  }

  function loop() {
    if (!state) return;
    var g = geom(), ctx = state.ctx;
    ctx.clearRect(0, 0, g.m.w, g.m.h);

    ctx.fillStyle = "#DCE6EA";
    ctx.fillRect(g.ox - g.cell * 0.3, g.oy - g.cell * 0.3,
                 g.cell * COLS + g.cell * 0.6, g.cell * ROWS + g.cell * 0.6);

    var r = g.cell * 0.40;
    for (var i = 0; i < N; i++) {
      var cx = g.ox + (i % COLS) * g.cell + g.cell / 2;
      var cy = g.oy + Math.floor(i / COLS) * g.cell + g.cell / 2;

      if (state.anim[i] > 0) state.anim[i] = Math.max(0, state.anim[i] - 0.06);

      if (!state.popped[i]) {
        ctx.fillStyle = "#B9D3DC";
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.75)";
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.28, cy - r * 0.32, r * 0.30, r * 0.20, -0.7, 0, 6.2832);
        ctx.fill();
      } else {
        ctx.fillStyle = "#C6D6DC";
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = "#9FB6BE";
        ctx.lineWidth = Math.max(1, g.cell * 0.05);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.5, 0.6, 3.9);
        ctx.stroke();
        if (state.anim[i] > 0) {
          var a = state.anim[i];
          ctx.strokeStyle = "rgba(255,77,46," + a.toFixed(2) + ")";
          ctx.lineWidth = Math.max(1, g.cell * 0.09);
          ctx.beginPath();
          ctx.arc(cx, cy, r * (1 + (1 - a) * 0.9), 0, 6.2832);
          ctx.stroke();
        }
      }
    }
    state.raf = requestAnimationFrame(loop);
  }

  function preview(ctx, w, h, t) {
    ctx.fillStyle = "#DCE6EA";
    ctx.fillRect(0, 0, w, h);
    var cols = 6, rows = Math.max(3, Math.round(cols * h / w));
    var cell = Math.min(w / cols, h / rows);
    var ox = (w - cell * cols) / 2, oy = (h - cell * rows) / 2;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var cx = ox + x * cell + cell / 2, cy = oy + y * cell + cell / 2;
        var r = cell * 0.36;
        // a slow wave of popping that travels across the sheet
        var wave = Math.sin(t * 1.5 - (x + y) * 0.55);
        if (wave > 0.55) {
          ctx.fillStyle = "#C6D6DC";
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, 6.2832); ctx.fill();
        } else {
          ctx.fillStyle = "#B9D3DC";
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.8)";
          ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.26, 0, 6.2832); ctx.fill();
        }
      }
    }
  }

  window.ARCADE.register({
    id: "bubblewrap",
    name: "Bubble Wrap",
    hint: "pop it",
    preview: preview,
    mount: mount,
    unmount: unmount
  });
})();
