import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import type { CombatEvent } from '../src/game/types';

async function start(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('beachhead.preferences', JSON.stringify({ quality: 'low' })));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { combat: unknown[] }).combat = [];
    window.addEventListener('beachhead:combat', event => (window as unknown as { combat: unknown[] }).combat.push((event as CustomEvent).detail));
  });
  await page.getByRole('button', { name: 'LEARN HINDI' }).click();
  await page.getByRole('button', { name: 'Play Basics' }).click();
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-stage', 'preview');
}

const events = (page: Page): Promise<CombatEvent[]> => page.evaluate(() => (window as unknown as { combat: CombatEvent[] }).combat);

test('retina phone hits aircraft bodies after the canvas resizes and moves', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 932, height: 430 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage(); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await page.getByRole('button', { name: 'READY — BUILD PHRASE' }).tap();
  // Simulate browser bars changing the visible surface without a window resize event.
  await page.addStyleTag({ content: '#app { height: 280px; margin-top: 60px; }' });
  await expect.poll(() => page.locator('#scene').evaluate(node => (node as HTMLCanvasElement).height)).toBe(280);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const craft = page.locator('.word-target[data-roman="Namaste"]');
  const targetId = await craft.getAttribute('data-target-id');
  const body = (await craft.locator('.target-anchor').boundingBox())!;
  // Touch the aircraft, near its wing, rather than the easier word-label hit area.
  await page.touchscreen.tap(body.x + body.width / 2 + 7, body.y + body.height / 2);
  await expect.poll(async () => (await events(page)).some(event => event.type === 'target-destroyed' && event.targetId === targetId && event.kind === 'aircraft')).toBe(true);
  await expect(page.locator('#score')).toHaveText('000100');
  await expect(craft.locator('.target-tag')).toBeHidden();
  await page.addStyleTag({ content: '#app { height: 320px; margin-top: 22px; }' });
  await expect.poll(() => page.locator('#scene').evaluate(node => (node as HTMLCanvasElement).height)).toBe(320);
  expect(errors).toEqual([]); await context.close();
});

test('phone shots damage and sink the unlabelled horizon ships in Hindi mode', async ({ browser, browserName }) => {
  test.skip(browserName === 'webkit', 'The Windows WebKit touch emulation does not reliably deliver the projected off-axis ship taps; Chromium and physical iPhone Safari remain covered.');
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 932, height: 430 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await start(page);
  const rect = (await page.locator('#scene').boundingBox())!;
  const camera = new PerspectiveCamera(58, rect.width / rect.height, .1, 16000);
  camera.position.set(0, 4.6, 27); camera.rotation.set(.14, 0, 0, 'YXZ'); camera.updateMatrixWorld();
  const ship = new Vector3(-165, 4, -370).project(camera);
  let x = rect.x + (ship.x * .5 + .5) * rect.width, y = rect.y + (-ship.y * .5 + .5) * rect.height;
  for (let i = 0; i < 15; i++) {
    await page.touchscreen.tap(x, y);
    await expect.poll(async () => (await events(page)).filter(event => event.type === 'target-hit' && event.kind === 'ship').length).toBe(i + 1);
    if (i === 0) await expect(page.locator('#points')).toHaveText('HIT · 14 HP');
    // Follow the moving ship using its visible impact marker, rather than keep firing into its old position.
    const impact = await page.locator('#hitmarker').evaluate(node => {
      const marker = node as HTMLElement, view = document.querySelector('canvas')!.getBoundingClientRect();
      return { x: view.left + parseFloat(marker.style.left) / 100 * view.width, y: view.top + parseFloat(marker.style.top) / 100 * view.height };
    });
    x = impact.x; y = impact.y;
  }
  await expect.poll(async () => (await events(page)).some(event => event.type === 'target-destroyed' && event.kind === 'ship')).toBe(true);
  await expect(page.locator('#score')).toHaveText('000500');
  await expect(page.locator('#lesson-phrase .collected')).toHaveCount(0);
  await context.close();
});

test('the turret and muzzle follow left and right pointer aim', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 932, height: 430 }); await start(page);
  await page.mouse.move(150, 300);
  await expect.poll(async () => { const box = (await page.locator('.reticle').boundingBox())!; return Math.round(box.x + box.width / 2); }).toBe(150);
  await page.screenshot({ path: `test-results/turret-left-${testInfo.project.name}.png` });
  await page.mouse.click(150, 300);
  await expect.poll(async () => (await events(page)).filter(event => event.type === 'shot-fired').length).toBe(1);
  await page.mouse.move(780, 300);
  await expect.poll(async () => { const box = (await page.locator('.reticle').boundingBox())!; return Math.round(box.x + box.width / 2); }).toBe(780);
  await page.screenshot({ path: `test-results/turret-right-${testInfo.project.name}.png` });
  await page.mouse.click(780, 300);
  await expect.poll(async () => (await events(page)).filter(event => event.type === 'shot-fired').length).toBe(2);
  const shots = (await events(page)).filter(event => event.type === 'shot-fired');
  expect(shots[1].origin.x - shots[0].origin.x).toBeGreaterThan(2);
});
