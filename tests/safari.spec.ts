import { test, expect } from '@playwright/test';

test('WebKit renders the mobile scene and supports start, fire, and pause', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('#error-screen')).toBeHidden();
  await page.getByRole('button', { name: 'TAKE YOUR POST' }).tap();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await page.keyboard.down('Space');
  await expect.poll(async () => page.locator('#heat-fill').evaluate(el => parseFloat((el as HTMLElement).style.width))).toBeGreaterThan(3);
  await page.keyboard.up('Space');
  await page.screenshot({ path: 'test-results/combat-webkit.png' });
  await page.getByRole('button', { name: 'Pause game' }).tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await page.getByRole('button', { name: 'RESUME DEFENCE' }).tap();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  expect(errors).toEqual([]);
});
