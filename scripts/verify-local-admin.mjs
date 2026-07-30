import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from './palis-browser-runtime.mjs';
import { waitForPalisVisuals } from './palis-page-fixture.mjs';
import { startPalisTestServer } from '../tests/helpers/palis-test-server.mjs';

export const EXPECTED_LOCAL_ADMIN_NUMBERING = Object.freeze({
  country: Object.freeze({ code: 'N19', formalNumber: '019.REG' }),
  organization: Object.freeze({ code: 'O25', formalNumber: '025.CHN' }),
  station: Object.freeze({ code: 'ST21', formalNumber: '021.LOG' }),
  entrance: Object.freeze({ code: 'EN19', formalNumber: '019.CRD' }),
  ecology: Object.freeze({ code: 'E08', formalNumber: '008.ECO' }),
  person: Object.freeze({ code: 'P47', formalNumber: '047.PER' }),
  event: Object.freeze({ code: 'EV02', formalNumber: '002.RLL' }),
  anomaly: Object.freeze({ code: 'A04', formalNumber: '004.TRC' }),
  species: Object.freeze({ code: 'S23', formalNumber: '023.SPC' }),
});

const FIXED_TIME = '2026-07-29T04:00:00.000Z';
const VIEWPORT = Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 });
const OUTPUT_ROOT = path.resolve('tmp/local-admin-verification');
const REPORT_PATH = path.join(OUTPUT_ROOT, 'report.json');

const openWorkspaceCommand = async (page, command) => {
  await page.click(`[data-workspace-shortcut][data-workspace-command="${command}"]`, { count: 2, delay: 40 });
};
const openNewArchiveTemplate = async (page, code) => {
  if (!await page.$('[data-new-archive-chooser]')) {
    await openWorkspaceCommand(page, 'new-archive');
    await page.waitForSelector('[data-new-archive-chooser]');
  }
  await page.$eval(
    `[data-new-archive-template="${code}"]`,
    (button) => button.click(),
  );
};
const exitWorkspace = async (page) => {
  await page.$eval('#clerk-desktop-start', (button) => button.click());
  await page.waitForSelector('#clerk-desktop-start-menu:not([hidden])');
  await page.$eval(
    '#clerk-desktop-start-menu [data-workspace-command="exit"]',
    (button) => button.click(),
  );
  await page.waitForFunction(() => !document.body.classList.contains('clerk-desktop-open'), { timeout: 10_000 });
};

const CATEGORY_FIXTURES = Object.freeze([
  {
    category: 'country',
    title: '极地协定观察区',
    summary: '本地验收用国家档案。',
    indexData: { title: '极地协定观察区', archivePeriod: '1960—1965', bloc: 'JOINT' },
  },
  {
    category: 'organization',
    title: '白幕联合档案处',
    summary: '本地验收用组织档案。',
    indexData: { title: '白幕联合档案处', channel: 'JOINT', foundedAt: '1964' },
  },
  {
    category: 'station',
    title: '灰岭科考站',
    summary: '本地验收用科考站档案。',
    indexData: {
      title: '灰岭科考站',
      latitude: -78.5,
      longitude: 164.1,
      owner: 'PALIS',
      stationType: '夏季站',
      status: '运行',
    },
  },
  {
    category: 'entrance',
    title: '白幕副入口',
    summary: '本地验收用入口档案。',
    indexData: {
      title: '白幕副入口',
      latitude: -79.1,
      longitude: 161.2,
      owner: 'PALIS',
      entranceType: '冰裂隙',
      status: '受控',
      hazard: '高',
    },
  },
  {
    category: 'ecology',
    title: '灰岭苔原带',
    summary: '本地验收用生态档案。',
    indexData: {
      title: '灰岭苔原带',
      recordType: '野外样带',
      firstObservedAt: '1964-12-03',
      scope: '灰岭东坡',
      status: '持续观察',
    },
  },
  {
    category: 'person',
    title: '林岚',
    summary: '本地验收用人物档案。',
    indexData: {
      title: '林岚',
      archiveChain: 'PALIS / FIELD',
      organization: '白幕联合档案处',
      role: '现场书记官',
      activePeriod: '1964—',
      status: '在岗',
    },
  },
  {
    category: 'event',
    title: '白幕初垂事件',
    summary: '本地验收用事件档案。',
    indexData: {
      title: '白幕初垂事件',
      startDate: '1965-01-17',
      endDate: '',
      timePrecision: 'DAY',
      location: '白幕副入口',
      reviewStatus: '已复核',
    },
  },
  {
    category: 'anomaly',
    title: '白幕回声异常',
    summary: '本地验收用异常附卷。',
    indexData: {
      title: '白幕回声异常',
      parentEvent: 'EV02',
      occurredAt: '1965-01-17',
      location: '白幕副入口',
      anomalyType: '声音复现',
      severity: '观察',
      status: '开放',
    },
  },
  {
    category: 'species',
    title: '银脊鸣虫',
    summary: '本地验收用物种档案。',
    indexData: {
      title: '银脊鸣虫',
      specimenClass: 'FAUNA',
      discoveredAt: '1965-01-18',
      location: '灰岭苔原带',
      specimenStatus: '活体',
      hazard: '低',
    },
  },
]);

