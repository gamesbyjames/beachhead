import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function begin(page: Page): Promise<void> {
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { shots: number[] }).shots = [];
    window.addEventListener('beachhead:combat', event => { const detail = (event as CustomEvent).detail; if (detail.type === 'shot-fired') (window as unknown as { shots: number[] }).shots.push(detail.burstId); });
  });
  await page.getByRole('button', { name: 'LEARN HINDI' }).click();
  await page.getByRole('button', { name: 'Play Basics' }).click();
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-stage', 'preview');
}

const shotCount = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { shots: number[] }).shots.length);

async function wordPoint(page: Page, word: string): Promise<{ x: number; y: number }> {
  const tag = page.locator(`.word-target[data-roman="${word}"] .target-tag`);
  await expect(tag).toBeVisible(); const box = (await tag.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function aimCrosshair(page: Page, word: string): Promise<void> {
  const viewport = page.viewportSize()!, cx = viewport.width / 2, cy = viewport.height / 2;
  const focal = viewport.height / (2 * Math.tan((viewport.width < viewport.height ? 72 : 58) * Math.PI / 360));
  const scale = 1.55 / Math.min(viewport.width, 1000);
  for (let i = 0; i < 3; i++) {
    const point = await wordPoint(page, word);
    await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx + Math.atan((point.x - cx) / focal) / scale, cy - Math.atan((cy - point.y) / focal) / scale);
    await page.mouse.up({ button: 'right' });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
}

test('short laptop clicks fire, held bursts count once, and the next click always rearms', async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 430 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await begin(page);
  // A down/up click need not overlap an animation frame, and also starts the preview round.
  await page.mouse.click(80, 285);
  await expect.poll(() => shotCount(page)).toBe(1);
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-stage', 'active');
  await page.mouse.dblclick(80, 285);
  await expect.poll(() => shotCount(page)).toBe(3);
  let point = await wordPoint(page, 'hain'); await page.mouse.click(point.x, point.y);
  await expect(page.locator('#lesson-mistakes')).toHaveText('1');
  await aimCrosshair(page, 'hain');
  const button = (await page.locator('#fire-button').boundingBox())!;
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2); await page.mouse.down();
  await expect(page.locator('#lesson-mistakes')).toHaveText('2');
  await page.waitForTimeout(450);
  await expect(page.locator('#lesson-mistakes')).toHaveText('2');
  await page.mouse.up();
  // A quick button tap must rearm even if its release wasn't sampled in a frame.
  await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
  await expect(page.locator('#lesson-mistakes')).toHaveText('3');
  point = await wordPoint(page, 'Namaste'); await page.mouse.click(point.x, point.y);
  await expect(page.locator('#lesson-phrase .collected')).toHaveCount(1);
  for (const word of ['aap', 'kaise', 'hain']) { point = await wordPoint(page, word); await page.mouse.click(point.x, point.y); await expect(page.locator(`.word-target[data-roman="${word}"] .target-tag`)).toBeHidden(); }
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-stage', 'complete');
  await page.getByRole('button', { name: 'NEXT PHRASE' }).click();
  point = await wordPoint(page, 'Main'); await page.mouse.click(point.x, point.y);
  await expect(page.locator('#lesson-phrase .collected')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('phone scene taps shoot words after dragging, cancellation, pause, and a new phrase', async ({ browser, browserName }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await begin(page);
  if (browserName === 'chromium') {
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 220, y: 260, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 255, y: 250, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 220, y: 260, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.locator('#lesson-panel')).toHaveAttribute('data-stage', 'preview');
    expect(await shotCount(page)).toBe(0);
    await page.getByRole('button', { name: 'Recenter formation' }).tap();
  }
  await page.touchscreen.tap(80, 285);
  await expect.poll(() => shotCount(page)).toBe(1);
  let point = await wordPoint(page, 'Namaste'); await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('#lesson-phrase .collected')).toHaveCount(1);
  const beforePause = await shotCount(page);
  await page.getByRole('button', { name: 'Pause game' }).tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await page.getByRole('button', { name: 'RESUME DEFENCE' }).tap();
  expect(await shotCount(page)).toBe(beforePause);
  for (const word of ['aap', 'kaise', 'hain']) { point = await wordPoint(page, word); await page.touchscreen.tap(point.x, point.y); await expect(page.locator(`.word-target[data-roman="${word}"] .target-tag`)).toBeHidden(); }
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-stage', 'complete');
  await page.getByRole('button', { name: 'NEXT PHRASE' }).tap();
  point = await wordPoint(page, 'Main'); await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('#lesson-phrase .collected')).toHaveCount(1);
  expect(errors).toEqual([]); await context.close();
});
