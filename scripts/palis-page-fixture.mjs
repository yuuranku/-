const DEFAULT_FREEZE_AT = '2026-07-28T12:00:00.000Z';

const isLoopback = (url) => {
  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
};

export async function installPalisPageFixture(page, { freezeAt = DEFAULT_FREEZE_AT } = {}) {
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

  const requestLog = { allowed: [], archives: [], fatal: [] };
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    const resource = { method: request.method(), url };
    if (url.startsWith('data:') || url.startsWith('blob:') || isLoopback(url)) {
      requestLog.allowed.push(resource);
      void request.continue();
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.pathname === '/rest/v1/archives') {
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
    const mascot = document.querySelector(
      '#mascot, .mascot img, img[src*="mascot"]',
    );
    if (!mascot) return;
    mascot.src = '/assets/mascot/idle-02.png';
    await mascot.decode?.().catch(() => {});
  });
}

export async function waitForPalisVisuals(page) {
  await page.evaluate(async () => {
    const within = (promise, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} did not settle`)), 5_000)),
    ]);
    await within(document.fonts?.ready ?? Promise.resolve(), 'font loading');
    const images = [...document.images].filter((image) => {
      const style = getComputedStyle(image);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    await Promise.all(images.map((image) => Promise.race([
      image.decode?.().catch(() => {}) ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ])));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await freezePalisMascot(page);
}
