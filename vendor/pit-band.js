/* Pit Band — a small generative lo-fi band in Web Audio.
 *
 * Nothing is recorded. Rhodes-style chords with tape wobble, a round sub bass,
 * a sparse pentatonic melody through a dark delay, brushed drums that come and go,
 * and vinyl noise on top. Every bar is rolled fresh, so it never loops.
 *
 *   var band = PitBand.create({ bpm: 74, drums: true, density: 1, transpose: 0, volume: 0.85, lookahead: 0.25 });
 *   band.onBar(function (info) { console.log(info.bar, info.section, info.chord); });
 *   button.onclick = function () { band.playing ? band.stop() : band.start(); };
 *
 * start() must be called from a user gesture (browsers block audio before one).
 * Zero dependencies. One global: PitBand.
 */
(function (root) {
  'use strict';

  // chords: name → [bass root midi, voicing midi[], display]
  var CH = {
    F:    [41, [53, 57, 60, 64], 'Fmaj7'],
    Am:   [45, [57, 60, 64, 67], 'Am7'],
    Dm:   [38, [50, 53, 57, 60], 'Dm7'],
    Gm:   [43, [50, 53, 58, 62], 'Gm7'],
    C9:   [36, [52, 55, 58, 62], 'C9'],
    Bb:   [46, [53, 57, 58, 62], 'B♭maj7'],
    Csus: [36, [53, 55, 58, 62], 'C9sus']
  };
  // form: A A B A, eight bars each. density = how often the melody speaks.
  var SECTIONS = [
    { name: 'A', bars: ['F', 'F', 'Am', 'Am', 'Dm', 'Dm', 'Gm', 'C9'], density: 0.45 },
    { name: 'A', bars: ['F', 'F', 'Am', 'Am', 'Dm', 'Dm', 'Gm', 'C9'], density: 0.6 },
    { name: 'B', bars: ['Bb', 'Bb', 'Am', 'Am', 'Gm', 'Gm', 'Csus', 'Csus'], density: 0.8 },
    { name: 'A', bars: ['F', 'F', 'Am', 'Am', 'Dm', 'Dm', 'Gm', 'C9'], density: 0.55 }
  ];
  var PENTA = [65, 67, 69, 72, 74, 77, 79, 81, 84]; // F major pentatonic, octaves 4–6

  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var chance = function (p) { return Math.random() < p; };

  function create(opts) {
    opts = opts || {};
    var o = {
      bpm: opts.bpm || 74,
      drums: opts.drums !== false,
      density: opts.density == null ? 1 : opts.density,
      transpose: opts.transpose || 0,
      volume: opts.volume == null ? 0.85 : opts.volume,
      lookahead: opts.lookahead || 0.25,   // seconds scheduled ahead; raise it where timers get throttled
      tick: opts.tick || 60                // ms between scheduler runs
    };
    var beat = 60 / o.bpm, eighth = beat / 2, swing = 0.09 * beat;
    var lookahead = o.lookahead, tick = o.tick;
    var ctx = null, master, bus, wowGain, delaySend, verbSend, drumBus, noiseGain, noiseBuf;
    var timer = null, bar = 0, nextTime = 0, lastMelody = 72, drumsOn = false, lastNoise = 0;
    var listeners = [];
    var band = { playing: false };

    var mtof = function (m) { return 440 * Math.pow(2, (m + o.transpose - 69) / 12); };

    function build() {
      ctx = new (root.AudioContext || root.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
      var warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 5200; warm.Q.value = 0.5;
      bus = ctx.createGain();
      bus.connect(warm); warm.connect(comp); comp.connect(master); master.connect(ctx.destination);

      // tape wobble: one slow LFO feeding every oscillator's detune
      var wow = ctx.createOscillator(); wow.type = 'sine'; wow.frequency.value = 0.37;
      wowGain = ctx.createGain(); wowGain.gain.value = 6; // cents
      wow.connect(wowGain); wow.start();

      // dark delay, dotted eighth
      var delay = ctx.createDelay(2); delay.delayTime.value = eighth * 3;
      var fb = ctx.createGain(); fb.gain.value = 0.34;
      var dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 1400;
      var wet = ctx.createGain(); wet.gain.value = 0.35;
      delaySend = ctx.createGain();
      delaySend.connect(delay); delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(wet); wet.connect(bus);

      // soft room: generated impulse
      var len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      var verb = ctx.createConvolver(); verb.buffer = ir;
      var vwet = ctx.createGain(); vwet.gain.value = 0.28;
      verbSend = ctx.createGain(); verbSend.connect(verb); verb.connect(vwet); vwet.connect(bus);

      drumBus = ctx.createGain(); drumBus.gain.value = 0.55;
      var dlp2 = ctx.createBiquadFilter(); dlp2.type = 'lowpass'; dlp2.frequency.value = 3800;
      drumBus.connect(dlp2); dlp2.connect(bus);

      // vinyl bed
      var nlen = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
      var nd = noiseBuf.getChannelData(0);
      for (var k = 0; k < nlen; k++) nd[k] = Math.random() * 2 - 1;
      var noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true;
      var nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 2600; nbp.Q.value = 0.6;
      noiseGain = ctx.createGain(); noiseGain.gain.value = 0.012;
      noise.connect(nbp); nbp.connect(noiseGain); noiseGain.connect(bus); noise.start();
    }

    function osc(type, freq, detune) {
      var x = ctx.createOscillator(); x.type = type; x.frequency.value = freq; x.detune.value = detune || 0;
      wowGain.connect(x.detune);
      return x;
    }

    // electric-piano voice: two detuned tones, a fast-decaying tine, a filter that closes as it rings
    function keys(midi, t, dur, vel, sendAmt) {
      var f = mtof(midi);
      var o1 = osc('sine', f, 0), o2 = osc('triangle', f, 4), o3 = osc('sine', f * 2, -3);
      var g = ctx.createGain(), g3 = ctx.createGain(), flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.Q.value = 0.8;
      flt.frequency.setValueAtTime(2600, t); flt.frequency.exponentialRampToValueAtTime(700, t + 1.2);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.012);
      g.gain.exponentialRampToValueAtTime(vel * 0.4, t + 0.7);
      g.gain.setValueAtTime(vel * 0.4, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.4);
      g3.gain.setValueAtTime(vel * 0.35, t);
      g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o1.connect(g); o2.connect(g); o3.connect(g3); g3.connect(flt); g.connect(flt);
      flt.connect(bus);
      if (sendAmt) { var sd = ctx.createGain(); sd.gain.value = sendAmt; flt.connect(sd); sd.connect(delaySend); }
      var vs = ctx.createGain(); vs.gain.value = 0.6; flt.connect(vs); vs.connect(verbSend);
      [o1, o2, o3].forEach(function (x) { x.start(t); x.stop(t + dur + 1.6); });
    }

    function bass(midi, t, dur, vel) {
      var f = mtof(midi);
      var o1 = osc('sine', f, 0), o2 = osc('triangle', f, 0);
      var g = ctx.createGain(), g2 = ctx.createGain(), flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = 320;
      g2.gain.value = 0.25;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.03);
      g.gain.setValueAtTime(vel, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
      o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(flt); flt.connect(bus);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.4); o2.stop(t + dur + 0.4);
    }

    function kick(t, vel) {
      var x = ctx.createOscillator(), g = ctx.createGain();
      x.frequency.setValueAtTime(130, t); x.frequency.exponentialRampToValueAtTime(48, t + 0.11);
      g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      x.connect(g); g.connect(drumBus); x.start(t); x.stop(t + 0.3);
    }
    function noiseHit(t, vel, hp, dur, q) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf;
      var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; f.Q.value = q || 0.7;
      var g = ctx.createGain();
      g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(drumBus); src.start(t, Math.random()); src.stop(t + dur + 0.02);
    }
    function snare(t, vel) {
      noiseHit(t, vel, 900, 0.16, 0.5);
      var x = ctx.createOscillator(), g = ctx.createGain(); x.frequency.value = 190;
      g.gain.setValueAtTime(vel * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      x.connect(g); g.connect(drumBus); x.start(t); x.stop(t + 0.1);
    }
    var hat = function (t, vel, open) { noiseHit(t, vel, 6500, open ? 0.22 : 0.05, 1.2); };
    var crackle = function (t) { noiseHit(t, rnd(0.02, 0.07), 1800, 0.004 + Math.random() * 0.01, 0.3); };

    function scheduleBar(t, barIndex) {
      var section = SECTIONS[Math.floor(barIndex / 8) % SECTIONS.length];
      var inSection = barIndex % 8;
      var name = section.bars[inSection], chord = CH[name];
      var nextName = section.bars[(inSection + 1) % 8], nextChord = CH[nextName];
      var changing = name !== nextName;

      if (inSection === 0) {
        drumsOn = o.drums && barIndex >= 8 && !chance(0.22);
        if (barIndex > 0 && chance(0.5)) {            // breath: the room closes and reopens
          noiseGain.gain.setTargetAtTime(0.02, t - beat * 2, 0.6);
          noiseGain.gain.setTargetAtTime(0.012, t + beat, 0.8);
        }
      }

      // chords: soft strum on the downbeat, sometimes a lazy re-hit
      var voicing = chord[1].slice();
      if (chance(0.35)) voicing.push(chord[0] + 26);   // the 9th on top
      if (chance(0.25)) voicing.splice(1, 1);          // thin it out
      var rehit = chance(0.45) ? (chance(0.5) ? 2.5 : 3) : 0;
      voicing.forEach(function (m, i) {
        keys(m, t + i * rnd(0.015, 0.045), rehit ? beat * (rehit - 0.6) : beat * 3.4, rnd(0.09, 0.13), 0.12);
        if (rehit) keys(m, t + beat * rehit + i * rnd(0.01, 0.03), beat * (4 - rehit) - 0.3, rnd(0.06, 0.09), 0.12);
      });

      // bass
      bass(chord[0], t, beat * 1.7, 0.32);
      if (chance(0.55)) bass(chord[0] + (chance(0.5) ? 7 : 0), t + beat * 2.5 + swing, beat * 0.9, 0.24);
      if (changing && chance(0.4)) bass(nextChord[0] + (nextChord[0] > chord[0] ? -1 : 1), t + beat * 3.5 + swing, beat * 0.45, 0.2);

      // melody: a short phrase, stepwise, resting often
      if (chance(section.density * o.density)) {
        var pos = chance(0.5) ? 0 : 1, n = 2 + Math.floor(Math.random() * 4);
        var idx = PENTA.indexOf(lastMelody); if (idx < 0) idx = 3;
        for (var i = 0; i < n && pos < 8; i++) {
          idx = Math.max(0, Math.min(PENTA.length - 1, idx + (chance(0.7) ? (chance(0.5) ? 1 : -1) : (chance(0.5) ? 2 : -2))));
          var m = PENTA[idx];
          if (pos % 2 === 0 && chance(0.6)) {       // land chord tones on strong beats
            var tones = chord[1].map(function (v) { return v % 12; });
            var tries = 0;
            while (tones.indexOf(m % 12) < 0 && tries++ < 3) {
              idx = Math.max(0, Math.min(PENTA.length - 1, idx + (chance(0.5) ? 1 : -1))); m = PENTA[idx];
            }
          }
          var when = t + pos * eighth + (pos % 2 ? swing : 0) + rnd(-0.008, 0.012);
          var len = eighth * (chance(0.3) ? 3 : chance(0.5) ? 2 : 1);
          keys(m, when, len, rnd(0.05, 0.085), 0.45);
          lastMelody = m;
          pos += chance(0.25) ? 3 : chance(0.5) ? 2 : 1;
        }
      }

      // drums: brushed, quiet, swung
      if (drumsOn) {
        for (var p = 0; p < 8; p++) {
          var tp = t + p * eighth + (p % 2 ? swing : 0);
          if (p === 0) kick(tp, 0.5);
          if (p === 4 && chance(0.85)) kick(tp, 0.42);
          if (p === 3 && chance(0.3)) kick(tp + 0.01, 0.3);
          if (p === 7 && chance(0.2)) kick(tp, 0.28);
          if (p === 2 || p === 6) snare(tp + rnd(0, 0.012), p === 2 ? 0.16 : 0.19);
          if (chance(0.86)) hat(tp, p % 2 ? rnd(0.035, 0.06) : rnd(0.06, 0.09), p === 7 && chance(0.3));
        }
      }

      var info = { bar: barIndex, section: section.name, chord: chord[2], drums: drumsOn, at: t };
      var delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
      listeners.forEach(function (fn) { setTimeout(function () { if (band.playing) fn(info); }, delayMs); });
    }

    function scheduler() {
      if (!ctx || !band.playing) return;
      while (nextTime < ctx.currentTime + lookahead) {
        scheduleBar(nextTime, bar);
        nextTime += beat * 4;
        bar++;
      }
      var now = ctx.currentTime;
      if (now - lastNoise > rnd(0.08, 0.5)) { crackle(now + 0.02); lastNoise = now; }
      timer = setTimeout(scheduler, tick);
    }

    band.start = function () {
      if (band.playing) return;
      if (!ctx) build();
      band.playing = true;
      var go = function () {
        nextTime = ctx.currentTime + 0.1;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(o.volume, ctx.currentTime + 1.8);
        clearTimeout(timer); scheduler();
      };
      if (ctx.state === 'suspended') ctx.resume().then(go); else go();
    };
    band.stop = function () {
      if (!band.playing) return;
      band.playing = false;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
      clearTimeout(timer);
      setTimeout(function () { if (!band.playing && ctx) ctx.suspend(); }, 1400);
    };
    band.onBar = function (fn) { listeners.push(fn); return band; };
    band.set = function (key, value) {          // live knobs: drums, density, volume
      o[key] = value;
      if (key === 'volume' && ctx && band.playing) master.gain.setTargetAtTime(value, ctx.currentTime, 0.3);
      return band;
    };
    band.options = o;
    return band;
  }

  root.PitBand = { create: create, chords: CH, sections: SECTIONS };
})(window);
