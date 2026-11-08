import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { HindiLesson } from '../src/game/lesson';
import type { HindiCourse } from '../src/game/lesson';

const course: HindiCourse = JSON.parse(readFileSync('public/lessons/hi-course.json', 'utf8'));

test('skipping advances without completing, scoring, or repeating a phrase', () => {
  const lesson = new HindiLesson(course); lesson.startTopic('basics', 'sequence');
  lesson.activate();
  expect(lesson.select('first', lesson.state.phrase!.words[0])).toBe('correct');
  expect(lesson.skip()).toBe(true);
  expect(lesson.state.phrase?.id).toBe('basics/1/n');
  expect(lesson.state.skipped).toBe(1); expect(lesson.state.completed).toBe(0); expect(lesson.state.wordIndex).toBe(0);
  for (let i = 0; i < 3; i++) expect(lesson.skip()).toBe(true);
  expect(lesson.skip()).toBe(false); expect(lesson.state.stage).toBe('finished');
  expect(lesson.state.skipped).toBe(5); expect(lesson.state.completed).toBe(0);
  expect(lesson.skip()).toBe(false); expect(lesson.state.skipped).toBe(5);
  lesson.startTopic('basics', 'random', () => 0);
  expect(lesson.state.skipped).toBe(0); expect(lesson.state.completed).toBe(0);
});

test('phone can skip during and between phrases, and the summary counts skipped separately', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('beachhead.preferences', JSON.stringify({ quality: 'low', muted: true })));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { events: { type: string; phraseId?: string }[] }).events = [];
    window.addEventListener('beachhead:combat', event => (window as unknown as { events: unknown[] }).events.push((event as CustomEvent).detail));
  });
  await page.getByRole('button', { name: 'LEARN HINDI' }).tap();
  await page.getByRole('button', { name: 'Play Basics' }).tap();
  const first = page.locator('.word-target[data-roman="Namaste"] .target-tag');
  await expect(first).toBeVisible(); const box = (await first.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#lesson-phrase .collected')).toHaveCount(1);
  await page.getByRole('button', { name: 'Skip phrase', exact: true }).tap();
  await expect(page.locator('#lesson-english')).toHaveText('I am fine, thank you.');
  await expect(page.locator('#phrases-skipped')).toHaveText('1');
  await expect(page.locator('#phrases-completed')).toHaveText('0 / 5');
  await expect(page.locator('#score')).toHaveText('000100');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Skip phrase', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Skip final phrase' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip final phrase' }).tap();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'complete');
  await expect(page.locator('#result-description')).toContainText('0 of 5 phrases completed, 5 skipped');
  await expect(page.locator('#score')).toHaveText('000100');
  const events = await page.evaluate(() => (window as unknown as { events: { type: string; phraseId?: string }[] }).events);
  expect(events.filter(event => event.type === 'phrase-skipped').map(event => event.phraseId)).toEqual(course.phrases.filter(phrase => phrase.topic === 'basics').map(phrase => phrase.id));
  expect(events.some(event => event.type === 'phrase-completed')).toBe(false);
  await page.getByRole('button', { name: 'PRACTISE AGAIN' }).tap();
  await expect(page.locator('#phrases-skipped')).toHaveText('0');
  await expect(page.locator('#score')).toHaveText('000000');
  await context.close();
});

test('portrait phone prompts for landscape, freezes until rotated, then continues', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('beachhead.preferences', JSON.stringify({ quality: 'low', muted: true })));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'LEARN HINDI' }).tap();
  await page.getByRole('button', { name: 'Play Basics' }).tap();
  await expect(page.getByRole('dialog', { name: 'TURN YOUR PHONE SIDEWAYS.' })).toBeVisible();
  const plane = page.locator('.word-target[data-roman="Namaste"]');
  await expect(plane).toHaveAttribute('data-range', /^\d+$/);
  const initial = await plane.getAttribute('data-range'); await page.waitForTimeout(600);
  expect(await plane.getAttribute('data-range')).toBe(initial);
  await page.setViewportSize({ width: 932, height: 430 });
  await expect(page.locator('#orientation-prompt')).toBeHidden();
  await expect.poll(async () => Number(await plane.getAttribute('data-range')), { timeout: 15_000 }).toBeLessThan(Number(initial) - 3);
  const tag = plane.locator('.target-tag'), box = (await tag.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(tag).toBeHidden(); await expect(page.locator('#lesson-phrase .collected')).toHaveCount(1);
  await context.close();
});
