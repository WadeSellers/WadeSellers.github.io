(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Cat Play: manic bouncing ball, cat face with tracking slit pupils ----
  function setupCatPlay() {
    const thumb = document.querySelector('.thumb-catplay');
    if (!thumb) return;
    const ball = thumb.querySelector('.ball');
    const trails = thumb.querySelectorAll('.ball-trail');
    const faceEl = thumb.querySelector('.cat-face');
    const eyes = faceEl ? Array.from(faceEl.querySelectorAll('.cf-eye')) : [];
    const card = thumb.closest('.project-card');
    if (!ball || !card) return;

    let bx = 0, by = 0, vx = 0, vy = 0;
    let cursorX = -1, cursorY = -1;
    let inside = false;
    let raf;
    let kickTimer = 0;

    function kick() {
      const angle = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 5;
      vx += Math.cos(angle) * spd;
      vy += Math.sin(angle) * spd;
      kickTimer = 22 + Math.floor(Math.random() * 44);
    }

    function size() {
      const r = thumb.getBoundingClientRect();
      bx = r.width / 2;
      by = r.height / 3;
      vx = 0; vy = 0;
      kick();
    }
    size();
    window.addEventListener('resize', size);

    function paint() {
      ball.style.left = bx + 'px';
      ball.style.top = by + 'px';
      trails.forEach((t) => {
        t.style.left = bx + 'px';
        t.style.top = by + 'px';
      });
      if (faceEl && eyes.length) {
        const fR = faceEl.getBoundingClientRect();
        const tR = thumb.getBoundingClientRect();
        const fcx = fR.left - tR.left + fR.width / 2;
        const fcy = fR.top - tR.top + fR.height / 2;
        const dx = bx - fcx;
        const dy = by - fcy;
        const len = Math.max(1, Math.hypot(dx, dy));
        const ex = (dx / len) * 2;
        const ey = (dy / len) * 2;
        eyes.forEach((e) => {
          e.style.setProperty('--ex', ex + 'px');
          e.style.setProperty('--ey', ey + 'px');
        });
      }
    }

    function step() {
      const r = thumb.getBoundingClientRect();
      const W = r.width;
      const H = r.height;
      const rad = 14;

      if (inside && cursorX >= 0) {
        const dx = bx - cursorX;
        const dy = by - cursorY;
        const dist = Math.max(1, Math.hypot(dx, dy));
        if (dist < 90) {
          const f = (1 - dist / 90) * 2;
          vx += (dx / dist) * f;
          vy += (dy / dist) * f;
        }
      }

      if (--kickTimer <= 0) kick();

      const spd = Math.hypot(vx, vy);
      const maxSpd = 11, minSpd = 2.5;
      if (spd > maxSpd) { vx = (vx / spd) * maxSpd; vy = (vy / spd) * maxSpd; }
      if (spd > 0 && spd < minSpd) { vx = (vx / spd) * minSpd; vy = (vy / spd) * minSpd; }

      vx *= 0.97; vy *= 0.97;
      bx += vx; by += vy;

      if (bx < rad)     { bx = rad;     vx =  Math.abs(vx) * (0.85 + Math.random() * 0.3); vy += (Math.random() - 0.5) * 1.5; }
      if (bx > W - rad) { bx = W - rad; vx = -Math.abs(vx) * (0.85 + Math.random() * 0.3); vy += (Math.random() - 0.5) * 1.5; }
      if (by < rad)     { by = rad;     vy =  Math.abs(vy) * (0.85 + Math.random() * 0.3); vx += (Math.random() - 0.5) * 1.5; }
      if (by > H - rad) { by = H - rad; vy = -Math.abs(vy) * (0.85 + Math.random() * 0.3); vx += (Math.random() - 0.5) * 1.5; }

      paint();
      raf = requestAnimationFrame(step);
    }

    card.addEventListener('mousemove', (e) => {
      const r = thumb.getBoundingClientRect();
      cursorX = e.clientX - r.left;
      cursorY = e.clientY - r.top;
      inside = true;
    });
    card.addEventListener('mouseleave', () => { inside = false; });

    paint();
    if (!reduce) raf = requestAnimationFrame(step);
  }

  // ---- AI Usage Meter: tick percentage numbers on hover ----
  function setupMeter() {
    const thumb = document.querySelector('.thumb-ai-meter');
    if (!thumb) return;
    const card = thumb.closest('.project-card');
    const rows = thumb.querySelectorAll('.meter-row');

    function setPct(row, val) {
      const pctEl = row.querySelector('.meter-pct');
      if (pctEl) pctEl.textContent = Math.round(val) + '%';
    }
    rows.forEach((row) => setPct(row, 0));

    let active = false;
    let starts = [];

    function animate(now) {
      let any = false;
      rows.forEach((row, i) => {
        const target = parseFloat(row.dataset.tgt || 0);
        const start = starts[i];
        if (start == null) return;
        const t = Math.min(1, (now - start) / 800);
        const eased = 1 - Math.pow(1 - t, 3);
        setPct(row, target * eased);
        if (t < 1) any = true;
      });
      if (any) requestAnimationFrame(animate);
    }

    card.addEventListener('mouseenter', () => {
      if (active) return;
      active = true;
      const now = performance.now();
      starts = Array.from(rows).map((_, i) => now + i * 80);
      requestAnimationFrame(animate);
    });
    card.addEventListener('mouseleave', () => {
      active = false;
      starts = [];
      rows.forEach((row) => setPct(row, 0));
    });
  }

  // ---- Riddle Scoreboard: scores cycle, leader reflected in big num ----
  function setupRiddle() {
    const thumb = document.querySelector('.thumb-riddle');
    if (!thumb) return;
    const card = thumb.closest('.project-card');
    const big = thumb.querySelector('.board-num');
    const rows = thumb.querySelectorAll('.board-row');
    if (!big || rows.length === 0) return;

    const players = Array.from(rows).map((row) => ({
      row,
      name: row.querySelector('.name'),
      pts: row.querySelector('.pts'),
      rank: row.querySelector('.rank'),
      score: parseInt(row.querySelector('.pts').textContent, 10) || 0,
      target: parseInt(row.querySelector('.pts').textContent, 10) || 0,
    }));

    function render() {
      const sorted = [...players].sort((a, b) => b.score - a.score);
      sorted.forEach((p, i) => {
        p.row.style.order = i;
        p.rank.textContent = i + 1;
        p.pts.textContent = Math.round(p.score);
        p.row.classList.toggle('leader', i === 0);
      });
      big.textContent = Math.round(sorted[0].score);
    }
    render();

    let active = false;
    let raf;

    function tick() {
      players.forEach((p) => {
        if (Math.random() < 0.06) {
          const delta = Math.floor(Math.random() * 12) - 4;
          p.target = Math.max(5, Math.min(99, p.target + delta));
        }
        p.score += (p.target - p.score) * 0.08;
      });
      render();
      if (active) raf = requestAnimationFrame(tick);
    }

    card.addEventListener('mouseenter', () => {
      if (reduce) return;
      active = true;
      raf = requestAnimationFrame(tick);
    });
    card.addEventListener('mouseleave', () => {
      active = false;
      cancelAnimationFrame(raf);
      players.forEach((p) => {
        p.score = p.target = parseInt(p.pts.textContent, 10) || p.target;
      });
      render();
    });
  }

  // ---- Brickbreaker thumbnail: 5s game loop with crossfade reset ----
  function setupBrickbreaker() {
    const thumb = document.querySelector('.thumb-brickbreaker');
    if (!thumb) return;
    const card = thumb.closest('.project-card');
    const ball = thumb.querySelector('.bb-ball');
    const paddle = thumb.querySelector('.bb-paddle');
    const grid = thumb.querySelector('.brick-grid');
    const score = thumb.querySelector('.bb-score');
    const bricks = Array.from(thumb.querySelectorAll('.brick'));
    if (!ball || !paddle || bricks.length === 0) return;

    let active = false;
    let raf;
    let state;

    function reset() {
      const r = thumb.getBoundingClientRect();
      const W = r.width;
      const H = r.height;
      state = {
        W, H,
        bx: W / 2,
        by: H - 26,
        vx: 1.4 + Math.random() * 0.6,
        vy: -2.2,
        px: W / 2,
        ptx: W / 2,
        score: 0,
        startedAt: performance.now(),
        alive: bricks.map(() => true),
      };
      bricks.forEach((b) => {
        b.style.opacity = '';
        b.style.transform = '';
      });
      if (score) score.textContent = '000';
    }

    function paint() {
      ball.style.left = state.bx + 'px';
      ball.style.top = state.by + 'px';
      paddle.style.left = state.px + 'px';
      if (score) score.textContent = String(state.score).padStart(3, '0');
    }

    function step(now) {
      if (!active) return;
      const elapsed = now - state.startedAt;

      const fadePhase = elapsed > 4800;
      const fadeAmt = fadePhase ? Math.min(1, (elapsed - 4800) / 600) : 0;
      thumb.style.setProperty('--bb-fade', String(1 - fadeAmt * 0.85));
      thumb.style.opacity = String(1 - fadeAmt * 0.5);

      if (elapsed > 5400) {
        reset();
        thumb.style.opacity = '1';
        thumb.style.setProperty('--bb-fade', '1');
        if (active) raf = requestAnimationFrame(step);
        return;
      }

      // Update ball
      state.bx += state.vx;
      state.by += state.vy;

      const W = state.W;
      const H = state.H;
      const r = 4;

      if (state.bx < r) { state.bx = r; state.vx = Math.abs(state.vx); }
      if (state.bx > W - r) { state.bx = W - r; state.vx = -Math.abs(state.vx); }
      if (state.by < r + 6) { state.by = r + 6; state.vy = Math.abs(state.vy); }

      // Paddle tracks ball with lag
      state.ptx = state.bx;
      state.px += (state.ptx - state.px) * 0.15;
      state.px = Math.max(20, Math.min(W - 20, state.px));

      // Paddle collision
      const paddleY = H - 16;
      if (
        state.vy > 0 &&
        state.by + r >= paddleY - 2 &&
        state.by - r <= paddleY + 4 &&
        Math.abs(state.bx - state.px) < 22
      ) {
        const hitPos = (state.bx - state.px) / 22;
        const speed = Math.hypot(state.vx, state.vy);
        const angle = hitPos * 0.9;
        state.vx = Math.sin(angle) * speed;
        state.vy = -Math.abs(Math.cos(angle) * speed);
        state.by = paddleY - r - 2;
      }

      if (state.by > H + 10) {
        state.bx = W / 2;
        state.by = H - 26;
        state.vy = -2.2;
        state.vx = 1.4 + Math.random() * 0.8;
      }

      // Brick collisions
      const gridRect = grid.getBoundingClientRect();
      const tRect = thumb.getBoundingClientRect();
      const gx = gridRect.left - tRect.left;
      const gy = gridRect.top - tRect.top;
      bricks.forEach((b, i) => {
        if (!state.alive[i]) return;
        const br = b.getBoundingClientRect();
        const bx0 = br.left - tRect.left;
        const by0 = br.top - tRect.top;
        const bx1 = bx0 + br.width;
        const by1 = by0 + br.height;
        if (state.bx + r > bx0 && state.bx - r < bx1 && state.by + r > by0 && state.by - r < by1) {
          state.alive[i] = false;
          b.style.opacity = '0';
          b.style.transform = 'scale(0.4)';
          state.score += 10;
          const overlapX = Math.min(state.bx + r - bx0, bx1 - (state.bx - r));
          const overlapY = Math.min(state.by + r - by0, by1 - (state.by - r));
          if (overlapX < overlapY) state.vx = -state.vx;
          else state.vy = -state.vy;
        }
      });

      paint();
      raf = requestAnimationFrame(step);
    }

    card.addEventListener('mouseenter', () => {
      if (reduce) return;
      active = true;
      reset();
      raf = requestAnimationFrame(step);
    });
    card.addEventListener('mouseleave', () => {
      active = false;
      cancelAnimationFrame(raf);
      thumb.style.opacity = '';
      bricks.forEach((b) => {
        b.style.opacity = '';
        b.style.transform = '';
      });
    });
  }

  // ---- Mobile: fire card animations as cards scroll into view ----
  function setupMobileAutoplay() {
    if (!window.matchMedia('(hover: none)').matches) return;
    if (!('IntersectionObserver' in window)) return;
    const cards = document.querySelectorAll('.project-card');
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const card = entry.target;
        if (entry.isIntersecting) {
          card.classList.add('card-active');
          card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        } else {
          card.classList.remove('card-active');
          card.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        }
      }
    }, { threshold: 0.4 });
    cards.forEach((card) => io.observe(card));
  }

  function init() {
    setupCatPlay();
    setupMeter();
    setupRiddle();
    setupBrickbreaker();
    setupMobileAutoplay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
