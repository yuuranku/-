import { preview } from 'vite';

import { waitForPalisVisuals } from './palis-page-fixture.mjs';

export const DIRECTORY_SCENES = Object.freeze({
  countries: ['country-stack', '.country-stack-vault', 18],
  organizations: ['network', '.organization-lane', 23],
  stations: ['station-board', '.station-coordinate-board', 20],
  entrances: ['entrance-network', '.entrance-sheet-console', 18],
  ecology: ['ecology-strata', '.eco-log-console', 7],
  people: ['dossier', '.people-network-workbench', 36],
  events: ['event-plane', '.event-plane', 26],
  abnormalities: ['anomaly-monitor', '.anomaly-carousel', 25],
  species: ['species-helix', '.species-helix-console', 22],
});

const DIRECTORY_CODES = Object.freeze({
  countries: '01', organizations: '02', stations: '03', entrances: '04', ecology: '05',
  people: '06', events: '07', abnormalities: '08', species: '09',
});
const SCENE_TIMEOUT = 30_000;

export async function startPalisPreview({ root, port = 0 }) {
  const server = await preview({
    root,
    logLevel: 'error',
    preview: { host: '127.0.0.1', port, strictPort: false },
  });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('PALIS preview server did not expose a TCP address');
  }

  let closed = false;
  return {
    url: `http://127.0.0.1:${address.port}/`,
    async close() {
      if (closed) return;
      closed = true;
      server.httpServer.closeAllConnections?.();
      await server.close();
    },
  };
}

export async function waitForPalisScene(page, scene) {
  const previewActive = await page.evaluate(() => document.body.dataset.accessMode === 'preview');
  if (!previewActive) {
    await page.mouse.click(8, 8);
    await page.waitForSelector('#access-login:not([hidden])', { timeout: SCENE_TIMEOUT });
    await page.waitForSelector('#access-preview:not([disabled])', { timeout: SCENE_TIMEOUT });
    await page.click('#access-preview');
    await page.waitForSelector(
      'body[data-access-mode="preview"] #experience:not([inert])',
      { timeout: SCENE_TIMEOUT },
    );
    await page.waitForSelector('#version-notice:not([hidden])', { timeout: SCENE_TIMEOUT });
  }
  const closeButton = await page.$('#version-notice:not([hidden]) button[data-version-notice-action="close"]');
  if (closeButton) {
    // The notice can still have its entrance layer above the button during a
    // headless capture.  Dispatch through the actual control so the close
    // transition is deterministic, then require the application to hide it.
    await page.$eval('#version-notice:not([hidden]) button[data-version-notice-action="close"]', (button) => button.click());
    await page.waitForFunction(() => document.querySelector('#version-notice')?.hidden, { timeout: SCENE_TIMEOUT });
  }
  await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 2 / 3));
  await page.waitForSelector(
    'body[data-chapter="2"] #archive-layer.is-active:not(.has-directory)[aria-hidden="false"]',
    { timeout: SCENE_TIMEOUT },
  );
  await page.waitForSelector('#folder-orbit[data-category="root"][data-mode="orbit"]', { timeout: SCENE_TIMEOUT });
  if (scene === 'home' || scene === 'root') {
    await waitForPalisVisuals(page);
    return;
  }
  const expected = DIRECTORY_SCENES[scene];
  const code = DIRECTORY_CODES[scene];
  if (!expected || !code) throw new RangeError(`Unknown PALIS scene: ${scene}`);
  const [mode, structureSelector, count] = expected;
  await page.$eval(`.folder-button.is-folder[data-code="${code}"]`, (button) => button.click());
  await page.waitForSelector('#archive-layer.is-active.has-directory[aria-hidden="false"]', { timeout: SCENE_TIMEOUT });
  await page.waitForSelector(
    `#folder-orbit[data-category="${scene}"][data-mode="${mode}"]`,
    { timeout: SCENE_TIMEOUT },
  );
  await page.waitForSelector(structureSelector, { timeout: SCENE_TIMEOUT });
  const entries = await page.$$eval('#folder-orbit .folder-button', (buttons) => buttons.length);
  if (entries !== count) {
    throw new Error(`PALIS ${scene} expected ${count} entries, received ${entries}`);
  }
  await waitForPalisVisuals(page);
}
