/**
 * Headless Chrome as a renderer for the build scripts: one HTML page in, one screenshot out.
 * Uses Google Chrome on macOS or Linux, or the binary in $CHROME.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng } from './png.mjs';

const CANDIDATES = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];

/** Renders `html` at width × height CSS px, 1 device px each; `transparent` keeps the page background clear. */
export function screenshot(html, width, height, { transparent = false } = {}) {
  const chrome = CANDIDATES.find((p) => p && existsSync(p));
  if (!chrome) throw new Error('Chrome not found: set CHROME to a Chrome or Chromium binary');
  const tmp = mkdtempSync(join(tmpdir(), 'render-'));
  try {
    writeFileSync(join(tmp, 'page.html'), html);
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', '--force-device-scale-factor=1',
      `--window-size=${width},${height}`, '--virtual-time-budget=5000', `--user-data-dir=${join(tmp, 'profile')}`,
      ...(transparent ? ['--default-background-color=00000000'] : []),
      `--screenshot=${join(tmp, 'shot.png')}`, pathToFileURL(join(tmp, 'page.html')).href,
    ], { stdio: 'ignore' });
    const shot = decodePng(readFileSync(join(tmp, 'shot.png')));
    if (shot.width !== width || shot.height !== height) throw new Error(`screenshot is ${shot.width}×${shot.height}, expected ${width}×${height}`);
    return shot;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** A width × height crop of an RGBA image. */
export function crop(img, x, y, width, height) {
  const data = Buffer.alloc(width * height * 4);
  for (let r = 0; r < height; r++) img.data.copy(data, r * width * 4, ((y + r) * img.width + x) * 4, ((y + r) * img.width + x + width) * 4);
  return { width, height, data };
}
