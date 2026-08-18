const PALETTE = ['#f4f1e9', '#aaa9a4', '#d4d2cb', '#74746f'];
const MAX_PARTICLES = 220;

function makeParticles(count, horizon, outerRadius) {
  return Array.from({ length: count }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: horizon + Math.pow(Math.random(), 1.75) * (outerRadius - horizon),
    height: (Math.random() - 0.5) * 16,
    speed: 0.72 + Math.random() * 0.55,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
  }));
}

/**
 * Quiet, canvas-based "white abyss" field for the PALIS boot screen.
 * It intentionally avoids a framework dependency and pauses outside the boot view.
 */
export function initializeAccessVoid({ reducedMotion = false } = {}) {
  const canvas = document.querySelector('#access-void-canvas');
  const gate = document.querySelector('#access-gate');
  if (!canvas || !gate || reducedMotion) return () => {};

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return () => {};

  let width = 0;
  let height = 0;
  let horizon = 0;
  let outerRadius = 0;
  let particles = [];
  let animationFrame = 0;
  let lastTime = performance.now();

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    horizon = Math.max(30, Math.min(width, height) * 0.052);
    outerRadius = Math.max(horizon + 20, Math.min(width * 0.43, height * 0.58));
    particles = makeParticles(Math.min(MAX_PARTICLES, Math.max(110, Math.round(width / 8))), horizon, outerRadius);
  };

  const draw = (now) => {
    const dt = Math.min((now - lastTime) / 16.667, 2.5);
    lastTime = now;

    if (gate.hidden || gate.dataset.phase !== 'boot') {
      animationFrame = 0;
      return;
    }

    if (document.hidden) {
      animationFrame = window.requestAnimationFrame(draw);
      return;
    }

    const centerX = width * 0.72;
    const centerY = height * 0.47;
    const tilt = Math.PI * 0.19;
    const roll = Math.PI * 0.86;

    context.clearRect(0, 0, width, height);

    const background = [];
    const foreground = [];
    for (const particle of particles) {
      const speed = (0.004 + (horizon / Math.max(particle.radius, horizon)) * 0.009) * particle.speed;
      particle.angle += speed * dt;
      const xBase = particle.radius * Math.cos(particle.angle);
      const yBase = particle.height;
      const zBase = particle.radius * Math.sin(particle.angle);
      const yTilt = yBase * Math.cos(tilt) + zBase * Math.sin(tilt);
      const zTilt = -yBase * Math.sin(tilt) + zBase * Math.cos(tilt);
      const x = xBase * Math.cos(roll) - yTilt * Math.sin(roll);
      const y = xBase * Math.sin(roll) + yTilt * Math.cos(roll);
      const scale = 1300 / (1300 + zTilt);
      const point = {
        x: centerX + x * scale,
        y: centerY + y * scale,
        z: zTilt,
        size: Math.max(0.45, (0.55 + (particle.radius / outerRadius) * 1.1) * scale),
        color: particle.color,
        alpha: 0.16 + (1 - (zTilt + outerRadius) / (2 * outerRadius)) * 0.34,
      };
      (zTilt >= 0 ? background : foreground).push(point);
    }

    const render = (points) => {
      points.sort((a, b) => b.z - a.z);
      for (const point of points) {
        context.globalAlpha = point.alpha;
        context.fillStyle = point.color;
        context.beginPath();
        context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
        context.fill();
      }
    };

    render(background);
    const halo = context.createRadialGradient(centerX, centerY, horizon * 0.25, centerX, centerY, horizon * 2.2);
    halo.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    halo.addColorStop(0.45, 'rgba(2, 5, 3, 0.88)');
    halo.addColorStop(0.73, 'rgba(105, 139, 113, 0.09)');
    halo.addColorStop(1, 'rgba(105, 139, 113, 0)');
    context.globalAlpha = 1;
    context.fillStyle = halo;
    context.beginPath();
    context.arc(centerX, centerY, horizon * 2.2, 0, Math.PI * 2);
    context.fill();
    render(foreground);
    context.globalAlpha = 1;

    animationFrame = window.requestAnimationFrame(draw);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  animationFrame = window.requestAnimationFrame(draw);

  return () => {
    observer.disconnect();
    window.cancelAnimationFrame(animationFrame);
  };
}
