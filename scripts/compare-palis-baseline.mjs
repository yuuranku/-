import { cp, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const workspace = process.cwd();
const defaultBaselinePath = path.join(workspace, 'tmp/verification/baseline/manifest.json');
const defaultCurrentPath = path.join(workspace, 'tmp/verification/current/manifest.json');
const defaultDiffRoot = path.join(workspace, 'tmp/verification/diff');
const VIEWPORTS = ['1440x900', '390x844', '844x390'];
const SCENES = [
  'first-entry-home', 'clean-home', 'clerk-workspace', 'admin-workspace',
  'directory-countries', 'directory-organizations', 'directory-stations',
  'directory-entrances', 'directory-ecology', 'directory-people',
  'directory-events', 'directory-abnormalities', 'directory-species',
];
const EXPECTED_KEYS = new Set(VIEWPORTS.flatMap((viewport) => SCENES.map((scene) => `${viewport}:${scene}`)));
const ARCHIVE_ORIGIN = 'https://hpzdccfrouhljqlzczuv.supabase.co';
const DIRECTORY_PROOFS = Object.freeze({ countries:['country-stack',18], organizations:['network',23], stations:['station-board',20], entrances:['entrance-network',18], ecology:['ecology-strata',7], people:['dossier',36], events:['event-plane',26], abnormalities:['anomaly-monitor',25], species:['species-helix',22] });

const resolveCapturePath = (manifestPath, capture) => path.resolve(
  capture.file.startsWith('tmp/') ? workspace : path.dirname(manifestPath), capture.file,
);

export function validatePalisManifest(manifest) {
  const problems = [];
  if (!Array.isArray(manifest?.captures) || manifest.captures.length !== 39) {
    problems.push(`expected 39 captures, received ${manifest?.captures?.length ?? 0}`);
  }
  const keys = new Set();
  for (const capture of manifest?.captures ?? []) {
    const key = `${capture.viewport}:${capture.scene}`;
    if (!EXPECTED_KEYS.has(key)) problems.push(`unexpected capture key ${key}`);
    if (keys.has(key)) problems.push(`capture key must be unique: ${key}`);
    keys.add(key);
    if (!/^[a-f0-9]{64}$/i.test(capture.sha256 ?? '')) problems.push(`capture sha256 invalid: ${key}`);
    if (typeof capture.file !== 'string' || path.isAbsolute(capture.file) || capture.file.includes('..') || !capture.file.endsWith('.png')) problems.push(`capture file unsafe: ${key}`);
    const [width, height] = String(capture.viewport).split('x').map(Number);
    if (capture.width !== width || capture.height !== height) problems.push(`capture dimensions invalid: ${key}`);
    const workspace = ['clerk-workspace', 'admin-workspace'].includes(capture.scene);
    const accessMode = workspace ? 'authenticated' : 'preview';
    const notice = capture.scene === 'first-entry-home';
    const role = capture.scene === 'clerk-workspace' ? 'clerk' : capture.scene === 'admin-workspace' ? 'admin' : 'observer';
    if (!capture.state || capture.state.accessMode !== accessMode || capture.state.operatorRole !== role || capture.state.chapter !== '2' || capture.state.versionNoticeVisible !== notice) problems.push(`capture state invalid: ${key}`);
    const directory = capture.scene.replace('directory-', '');
    const [mode, entries] = DIRECTORY_PROOFS[directory] ?? ['orbit', 9];
    if (!capture.proof || capture.proof.scene !== capture.scene || capture.proof.workspaceOpen !== workspace || capture.proof.archive?.category !== (DIRECTORY_PROOFS[directory] ? directory : 'root') || capture.proof.archive?.mode !== mode || capture.proof.archive?.entries !== entries) problems.push(`capture proof invalid: ${key}`);
  }
  for (const key of EXPECTED_KEYS) if (!keys.has(key)) problems.push(`missing capture key ${key}`);
  for (const field of ['browser', 'puppeteer', 'os']) {
    if (!manifest?.[field]) problems.push(`environment field missing: ${field}`);
  }
  if (manifest?.locale !== 'zh-CN' || manifest?.timezone !== 'Asia/Shanghai' || !/^[a-f0-9]{64}$/i.test(manifest?.distEntrySha256 ?? '')) problems.push('environment identity invalid');
  if (manifest?.deviceScaleFactor !== 1 || !manifest?.fonts || Object.keys(manifest.fonts).sort().join(',') !== 'ibmPlexMono,notoSans,notoSerif' || !Object.values(manifest.fonts).every((value) => value === true)) problems.push('environment font/device evidence invalid');
  if (!(typeof manifest?.webgl?.vendor === 'string' && manifest.webgl.vendor && typeof manifest.webgl.renderer === 'string' && manifest.webgl.renderer)) problems.push('webgl evidence invalid');
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(manifest?.previewOrigin ?? '') || manifest?.archiveOrigin !== ARCHIVE_ORIGIN) problems.push('network origin evidence invalid');
  if (Object.keys(manifest?.requestLog ?? {}).sort().join(',') !== 'allowed,archives,fatal,unknownExternal') problems.push('request log keys invalid');
  for (const field of ['allowed', 'archives', 'fatal', 'unknownExternal']) {
    if (!Array.isArray(manifest?.requestLog?.[field])) problems.push(`request log missing: ${field}`);
  }
  for (const [kind, entries] of Object.entries(manifest?.requestLog ?? {})) for (const entry of entries ?? []) {
    if (!entry || typeof entry.method !== 'string' || !entry.method || typeof entry.url !== 'string' || !entry.url) problems.push(`request entry invalid: ${kind}`);
    else if (kind === 'allowed' && !(entry.url.startsWith('data:') || entry.url.startsWith('blob:') || (() => { try { return new URL(entry.url).origin === manifest.previewOrigin; } catch { return false; } })())) problems.push('allowed request origin invalid');
    else if (kind === 'archives' && (!['GET','OPTIONS'].includes(entry.method) || (() => { try { const u=new URL(entry.url); return u.origin !== manifest.archiveOrigin || u.pathname !== '/rest/v1/archives'; } catch { return true; } })())) problems.push('archive request invalid');
  }
  if (manifest?.diagnostics?.length) problems.push('diagnostics are not empty');
  if (manifest?.requestLog?.fatal?.length) problems.push('external requests were blocked');
  if (manifest?.requestLog?.unknownExternal?.length) problems.push('unknown external requests were allowed');
  return problems;
}

