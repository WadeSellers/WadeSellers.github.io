/* ------------------------------------------------------------------
   Toy 01 — The Wall

   A shared surface. Your marks go to everyone who opens it next, and
   everything fades out of the query after a day, so the wall is never
   the same twice.

   The trick that makes it feel alive: it does not load finished. It
   redraws the strokes already there, in the order they were made,
   before it hands you the pen.

   Time-lapse is the same trick over the whole history rather than the
   last day, with the date of each mark showing as it is drawn. It is a
   button and not the default because the wall's first job is to hand
   you a pen, and sitting through the archive every visit would wear
   out fast. Ask for it and you get the lot.

   Wiping is what stops that becoming one endless pile. Anyone can wipe
   the wall, and the wipe is recorded rather than destructive: the marks
   stay in the table forever, and the replay honours the wipe by
   clearing the wall right there and starting the next stretch. So the
   history reads as chapters, filled and cleared and filled again,
   instead of everything ever drawn on top of everything else.
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
  // A wipe has no points of its own, so it is given a cost in the replay
  // timeline. Measured in frames rather than points on purpose: a fixed
  // point cost is a third of a second on a busy wall and a long wait on a
  // quiet one. At roughly a second and a quarter you actually see the wall
  // empty before the next chapter starts filling it, which is the entire
  // reason for showing the wipe at all.
  var WIPE_FRAMES = 75;

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
      lastWipe: null,
      wipesOk: false,
      lapse: null,
      lapseBtn: null,
      wipeBtn: null,
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

  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function stamp(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return "";
    var h = d.getHours(), ap = h < 12 ? "am" : "pm";
    var hh = h % 12; if (hh === 0) hh = 12;
    var mm = d.getMinutes(); if (mm < 10) mm = "0" + mm;
    return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() +
           " · " + hh + ":" + mm + ap;
  }

  // Same date without the time, for when the full one will not fit.
  function shortStamp(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return "";
    return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear();
  }

  function frame() {
    var v = state.view = view();
    var ctx = state.ctx;
    var L = state.lapse;
    var list = L ? L.items : state.strokes;
    var done = L ? L.qi : state.qi;

    ctx.clearRect(0, 0, v.w, v.h);

    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.scale(v.s, v.s);

    ctx.fillStyle = "#FFFDF7";
    ctx.fillRect(0, 0, W, H);

    var drawn = 0, cur = 0, shown = 0, curAt = null, wiping = false;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      // A wipe carries no points, so it is costed separately; everything
      // else in this loop treats the two the same way.
      var cost = it.wipe ? L.wipeCost : it.points.length;
      if (drawn + cost <= done) {
        if (it.wipe) { ctx.fillStyle = "#FFFDF7"; ctx.fillRect(0, 0, W, H); }
        else { paintStroke(ctx, it); shown++; }
        drawn += cost;
        cur = i + 1;
        curAt = it.at;
      } else if (drawn < done) {
        if (it.wipe) {
          ctx.fillStyle = "#FFFDF7"; ctx.fillRect(0, 0, W, H);
          wiping = true;
        } else {
          paintStroke(ctx, it, done - drawn);
          shown++;
        }
        cur = i + 1;
        curAt = it.at;
        drawn = done;
        break;
      } else break;
    }

    // Live marks belong to the live wall, not to a replay of the archive.
    if (!L) {
      for (var j = 0; j < state.mine.length; j++) paintStroke(ctx, state.mine[j]);
      if (state.drawing) paintStroke(ctx, state.drawing);
    }

    ctx.restore();

    // keyline around the wall so its edges are obvious
    ctx.strokeStyle = "#14110F";
    ctx.lineWidth = 3;
    ctx.strokeRect(v.ox + 1.5, v.oy + 1.5, W * v.s - 3, H * v.s - 3);

    if (L) {
      // the date of the mark being drawn right now, burned in like a
      // camera's timestamp rather than tucked away in the chrome
      var barH = Math.min(34, v.h * 0.07);
      var by = v.oy + H * v.s - barH - 3;
      ctx.fillStyle = "#14110F";
      ctx.fillRect(v.ox + 3, by, W * v.s - 6, barH);
      ctx.fillStyle = "#F4F0E6";
      ctx.font = "500 12px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textBaseline = "middle";
      // Draw the counter first and measure it, so the left-hand text can be
      // shortened to whatever room is actually left. "wiped clean" plus a
      // full timestamp is longer than a date alone and was running straight
      // into the counter on a narrow phone.
      var right = shown + " / " + L.markCount;
      ctx.textAlign = "right";
      ctx.fillStyle = "#F0A830";
      ctx.fillText(right, v.ox + W * v.s - 12, by + barH / 2);

      var room = (W * v.s) - 24 - ctx.measureText(right).width - 14;
      var lead = wiping ? "wiped clean · " : "";
      var left = curAt ? lead + stamp(curAt) : "nothing here yet";
      if (ctx.measureText(left).width > room) left = lead + shortStamp(curAt);
      if (ctx.measureText(left).width > room) left = wiping ? "wiped clean" : shortStamp(curAt);

      ctx.textAlign = "left";
      ctx.fillStyle = wiping ? "#F0A830" : "#F4F0E6";
      ctx.fillText(left, v.ox + 12, by + barH / 2);
    }
  }

  function loop() {
    if (!state) return;
    var L = state.lapse;
    if (L) {
      if (L.qi < L.total) {
        L.qi = Math.min(L.total, L.qi + L.perFrame);
        if (L.qi >= L.total) state.api.status("time-lapse done · " + L.markCount + " marks");
      }
    } else if (state.qi < totalPoints()) {
      state.qi = Math.min(totalPoints(), state.qi + state.perFrame);
      if (state.qi >= totalPoints()) settled();
    }
    frame();
    state.raf = requestAnimationFrame(loop);
  }

  function countPoints(list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) n += list[i].points.length;
    return n;
  }

  function totalPoints() { return countPoints(state.strokes); }

  function redraw() { if (state) frame(); }

  function settled() {
    if (!state || state.lapse) return;
    state.api.status(
      (state.online ? "" : "offline · ") + state.strokes.length + " marks"
    );
  }

  /* --------------------------- input --------------------------- */

  function down(e) {
    if (!state || state.lapse) return;   // no drawing over a replay
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
    var floorTime = new Date(Date.now() - (api.cfg.wallHours || 24) * 3600e3).toISOString();

    latestWipe().then(function (wipeAt) {
      if (!state) return;
      state.lastWipe = wipeAt;
      // Whichever is later: a day ago, or the last time somebody wiped.
      var since = (wipeAt && wipeAt > floorTime) ? wipeAt : floorTime;
      var q = "select=created_at,color,width,points" +
              "&created_at=gt." + since +
              "&order=created_at.asc" +
              "&limit=" + (api.cfg.wallLimit || 300);
      return api.db.select("strokes", q);
    }).then(function (rows) {
      if (!state || !rows) return;
      state.online = true;
      state.strokes = rows.map(clean).filter(Boolean);
      if (state.strokes.length) state.newestSeen = rows[rows.length - 1].created_at;
      // Replay the whole wall in about four seconds, whatever its size.
      state.perFrame = Math.max(1, Math.ceil(totalPoints() / (60 * 4)));
      state.qi = 0;
      if (state.wipeBtn) state.wipeBtn.hidden = !state.wipesOk;
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

  // The most recent wipe, or null. A missing table is not an error here:
  // it just means wiping has never been set up, and the wall carries on
  // exactly as it did before, minus the button.
  function latestWipe() {
    return state.api.db.select("wipes", "select=created_at&order=created_at.desc&limit=1")
      .then(function (rows) {
        if (state) state.wipesOk = true;
        return rows && rows.length ? rows[0].created_at : null;
      })
      .catch(function () {
        if (state) state.wipesOk = false;
        return null;
      });
  }

  function wipeNow() {
    var api = state.api;
    api.db.insert("wipes", {}).then(function () {
      if (!state) return;
      clearLocally();
      api.status("wiped · 0 marks");
      // Read back the wipe we just made, so the poller does not immediately
      // see it as somebody else's and clear the wall a second time.
      latestWipe().then(function (at) { if (state) state.lastWipe = at; });
    }).catch(function (err) {
      if (!state) return;
      api.banner("Could not wipe the wall. " + String(err.message || err).slice(0, 90));
    });
  }

  function clearLocally() {
    state.strokes = [];
    state.mine = [];
    state.drawing = null;
    state.qi = 0;
  }

  // Pull anything added since we loaded, so two people drawing at once
  // see each other within about ten seconds.
  function fresh() {
    if (!state) return;

    // Somebody else may have wiped since we last looked. Check that first:
    // pulling their new strokes onto a wall that should be empty would put
    // two people on different walls.
    if (state.wipesOk) {
      latestWipe().then(function (at) {
        if (!state || !at) return;
        if (state.lastWipe && at <= state.lastWipe) return;
        if (!state.lastWipe && !state.strokes.length) { state.lastWipe = at; return; }
        state.lastWipe = at;
        state.newestSeen = at;
        clearLocally();
        settled();
      }).catch(function () {});
    }

    if (!state.newestSeen) return;
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
    return pts.length ? { color: r.color, width: w, points: pts, at: r.created_at } : null;
  }

  /* --------------------------- time-lapse --------------------------- */

  function startLapse() {
    var api = state.api;
    if (!api.db.ready) {
      api.banner("No wall connected, so there is no history to play back.");
      return;
    }
    state.lapseBtn.disabled = true;
    api.status("loading the whole history");

    // No time filter here: the live wall only shows the last day, but every
    // mark ever made is still in the table, and this is the one place that
    // shows them all.
    var pStrokes = api.db.select("strokes",
      "select=created_at,color,width,points&order=created_at.asc&limit=3000");
    // A missing wipes table just means no chapter breaks, not a failure.
    var pWipes = api.db.select("wipes", "select=created_at&order=created_at.asc&limit=500")
      .catch(function () { return []; });

    Promise.all([pStrokes, pWipes]).then(function (res) {
      if (!state) return;
      state.lapseBtn.disabled = false;
      var marks = res[0].map(clean).filter(Boolean);
      if (!marks.length) {
        api.banner("Nothing on the wall yet. Draw something and it becomes the first frame.");
        api.status("no history yet");
        return;
      }
      var wipes = (res[1] || []).map(function (r) {
        return { wipe: true, at: r.created_at };
      });
      // One chronological timeline. Times are compared as numbers rather
      // than as strings, so a stray timezone format cannot scramble it.
      var items = marks.concat(wipes).sort(function (a, b) {
        return Date.parse(a.at) - Date.parse(b.at);
      });
      // Pace off the drawing alone, so the speed of the marks does not
      // change with how often people wiped. The pauses are then added on
      // top: a history with more chapters simply takes a little longer.
      var drawPoints = 0;
      for (var i = 0; i < marks.length; i++) drawPoints += marks[i].points.length;
      var perFrame = Math.max(1, Math.ceil(drawPoints / (60 * 20)));
      var wipeCost = perFrame * WIPE_FRAMES;

      state.lapse = {
        items: items,
        markCount: marks.length,
        total: drawPoints + wipes.length * wipeCost,
        wipeCost: wipeCost,
        qi: 0,
        perFrame: perFrame
      };
      state.lapseBtn.textContent = "Stop";
      state.lapseBtn.className = "tbtn";
      api.status("replaying " + marks.length + " marks"
                 + (wipes.length ? " · " + wipes.length + " wipes" : ""));
    }).catch(function (err) {
      if (!state) return;
      state.lapseBtn.disabled = false;
      api.banner("Could not load the history. " + String(err.message || err).slice(0, 90));
    });
  }

  function stopLapse() {
    if (!state) return;
    state.lapse = null;
    state.qi = totalPoints();      // back to the live wall, fully drawn
    state.lapseBtn.textContent = "Time-lapse";
    state.lapseBtn.className = "tbtn go";
    settled();
  }

  /* --------------------------- tools --------------------------- */

  function buildTools(api) {
    // Two rows: the inks sit on the bottom one because they are what a
    // thumb reaches for most, and the buttons above them. One row of all
    // of it would have run off the side of a phone.
    api.tools.className = "tools stacked";

    var top = document.createElement("div");
    top.className = "toolrow";

    var lapseBtn = document.createElement("button");
    lapseBtn.className = "tbtn go";
    lapseBtn.type = "button";
    lapseBtn.textContent = "Time-lapse";
    lapseBtn.addEventListener("click", function () {
      if (state.lapse) stopLapse(); else startLapse();
    });
    state.lapseBtn = lapseBtn;
    top.appendChild(lapseBtn);

    var sz = document.createElement("button");
    sz.className = "tbtn";
    sz.type = "button";
    sz.textContent = SIZE_NAMES[state.size];
    sz.addEventListener("click", function () {
      state.size = (state.size + 1) % SIZES.length;
      sz.textContent = SIZE_NAMES[state.size];
      api.lsSet("wall.size", String(state.size));
    });
    top.appendChild(sz);

    // Wiping clears the wall for everyone, so it asks once first. Nothing
    // is actually lost: the marks stay in the table and the replay still
    // shows them, with the wipe as the break between chapters.
    var wipeBtn = document.createElement("button");
    wipeBtn.className = "tbtn";
    wipeBtn.type = "button";
    wipeBtn.textContent = "Wipe";
    wipeBtn.hidden = true;          // shown once we know the table is there
    var armed = 0;
    wipeBtn.addEventListener("click", function () {
      if (state.lapse) return;
      var now = Date.now();
      if (armed && now - armed < 4000) {
        armed = 0;
        wipeBtn.textContent = "Wipe";
        wipeBtn.className = "tbtn";
        wipeNow();
        return;
      }
      armed = now;
      wipeBtn.textContent = "Wipe it?";
      wipeBtn.className = "tbtn warn";
      setTimeout(function () {
        if (!armed || Date.now() - armed < 3900) return;
        armed = 0;
        wipeBtn.textContent = "Wipe";
        wipeBtn.className = "tbtn";
      }, 4100);
    });
    state.wipeBtn = wipeBtn;
    top.appendChild(wipeBtn);

    var note = document.createElement("span");
    note.className = "note";
    note.textContent = "a wipe starts a new chapter";
    top.appendChild(note);

    var inks = document.createElement("div");
    inks.className = "matrow";
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
        Array.prototype.forEach.call(inks.querySelectorAll(".swatch"), function (o) {
          o.setAttribute("aria-pressed", o === b ? "true" : "false");
        });
      });
      inks.appendChild(b);
    });

    api.tools.appendChild(top);
    api.tools.appendChild(inks);
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