const ROOT_DIRECTORY = Object.freeze({
  anomaly: { folderCode: '08', category: 'abnormalities', mode: 'anomaly-monitor' },
  event: { folderCode: '07', category: 'events', mode: 'event-plane' },
});

const comparable = (value) => JSON.stringify(value);

export function isAllowedVerificationRequest(value, previewOrigin) {
  const text = String(value ?? '');
  if (text.startsWith('data:')) return true;
  try {
    const url = new URL(text);
    const origin = new URL(previewOrigin);
    return url.origin === origin.origin;
  } catch {
    return false;
  }
}

export function isViewportRectVisible(rect, viewport) {
  if (!rect || !viewport) return false;
  return Number(rect.bottom) > 0
    && Number(rect.right) > 0
    && Number(rect.top) < Number(viewport.height)
    && Number(rect.left) < Number(viewport.width);
}

export function summarizeVerification({
  assertions = [],
  externalRequests = [],
  diagnostics = [],
} = {}) {
  return {
    passed: assertions.every((entry) => entry.passed === true)
      && externalRequests.length === 0
      && diagnostics.length === 0,
    assertionCount: assertions.length,
    passedAssertionCount: assertions.filter((entry) => entry.passed === true).length,
    failedAssertionCount: assertions.filter((entry) => entry.passed !== true).length,
  };
}

const sha256 = async (file) =>
  createHash('sha256').update(await readFile(file)).digest('hex');

const addAssertion = (report, {
  id,
  layer,
  actual,
  expected,
  passed = comparable(actual) === comparable(expected),
  evidence = [],
}) => {
  const entry = {
    id,
    layer,
    passed: Boolean(passed),
    actual: structuredClone(actual),
    expected: structuredClone(expected),
    evidence: [...evidence],
  };
  report.assertions.push(entry);
  return entry.passed;
};

const installFrozenBrowserState = async (page) => {
  const timestamp = Date.parse(FIXED_TIME);
  await page.emulateTimezone('Asia/Shanghai');
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.evaluateOnNewDocument((frozenTimestamp) => {
    const NativeDate = Date;
    class FrozenDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [frozenTimestamp]));
      }
      static now() {
        return frozenTimestamp;
      }
    }
    Object.setPrototypeOf(FrozenDate, NativeDate);
    window.Date = FrozenDate;
  }, timestamp);
};

const capture = async (page, report, scene, proof = {}) => {
  await waitForPalisVisuals(page);
  const filename = `${String(report.screenshots.length + 1).padStart(2, '0')}-${scene}.png`;
  const file = path.join(OUTPUT_ROOT, filename);
  await page.screenshot({ path: file, fullPage: false });
  const viewport = page.viewport() || VIEWPORT;
  report.screenshots.push({
    scene,
    file: path.relative(process.cwd(), file).replaceAll('\\', '/'),
    sha256: await sha256(file),
    width: viewport.width,
    height: viewport.height,
    proof: structuredClone(proof),
  });
  return filename;
};

const enterDirectory = async (page, descriptor) => {
  await page.evaluate(() => {
    window.scrollTo(
      0,
      (document.documentElement.scrollHeight - innerHeight) * 2 / 3,
    );
  });
  await page.waitForSelector(
    'body[data-chapter="2"] #archive-layer.is-active[aria-hidden="false"]',
    { timeout: 20_000 },
  );
  const current = await page.$eval('#folder-orbit', (node) => node.dataset.category);
  if (current !== 'root') {
    await page.$eval('#archive-back:not([hidden])', (button) => button.click());
    await page.waitForSelector(
      '#folder-orbit[data-category="root"][data-mode="orbit"]',
      { timeout: 20_000 },
    );
  }
  await page.$eval(
    `.folder-button.is-folder[data-code="${descriptor.folderCode}"]`,
    (button) => button.click(),
  );
  await page.waitForSelector(
    `#folder-orbit[data-category="${descriptor.category}"][data-mode="${descriptor.mode}"]`,
    { timeout: 20_000 },
  );
};

