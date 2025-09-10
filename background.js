// Animated background using canvas for a modern, dark green, and visually striking effect
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.createElement('canvas');
  canvas.id = 'bg-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = 0;
  canvas.style.left = 0;
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.zIndex = '-1';
  canvas.style.pointerEvents = 'none';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let w, h;
  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
  }
  resize();
  window.addEventListener('resize', resize);

  // Animated floating orbs
  const orbs = Array.from({length: 18}, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: 40 + Math.random() * 60,
    dx: (Math.random() - 0.5) * 0.7,
    dy: (Math.random() - 0.5) * 0.7,
    hue: 120 + Math.random() * 40,
    alpha: 0.18 + Math.random() * 0.12
  }));

  function animate() {
    ctx.clearRect(0, 0, w, h);
    for (const orb of orbs) {
      ctx.save();
      ctx.globalAlpha = orb.alpha;
      const grad = ctx.createRadialGradient(orb.x, orb.y, orb.r * 0.2, orb.x, orb.y, orb.r);
      grad.addColorStop(0, `hsl(${orb.hue}, 70%, 45%)`);
      grad.addColorStop(1, `hsl(${orb.hue}, 80%, 15%)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
      orb.x += orb.dx;
      orb.y += orb.dy;
      if (orb.x < -orb.r) orb.x = w + orb.r;
      if (orb.x > w + orb.r) orb.x = -orb.r;
      if (orb.y < -orb.r) orb.y = h + orb.r;
      if (orb.y > h + orb.r) orb.y = -orb.r;
    }
    requestAnimationFrame(animate);
  }
  animate();
});
