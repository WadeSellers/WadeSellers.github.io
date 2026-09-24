/* ------------------------------------------------------------------
   Arcade shell: registry, grid, router, and a very small Supabase client.

   No framework and no SDK on purpose. This runs inside Instagram's
   in-app browser, where every kilobyte and every unusual API is a risk,
   so it is plain fetch and plain DOM.
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  var CFG = window.WS_CONFIG || {};
  var toys = [];
  var current = null;
  var shell, grid, toyEl;

  /* ----------------------------- storage ----------------------------- */
  // Instagram's browser can hand back a throwing localStorage, so every
  // touch of it goes through here and the page works fine without it.
  function lsGet(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; }
    catch (e) { return d; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }

  /* ----------------------------- database ----------------------------- */
  var db = {
    ready: !!(CFG.supabaseUrl && CFG.supabaseKey),
    lastError: null,

    headers: function (extra) {
      var h = {
        "apikey": CFG.supabaseKey,
        "Authorization": "Bearer " + CFG.supabaseKey
      };
      for (var k in extra) h[k] = extra[k];
      return h;
    },

    // GET rows. `query` is everything after the table name.
    select: function (table, query) {
      if (!db.ready) return Promise.reject(new Error("no config"));
      return fetch(CFG.supabaseUrl + "/rest/v1/" + table + "?" + query, {
        headers: db.headers()
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) {
          throw new Error("HTTP " + r.status + " " + t.slice(0, 120));
        });
        return r.json();
      });
    },

    // Row count without pulling the rows.
    count: function (table, query) {
      if (!db.ready) return Promise.reject(new Error("no config"));
      return fetch(CFG.supabaseUrl + "/rest/v1/" + table + "?" + (query || "select=id"), {
        headers: db.headers({ "Prefer": "count=exact", "Range": "0-0" })
      }).then(function (r) {
        if (!r.ok && r.status !== 206) throw new Error("HTTP " + r.status);
        // The count rides in Content-Range, which is not a CORS-safelisted
        // header: if the server ever stops exposing it we get null here.
        // Throwing means the chip removes itself. Returning 0 would put a
        // confident, wrong number on the page instead.
        var cr = r.headers.get("content-range");
        var total = cr ? cr.split("/")[1] : null;
        if (total == null || total === "*") throw new Error("no count header");
        var n = parseInt(total, 10);
        if (isNaN(n)) throw new Error("bad count header: " + total);
        return n;
      });
    },

    insert: function (table, row) {
      if (!db.ready) return Promise.reject(new Error("no config"));
      return fetch(CFG.supabaseUrl + "/rest/v1/" + table, {
        method: "POST",
        headers: db.headers({
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        }),
        body: JSON.stringify(row)
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) {
          throw new Error("HTTP " + r.status + " " + t.slice(0, 160));
        });
        return true;
      });
    },

    // Insert and get the row back. The visits table's id is an identity
    // column, so the id of the row this visit just wrote IS the visitor
    // number, which saves doing an insert and then a count.
    insertReturning: function (table, row) {
      if (!db.ready) return Promise.reject(new Error("no config"));
      return fetch(CFG.supabaseUrl + "/rest/v1/" + table, {
        method: "POST",
        headers: db.headers({
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        }),
        body: JSON.stringify(row)
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) {
          throw new Error("HTTP " + r.status + " " + t.slice(0, 160));
        });
        return r.json();
      }).then(function (rows) {
        if (!rows || !rows.length) throw new Error("no row returned");
        return rows[0];
      });
    }
  };

  /* ----------------------------- canvas ----------------------------- */
  // Size a canvas to its CSS box at device resolution, capped so a 3x
  // phone does not ask the GPU for nine times the pixels it needs.
  function fit(canvas, ctx) {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(r.width * dpr));
    var h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: r.width, h: r.height, dpr: dpr };
  }

  /* ----------------------------- grid ----------------------------- */
  function buildGrid() {
    grid.innerHTML = "";
    toys.forEach(function (t, i) {
      var b = document.createElement("button");
      b.className = "tile" + (t.wide ? " wide" : "") + (t.soon ? " soon" : "");
      b.type = "button";
      b.setAttribute("aria-label", t.name + (t.soon ? ", not ready yet" : ""));

      var cv = document.createElement("canvas");
      b.appendChild(cv);

      if (t.hint) {
        var h = document.createElement("span");
        h.className = "hint"; h.textContent = t.hint;
        b.appendChild(h);
      }

      var cap = document.createElement("span");
      cap.className = "cap";
      cap.innerHTML = '<span class="no"></span><span class="nm"></span>';
      cap.querySelector(".no").textContent = t.soon ? "??" : pad(i + 1);
      cap.querySelector(".nm").textContent = t.name;
      b.appendChild(cap);

      if (!t.soon) {
        b.addEventListener("click", function () { go(t.id); });
      } else {
        b.addEventListener("click", function () {
          // Tapping a locked tile is somebody asking what comes next, so
          // this is the one place the ask is the honest answer.
          var host = document.getElementById("aside");
          var el = window.ARCADE.follow &&
                   window.ARCADE.follow.show(host, "Not built yet. This is where new ones show up.");
          if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      }

      grid.appendChild(b);
      t._canvas = cv;
      t._ctx = cv.getContext("2d");
    });
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // One shared animation loop for every tile preview. Cheaper than a
  // loop per tile, and it stops entirely while a toy is open.
  var t0 = performance.now();
  function tick(now) {
    if (!current) {
      var t = (now - t0) / 1000;
      for (var i = 0; i < toys.length; i++) {
        var toy = toys[i];
        if (!toy.preview || !toy._canvas) continue;
        var box = toy._canvas.getBoundingClientRect();
        if (box.bottom < -80 || box.top > window.innerHeight + 80) continue;
        var m = fit(toy._canvas, toy._ctx);
        toy._ctx.clearRect(0, 0, m.w, m.h);
        try { toy.preview(toy._ctx, m.w, m.h, t); } catch (e) { /* a bad tile must not stop the rest */ }
      }
    }
    requestAnimationFrame(tick);
  }

  /* ----------------------------- router ----------------------------- */
  function find(id) {
    for (var i = 0; i < toys.length; i++) if (toys[i].id === id) return toys[i];
    return null;
  }

  function go(id) {
    if (location.hash !== "#" + id) location.hash = id;
    else open(id);
  }

  function open(id) {
    var t = find(id);
    if (!t || t.soon) return close();
    if (current && current.id === id) return;
    if (current) teardown();

    current = t;
    shell.hidden = true;

    toyEl = document.createElement("div");
    toyEl.className = "toy";
    toyEl.innerHTML =
      '<div class="toybar">' +
        '<button class="back" type="button">Back</button>' +
        '<span class="tname"></span>' +
        '<span class="tstat"></span>' +
      '</div>' +
      '<div class="stage"></div>' +
      '<div class="tools"></div>';
    toyEl.querySelector(".tname").textContent = t.name;
    toyEl.querySelector(".back").addEventListener("click", function () {
      if (location.hash) history.back(); else close();
    });
    document.body.appendChild(toyEl);

    var api = {
      stage: toyEl.querySelector(".stage"),
      tools: toyEl.querySelector(".tools"),
      status: function (s) { toyEl.querySelector(".tstat").textContent = s; },
      banner: function (msg) {
        var old = toyEl.querySelector(".banner");
        if (old) old.remove();
        if (!msg) return;
        var d = document.createElement("div");
        d.className = "banner";
        d.textContent = msg + "  (tap to dismiss)";
        d.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          d.remove();
        });
        toyEl.querySelector(".stage").appendChild(d);
      },
      fit: fit, db: db, lsGet: lsGet, lsSet: lsSet, cfg: CFG
    };

    try { t.mount(api); }
    catch (e) {
      api.banner("This one broke on your device. " + (e && e.message ? e.message : ""));
    }
  }

  function teardown() {
    if (current && current.unmount) { try { current.unmount(); } catch (e) {} }
    if (toyEl && toyEl.parentNode) toyEl.parentNode.removeChild(toyEl);
    toyEl = null; current = null;
  }

  function close() {
    teardown();
    shell.hidden = false;
  }

  function route() {
    var id = (location.hash || "").replace(/^#/, "");
    if (id && find(id)) open(id); else close();
  }

  /* ----------------------------- ticker ----------------------------- */
  function ticker() {
    var you = document.getElementById("chip-you");
    var wallChip = document.getElementById("chip-wall");

    // Counted locally too, so the chip has something true to say before the
    // database answers, and something to fall back on if it never does.
    var mine = parseInt(lsGet("pte.visits", "0"), 10) + 1;
    lsSet("pte.visits", String(mine));

    function localOnly() {
      if (you) you.innerHTML = "your visit <b>#" + mine + "</b>";
    }

    if (!db.ready) {
      if (wallChip) wallChip.remove();
      localOnly();
      return;
    }

    db.count("strokes", "select=id").then(function (c) {
      if (wallChip) wallChip.innerHTML = "<b>" + c.toLocaleString() + "</b> marks on the wall";
    }).catch(function (e) {
      db.lastError = e;
      if (wallChip) wallChip.remove();
    });

    // Every view counts as a visitor, repeat or not. That is not the same as
    // unique people and is not claimed to be: the chip says "visitor #N",
    // which is exactly what it is.
    db.insertReturning("visits", {}).then(function (row) {
      if (you && row && row.id != null) {
        you.innerHTML = "visitor <b>#" + Number(row.id).toLocaleString() + "</b>";
      } else {
        localOnly();
      }
    }).catch(function () {
      // The visits table may not exist yet; fall back rather than showing
      // a broken number.
      localOnly();
    });
  }

  /* ----------------------------- boot ----------------------------- */
  window.ARCADE = {
    register: function (toy) { toys.push(toy); },
    db: db,
    fit: fit,
    lsGet: lsGet,
    lsSet: lsSet,
    close: close,
    start: function () {
      shell = document.getElementById("shell");
      grid = document.getElementById("grid");
      // Always last in the grid: a visible promise that more is coming.
      toys.push({
        id: "next", name: "Next toy", soon: true,
        preview: function (ctx, w, h, t) {
          ctx.fillStyle = "#E9E3D4"; ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = "#6B6154"; ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 14;
          ctx.strokeRect(10, 10, w - 20, h - 20);
          ctx.setLineDash([]);
          ctx.fillStyle = "#6B6154";
          ctx.font = "600 13px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillText("under", w / 2, h / 2 - 4);
          ctx.fillText("construction", w / 2, h / 2 + 14);
        }
      });
      buildGrid();
      ticker();
      window.addEventListener("hashchange", route);
      route();
      requestAnimationFrame(tick);
    }
  };
})();
