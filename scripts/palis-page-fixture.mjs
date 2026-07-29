const DEFAULT_FREEZE_AT = '2026-07-28T12:00:00.000Z';

const DEFAULT_ARCHIVE_ORIGIN = 'https://hpzdccfrouhljqlzczuv.supabase.co';

export async function installPalisPageFixture(page, {
  freezeAt = DEFAULT_FREEZE_AT,
  previewOrigin,
  archiveOrigin = DEFAULT_ARCHIVE_ORIGIN,
} = {}) {
  const frozenTimestamp = Date.parse(freezeAt);
  if (!Number.isFinite(frozenTimestamp)) throw new TypeError('freezeAt must be a valid date');

  await page.emulateTimezone('Asia/Shanghai');
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.evaluateOnNewDocument((timestamp) => {
    const NativeDate = Date;
    class FrozenDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [timestamp]));
      }
      static now() { return timestamp; }
    }
    Object.setPrototypeOf(FrozenDate, NativeDate);
    window.Date = FrozenDate;

    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      if (Number(delay) === 260) return 0;
      return nativeSetInterval(callback, delay, ...args);
    };

  }, frozenTimestamp);

  const requestLog = { allowed: [], archives: [], fatal: [], unknownExternal: [] };
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    const resource = { method: request.method(), url };
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      requestLog.fatal.push(resource);
      void request.abort('blockedbyclient');
      return;
    }
    if (url.startsWith('data:') || url.startsWith('blob:') || parsed.origin === previewOrigin) {
      requestLog.allowed.push(resource);
      void request.continue();
      return;
    }
    try {
      if (
        parsed.origin === archiveOrigin
        && parsed.pathname === '/rest/v1/archives'
        && ['GET', 'OPTIONS'].includes(request.method())
      ) {
        requestLog.archives.push(resource);
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: '[]',
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,HEAD,OPTIONS',
            'access-control-allow-headers': '*',
          },
        });
        return;
      }
    } catch {
      // The malformed request is recorded as fatal below.
    }
    requestLog.fatal.push(resource);
    void request.abort('blockedbyclient');
  });
  return requestLog;
}

export async function freezePalisMascot(page) {
  await page.evaluate(async () => {
    const mascot = document.querySelector('#mascot-idle-frame');
    if (!mascot) throw new Error('PALIS mascot idle frame is missing');
    mascot.dataset.mascotFrame = '02';
    mascot.src = '/assets/mascot/idle-02.png';
    if (!mascot.complete || mascot.naturalWidth <= 0) {
      await mascot.decode();
    }
    if (!mascot.complete || mascot.naturalWidth <= 0) throw new Error('PALIS mascot idle frame did not load');
  });
}

export async function waitForPalisVisuals(page) {
  // `page.click()` leaves Puppeteer's pointer on the control it clicked. Move
  // it to the inert viewport corner so capture never preserves a transient
  // folder hover state, then let the resulting style change paint twice.
  await page.mouse.move(0, 0);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await freezePalisMascot(page);
  await page.evaluate(async () => {
    const within = (promise, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not settle`)), 5_000)),
    ]);
    await within(document.fonts?.ready ?? Promise.resolve(), 'font loading');
    const images = [...document.images].filter((image) => {
      const style = getComputedStyle(image);
      const rect = image.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    await Promise.all(images.map(async (image) => {
      if (!image.complete || image.naturalWidth <= 0) {
        await within(image.decode(), `visible image decode: ${image.currentSrc || image.src}`);
      }
      if (!image.complete || image.naturalWidth <= 0) {
        throw new Error(`visible image did not load: ${image.currentSrc || image.src}`);
      }
    }));
    for (const animation of document.getAnimations({ subtree: true })) {
      const timing = animation.effect?.getComputedTiming();
      if (timing?.iterations === Infinity) {
        animation.currentTime = 0;
        animation.pause();
      } else {
        try { animation.finish(); } catch { animation.pause(); }
      }
    }
    const eventPlane = document.querySelector('.event-plane');
    const eventWorld = eventPlane?.querySelector('.event-plane-world');
    if (eventPlane && eventWorld) {
      const width = eventPlane.clientWidth;
      const height = eventPlane.clientHeight;
      const scale = Math.min(0.62, Math.max(0.1, Math.min(width / 3980, height / 2780) * 0.96));
      const x = width / 2 - 3800 * scale / 2;
      const y = height / 2 - 2600 * scale / 2;
      eventWorld.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      eventPlane.style.setProperty('--plane-grid-x', `${x % 64}px`);
      eventPlane.style.setProperty('--plane-grid-y', `${y % 64}px`);
      eventPlane.style.setProperty('--plane-grid-scale', String(scale));
      eventPlane.dataset.captureCamera = `${width}x${height}:${x}:${y}:${scale}`;
    }
    // The event plane performs a second camera-layout pass after its initial
    // render.  Two frames can preserve that intermediate transform on a busy
    // machine, so capture only after a deterministic settle window.
    await new Promise((resolve) => {
      let frames = 8;
      const settle = () => (frames-- > 0 ? requestAnimationFrame(settle) : resolve());
      requestAnimationFrame(settle);
    });
  });
}
