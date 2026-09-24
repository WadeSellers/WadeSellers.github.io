/* ------------------------------------------------------------------
   Toy 01 — The Wall

   A shared surface. Your marks go to everyone who opens it next, and
   everything fades out of the query after a day, so the wall is never
   the same twice.

   The trick that makes it feel alive: it does not load finished. It
   redraws the strokes already there, in the order they were made,
   before it hands you the pen.
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  // Everyone draws into the same fixed space, so everyone sees the same
  // wall regardless of phone size. Points are stored as integers here.
  var W = 1000, H = 1500;

  var INKS = ["#14110F", "#FF4D2E", "#2B5BE8", "#FFC72C", "#00A06B", "#FF5FA2"];
  var SIZES = [4, 10, 22];
  var SIZE_NAMES = ["Thin", "Medium", "Fat"];
  var MAX_POINTS = 600;   // matches the check constraint on the table

  var state = null;

  function mount(api) {
    var wrap = document.createElement("canvas");
    api.stage.appendChild(wrap);
    var ctx = wrap.getContext("2d");

    state = {
      api: api, canvas: wrap, ctx: ctx,
      ink: api.lsGet("wall.ink", INKS[1]),
      size: parseInt(api.lsGet("wall.size", "1"), 10) || 1,
      strokes: [],        // everything known, oldest first
      mine: [],           // pending local strokes not yet confirmed
      drawing: null,
      queue: [],          // replay timeline
      qi: 0,
      perFrame: 1,
      online: false,
      raf: 0,
      poll: 0,
      newestSeen: null,
      view: null
    };

    buildTools(api);
    window.addEventListener("resize", redraw);

    wrap.addEventListener("pointerdown", down);
    wrap.addEventListener("pointermove", move);
    wrap.addEventListener("pointerup", up);
    wrap.addEventListener("pointercancel", up);
    wrap.addEventListener("pointerleave", up);
    // Belt and braces: stop the in-app browser treating a drag as a
    // page gesture even if pointer events are not available.
    wrap.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

    api.status("loading the wall");
    load();
    loop();
  }

  function unmount() {
    if (!state) return;
    cancelAnimationFrame(state.raf);
    clearInterval(state.poll);
    window.removeEventListener("resize", redraw);
    state = null;
  }

  /* --------------------------- geometry --------------------------- */

  // Fit the fixed wall inside whatever box the phone gives us, centred.
  function view() {
    var m = state.api.fit(state.canvas, state.ctx);
    var s = Math.min(m.w / W, m.h / H);
    return { s: s, ox: (m.w - W * s) / 2, oy: (m.h - H * s) / 2, w: m.w, h: m.h };
  }

  function toWall(clientX, clientY) {
    var r = state.canvas.getBoundingClientRect();
    var v = state.view;
    return [
      Math.round(((clientX - r.left) - v.ox) / v.s),
      Math.round(((clientY - r.top) - v.oy) / v.s)
    ];
  }

  /* --------------------------- drawing --------------------------- */

  function paintStroke(ctx, st, upto) {
    var p = st.points;
    var n = upto == null ? p.length : Math.min(upto, p.length);
    if (n < 1) return;
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    if (n === 1) { ctx.lineTo(p[0][0] + 0.01, p[0][1]); }
    for (var i = 1; i < n; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.stroke();
  }

  function frame() {
    var v = state.view = view();
    var ctx = state.ctx;

    ctx.clearRect(0, 0, v.w, v.h);

    // the wall itself
    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.scale(v.s, v.s);

    ctx.fillStyle = "#FFFDF7";
    ctx.fillRect(0, 0, W, H);

    // everything fully revealed
    var done = state.qi;
    var drawn = 0;
    for (var i = 0; i < state.strokes.length; i++) {
      var st = state.strokes[i];
      if (drawn + st.points.length <= done) {
        paintStroke(ctx, st);
        drawn += st.points.length;
      } else if (drawn < done) {
        paintStroke(ctx, st, done - drawn);
        drawn = done;
        break;
      } else break;
    }

    // my own, always fully drawn
    for (var j = 0; j < state.mine.length; j++) paintStroke(ctx, state.mine[j]);
    if (state.drawing) paintStroke(ctx, state.drawing);

    ctx.restore();

    // keyline around the wall so its edges are obvious
    ctx.strokeStyle = "#14110F";
    ctx.lineWidth = 3;
    ctx.strokeRect(v.ox + 1.5, v.oy + 1.5, W * v.s - 3, H * v.s - 3);
  }

  function loop() {
    if (!state) return;
    if (state.qi < totalPoints()) {
      state.qi = Math.min(totalPoints(), state.qi + state.perFrame);
      if (state.qi >= totalPoints()) settled();
    }
    frame();
    state.raf = requestAnimationFrame(loop);
  }

  function totalPoints() {
    var n = 0;
    for (var i = 0; i < state.strokes.length; i++) n += state.strokes[i].points.length;
    return n;
  }

  function redraw() { if (state) frame(); }

  function settled() {
    if (!state) return;
    state.api.status(
      (state.online ? "" : "offline · ") + state.strokes.length + " marks"
    );
  }

  /* --------------------------- input --------------------------- */

  function down(e) {
    if (!state) return;
    e.preventDefault();
    if (state.canvas.setPointerCapture && e.pointerId != null) {
      try { state.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
    state.drawing = {
      color: state.ink,
      width: SIZES[state.size],
      points: [toWall(e.clientX, e.clientY)]
    };
  }

  function move(e) {
    if (!state || !state.drawing) return;
    e.preventDefault();
    var p = toWall(e.clientX, e.clientY);
    var pts = state.drawing.points;
    var last = pts[pts.length - 1];
    var dx = p[0] - last[0], dy = p[1] - last[1];
    if (dx * dx + dy * dy < 9) return;      // skip jitter, keeps payload small
    pts.push(p);
    if (pts.length >= MAX_POINTS) {         // cap per row, so start a fresh stroke
      var color = state.drawing.color, width = state.drawing.width;
      up(e);
      state.drawing = { color: color, width: width, points: [p] };
    }
  }

  function up(e) {
    if (!state || !state.drawing) return;
    if (e && e.preventDefault) e.preventDefault();
    var st = state.drawing;
    state.drawing = null;
    if (st.points.length < 2) {
      // a tap is a dot: give it a second point so it renders and stores
      st.points.push([st.points[0][0] + 1, st.points[0][1]]);
    }
    state.mine.push(st);
    send(st);
  }

  /* --------------------------- network --------------------------- */

  function send(st) {
    var api = state.api;
    if (!api.db.ready) return;
    api.db.insert("strokes", {
      color: st.color, width: st.width, points: st.points
    }).then(function () {
      if (!state) return;
      state.online = true;
      settled();
      // Their mark is now on the wall for the next person. Once, ever.
      if (window.ARCADE.follow) {
        window.ARCADE.follow.showOnce(
          api.stage,
          "That's on the wall for the next person now. I put new toys here.",
          true);
      }
    }).catch(function (err) {
      if (!state) return;
      state.online = false;
      api.banner("The wall is offline, so this mark is only on your screen. " +
                 String(err.message || err).slice(0, 90));
      settled();
    });
  }

  function load() {
    var api = state.api;
    if (!api.db.ready) {
      state.online = false;
      api.banner("No wall connected yet. You can still draw, but only you will see it.");
      settled();
      return;
    }
    var since = new Date(Date.now() - (api.cfg.wallHours || 24) * 3600e3).toISOString();
    var q = "select=created_at,color,width,points" +
            "&created_at=gt." + since +
            "&order=created_at.asc" +
            "&limit=" + (api.cfg.wallLimit || 300);

    api.db.select("strokes", q).then(function (rows) {
      if (!state) return;
      state.online = true;
      state.strokes = rows.map(clean).filter(Boolean);
      if (state.strokes.length) state.newestSeen = rows[rows.length - 1].created_at;
      // Replay the whole wall in about four seconds, whatever its size.
      state.perFrame = Math.max(1, Math.ceil(totalPoints() / (60 * 4)));
      state.qi = 0;
      api.status("replaying " + state.strokes.length + " marks");
      state.poll = setInterval(fresh, 10000);
    }).catch(function (err) {
      if (!state) return;
      state.online = false;
      api.banner("Could not reach the wall. You can still draw, but only you will see it. " +
                 String(err.message || err).slice(0, 90));
      settled();
    });
  }

  // Pull anything added since we loaded, so two people drawing at once
  // see each other within about ten seconds.
  function fresh() {
    if (!state || !state.newestSeen) return;
    var q = "select=created_at,color,width,points" +
            "&created_at=gt." + state.newestSeen +
            "&order=created_at.asc&limit=100";
    state.api.db.select("strokes", q).then(function (rows) {
      if (!state || !rows.length) return;
      rows.forEach(function (r) {
        var c = clean(r);
        if (c) { state.strokes.push(c); state.qi += c.points.length; }
      });
      state.newestSeen = rows[rows.length - 1].created_at;
      settled();
    }).catch(function () {});
  }

  // Never trust what comes back off the wire: anyone can post to this
  // table, so drop anything that is not the shape we expect.
  function clean(r) {
    if (!r || !Array.isArray(r.points) || r.points.length < 1) return null;
    if (typeof r.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(r.color)) return null;
    var w = Number(r.width);
    if (!isFinite(w) || w < 1 || w > 48) return null;
    var pts = [];
    for (var i = 0; i < r.points.length && i < MAX_POINTS; i++) {
      var p = r.points[i];
      if (!Array.isArray(p) || p.length < 2) continue;
      var x = Number(p[0]), y = Number(p[1]);
      if (!isFinite(x) || !isFinite(y)) continue;
      pts.push([Math.max(-50, Math.min(W + 50, x)), Math.max(-50, Math.min(H + 50, y))]);
    }
    return pts.length ? { color: r.color, width: w, points: pts } : null;
  }

  /* --------------------------- tools --------------------------- */

  function buildTools(api) {
    INKS.forEach(function (hex) {
      var b = document.createElement("button");
      b.className = "swatch";
      b.type = "button";
      b.style.background = hex;
      b.setAttribute("aria-label", "ink " + hex);
      b.setAttribute("aria-pressed", hex === state.ink ? "true" : "false");
      b.addEventListener("click", function () {
        state.ink = hex;
        api.lsSet("wall.ink", hex);
        Array.prototype.forEach.call(api.tools.querySelectorAll(".swatch"), function (s) {
          s.setAttribute("aria-pressed", s === b ? "true" : "false");
        });
      });
      api.tools.appendChild(b);
    });

    var sz = document.createElement("button");
    sz.className = "tbtn";
    sz.type = "button";
    sz.textContent = SIZE_NAMES[state.size];
    sz.addEventListener("click", function () {
      state.size = (state.size + 1) % SIZES.length;
      sz.textContent = SIZE_NAMES[state.size];
      api.lsSet("wall.size", String(state.size));
    });
    api.tools.appendChild(sz);
  }

  /* --------------------------- tile preview --------------------------- */

  function preview(ctx, w, h, t) {
    ctx.fillStyle = "#FFFDF7";
    ctx.fillRect(0, 0, w, h);
    var inks = ["#FF4D2E", "#2B5BE8", "#FFC72C", "#00A06B"];
    ctx.lineCap = "round";
    for (var k = 0; k < 4; k++) {
      ctx.strokeStyle = inks[k];
      ctx.lineWidth = 5 - k * 0.6;
      ctx.beginPath();
      var phase = t * 0.55 + k * 1.7;
      for (var i = 0; i <= 42; i++) {
        var u = i / 42;
        // a scribble that keeps redrawing itself
        var reveal = (Math.sin(phase * 0.5) * 0.5 + 0.5) * 1.35;
        if (u > reveal) break;
        var x = w * (0.12 + 0.76 * u);
        var y = h * (0.5 + 0.30 * Math.sin(u * 7.5 + phase) * Math.cos(u * 2.1 + k));
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }

  window.ARCADE.register({
    id: "wall",
    name: "The Wall",
    wide: true,
    hint: "everyone draws here",
    preview: preview,
    mount: mount,
    unmount: unmount
  });
})();
