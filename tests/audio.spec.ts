import { test, expect } from '@playwright/test';

test('Hindi MP3 audio decodes, replays, cancels on pause, and respects mute', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 932, height: 430 });
  await page.addInitScript(() => localStorage.setItem('beachhead.preferences', JSON.stringify({ quality: 'low', muted: false })));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'LEARN HINDI' }).click();
  await page.getByRole('button', { name: 'Play Basics' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'hindi');
  await page.getByRole('button', { name: 'Replay Hindi phrase' }).click();
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-voice', 'playing');
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-voice', 'idle');
  await page.getByRole('button', { name: 'Replay Hindi phrase' }).click();
  await page.getByRole('button', { name: 'Pause game' }).click();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-voice', 'idle');
  await page.getByRole('button', { name: 'RESUME DEFENCE' }).click();
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unmute sound to hear the phrase' })).toBeDisabled();
  await expect(page.locator('#lesson-audio-status')).toHaveText('SOUND MUTED');
  await page.getByRole('button', { name: 'Unmute sound', exact: true }).click();
  await page.getByRole('button', { name: 'Replay Hindi phrase' }).click();
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-voice', 'playing');
  expect(errors).toEqual([]);
});

test('interrupted iPhone-style audio resumes inside a fresh gesture and enabling sound does not mute it', async ({ page }) => {
  await page.addInitScript(() => {
    const environment = window as unknown as { interrupted: boolean; resumeEvents: string[]; testContext: AudioContext };
    environment.interrupted = false; environment.resumeEvents = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor() {
        super(); environment.testContext = this;
        Object.defineProperty(this, 'state', { get: () => environment.interrupted ? 'interrupted' : Reflect.get(NativeContext.prototype, 'state', this) });
      }
      resume(): Promise<void> {
        environment.resumeEvents.push(window.event?.type ?? 'outside-gesture'); environment.interrupted = false;
        return super.resume();
      }
    };
    Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true });
  });
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'LEARN HINDI' }).click();
  await page.getByRole('button', { name: 'Play Basics' }).click();
  await expect(page.locator('#sound')).toHaveAttribute('data-audio', 'ready');
  expect(await page.evaluate(() => (navigator as Navigator & { audioSession: { type: string } }).audioSession.type)).toBe('playback');
  const interrupt = async (): Promise<void> => {
    await page.evaluate(() => {
      const environment = window as unknown as { interrupted: boolean; testContext: AudioContext };
      environment.interrupted = true; environment.testContext.dispatchEvent(new Event('statechange'));
    });
    await expect(page.getByRole('button', { name: 'Enable sound', exact: true })).toBeVisible();
  };
  await interrupt(); await page.mouse.click(80, 285);
  await expect(page.locator('#sound')).toHaveAttribute('data-audio', 'ready');
  expect(await page.evaluate(() => (window as unknown as { resumeEvents: string[] }).resumeEvents.at(-1))).toMatch(/^pointer(down|up)$/);
  await interrupt(); await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { resumeEvents: string[] }).resumeEvents.at(-1))).toBe('click');
  await page.getByRole('button', { name: 'Replay Hindi phrase' }).click();
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-voice', 'playing');
});
