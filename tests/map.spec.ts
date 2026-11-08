import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { HindiCourse } from '../src/game/lesson';
import { PerspectiveCamera, Vector3 } from 'three';

const course: HindiCourse = JSON.parse(readFileSync('public/lessons/hi-course.json', 'utf8'));

test('Hindi map selects a destination and starts its full shuffled topic', async ({ page }, testInfo) => {
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'LEARN HINDI' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'map');
  await expect(page.locator('.map-topic')).toHaveCount(8);
  await expect(page.locator('.loc')).toHaveCount(8);
  await page.screenshot({ path: `test-results/hindi-map-${testInfo.project.name}.png` });
  await expect(page.locator('.map-topic').nth(5)).toContainText('Food & Drink');
  await page.locator('.map-topic').nth(5).click();
  await expect(page.locator('.map-phrase')).toHaveCount(8);
  await expect(page.locator('#map-location-name')).toHaveText('Spice Harbour');
  await page.getByLabel('Shuffle').check();
  await page.getByRole('button', { name: 'Play Food & Drink' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#lesson-number')).toHaveText('FOOD & DRINK / 01 OF 08');
  const phrase = await page.locator('#lesson-english').textContent();
  expect(['I am hungry.', 'One tea and two samosas, please.', 'The food is very tasty.', 'Could I get some water?', 'I like spicy food.', 'I need to eat something.', 'I am thirsty.', 'I need to drink something.']).toContain(phrase);
  await page.getByRole('button', { name: 'Pause game' }).click();
  await page.getByRole('button', { name: 'RESTART MISSION' }).click();
  await expect(page.locator('#lesson-number')).toHaveText('FOOD & DRINK / 01 OF 08');
  await expect(page.locator('#phrases-completed')).toHaveText('0 / 8');
});

test('landscape phone plays long phrases in sequence within My Story', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('beachhead.preferences', JSON.stringify({ quality: 'low', muted: true })));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'LEARN HINDI' }).tap();
  await expect(page.getByRole('button', { name: 'Select My Story' })).toBeVisible();
  await page.getByRole('button', { name: 'Select My Story' }).tap();
  await expect(page.locator('#map-location-name')).toHaveText('Storyteller’s Cove');
  await page.screenshot({ path: `test-results/hindi-map-phone-${testInfo.project.name}.png` });
  await page.getByLabel('In sequence').check();
  await page.getByRole('button', { name: 'Play My Story' }).tap();
  const canvas = (await page.locator('#scene').boundingBox())!;
  const camera = new PerspectiveCamera(58, canvas.width / canvas.height, .1, 16000);
  camera.position.set(0, 4.6, 27); camera.rotation.set(.28, 0, 0, 'YXZ'); camera.updateMatrixWorld();
  const horizon = canvas.y + (-new Vector3(0, 0, -185).project(camera).y * .5 + .5) * canvas.height;
  const phrases = course.phrases.filter(phrase => phrase.topic === 'story');
  for (const [index, phrase] of phrases.slice(0, 2).entries()) {
    await expect(page.locator('#lesson-english')).toHaveText(phrase.english);
    await expect(page.locator('#lesson-number')).toHaveText(`MY STORY / 0${index + 1} OF 06`);
    if (index === 1) {
      await expect(page.locator('.word-target:not([hidden]) .target-tag')).toHaveCount(8);
      await page.screenshot({ path: `test-results/hindi-wide-formation-${testInfo.project.name}.png` });
      const boxes = await page.locator('.word-target:not([hidden]) .target-tag').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }; }));
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
        const overlap = boxes[a].left < boxes[b].right && boxes[a].right > boxes[b].left && boxes[a].top < boxes[b].bottom && boxes[a].bottom > boxes[b].top;
        expect(overlap, `word labels ${a} and ${b} should not overlap`).toBe(false);
      }
    }
    for (const word of phrase.words) {
      const target = page.locator('.word-target').filter({ has: page.locator('.target-tag', { hasText: new RegExp(`^${word.roman}$`) }) });
      const tag = target.locator('.target-tag');
      await expect(tag).toBeVisible();
      const box = (await tag.boundingBox())!;
      const anchor = (await target.locator('.target-anchor').boundingBox())!;
      expect(anchor.y + anchor.height / 2, `${word.roman} should be above the horizon`).toBeLessThan(horizon);
      expect(box.x).toBeGreaterThanOrEqual(canvas.x); expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(tag).toBeHidden();
    }
    await expect(page.locator('#phrases-completed')).toHaveText(`${index + 1} / 6`);
    await page.getByRole('button', { name: 'NEXT PHRASE' }).tap();
  }
  await expect(page.locator('#lesson-english')).toHaveText(phrases[2].english);
  await context.close();
});

