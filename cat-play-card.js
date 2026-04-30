(() => {
  const thumb = document.querySelector('.thumb-catplay');
  if (!thumb) return;
  const ball = thumb.querySelector('.ball');
  if (!ball) return;

  const card = thumb.closest('.project-card');

  function move(clientX, clientY) {
    const rect = thumb.getBoundingClientRect();
    const x = Math.max(14, Math.min(rect.width - 14, clientX - rect.left));
    const y = Math.max(14, Math.min(rect.height - 14, clientY - rect.top));
    ball.style.left = x + 'px';
    ball.style.top = y + 'px';
  }

  card.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
  card.addEventListener('mouseleave', () => {
    ball.style.left = '50%';
    ball.style.top = '50%';
  });
})();