export async function validatePalisArtifacts(manifest, currentPath) {
  const problems = validatePalisManifest(manifest); const root = await realpath(path.dirname(currentPath));
  for (const capture of manifest?.captures ?? []) try {
    const file = resolveCapturePath(currentPath, capture); const info = await lstat(file); const actual = await realpath(file); if (!info.isFile() || info.isSymbolicLink() || !actual.startsWith(`${root}${path.sep}`)) throw new Error('escape');
    const image = PNG.sync.read(await readFile(file));
    if (image.width !== capture.width || image.height !== capture.height) problems.push(`artifact dimensions invalid: ${capture.viewport}:${capture.scene}`);
    if (createHash('sha256').update(await readFile(file)).digest('hex') !== capture.sha256) problems.push(`artifact hash invalid: ${capture.viewport}:${capture.scene}`);
  } catch { problems.push(`artifact missing or unsafe: ${capture.viewport}:${capture.scene}`); }
  return problems;
}

export async function acceptPalisBaseline({
  currentPath = defaultCurrentPath,
  baselinePath = defaultBaselinePath,
  docsManifestPath,
  copyPath = cp,
  renamePath = rename,
} = {}) {
  const manifest = JSON.parse(await readFile(currentPath, 'utf8')); const validation = await validatePalisArtifacts(manifest, currentPath);
  if (validation.length) throw new Error(`PALIS baseline update rejected: ${validation.join('; ')}`);
  const baselineRoot = path.dirname(baselinePath); const staging = `${baselineRoot}.staging`; const backup = `${baselineRoot}.backup`;
  const docsStage = docsManifestPath && `${docsManifestPath}.staging`; const docsBackup = docsManifestPath && `${docsManifestPath}.backup`;
  const exists = async (target) => lstat(target).then(() => true, () => false);
  const hadBaseline = await exists(baselineRoot); const hadDocs = docsManifestPath && await exists(docsManifestPath);
  let baselineBackedUp = false;
  let docsBackedUp = false;
  let baselineInstalled = false;
  let docsInstalled = false;
  const cleanup = async (targets) => {
    await Promise.allSettled(targets.filter(Boolean).map((target) => (
      rm(target, { recursive: true, force: true })
    )));
  };
  await rm(staging, { recursive:true, force:true }); await rm(backup, { recursive:true, force:true });
  if (docsStage) { await rm(docsStage, { force:true }); await rm(docsBackup, { force:true }); }
  try {
    await copyPath(path.dirname(currentPath), staging, { recursive:true });
    const stagedValidation = await validatePalisArtifacts(JSON.parse(await readFile(path.join(staging,'manifest.json'),'utf8')), path.join(staging,'manifest.json'));
    if (stagedValidation.length) throw new Error(`PALIS baseline stage rejected: ${stagedValidation.join('; ')}`);
    if (docsStage) { await mkdir(path.dirname(docsStage), { recursive:true }); await copyPath(path.join(staging,'manifest.json'), docsStage); }
    if (hadBaseline) { await renamePath(baselineRoot, backup); baselineBackedUp = true; }
    if (hadDocs) { await renamePath(docsManifestPath, docsBackup); docsBackedUp = true; }
    await renamePath(staging, baselineRoot);
    baselineInstalled = true;
    if (docsStage) { await renamePath(docsStage, docsManifestPath); docsInstalled = true; }
  } catch (error) {
    const rollbackErrors = [];
    const attempt = async (operation) => {
      try { await operation(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    };
    if (docsInstalled) await attempt(() => rm(docsManifestPath, { force: true }));
    if (docsBackedUp && await exists(docsBackup)) await attempt(() => rename(docsBackup, docsManifestPath));
    if (baselineInstalled) await attempt(() => rm(baselineRoot, { recursive: true, force: true }));
    if (baselineBackedUp && await exists(backup)) await attempt(() => rename(backup, baselineRoot));
    await cleanup([staging, docsStage]);
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], 'PALIS baseline update and rollback failed');
    }
    await cleanup([backup, docsBackup]);
    throw error;
  }
  await cleanup([staging, backup, docsStage, docsBackup]);
  return manifest;
}

