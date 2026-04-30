(() => {
  const canvas = document.getElementById('matrix-rain');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const chars = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF';
  const fontSize = 16;
  const trailFade = 'rgba(8, 10, 8, 0.08)';
  const head = '#caffca';
  const body = '#36c536';

  let dpr, columns, drops;

  function size() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Math.floor(rect.width / fontSize);
    drops = Array.from({ length: columns }, () => Math.random() * -40);
    ctx.fillStyle = '#080a08';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }
  size();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(size, 150);
  });

  function tick() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.fillStyle = trailFade;
    ctx.fillRect(0, 0, w, h);

    ctx.font = `${fontSize}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textBaseline = 'top';

    for (let i = 0; i < columns; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      ctx.fillStyle = head;
      ctx.fillText(ch, x, y);
      ctx.fillStyle = body;
      ctx.fillText(ch, x, y - fontSize);

      if (y > h && Math.random() > 0.975) drops[i] = 0;
      drops[i] += 1;
    }
  }

  if (reduceMotion) {
    for (let i = 0; i < 80; i++) tick();
    return;
  }

  let last = 0;
  const interval = 60;
  function loop(now) {
    if (now - last >= interval) {
      tick();
      last = now;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
