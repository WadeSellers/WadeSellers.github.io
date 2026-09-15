/* ------------------------------------------------------------------
   Toy 03 — Googly

   Tap anywhere and something with eyes appears. They wander, they bump
   into each other, and all of them watch your finger. The whole joke is
   that a dot with two eyes reads as alive, so the physics can stay dumb.
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  var COLORS = ["#FF4D2E", "#2B5BE8", "#FFC72C", "#00A06B", "#FF5FA2", "#14110F"];
  var MAX = 90;
  var state = null;

  function mount(api) {
    var cv = document.createElement("canvas");
    api.stage.appendChild(cv);

    state = {
      api: api, canvas: cv, ctx: cv.getContext("2d"),
      blobs: [], look: null, down: false, raf: 0, seed: Math.random() * 99
    };

    var clear = document.createElement("button");
    clear.className = "tbtn";
    clear.type = "button";
    clear.textContent = "Shoo";
    clear.addEventListener("click", function () { state.blobs.length = 0; status(); });
    api.tools.appendChild(clear);

    var crowd = document.createElement("button");
    crowd.className = "tbtn go";
    crowd.type = "button";
    crowd.textContent = "A crowd";
    crowd.addEventListener("click", function () {
      var m = api.fit(cv, state.ctx);
      for (var i = 0; i < 18; i++) {
        spawn(Math.random() * m.w, Math.random() * m.h);
      }
      status();
    });
    api.tools.appendChild(crowd);

    var note = document.createElement("span");
    note.className = "note";
    note.textContent = "tap to add. they follow your finger";
    api.tools.appendChild(note);

    cv.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      state.down = true;
      var r = cv.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      state.look = { x: x, y: y };
      spawn(x, y);
      status();
    });
    cv.addEventListener("pointermove", function (e) {
      var r = cv.getBoundingClientRect();
      state.look = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (state.down) e.preventDefault();
    });
    cv.addEventListener("pointerup", function () { state.down = false; });
    cv.addEventListener("pointercancel", function () { state.down = false; });
    cv.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

    // Start with a few so the toy is never an empty box.
    var m0 = api.fit(cv, state.ctx);
    for (var i = 0; i < 5; i++) spawn(m0.w * (0.2 + 0.15 * i), m0.h * (0.35 + 0.1 * (i % 3)));
    status();
    loop();
  }

  function unmount() {
    if (!state) return;
    cancelAnimationFrame(state.raf);
    state = null;
  }

  function status() {
    state.api.status(state.blobs.length + (state.blobs.length === 1 ? " creature" : " creatures"));
  }

  function spawn(x, y) {
    if (state.blobs.length >= MAX) state.blobs.shift();
    var r = 14 + Math.random() * 20;
    state.blobs.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 60,
      vy: (Math.random() - 0.5) * 60,
      r: r,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      wob: Math.random() * 6.28,
      born: performance.now()
    });
  }

  var last = 0;
  function loop(now) {
    if (!state) return;
    now = now || performance.now();
    var dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;

    var m = state.api.fit(state.canvas, state.ctx);
    var ctx = state.ctx;

    ctx.fillStyle = "#F4F0E6";
    ctx.fillRect(0, 0, m.w, m.h);

    var b, i;
    for (i = 0; i < state.blobs.length; i++) {
      b = state.blobs[i];
      b.wob += dt * 3;

      // a slow random walk, plus a gentle pull toward the finger
      b.vx += (Math.random() - 0.5) * 40 * dt;
      b.vy += (Math.random() - 0.5) * 40 * dt;
      if (state.look) {
        var dx = state.look.x - b.x, dy = state.look.y - b.y;
        var d = Math.hypot(dx, dy) || 1;
        if (d < 220) { b.vx += (dx / d) * 22 * dt; b.vy += (dy / d) * 22 * dt; }
      }
      b.vx *= 0.99; b.vy *= 0.99;
      b.x += b.vx * dt; b.y += b.vy * dt;

      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; }
      if (b.x > m.w - b.r) { b.x = m.w - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.8; }
      if (b.y > m.h - b.r) { b.y = m.h - b.r; b.vy = -Math.abs(b.vy) * 0.8; }
    }

    // keep them from stacking into one lump
    for (i = 0; i < state.blobs.length; i++) {
      for (var j = i + 1; j < state.blobs.length; j++) {
        var a = state.blobs[i], c = state.blobs[j];
        var ddx = c.x - a.x, ddy = c.y - a.y;
        var dist = Math.hypot(ddx, ddy) || 0.01;
        var min = a.r + c.r;
        if (dist < min) {
          var push = (min - dist) / 2;
          var nx = ddx / dist, ny = ddy / dist;
          a.x -= nx * push; a.y -= ny * push;
          c.x += nx * push; c.y += ny * push;
        }
      }
    }

    for (i = 0; i < state.blobs.length; i++) {
      b = state.blobs[i];
      var pop = Math.min(1, (now - b.born) / 220);
      var rr = b.r * (0.6 + 0.4 * pop) * (1 + Math.sin(b.wob) * 0.04);

      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "#14110F"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, 6.2832); ctx.stroke();

      var tx = state.look ? state.look.x : b.x, ty = state.look ? state.look.y : b.y - 100;
      var eo = rr * 0.34, er = rr * 0.30, pr = er * 0.5;
      for (var s = -1; s <= 1; s += 2) {
        var ex = b.x + s * eo, ey = b.y - rr * 0.10;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = "#14110F"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832); ctx.stroke();

        var vx = tx - ex, vy = ty - ey;
        var vd = Math.hypot(vx, vy) || 1;
        var reach = Math.min(er - pr, vd);
        ctx.fillStyle = "#14110F";
        ctx.beginPath();
        ctx.arc(ex + (vx / vd) * reach, ey + (vy / vd) * reach, pr, 0, 6.2832);
        ctx.fill();
      }
    }

    state.raf = requestAnimationFrame(loop);
  }

  function preview(ctx, w, h, t) {
    ctx.fillStyle = "#F4F0E6";
    ctx.fillRect(0, 0, w, h);
    var tx = w * (0.5 + 0.34 * Math.sin(t * 1.1));
    var ty = h * (0.5 + 0.30 * Math.cos(t * 0.8));
    var pts = [[0.30, 0.38, 0.20, "#FF4D2E"], [0.66, 0.34, 0.15, "#2B5BE8"],
               [0.48, 0.68, 0.24, "#FFC72C"], [0.80, 0.70, 0.13, "#00A06B"]];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var bx = w * p[0] + Math.sin(t * 0.9 + i * 2) * w * 0.03;
      var by = h * p[1] + Math.cos(t * 1.2 + i) * h * 0.03;
      var r = Math.min(w, h) * p[2];
      ctx.fillStyle = p[3];
      ctx.beginPath(); ctx.arc(bx, by, r, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "#14110F"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, 6.2832); ctx.stroke();
      var eo = r * 0.34, er = r * 0.30, pr = er * 0.5;
      for (var s = -1; s <= 1; s += 2) {
        var ex = bx + s * eo, ey = by - r * 0.1;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = "#14110F"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832); ctx.stroke();
        var vx = tx - ex, vy = ty - ey, vd = Math.hypot(vx, vy) || 1;
        var reach = Math.min(er - pr, vd);
        ctx.fillStyle = "#14110F";
        ctx.beginPath();
        ctx.arc(ex + (vx / vd) * reach, ey + (vy / vd) * reach, pr, 0, 6.2832);
        ctx.fill();
      }
    }
  }

  window.ARCADE.register({
    id: "googly",
    name: "Googly",
    hint: "they watch you",
    preview: preview,
    mount: mount,
    unmount: unmount
  });

})();
