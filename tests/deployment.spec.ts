import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';

// Serve the production build under the same repository subpath as GitHub Pages.
test('production build loads the game, Hindi audio and install icons under /beachhead/', async ({ page }) => {
  const root = resolve('dist');
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg' };
  const server: Server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (!pathname.startsWith('/beachhead/')) { res.writeHead(404); res.end(); return; }
      const relative = decodeURIComponent(pathname.slice('/beachhead/'.length)) || 'index.html';
      const file = resolve(root, relative);
      if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }); res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const base = `${origin}/beachhead/`;
  const failed: string[] = [];
  page.on('pageerror', error => failed.push(error.message));
  page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  try {
    await page.goto(base);
    await expect(page.locator('#loading')).toHaveCount(0);
    await expect(page.locator('#error-screen')).toBeHidden();
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifestResponse = await page.request.get(new URL(manifestHref!, base).href);
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(new URL(manifest.start_url, manifestResponse.url()).pathname).toBe('/beachhead/');
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) expect((await page.request.get(new URL(icon.src, manifestResponse.url()).href)).ok()).toBe(true);
    const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect((await page.request.get(new URL(appleIcon!, base).href)).ok()).toBe(true);
    const courseResponse = await page.request.get(`${base}lessons/hi-course.json`);
    expect(courseResponse.ok()).toBe(true);
    const course = await courseResponse.json();
    expect(course.phrases).toHaveLength(44);
    expect((await page.request.get(new URL(course.phrases[0].audio, base).href)).ok()).toBe(true);
    await page.getByRole('button', { name: 'LEARN HINDI' }).click();
    await expect(page.getByRole('button', { name: 'Select Basics' })).toBeVisible();
    await page.getByRole('button', { name: 'Play Basics' }).click();
    await expect(page.locator('#lesson-english')).toHaveText('Hello, how are you?');
    expect(failed).toEqual([]);
  } finally {
    await page.goto('about:blank');
    await new Promise<void>((resolveServer, reject) => server.close(error => error ? reject(error) : resolveServer()));
  }
});
