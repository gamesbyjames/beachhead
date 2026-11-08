import { test, expect } from '@playwright/test';
import { Vector3 } from 'three';
import { segmentSphereHit } from '../src/game/math';

test('continuous collision catches fast rounds, rejects misses, and returns first entry', () => {
  expect(segmentSphereHit(new Vector3(0, 0, 0), new Vector3(0, 0, -100), new Vector3(0, 0, -50), 5)).toBeCloseTo(.45);
  expect(segmentSphereHit(new Vector3(0, 0, 0), new Vector3(0, 0, -100), new Vector3(10, 0, -50), 5)).toBeNull();
  expect(segmentSphereHit(new Vector3(0, 0, -50), new Vector3(0, 0, -51), new Vector3(0, 0, -50), 5)).toBe(0);
  expect(segmentSphereHit(new Vector3(), new Vector3(), new Vector3(0, 0, -50), 5)).toBeNull();
  expect(segmentSphereHit(new Vector3(), new Vector3(0, 0, -20), new Vector3(0, 0, -50), 5)).toBeNull();
});

test('renders the coast, starts combat, hits an aircraft, pauses, and persists preferences', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('#error-screen')).toBeHidden();
  await page.screenshot({ path: 'test-results/coast-desktop.png' });
  await page.evaluate(() => {
    (window as unknown as { combatEvents: unknown[] }).combatEvents = [];
    window.addEventListener('beachhead:combat', event => (window as unknown as { combatEvents: unknown[] }).combatEvents.push((event as CustomEvent).detail));
  });
  await page.getByRole('button', { name: 'TAKE YOUR POST' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#score')).toHaveText('000000');
  // Aim at the central inbound aircraft using the same relative mouse controls as a player.
  await page.mouse.move(720, 450);
  await page.mouse.move(720, 410);
  await page.keyboard.down('Space');
  await expect.poll(async () => page.locator('#heat-fill').evaluate(el => parseFloat((el as HTMLElement).style.width)), { timeout: 10_000 }).toBeGreaterThan(3);
  await expect.poll(async () => page.evaluate(() => (window as unknown as { combatEvents: { type: string }[] }).combatEvents.some(event => event.type === 'target-destroyed')), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#score')).not.toHaveText('000000');
  await page.screenshot({ path: 'test-results/combat-desktop.png' });
  await page.keyboard.up('Space');
  await page.getByRole('button', { name: 'Pause game' }).click();
  await expect(page.locator('#pause-screen')).toBeVisible();
  const health = await page.locator('#health').textContent();
  await page.waitForTimeout(300);
  await expect(page.locator('#health')).toHaveText(health!);
  await page.getByRole('button', { name: 'RESUME DEFENCE' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'paused');
  await page.getByLabel('Graphics quality').selectOption('low');
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  const events = await page.evaluate(() => (window as unknown as { combatEvents: { type: string }[] }).combatEvents);
  expect(events.filter(event => event.type === 'target-spawned').length).toBeGreaterThanOrEqual(7);
  expect(events.some(event => event.type === 'wave-started')).toBe(true);
  await page.reload();
  await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByLabel('Graphics quality')).toHaveValue('low');
  expect(errors).toEqual([]);
});

test('phone landscape layout supports simultaneous aiming and firing with cancellation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 932, height: 430 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/coast-phone.png' });
  await page.getByRole('button', { name: 'TAKE YOUR POST' }).tap();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  const session = await context.newCDPSession(page);
  const fire = (await page.locator('#fire-button').boundingBox())!;
  const firePoint = { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 250, y: 230, id: 1 }, firePoint] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 280, y: 210, id: 1 }, firePoint] });
  await expect.poll(async () => page.locator('#heat-fill').evaluate(el => parseFloat((el as HTMLElement).style.width))).toBeGreaterThan(3);
  await page.screenshot({ path: 'test-results/combat-phone.png' });
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => page.locator('#heat-fill').evaluate(el => parseFloat((el as HTMLElement).style.width))).toBe(0);
  await page.getByRole('button', { name: 'Pause game' }).tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await page.getByRole('button', { name: 'RESTART MISSION' }).tap();
  await expect(page.locator('#health')).toHaveText('100');
  await expect(page.locator('#score')).toHaveText('000000');
  expect(errors).toEqual([]);
  await context.close();
});