const seedLocalVerificationData = async (page) => page.evaluate(async (fixtures) => {
  const { createLocalAdminRuntime } = await import(
    '/src/archive-workflow/local/local-admin-runtime.js'
  );
  const runtime = createLocalAdminRuntime();
  const repository = runtime.repository;
  await repository.resetLocalDatabase();
  const templates = await repository.listTemplates();
  const templateByCategory = new Map(templates.map((template) => [
    template.category,
    template,
  ]));

  const documentFor = (fixture, template, overrides = {}) => ({
    schemaVersion: 2,
    templateCode: template.code,
    category: fixture.category,
    abbreviation: template.abbreviation,
    title: overrides.title || fixture.title,
    summary: overrides.summary || fixture.summary,
    indexData: structuredClone(fixture.indexData),
    values: {
      hero: overrides.title || fixture.title,
      summary: overrides.summary || fixture.summary,
      ...(overrides.values || {}),
    },
    sections: overrides.sections || [],
  });

  const approveAndPublish = async (fixture, {
    kind = 'new',
    archiveId = null,
    targetContributionId = null,
    baseVersionId = null,
    title = fixture.title,
    content = null,
    key,
  } = {}) => {
    const template = templateByCategory.get(fixture.category);
    if (!template) throw new Error(`Missing template for ${fixture.category}`);
    const draft = await repository.saveDraft({
      templateId: template.id,
      archiveId,
      kind,
      targetContributionId,
      baseVersionId,
      title,
      content: content || documentFor(fixture, template, { title }),
    });
    await repository.submitDraft(draft.id);
    await repository.reviewSubmission(draft.id, {
      decision: 'approved',
      message: `本地验收通过：${title}`,
    });
    const publication = await repository.publishContribution(draft.id, {
      archiveId,
      category: fixture.category,
      visibility: 'public',
      title: fixture.title,
      summary: fixture.summary,
      idempotencyKey: `local-verification:${key || fixture.category}`,
    });
    return { draft, publication };
  };

  const published = {};
  for (const fixture of fixtures) {
    published[fixture.category] = await approveAndPublish(fixture);
  }

  const speciesFixture = fixtures.find(({ category }) => category === 'species');
  const speciesArchiveId = published.species.publication.archiveId;
  const secondRecord = await approveAndPublish(speciesFixture, {
    kind: 'contribution',
    archiveId: speciesArchiveId,
    title: '银脊鸣虫第二观察记录',
    key: 'species-independent-2',
  });
  const documentsBeforeAmendment = await repository.listArchiveDocuments(speciesArchiveId);
  const firstDocument = documentsBeforeAmendment.find(
    ({ id }) => id === published.species.draft.id,
  );
  if (!firstDocument?.latestVersionId) {
    throw new Error('The first species document has no immutable base version');
  }
  const speciesTemplate = templateByCategory.get('species');
  const amendment = await approveAndPublish(speciesFixture, {
    kind: 'amendment',
    archiveId: speciesArchiveId,
    targetContributionId: firstDocument.id,
    baseVersionId: firstDocument.latestVersionId,
    title: '银脊鸣虫定向补充',
    key: 'species-targeted-amendment',
    content: documentFor(speciesFixture, speciesTemplate, {
      title: '银脊鸣虫定向补充',
      values: {
        'amendment:title': '鸣声频率补录',
        'amendment:body': '本修改只归入第一份独立观察记录。',
      },
      sections: [{
        id: 'amendment',
        label: '定向修改',
        fields: ['amendment:title', 'amendment:body'],
      }],
    }),
  });

  const archives = await repository.listAdminArchives({ limit: 100 });
  const numbering = {};
  for (const fixture of fixtures) {
    const publication = published[fixture.category].publication;
    const contributions = await repository.listArchiveContributions(publication.archiveId);
    const initial = contributions.find(
      ({ id }) => id === published[fixture.category].draft.id,
    );
    const content = initial?.versions?.[0]?.content || {};
    const archive = archives.find(({ id }) => id === publication.archiveId);
    numbering[fixture.category] = {
      archiveId: publication.archiveId,
      contributionId: published[fixture.category].draft.id,
      code: publication.code,
      formalNumber: publication.formalNumber,
      stampedEntryCode: content.values?.entryCode || null,
      stampedDossierNo: content.values?.dossierNo || null,
      title: archive?.title || null,
      indexData: archive?.index_payload || null,
      newBadgeVisible: archive?.new_badge_visible === true,
    };
  }

  const speciesDocuments = await repository.listArchiveDocuments(speciesArchiveId);
  const speciesContributions = await repository.listArchiveContributions(speciesArchiveId);
  const amendmentRecords = speciesContributions.filter(({ kind }) => kind === 'amendment');
  window.__palisVerificationRepository = repository;

  return {
    numbering,
    records: {
      archiveId: speciesArchiveId,
      independentDocumentIds: speciesDocuments.map(({ id }) => id),
      independentDocumentCount: speciesDocuments.length,
      amendmentCount: amendmentRecords.length,
      amendmentTarget: amendmentRecords[0]?.target_contribution_id || null,
      expectedAmendmentTarget: firstDocument.id,
      secondRecordId: secondRecord.draft.id,
      amendmentId: amendment.draft.id,
    },
  };
}, CATEGORY_FIXTURES);

