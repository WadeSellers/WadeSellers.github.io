(() => {
  const canvas = document.getElementById('brickbreaker');
  if (!canvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    canvas.style.display = 'none';
    const hint = document.querySelector('.game-hint');
    if (hint) hint.innerHTML = '<a href="/">Head back to the projects &rarr;</a>';
    return;
  }

  const ctx = canvas.getContext('2d');
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#c96d3c';
  const text = styles.getPropertyValue('--text').trim() || '#2c2c2c';
  const muted = styles.getPropertyValue('--text-muted').trim() || '#6b6b6b';
  const bgCard = styles.getPropertyValue('--bg-card').trim() || '#ffffff';

  const W = canvas.width;
  const H = canvas.height;

  const paddle = { w: 110, h: 12, x: W / 2 - 55, y: H - 28 };
  const ball = { x: W / 2, y: paddle.y - 9, r: 8, dx: 0, dy: 0, attached: true, speed: 6 };

  const cols = 10;
  const rows = 6;
  const brickPadX = 28;
  const brickPadTop = 56;
  const brickGap = 4;
  const brickW = (W - brickPadX * 2 - brickGap * (cols - 1)) / cols;
  const brickH = 18;

  const bricks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      bricks.push({
        x: brickPadX + c * (brickW + brickGap),
        y: brickPadTop + r * (brickH + brickGap),
        w: brickW,
        h: brickH,
        alive: true,
        row: r,
      });
    }
  }

  let score = 0;
  let lives = 3;
  let state = 'ready';
  let pointerX = W / 2;

  function pointerFromClient(clientX) {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    pointerX = (clientX - rect.left) * scale;
  }

  canvas.addEventListener('mousemove', (e) => pointerFromClient(e.clientX));
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches[0]) {
      pointerFromClient(e.touches[0].clientX);
      e.preventDefault();
    }
  }, { passive: false });
  canvas.addEventListener('click', launch);
  canvas.addEventListener('touchstart', (e) => { launch(); e.preventDefault(); }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      launch();
    } else if (e.code === 'ArrowLeft') {
      pointerX = Math.max(0, pointerX - 28);
    } else if (e.code === 'ArrowRight') {
      pointerX = Math.min(W, pointerX + 28);
    }
  });

  function launch() {
    if (state === 'ready') {
      ball.attached = false;
      const dir = Math.random() < 0.5 ? -1 : 1;
      ball.dx = dir * ball.speed * 0.5;
      ball.dy = -ball.speed * 0.85;
      state = 'playing';
    } else if (state === 'won' || state === 'lost') {
      reset();
    }
  }

  function reset() {
    score = 0;
    lives = 3;
    bricks.forEach((b) => { b.alive = true; });
    resetBall();
    state = 'ready';
  }

  function resetBall() {
    ball.attached = true;
    ball.dx = 0;
    ball.dy = 0;
    state = 'ready';
  }

  function update() {
    paddle.x = Math.max(0, Math.min(W - paddle.w, pointerX - paddle.w / 2));

    if (ball.attached) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r;
      return;
    }
    if (state !== 'playing') return;

    ball.x += ball.dx;
    ball.y += ball.dy;

    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.dx = Math.abs(ball.dx); }
    if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.dx = -Math.abs(ball.dx); }
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.dy = Math.abs(ball.dy); }

    if (ball.y - ball.r > H) {
      lives -= 1;
      if (lives <= 0) {
        state = 'lost';
      } else {
        resetBall();
      }
      return;
    }

    if (
      ball.dy > 0 &&
      ball.y + ball.r >= paddle.y &&
      ball.y - ball.r <= paddle.y + paddle.h &&
      ball.x >= paddle.x &&
      ball.x <= paddle.x + paddle.w
    ) {
      const hitPos = (ball.x - paddle.x) / paddle.w;
      const angle = (hitPos - 0.5) * (Math.PI / 2.4);
      const speed = Math.hypot(ball.dx, ball.dy) || ball.speed;
      ball.dx = Math.sin(angle) * speed;
      ball.dy = -Math.abs(Math.cos(angle) * speed);
      ball.y = paddle.y - ball.r;
    }

    for (const b of bricks) {
      if (!b.alive) continue;
      if (
        ball.x + ball.r > b.x &&
        ball.x - ball.r < b.x + b.w &&
        ball.y + ball.r > b.y &&
        ball.y - ball.r < b.y + b.h
      ) {
        b.alive = false;
        score += 10;
        const overlapX = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r));
        const overlapY = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
        if (overlapX < overlapY) ball.dx = -ball.dx;
        else ball.dy = -ball.dy;
        break;
      }
    }

    if (bricks.every((b) => !b.alive)) {
      state = 'won';
    }
  }

  function draw() {
    ctx.fillStyle = bgCard;
    ctx.fillRect(0, 0, W, H);

    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.row < 3 ? accent : muted;
      ctx.globalAlpha = b.row < 3 ? 1 - b.row * 0.15 : 0.55 - (b.row - 3) * 0.1;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = accent;
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);

    ctx.fillStyle = text;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = muted;
    ctx.font = '500 13px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE  ${score}`, 16, 26);
    ctx.textAlign = 'right';
    ctx.fillText(`LIVES  ${lives}`, W - 16, 26);

    if (state === 'ready') {
      ctx.fillStyle = text;
      ctx.font = '500 16px ui-sans-serif, system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click or press space to launch.', W / 2, H - 60);
    } else if (state === 'won' || state === 'lost') {
      ctx.fillStyle = bgCard;
      ctx.globalAlpha = 0.88;
      ctx.fillRect(0, H / 2 - 70, W, 140);
      ctx.globalAlpha = 1;
      ctx.fillStyle = text;
      ctx.textAlign = 'center';
      ctx.font = '500 26px Georgia, ui-serif, serif';
      const line1 = state === 'won' ? 'You broke all the bricks.' : 'You lost.';
      ctx.fillText(line1, W / 2, H / 2 - 14);
      ctx.fillText("The page still doesn't exist.", W / 2, H / 2 + 16);
      ctx.fillStyle = muted;
      ctx.font = '500 13px ui-sans-serif, system-ui, -apple-system, sans-serif';
      ctx.fillText('Press space or click to play again.', W / 2, H / 2 + 48);
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  loop();
})();
