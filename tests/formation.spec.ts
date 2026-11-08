import { test, expect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { sampleFormationFlight } from '../src/game/formation';

test('word aircraft approach, turn back, and remain above the sea through repeated passes', () => {
  const camera = new Vector3(0, 4.6, 27), anchor = new Vector3(55, 24, -185);
  const position = new Vector3(), velocity = new Vector3();
  sampleFormationFlight(anchor, 0, 0, camera, position, velocity);
  const far = position.z;
  expect(velocity.z).toBeGreaterThan(0);
  sampleFormationFlight(anchor, 0, 15, camera, position, velocity);
  expect(position.z).toBeCloseTo(-45, 4);
  expect(position.z).toBeGreaterThan(far + 200);
  sampleFormationFlight(anchor, 0, 24, camera, position, velocity);
  expect(velocity.z).toBeLessThan(0);
  sampleFormationFlight(anchor, 0, 33, camera, position, velocity);
  expect(position.z).toBeCloseTo(-305, 4);
  sampleFormationFlight(anchor, 0, 36, camera, position, velocity);
  expect(position.z).toBeCloseTo(far, 4);
  const view = new PerspectiveCamera(58, 932 / 430, .1, 16000);
  view.position.copy(camera); view.rotation.set(.28, 0, 0, 'YXZ'); view.updateMatrixWorld();
  for (let slot = 0; slot < 8; slot++) for (let t = 0; t <= 104; t++) {
    sampleFormationFlight(anchor, slot, t, camera, position, velocity);
    expect(position.y).toBeGreaterThan(6);
    const projected = position.clone().project(view);
    expect(Math.abs(projected.x)).toBeLessThan(.9);
    expect(Math.abs(projected.y)).toBeLessThan(.8);
  }
});

test('phone sees aircraft approach, pause, resume, and remain shootable', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('beachhead.preferences', JSON.stringify({ quality: 'low', muted: true })));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'LEARN HINDI' }).tap();
  await page.getByRole('button', { name: 'Play Basics' }).tap();
  const craft = page.locator('.word-target[data-roman="Namaste"]');
  await expect(craft.locator('.target-tag')).toBeVisible();
  await expect(craft).toHaveAttribute('data-range', /^\d+$/);
  const initial = Number(await craft.getAttribute('data-range'));
  await page.screenshot({ path: `test-results/inbound-before-${testInfo.project.name}.png` });
  await expect.poll(async () => Number(await craft.getAttribute('data-range')), { timeout: 15_000 }).toBeLessThan(initial - 5);
  await page.screenshot({ path: `test-results/inbound-after-${testInfo.project.name}.png` });
  await page.getByRole('button', { name: 'Pause game' }).tap();
  const paused = Number(await craft.getAttribute('data-range'));
  await page.waitForTimeout(600);
  expect(Number(await craft.getAttribute('data-range'))).toBe(paused);
  await page.getByRole('button', { name: 'RESUME DEFENCE' }).tap();
  await expect(craft.locator('.target-tag')).toBeVisible();
  const tag = craft.locator('.target-tag'), box = (await tag.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(craft.locator('.target-tag')).toBeHidden();
  await expect(page.locator('#lesson-phrase .collected')).toHaveCount(1);
  await context.close();
});