export async function comparePalisManifests({
  baselinePath = defaultBaselinePath,
  currentPath = defaultCurrentPath,
  threshold = 0.005,
  diffRoot = defaultDiffRoot,
} = {}) {
  const [baseline, current] = await Promise.all([
    readFile(baselinePath, 'utf8').then(JSON.parse),
    readFile(currentPath, 'utf8').then(JSON.parse),
  ]);
  const baselineByKey = new Map(baseline.captures.map((capture) => [
    `${capture.viewport}:${capture.scene}`, capture,
  ]));
  const report = { threshold, comparisons: [], failures: [], validation: validatePalisManifest(current) };
  await mkdir(diffRoot, { recursive: true });
  for (const currentCapture of current.captures) {
    const key = `${currentCapture.viewport}:${currentCapture.scene}`;
    const baselineCapture = baselineByKey.get(key);
    if (!baselineCapture) {
      report.failures.push(`${key}: missing baseline capture`);
      continue;
    }
    const [baseImage, currentImage] = await Promise.all([
      readFile(resolveCapturePath(baselinePath, baselineCapture)).then(PNG.sync.read),
      readFile(resolveCapturePath(currentPath, currentCapture)).then(PNG.sync.read),
    ]);
    if (baseImage.width !== currentImage.width || baseImage.height !== currentImage.height) {
      report.failures.push(`${key}: dimensions differ`);
      continue;
    }
    const diffImage = new PNG({ width: baseImage.width, height: baseImage.height });
    const changedPixels = pixelmatch(baseImage.data, currentImage.data, diffImage.data,
      baseImage.width, baseImage.height, { threshold: 0.1, includeAA: false, alpha: 0.5 });
    const totalPixels = baseImage.width * baseImage.height;
    const ratio = changedPixels / totalPixels;
    const diffFile = path.join(diffRoot, `${currentCapture.viewport}-${currentCapture.scene}.png`);
    await writeFile(diffFile, PNG.sync.write(diffImage));
    const comparison = { key, changedPixels, totalPixels, ratio, diffFile };
    report.comparisons.push(comparison);
    if (ratio > threshold) report.failures.push(`${key}: ${(ratio * 100).toFixed(3)}% changed`);
  }
  for (const key of baselineByKey.keys()) {
    if (!current.captures.some((capture) => `${capture.viewport}:${capture.scene}` === key)) {
      report.failures.push(`${key}: missing current capture`);
    }
  }
  const reportPath = path.join(diffRoot, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  report.reportPath = reportPath;
  if (report.validation.length || report.failures.length) {
    throw new Error(`PALIS baseline comparison failed: ${[...report.validation, ...report.failures].join('; ')}`);
  }
  return report;
}

async function main() {
  const update = process.argv.includes('--update-baseline');
  if (update) {
    const current = await acceptPalisBaseline({ docsManifestPath: path.join(workspace, 'docs/verification/palis-baseline-manifest.json') });
    console.log(`PALIS baseline updated: ${current.captures.length} captures`);
    return;
  }
  const report = await comparePalisManifests({});
  console.log(`PALIS baseline comparison passed: ${report.comparisons.length} captures`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
