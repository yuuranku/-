import { existsSync } from 'node:fs';

export const DEFAULT_BROWSER_CANDIDATES = Object.freeze([
  process.env.PALIS_BROWSER_PATH,
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Microsoft/Edge/Application/msedge.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean));

export function normalizeBrowserPath(value) {
  const trimmed = String(value ?? '').trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseViewport(value) {
  const match = /^(\d+)[xX](\d+)$/.exec(String(value ?? ''));
  if (!match) {
    throw new TypeError('Viewport must use WIDTHxHEIGHT');
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) {
    throw new RangeError('Viewport dimensions must be positive');
  }

  return { width, height };
}

export function resolveBrowserExecutable(
  candidates = DEFAULT_BROWSER_CANDIDATES,
  fileExists = existsSync,
) {
  const executable = candidates
    .map(normalizeBrowserPath)
    .find((candidate) => candidate && fileExists(candidate));
  if (!executable) {
    throw new Error('No supported browser executable was found');
  }
  return executable;
}
