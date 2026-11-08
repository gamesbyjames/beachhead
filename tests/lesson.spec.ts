import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { HindiLesson } from '../src/game/lesson';
import type { HindiCourse } from '../src/game/lesson';

const course: HindiCourse = JSON.parse(readFileSync('public/lessons/hi-course.json', 'utf8'));

test('Hindi ordering rejects wrong words, deduplicates a target, and advances only completed phrases', () => {
  const lesson = new HindiLesson(course), [first, second] = course.phrases.find(phrase => phrase.id === 'basics/4/n')!.words;
  lesson.begin(4);
  expect(lesson.select('one', first)).toBe('ignored');
  expect(lesson.advance()).toBe(false);
  lesson.activate();
  expect(lesson.select('two', second)).toBe('wrong');
  expect(lesson.state.wordIndex).toBe(0); expect(lesson.state.mistakes).toBe(1);
  expect(lesson.select('one', first)).toBe('correct');
  expect(lesson.select('one', first)).toBe('ignored');
  expect(lesson.state.wordIndex).toBe(1);
  expect(lesson.select('two', second)).toBe('complete');
  expect(lesson.select('two', second)).toBe('ignored');
  expect(lesson.state.completed).toBe(1);
  expect(lesson.advance()).toBe(true); expect(lesson.state.stage).toBe('preview'); expect(lesson.state.phrase?.id).toBe('story/0/n');
  for (const phrase of course.phrases) for (const audio of [phrase.audio, ...phrase.words.map(word => word.audio)]) expect(existsSync(`public/${audio}`)).toBe(true);
});

test('every topic plays all and only its phrases once, in sequence or shuffled', () => {
  for (const topic of course.topics) for (const order of ['sequence', 'random'] as const) {
    const lesson = new HindiLesson(course);
    const expected = course.phrases.filter(phrase => phrase.topic === topic.id);
    lesson.startTopic(topic.id, order, () => 0);
    const seen: string[] = [];
    while (lesson.state.stage !== 'finished') {
      const phrase = lesson.state.phrase!;
      seen.push(phrase.id);
      expect(phrase.topic).toBe(topic.id);
      expect(lesson.state.phraseCount).toBe(expected.length);
      lesson.activate();
      phrase.words.forEach((word, index) => lesson.select(`${seen.length}-${index}`, word));
      expect(lesson.state.stage).toBe('complete');
      lesson.advance();
    }
    expect(seen).toHaveLength(expected.length);
    expect(new Set(seen).size).toBe(expected.length);
    expect([...seen].sort()).toEqual(expected.map(phrase => phrase.id).sort());
    if (order === 'sequence') expect(seen).toEqual(expected.map(phrase => phrase.id));
    else if (expected.length > 1) expect(seen).not.toEqual(expected.map(phrase => phrase.id));
    expect(lesson.state.completed).toBe(expected.length);
    expect(lesson.advance()).toBe(false);
    lesson.startTopic(topic.id, order, () => 0);
    expect(lesson.state.completed).toBe(0); expect(lesson.state.mistakes).toBe(0);
  }
  expect(() => new HindiLesson(course).startTopic('missing', 'sequence')).toThrow(RangeError);
});

async function tapWord(page: Page, roman: string): Promise<void> {
  const target = page.locator('.word-target').filter({ has: page.locator('.target-tag', { hasText: new RegExp(`^${roman}$`) }) }).locator('.target-tag');
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

test('all five Hindi phrases play, accept ordered shots, recover from mistakes, and finish', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [], audioResponses: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.url().endsWith('.mp3') && response.ok()) audioResponses.push(response.url()); });
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open settings' }).tap();
  await page.getByLabel('Graphics quality').selectOption('high');
  await page.getByRole('button', { name: 'Close settings' }).tap();
  await page.screenshot({ path: 'test-results/ocean-high-phone.png' });
  await page.getByRole('button', { name: 'LEARN HINDI' }).tap();
  await page.getByRole('button', { name: 'Play Basics' }).tap();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'hindi');
  // Playwright's Windows WebKit build omits Web Audio; real Safari has it.
  const hasWebAudio = await page.evaluate(() => typeof AudioContext !== 'undefined');
  await expect(page.locator('#lesson-panel')).toHaveAttribute('data-voice', hasWebAudio ? 'playing' : 'unavailable');
  await expect(page.locator('#lesson-english')).toHaveText('Hello, how are you?');
  await page.getByRole('button', { name: 'READY — BUILD PHRASE' }).tap();
  await page.getByRole('button', { name: 'Pause game' }).tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await expect(page.locator('#lesson-panel')).toBeHidden();
  await page.getByRole('button', { name: 'RESUME DEFENCE' }).tap();
  const route = course.phrases.slice(0, 5);
  for (let phraseIndex = 0; phraseIndex < route.length; phraseIndex++) {
    const phrase = route[phraseIndex];
    if (phraseIndex > 0) {
      await expect(page.locator('#lesson-english')).toHaveText(phrase.english);
      await page.getByRole('button', { name: 'READY — BUILD PHRASE' }).tap();
    }
    for (let wordIndex = 0; wordIndex < phrase.words.length; wordIndex++) {
      await tapWord(page, phrase.words[wordIndex].roman);
      await expect(page.locator('#lesson-phrase .collected')).toHaveCount(wordIndex + 1);
    }
    await expect(page.locator('#lesson-panel')).toHaveAttribute('data-stage', 'complete');
    await expect(page.locator('#phrases-completed')).toHaveText(`${phraseIndex + 1} / 5`);
    if (phraseIndex === 1) await page.screenshot({ path: 'test-results/hindi-complete-phone.png' });
    await page.getByRole('button', { name: phraseIndex === route.length - 1 ? 'FINISH TRAINING' : 'NEXT PHRASE' }).tap();
  }
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'complete');
  await expect(page.locator('#final-wave')).toHaveText('5');
  await expect(page.locator('#result-description')).toContainText('Basics: 5 of 5');
  if (hasWebAudio) expect(audioResponses.length).toBeGreaterThanOrEqual(20);
  else for (const phrase of route) expect((await page.request.get(`/${phrase.audio}`)).ok()).toBe(true);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'BACK TO MAP' }).tap();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'map');
  await expect(page.locator('.map-phrase').filter({ hasText: 'Hello, how are you?' })).toBeVisible();
});
