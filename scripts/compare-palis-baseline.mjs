import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const workspace = process.cwd();
const defaultBaselinePath = path.join(workspace, 'tmp/verification/baseline/manifest.json');
const defaultCurrentPath = path.join(workspace, 'tmp/verification/current/manifest.json');
const defaultDiffRoot = path.join(workspace, 'tmp/verification/diff');

const resolveCapturePath = (manifestPath, capture) => path.resolve(
  capture.file.startsWith('tmp/') ? workspace : path.dirname(manifestPath), capture.file,
);

export function validatePalisManifest(manifest) {
  const problems = [];
  if (!Array.isArray(manifest?.captures) || manifest.captures.length !== 39) {
    problems.push(`expected 39 captures, received ${manifest?.captures?.length ?? 0}`);
  }
  if (manifest?.diagnostics?.length) problems.push('diagnostics are not empty');
  if (manifest?.requestLog?.fatal?.length) problems.push('external requests were blocked');
  if (manifest?.requestLog?.allowedExternal?.length) problems.push('external requests were allowed');
  return problems;
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
    const current = JSON.parse(await readFile(defaultCurrentPath, 'utf8'));
    const validation = validatePalisManifest(current);
    if (validation.length) throw new Error(`PALIS baseline update rejected: ${validation.join('; ')}`);
    const baselineRoot = path.dirname(defaultBaselinePath);
    await rm(baselineRoot, { recursive: true, force: true });
    await cp(path.dirname(defaultCurrentPath), baselineRoot, { recursive: true });
    await mkdir(path.join(workspace, 'docs/verification'), { recursive: true });
    await cp(defaultBaselinePath, path.join(workspace, 'docs/verification/palis-baseline-manifest.json'));
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