test('shuffled Basics session finishes after all five different phrases', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The same sequence is covered by the WebKit lesson test.');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 932, height: 430 });
  await page.addInitScript(() => localStorage.setItem('beachhead.preferences', JSON.stringify({ quality: 'low', muted: true })));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'LEARN HINDI' }).click();
  await page.getByLabel('Shuffle').check();
  await page.getByRole('button', { name: 'Play Basics' }).click();
  const phrases = course.phrases.filter(phrase => phrase.topic === 'basics');
  const seen = new Set<string>();
  for (let index = 0; index < phrases.length; index++) {
    const english = await page.locator('#lesson-english').textContent();
    const phrase = phrases.find(candidate => candidate.english === english);
    expect(phrase).toBeDefined(); expect(seen.has(phrase!.id)).toBe(false); seen.add(phrase!.id);
    for (const word of phrase!.words) {
      const tag = page.locator('.word-target').filter({ has: page.locator('.target-tag', { hasText: new RegExp(`^${word.roman}$`) }) }).locator('.target-tag');
      await expect(tag).toBeVisible(); const box = (await tag.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(tag).toBeHidden();
    }
    await expect(page.locator('#phrases-completed')).toHaveText(`${index + 1} / 5`);
    await page.getByRole('button', { name: index === phrases.length - 1 ? 'FINISH TRAINING' : 'NEXT PHRASE' }).click();
  }
  expect(seen.size).toBe(5);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'complete');
  await expect(page.locator('#result-description')).toContainText('Basics: 5 of 5');
  await page.getByRole('button', { name: 'BACK TO MAP' }).click();
  await expect(page.locator('#map-location-name')).toHaveText('Gate of Greetings');
  await expect(page.getByLabel('Shuffle')).toBeChecked();
});

test('portrait phone keeps all eight-word targets above the sea and shootable', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('beachhead.preferences', JSON.stringify({ quality: 'low', muted: true })));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'LEARN HINDI' }).tap();
  await page.locator('.map-topic[data-topic="story"]').tap();
  await page.getByRole('button', { name: 'Play My Story' }).tap();
  await expect(page.locator('#orientation-prompt')).toBeVisible();
  await page.getByRole('button', { name: 'CONTINUE IN PORTRAIT' }).tap();
  const phrases = course.phrases.filter(phrase => phrase.topic === 'story');
  const canvas = (await page.locator('#scene').boundingBox())!;
  const camera = new PerspectiveCamera(72, canvas.width / canvas.height, .1, 16000);
  camera.position.set(0, 4.6, 27); camera.rotation.set(.4, 0, 0, 'YXZ'); camera.updateMatrixWorld();
  const horizon = canvas.y + (-new Vector3(0, 0, -185).project(camera).y * .5 + .5) * canvas.height;
  for (const [index, phrase] of phrases.slice(0, 2).entries()) {
    await expect(page.locator('#lesson-english')).toHaveText(phrase.english);
    if (index === 1) await page.screenshot({ path: `test-results/hindi-portrait-targets-${testInfo.project.name}.png` });
    for (const word of phrase.words) {
      const target = page.locator('.word-target').filter({ has: page.locator('.target-tag', { hasText: new RegExp(`^${word.roman}$`) }) });
      const tag = target.locator('.target-tag'); await expect(tag).toBeVisible();
      const box = (await tag.boundingBox())!, anchor = (await target.locator('.target-anchor').boundingBox())!;
      expect(anchor.y + anchor.height / 2, `${word.roman} should be above the horizon`).toBeLessThan(horizon);
      expect(box.x).toBeGreaterThanOrEqual(canvas.x); expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
      expect(box.y).toBeGreaterThanOrEqual(canvas.y); expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(tag).toBeHidden();
    }
    await expect(page.locator('#lesson-mistakes')).toHaveText('0');
    await page.getByRole('button', { name: 'NEXT PHRASE' }).tap();
  }
  await context.close();
});
