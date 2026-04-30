(() => {
  const thumb = document.querySelector('.thumb-catplay');
  if (!thumb) return;
  const ball = thumb.querySelector('.ball');
  const trails = thumb.querySelectorAll('.ball-trail');
  const eye = thumb.querySelector('.cat-eye');
  if (!ball) return;

  const card = thumb.closest('.project-card');

  function setBall(x, y) {
    ball.style.left = x + 'px';
    ball.style.top = y + 'px';
    trails.forEach((t) => {
      t.style.left = x + 'px';
      t.style.top = y + 'px';
    });
  }

  function setEye(ballX, ballY) {
    if (!eye) return;
    const eyeRect = eye.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const eyeCx = eyeRect.left - thumbRect.left + eyeRect.width / 2;
    const eyeCy = eyeRect.top - thumbRect.top + eyeRect.height / 2;
    const dx = ballX - eyeCx;
    const dy = ballY - eyeCy;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = (dx / len) * 1.6;
    const ny = (dy / len) * 1.6;
    eye.style.setProperty('--ex', nx + 'px');
    eye.style.setProperty('--ey', ny + 'px');
  }

  function move(clientX, clientY) {
    const rect = thumb.getBoundingClientRect();
    const x = Math.max(14, Math.min(rect.width - 14, clientX - rect.left));
    const y = Math.max(14, Math.min(rect.height - 14, clientY - rect.top));
    setBall(x, y);
    setEye(x, y);
  }

  card.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
  card.addEventListener('mouseleave', () => {
    const rect = thumb.getBoundingClientRect();
    setBall(rect.width / 2, rect.height / 2);
    setEye(rect.width / 2, rect.height / 2);
  });
})();
