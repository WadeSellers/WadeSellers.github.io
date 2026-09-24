/* ------------------------------------------------------------------
   Toy 04 — The Band

   Wraps the House Band engine (vendor/pit-band.js, copied from
   WadeSellers/house-band; see vendor/README.md for why the file still
   carries the old name). Nothing is recorded; every bar is rolled fresh.

   Two things shape this toy:

   1. Audio needs a gesture. Tapping the tile and then Play is that
      gesture, which is why there is no autoplay anywhere on the site.
   2. A lot of visitors arrive with the iPhone ringer switch on silent
      and will hear nothing no matter what we do. So the band is drawn
      as well as played. On silent it is still a toy, just a quiet one.

   The engine reports one event per bar. The drawing interpolates
   between those with a wall clock, so the movement is plausible
   rather than sample-accurate: it is a picture of the band, not a
   readout of the notes.
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  var BPM = 74;
  var BAR_MS = (60 / BPM) * 4 * 1000;   // four beats to the bar

  var MOODS = [
    { name: "Sleepy", density: 0.5 },
    { name: "Easy",   density: 1 },
    { name: "Awake",  density: 1.5 }
  ];

  // Lives above any single mount, so the music keeps going when you
  // leave for another toy. That is the whole point: it is a soundtrack
  // you switched on, not a page that shouts at you.
  var band = null;
  // Two different facts that both involve drums, kept apart on purpose:
  // wantDrums is what the visitor asked for, live.drums is whether the
  // engine is actually playing them this bar (it sits out whole sections
  // on its own). Conflating them let a bar report clobber the button.
  var wantDrums = true;
  var live = { bar: 0, section: "A", chord: "Fmaj7", drums: true, at: 0 };
  var mood = 1;
  var pill = null;
  var view = null;   // the mounted toy, or null when it is closed

  function engineMissing() {
    return typeof window.PitBand === "undefined";
  }

  function ensure(api) {
    if (band) return band;
    band = window.PitBand.create({
      bpm: BPM,
      drums: wantDrums,
      density: MOODS[mood].density,
      volume: 0.7,
      // A phone juggling a canvas and a scheduler benefits from a little
      // more runway than the browser default.
      lookahead: 0.6,
      tick: 100
    });
    band.onBar(function (info) {
      live = { bar: info.bar, section: info.section, chord: info.chord,
               drums: info.drums, at: performance.now() };
      if (view) view.status();
      if (pill) pill.querySelector(".pchord").textContent = info.chord;
    });
    return band;
  }

  /* --------------------------- the pill --------------------------- */
  // A small "still playing" control that sits over the grid, so leaving
  // the toy never means losing the music or the way to stop it.

  function buildPill() {
    if (pill) return pill;
    pill = document.createElement("div");
    pill.className = "nowplaying";
    pill.innerHTML =
      '<button class="pstop" type="button" aria-label="Stop the band"></button>' +
      '<a class="pname" href="#band">The Band</a>' +
      '<span class="pchord">Fmaj7</span>';
    pill.querySelector(".pstop").addEventListener("click", function (e) {
      e.preventDefault();
      if (band && band.playing) band.stop();
      sync();
    });
    document.body.appendChild(pill);
    return pill;
  }

  function sync() {
    var playing = !!(band && band.playing);
    if (playing) buildPill();
    if (!pill) return;
    // Hidden while any toy is open; the toy has its own controls, and
    // the pill would sit on top of them.
    pill.hidden = !playing || !!document.querySelector(".toy");
    if (view) view.refresh();
  }

  window.addEventListener("hashchange", function () { setTimeout(sync, 0); });

  /* --------------------------- the toy --------------------------- */

  function mount(api) {
    var cv = document.createElement("canvas");
    api.stage.appendChild(cv);
    var ctx = cv.getContext("2d");
    var raf = 0;

    if (engineMissing()) {
      api.banner("The band did not load on this device, so there is nothing to play.");
    }

    var playBtn = document.createElement("button");
    playBtn.className = "tbtn go";
    playBtn.type = "button";

    var drumBtn = document.createElement("button");
    drumBtn.className = "tbtn";
    drumBtn.type = "button";

    var moodBtn = document.createElement("button");
    moodBtn.className = "tbtn";
    moodBtn.type = "button";

    var note = document.createElement("span");
    note.className = "note";
    note.textContent = "no sound? check the ringer switch";

    playBtn.addEventListener("click", function () {
      if (engineMissing()) return;
      var b = ensure(api);
      // This click is the gesture the browser wants before any audio.
      if (b.playing) b.stop(); else b.start();
      refresh(); sync();
    });
    drumBtn.addEventListener("click", function () {
      wantDrums = !wantDrums;
      if (band) band.set("drums", wantDrums);
      refresh();
    });
    moodBtn.addEventListener("click", function () {
      mood = (mood + 1) % MOODS.length;
      if (band) band.set("density", MOODS[mood].density);
      refresh();
    });

    api.tools.appendChild(playBtn);
    api.tools.appendChild(drumBtn);
    api.tools.appendChild(moodBtn);
    api.tools.appendChild(note);

    function refresh() {
      var playing = !!(band && band.playing);
      playBtn.textContent = playing ? "Stop" : "Play";
      playBtn.className = "tbtn" + (playing ? "" : " go");
      drumBtn.textContent = wantDrums ? "Drums on" : "Drums off";
      moodBtn.textContent = MOODS[mood].name;
      status();
    }

    function status() {
      if (band && band.playing) {
        api.status(live.chord + " · " + live.section + " · bar " + (live.bar + 1));
      } else {
        api.status(engineMissing() ? "engine missing" : "not playing");
      }
    }

    view = { refresh: refresh, status: status };
    refresh();

    /* ------------------------- the drawing ------------------------- */

    function draw() {
      var m = api.fit(cv, ctx);
      var w = m.w, h = m.h;
      var playing = !!(band && band.playing);

      // Where we are inside the current bar, from the wall clock.
      var since = playing ? (performance.now() - live.at) : 0;
      var phase = playing ? Math.min(1, since / BAR_MS) : 0;
      var beat = phase * 4;                       // 0..4 across the bar
      var pulse = function (n) {                 // 1 on the beat, decaying after
        var d = beat - n;
        return d < 0 || d > 1 ? 0 : Math.pow(1 - d, 3);
      };

      ctx.fillStyle = "#F4F0E6";
      ctx.fillRect(0, 0, w, h);

      // stage floor
      var floor = h * 0.80;
      ctx.strokeStyle = "#14110F";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, floor); ctx.lineTo(w, floor); ctx.stroke();

      // vinyl: a dotted ring that turns whether or not anything else does
      var t = performance.now() / 1000;
      ctx.save();
      ctx.translate(w * 0.5, h * 0.33);
      ctx.rotate(playing ? t * 0.8 : t * 0.08);
      ctx.strokeStyle = "#6B6154";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 10]);
      ctx.beginPath(); ctx.arc(0, 0, Math.min(w, h) * 0.30, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // the chord, front and centre
      ctx.fillStyle = "#14110F";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var big = Math.min(w * 0.17, 54);
      ctx.font = "800 " + big + "px 'Bricolage Grotesque', 'Arial Black', sans-serif";
      ctx.fillText(playing ? live.chord : "silent", w * 0.5, h * 0.32);
      ctx.font = "500 11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "#6B6154";
      ctx.fillText(playing ? ("section " + live.section) : "press play", w * 0.5, h * 0.32 + big * 0.75);

      // the players, left to right along the floor
      var slots = [
        { x: 0.17, ink: "#2B5BE8", label: "bass",   hit: pulse(0) },
        { x: 0.37, ink: "#FF4D2E", label: "piano",  hit: Math.max(pulse(0), pulse(2)) },
        { x: 0.60, ink: "#00A06B", label: "melody", hit: 0 },
        { x: 0.83, ink: "#FFC72C", label: "drums",
          hit: (wantDrums && live.drums) ? Math.max(pulse(1), pulse(3)) : 0 }
      ];
      // the melody wanders instead of striking, so give it its own motion
      slots[2].hit = playing ? (Math.sin(t * 2.1) * 0.5 + 0.5) * 0.55 : 0;

      for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        var base = Math.min(w * 0.095, 40);
        var r = base * (1 + s.hit * 0.28);
        var cx = w * s.x;
        var cy = floor - r - 6 - s.hit * 10;

        var dim = (s.label === "drums" && !(wantDrums && live.drums)) || !playing;
        ctx.globalAlpha = dim ? 0.28 : 1;

        ctx.fillStyle = s.ink;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = "#14110F"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();

        // a shadow that squashes as the player lifts
        ctx.fillStyle = "#14110F";
        ctx.globalAlpha = dim ? 0.08 : 0.16;
        ctx.beginPath();
        ctx.ellipse(cx, floor + 5, r * (1 - s.hit * 0.2), 4, 0, 0, 6.2832);
        ctx.fill();

        ctx.globalAlpha = dim ? 0.35 : 0.75;
        ctx.fillStyle = "#14110F";
        ctx.font = "500 10px 'IBM Plex Mono', monospace";
        var label = s.label;
        if (s.label === "drums" && playing && wantDrums && !live.drums) label = "resting";
        ctx.fillText(label, cx, floor + 20);
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    }
    draw();

    view.stopDrawing = function () { cancelAnimationFrame(raf); };
  }

  function unmount() {
    // Deliberately does not stop the band. Leaving the toy should not
    // stop the music; the pill over the grid is how you stop it.
    if (view && view.stopDrawing) view.stopDrawing();
    view = null;
    setTimeout(sync, 0);
  }

  /* --------------------------- tile preview --------------------------- */

  function preview(ctx, w, h, t) {
    ctx.fillStyle = "#F4F0E6";
    ctx.fillRect(0, 0, w, h);
    var floor = h * 0.74;
    ctx.strokeStyle = "#14110F"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, floor); ctx.lineTo(w, floor); ctx.stroke();

    var inks = ["#2B5BE8", "#FF4D2E", "#00A06B", "#FFC72C"];
    for (var i = 0; i < 4; i++) {
      // each player bobs on its own offset, so the row reads as a band
      var hit = Math.max(0, Math.sin(t * 2.4 - i * 0.8));
      var r = Math.min(w * 0.09, 16) * (1 + hit * 0.25);
      var cx = w * (0.19 + i * 0.21);
      var cy = floor - r - 4 - hit * 7;
      ctx.fillStyle = inks[i];
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "#14110F"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
    }
  }

  window.ARCADE.register({
    id: "band",
    name: "The Band",
    hint: "turn it on",
    preview: preview,
    mount: mount,
    unmount: unmount
  });
})();