export async function verifyLocalAdministrator({
  outputRoot = OUTPUT_ROOT,
} = {}) {
  if (path.resolve(outputRoot) !== OUTPUT_ROOT) {
    throw new Error(`Custom outputRoot is not supported; expected ${OUTPUT_ROOT}`);
  }
  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });

  const startedAt = new Date().toISOString();
  const report = {
    schemaVersion: 1,
    command: 'npm.cmd run verify:local-admin',
    scope: {
      repositoryLifecycle: '真实 IndexedDB 的保存、提交、审核与发布',
      uiCriticalPaths: '真实页面的目录、编辑控件、NEW 开关与记录树',
      fullUiButtonWorkflow: false,
    },
    startedAt,
    generatedAt: null,
    passed: false,
    summary: null,
    environment: {
      accessMode: null,
      operatorRole: null,
      browser: null,
      viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
      narrowViewport: '390x844',
      frozenAt: FIXED_TIME,
      loopbackOnly: true,
    },
    repositoryEvidence: {
      numbering: {},
      records: {},
    },
    uiEvidence: {},
    assertions: [],
    screenshots: [],
    externalRequests: [],
    diagnostics: [],
  };

  const previousLocalAdmin = process.env.VITE_PALIS_LOCAL_ADMIN;
  process.env.VITE_PALIS_LOCAL_ADMIN = '1';
  let server;
  let browser;
  let page;

  try {
    server = await startPalisTestServer({ root: process.cwd() });
    const previewOrigin = new URL(server.url).origin;
    browser = await puppeteer.launch({
      executablePath: resolveBrowserExecutable(),
      headless: true,
      args: ['--no-sandbox', '--hide-scrollbars'],
    });
    report.environment.browser = await browser.version();
    page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await installFrozenBrowserState(page);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (isAllowedVerificationRequest(request.url(), previewOrigin)) {
        void request.continue();
        return;
      }
      report.externalRequests.push({
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
      });
      void request.abort('blockedbyclient');
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        report.diagnostics.push({
          level: 'console',
          message: message.text(),
        });
      }
    });
    page.on('pageerror', (error) => {
      report.diagnostics.push({
        level: 'pageerror',
        message: error.message,
      });
    });

    await page.goto(server.url, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForSelector(
      'body[data-access-mode="local-admin"][data-operator-role="admin"]',
      { timeout: 30_000 },
    );
    const localAdminState = await page.evaluate(() => ({
      accessMode: document.body.dataset.accessMode,
      operatorRole: document.body.dataset.operatorRole,
      gateHidden: document.querySelector('#access-gate')?.hidden === true,
      experienceUnlocked: !document.querySelector('#experience')?.hasAttribute('inert'),
      workspaceEntryVisible: !document.querySelector('#clerk-workspace-entry')?.hidden,
      operatorName: document.querySelector('#auth-session-user')?.textContent?.trim() || '',
    }));
    report.environment.accessMode = localAdminState.accessMode;
    report.environment.operatorRole = localAdminState.operatorRole;
    addAssertion(report, {
      id: 'local-admin-runtime',
      layer: 'ui',
      actual: localAdminState,
      expected: {
        accessMode: 'local-admin',
        operatorRole: 'admin',
        gateHidden: true,
        experienceUnlocked: true,
        workspaceEntryVisible: true,
        operatorName: '本地管理员',
      },
    });

    const versionClose = await page.$(
      '#version-notice:not([hidden]) [data-version-notice-action="close"]',
    );
    if (versionClose) {
      await versionClose.click();
      await page.waitForFunction(
        () => document.querySelector('#version-notice')?.hidden === true,
        { timeout: 10_000 },
      );
    }

    const seeded = await seedLocalVerificationData(page);
    report.repositoryEvidence = seeded;
    for (const [category, expected] of Object.entries(EXPECTED_LOCAL_ADMIN_NUMBERING)) {
      const actual = seeded.numbering[category];
      addAssertion(report, {
        id: `numbering-${category}`,
        layer: 'repository',
        actual: {
          code: actual?.code,
          formalNumber: actual?.formalNumber,
          stampedEntryCode: actual?.stampedEntryCode,
          stampedDossierNo: actual?.stampedDossierNo,
        },
        expected: {
          code: expected.code,
          formalNumber: expected.formalNumber,
          stampedEntryCode: expected.code,
          stampedDossierNo: expected.formalNumber,
        },
      });
    }
    addAssertion(report, {
      id: 'repository-anomaly-title',
      layer: 'repository',
      actual: seeded.numbering.anomaly.title,
      expected: '白幕回声异常',
    });
    addAssertion(report, {
      id: 'repository-event-index',
      layer: 'repository',
      actual: {
        title: seeded.numbering.event.indexData?.title,
        startDate: seeded.numbering.event.indexData?.startDate,
        location: seeded.numbering.event.indexData?.location,
      },
      expected: {
        title: '白幕初垂事件',
        startDate: '1965-01-17',
        location: '白幕副入口',
      },
    });
    addAssertion(report, {
      id: 'repository-record-tree',
      layer: 'repository',
      actual: {
        independentDocumentCount: seeded.records.independentDocumentCount,
        amendmentCount: seeded.records.amendmentCount,
        amendmentTarget: seeded.records.amendmentTarget,
      },
      expected: {
        independentDocumentCount: 2,
        amendmentCount: 1,
        amendmentTarget: seeded.records.expectedAmendmentTarget,
      },
    });
    addAssertion(report, {
      id: 'repository-new-default',
      layer: 'repository',
      actual: Object.values(seeded.numbering).every(
        ({ newBadgeVisible }) => newBadgeVisible === true,
      ),
      expected: true,
    });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('palis:archive-directory-changed'));
    });
    await page.waitForFunction(
      () => document.querySelectorAll('#folder-orbit .folder-button.is-folder').length === 9,
      { timeout: 20_000 },
    );

    await page.click('#clerk-workspace-entry');
    await page.waitForSelector(
      'body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])',
      { timeout: 20_000 },
    );
    const welcomeClose = await page.$('#clerk-desktop-welcome:not([hidden]) #clerk-desktop-welcome-close');
    if (welcomeClose) await welcomeClose.click();
    await openWorkspaceCommand(page, 'new-archive');
    await page.waitForSelector('[data-new-archive-chooser]');
    const desktopEvidence = await page.evaluate(() => ({
      title: document.querySelector('[data-workspace-name]')?.textContent?.trim(),
      englishTitle: document.querySelector('[data-workspace-name-en]')?.textContent?.trim(),
      templateCodes: [...document.querySelectorAll('[data-new-archive-template]')]
        .map((button) => button.dataset.newArchiveTemplate),
      adminUtilities: [...document.querySelectorAll('[data-admin-only]:not([hidden])')].length,
    }));
    report.uiEvidence.desktop = desktopEvidence;
    addAssertion(report, {
      id: 'ui-admin-desktop-nine-files',
      layer: 'ui',
      actual: desktopEvidence,
      expected: {
        title: '管理员工作台',
        englishTitle: 'ADMIN WORKSPACE',
        templateCodes: ['01', '02', '03', '04', '05', '06', '07', '08', '09'],
        adminUtilities: 4,
      },
      evidence: ['01-local-admin-win95.png'],
    });
    await capture(page, report, 'local-admin-win95', desktopEvidence);

    await openNewArchiveTemplate(page, '09');
    await page.waitForSelector(
      '.archive-editor-window [data-native-form-root] [name="index:specimenClass"]',
      { timeout: 20_000 },
    );
    const speciesSelect = '.archive-editor-window select[name="index:specimenClass"]';
    await page.waitForSelector(speciesSelect, { timeout: 20_000 });
    const speciesOptions = await page.$$eval(
      `${speciesSelect} option`,
      (options) => options.map(({ value }) => value).filter(Boolean),
    );
    await page.select(speciesSelect, 'FAUNA');
    const speciesSelected = await page.$eval(speciesSelect, (select) => select.value);
    const speciesEditorEvidence = {
      options: speciesOptions,
      selected: speciesSelected,
    };
    report.uiEvidence.speciesEditor = speciesEditorEvidence;
    addAssertion(report, {
      id: 'ui-species-three-options',
      layer: 'ui',
      actual: speciesEditorEvidence,
      expected: {
        options: ['FLORA', 'FAUNA', 'COMPOSITE'],
        selected: 'FAUNA',
      },
      evidence: ['02-species-three-options.png'],
    });
    await capture(page, report, 'species-three-options', speciesEditorEvidence);
    await page.click('.archive-editor-window [data-workflow-close]');
    await page.waitForFunction(() =>
      !document.querySelector('.archive-editor-window')
      || document.querySelector('#workspace-exit-dialog')?.open);
    if (await page.$eval('#workspace-exit-dialog', (dialog) => dialog.open)) {
      await page.$eval(
        '[data-workspace-exit-action="discard"]',
        (button) => button.click(),
      );
    }
    await page.waitForFunction(() => !document.querySelector('.archive-editor-window'));
    await exitWorkspace(page);

    await enterDirectory(page, ROOT_DIRECTORY.anomaly);
    await page.waitForSelector('.folder-button[data-code="A04"]', { timeout: 20_000 });
    const anomalyEvidence = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('#folder-orbit .folder-button')];
      const button = buttons.find((candidate) => candidate.dataset.code === 'A04');
      const archiveRect = button?.getBoundingClientRect();
      return {
        count: buttons.length,
        index: buttons.indexOf(button),
        code: button?.dataset.code,
        title: button?.querySelector('.folder-name')?.textContent?.trim(),
        isNew: Boolean(button?.querySelector('.archive-new-badge')),
        archiveRect: archiveRect ? {
          top: archiveRect.top,
          right: archiveRect.right,
          bottom: archiveRect.bottom,
          left: archiveRect.left,
        } : null,
      };
    });
    anomalyEvidence.inViewport = isViewportRectVisible(
      anomalyEvidence.archiveRect,
      VIEWPORT,
    );
    delete anomalyEvidence.archiveRect;
    report.uiEvidence.anomalyDirectory = anomalyEvidence;
    addAssertion(report, {
      id: 'ui-anomaly-title-tail-new',
      layer: 'ui',
      actual: anomalyEvidence,
      expected: {
        count: 4,
        index: 3,
        code: 'A04',
        title: '白幕回声异常',
        isNew: true,
        inViewport: true,
      },
      evidence: ['03-anomaly-title-tail-new.png'],
    });
    await page.$eval('.folder-button[data-code="A04"]', (button) => button.click());
    await page.waitForSelector('.folder-button[data-code="A04"].is-selected', {
      timeout: 10_000,
    });
    await capture(page, report, 'anomaly-title-tail-new', anomalyEvidence);

    await enterDirectory(page, ROOT_DIRECTORY.event);
    await page.waitForSelector('.folder-button[data-code="EV02"]', { timeout: 20_000 });
    const eventEvidence = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('#folder-orbit .folder-button')];
      const button = buttons.find((candidate) => candidate.dataset.code === 'EV02');
      const archiveRect = button?.getBoundingClientRect();
      return {
        count: buttons.length,
        index: buttons.indexOf(button),
        code: button?.dataset.code,
        title: button?.querySelector('.folder-name')?.textContent?.trim(),
        year: button?.querySelector('.event-plane-year b')?.textContent?.trim(),
        isNew: Boolean(button?.querySelector('.archive-new-badge')),
        archiveRect: archiveRect ? {
          top: archiveRect.top,
          right: archiveRect.right,
          bottom: archiveRect.bottom,
          left: archiveRect.left,
        } : null,
      };
    });
    eventEvidence.inViewport = isViewportRectVisible(
      eventEvidence.archiveRect,
      VIEWPORT,
    );
    delete eventEvidence.archiveRect;
    report.uiEvidence.eventDirectory = eventEvidence;
    addAssertion(report, {
      id: 'ui-event-index-tail',
      layer: 'ui',
      actual: eventEvidence,
      expected: {
        count: 2,
        index: 1,
        code: 'EV02',
        title: '白幕初垂事件',
        year: '1965',
        isNew: true,
        inViewport: true,
      },
      evidence: ['04-event-index-tail.png'],
    });
    await capture(page, report, 'event-index-tail', eventEvidence);

    await page.click('#clerk-workspace-entry');
    await page.waitForSelector(
      'body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])',
      { timeout: 20_000 },
    );
    await openWorkspaceCommand(page, 'archives');
    const anomalyArchiveId = seeded.numbering.anomaly.archiveId;
    await page.waitForSelector(
      `[data-managed-archive="${anomalyArchiveId}"] [data-toggle-archive-new][aria-checked="true"]`,
      { timeout: 20_000 },
    );
    await page.click(
      `[data-managed-archive="${anomalyArchiveId}"] [data-toggle-archive-new]`,
    );
    await page.waitForSelector(
      `[data-managed-archive="${anomalyArchiveId}"] [data-toggle-archive-new][aria-checked="false"]`,
      { timeout: 20_000 },
    );
    const newToggleEvidence = await page.evaluate(async (archiveId) => {
      const archives = await window.__palisVerificationRepository.listAdminArchives({
        limit: 100,
      });
      const archive = archives.find(({ id }) => id === archiveId);
      const switchElement = document.querySelector(
        `[data-managed-archive="${CSS.escape(archiveId)}"] [data-toggle-archive-new]`,
      );
      switchElement?.scrollIntoView({ block: 'center' });
      return {
        repositoryValue: archive?.new_badge_visible,
        uiAriaChecked: switchElement?.getAttribute('aria-checked'),
        uiLabel: switchElement?.textContent?.trim(),
      };
    }, anomalyArchiveId);
    report.uiEvidence.newToggle = newToggleEvidence;
    addAssertion(report, {
      id: 'ui-new-toggle-off',
      layer: 'ui+repository',
      actual: {
        repositoryValue: newToggleEvidence.repositoryValue,
        uiAriaChecked: newToggleEvidence.uiAriaChecked,
      },
      expected: {
        repositoryValue: false,
        uiAriaChecked: 'false',
      },
      evidence: ['05-new-toggle-off.png'],
    });
    await capture(page, report, 'new-toggle-off', newToggleEvidence);
    await exitWorkspace(page);

    await enterDirectory(page, ROOT_DIRECTORY.anomaly);
    await page.waitForSelector('.folder-button[data-code="A04"]', { timeout: 20_000 });
    await page.$eval('.folder-button[data-code="A04"]', (button) => button.click());
    await page.waitForSelector('.folder-button[data-code="A04"].is-selected', {
      timeout: 10_000,
    });
    const anomalyBadgeAfter = await page.$eval(
      '.folder-button[data-code="A04"]',
      (button) => Boolean(button.querySelector('.archive-new-badge')),
    );
    report.uiEvidence.anomalyDirectory.newAfterToggle = anomalyBadgeAfter;
    addAssertion(report, {
      id: 'ui-new-badge-removed-from-directory',
      layer: 'ui',
      actual: anomalyBadgeAfter,
      expected: false,
      evidence: ['06-anomaly-new-off-directory.png'],
    });
    await capture(page, report, 'anomaly-new-off-directory', {
      code: 'A04',
      newBadgeVisible: anomalyBadgeAfter,
    });

    await page.evaluate(async () => {
      await window.openArchiveReference('S23');
    });
    await page.waitForSelector(
      `.archive-contribution-ledger[data-published-archive="${seeded.records.archiveId}"]`,
      { timeout: 30_000 },
    );
    const recordEvidence = await page.evaluate((archiveId) => {
      const ledger = document.querySelector(
        `.archive-contribution-ledger[data-published-archive="${CSS.escape(archiveId)}"]`,
      );
      const sheet = ledger?.closest('.document-sheet');
      const amendment = ledger?.querySelector('[data-amendment-for]');
      if (sheet && amendment) {
        const sheetRect = sheet.getBoundingClientRect();
        const amendmentRect = amendment.getBoundingClientRect();
        sheet.scrollTop += amendmentRect.top - sheetRect.top - 120;
      }
      return {
        tabCount: ledger?.querySelectorAll('[data-contribution-tab]').length || 0,
        amendmentCount: ledger?.querySelectorAll('[data-amendment-for]').length || 0,
        mast: ledger?.querySelector('.archive-contribution-ledger__mast b')
          ?.textContent?.trim() || '',
      };
    }, seeded.records.archiveId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    recordEvidence.amendmentInViewport = await page.$eval(
      `[data-published-archive="${seeded.records.archiveId}"] [data-amendment-for]`,
      (amendment) => {
        const rect = amendment.getBoundingClientRect();
        return rect.bottom > 0
          && rect.right > 0
          && rect.top < innerHeight
          && rect.left < innerWidth;
      },
    );
    report.uiEvidence.recordTree = recordEvidence;
    addAssertion(report, {
      id: 'ui-two-records-one-targeted-amendment',
      layer: 'ui',
      actual: recordEvidence,
      expected: {
        tabCount: 2,
        amendmentCount: 1,
        mast: 'S23 / 02 RECORDS',
        amendmentInViewport: true,
      },
      evidence: ['07-two-records-one-amendment.png'],
    });
    await capture(page, report, 'two-records-one-amendment', recordEvidence);

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.waitForFunction(() => innerWidth === 390 && innerHeight === 844);
    await page.click('#clerk-workspace-entry');
    await page.waitForSelector(
      'body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])',
      { timeout: 20_000 },
    );
    await openNewArchiveTemplate(page, '07');
    await page.waitForSelector(
      '.archive-editor-window:not([hidden]) [data-native-form-root] [name="index:startDate"]',
      { timeout: 20_000 },
    );
    const narrowEditorEvidence = await page.evaluate(() => {
      const dialog = document.querySelector('.archive-editor-window:not([hidden])');
      const scroll = dialog?.querySelector('[data-editor-scroll]');
      const outline = dialog?.querySelector('[data-editor-outline-select]');
      const rect = dialog?.getBoundingClientRect();
      const scrollingNodes = [...(dialog?.querySelectorAll('*') ?? [])]
        .filter((node) => {
          const style = getComputedStyle(node);
          return /auto|scroll/.test(style.overflowY)
            && node.scrollHeight > node.clientHeight;
        });
      return {
        viewportWidth: innerWidth,
        dialogContained: Boolean(
          rect
          && rect.left >= 0
          && rect.right <= innerWidth
          && rect.top >= 0
          && rect.bottom <= innerHeight,
        ),
        outlineVisible: Boolean(outline && getComputedStyle(outline).display !== 'none'),
        oneScrollOwner: scrollingNodes.length === 1 && scrollingNodes[0] === scroll,
        focusInside: Boolean(dialog?.contains(document.activeElement)),
      };
    });
    report.uiEvidence.narrowEditor = narrowEditorEvidence;
    addAssertion(report, {
      id: 'ui-narrow-editor-access',
      layer: 'ui',
      actual: narrowEditorEvidence,
      expected: {
        viewportWidth: 390,
        dialogContained: true,
        outlineVisible: false,
        oneScrollOwner: true,
        focusInside: true,
      },
      evidence: ['08-narrow-editor-access.png'],
    });
    await capture(page, report, 'narrow-editor-access', narrowEditorEvidence);
    await page.$eval(
      '.archive-editor-window [data-workflow-close]',
      (button) => button.click(),
    );

    await openWorkspaceCommand(page, 'archives');
    await page.waitForSelector(
      '.archive-admin-window:not([hidden]) [data-admin-archive-management]',
      { timeout: 20_000 },
    );
    const narrowAdminEvidence = await page.evaluate(() => {
      const panel = document.querySelector(
        '.archive-admin-window:not([hidden]) [data-admin-archive-management]',
      );
      const header = panel?.querySelector(':scope > header');
      const heading = header?.querySelector('h3');
      const search = header?.querySelector('form');
      const rect = header?.getBoundingClientRect();
      const searchRect = search?.getBoundingClientRect();
      const headingRect = heading?.getBoundingClientRect();
      const inside = (value) => Boolean(
        value && value.left >= 0 && value.right <= innerWidth,
      );
      return {
        viewportWidth: innerWidth,
        headerContained: inside(rect),
        searchContained: inside(searchRect),
        headingHorizontal: Boolean(
          headingRect && headingRect.width > headingRect.height * 2,
        ),
      };
    });
    report.uiEvidence.narrowAdmin = narrowAdminEvidence;
    addAssertion(report, {
      id: 'ui-narrow-admin-contained',
      layer: 'ui',
      actual: narrowAdminEvidence,
      expected: {
        viewportWidth: 390,
        headerContained: true,
        searchContained: true,
        headingHorizontal: true,
      },
      evidence: ['09-narrow-admin-contained.png'],
    });
    await capture(page, report, 'narrow-admin-contained', narrowAdminEvidence);

    addAssertion(report, {
      id: 'network-loopback-only',
      layer: 'network',
      actual: report.externalRequests,
      expected: [],
    });
  } catch (error) {
    report.diagnostics.push({
      level: 'runner',
      message: error?.stack || error?.message || String(error),
    });
  } finally {
    const closeResource = async (label, close) => {
      try {
        await close();
      } catch (error) {
        report.diagnostics.push({
          level: 'cleanup',
          message: `${label}: ${error?.message || String(error)}`,
        });
      }
    };
    if (page) await closeResource('page', () => page.close());
    if (browser) await closeResource('browser', () => browser.close());
    if (server) await closeResource('server', () => server.close());
    if (previousLocalAdmin === undefined) delete process.env.VITE_PALIS_LOCAL_ADMIN;
    else process.env.VITE_PALIS_LOCAL_ADMIN = previousLocalAdmin;

    report.generatedAt = new Date().toISOString();
    report.summary = summarizeVerification(report);
    report.passed = report.summary.passed;
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }

  return report;
}

async function main() {
  const report = await verifyLocalAdministrator();
  const result = report.passed ? 'PASS' : 'FAIL';
  console.log(
    `PALIS local administrator verification ${result}: ${REPORT_PATH}`,
  );
  console.log(
    `${report.summary.passedAssertionCount}/${report.summary.assertionCount} assertions; `
      + `${report.screenshots.length} screenshots; `
      + `${report.externalRequests.length} external requests; `
      + `${report.diagnostics.length} diagnostics`,
  );
  if (!report.passed) process.exitCode = 1;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(async (error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
