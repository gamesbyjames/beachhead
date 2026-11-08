import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = 'gamesbyjames/lingo_run';
async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}
const commit = (await (await get(`https://api.github.com/repos/${repository}/commits/main`)).json()).sha;
const source = `https://raw.githubusercontent.com/${repository}/${commit}/`;
const [course, manifest] = await Promise.all(['data/hi.json', 'assets/audio/hi/manifest.json'].map(async file => (await get(source + file)).json()));
const files = new Set();
const audioFile = file => {
  if (typeof file !== 'string' || !/^[a-z0-9_]+\.mp3$/i.test(file)) throw new Error(`Missing/invalid audio entry: ${file}`);
  files.add(file);
  return `audio/hi/${file}`;
};
const topicNames = { basics: 'Basics', story: 'My Story', numbers: 'Numbers', colors: 'Colours', verbs: 'Verbs', food: 'Food & Drink', travel: 'Directions', family: 'Family' };
const phrases = Object.entries(course.topics).flatMap(([topic, entries]) => entries.map((phrase, index) => {
  const gendered = phrase.words.some(word => !Array.isArray(word));
  const gender = gendered ? 'm' : 'n';
  return {
    id: `${topic}/${index}/${gender}`, topic, topicName: topicNames[topic] ?? topic, english: phrase.en, tip: phrase.tip,
    audio: audioFile(manifest.phrases[`${topic}/${index}/${gender}`]),
    words: phrase.words.map(word => {
      const selected = Array.isArray(word) ? word : word.m;
      return { roman: selected[0], gloss: selected[1], native: selected[2], audio: audioFile(manifest.words[selected[2]]) };
    }),
  };
}));
await mkdir(path.join(root, 'public/audio/hi'), { recursive: true });
await mkdir(path.join(root, 'public/lessons'), { recursive: true });
const pending = [...files];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (pending.length) {
    const file = pending.pop();
    const response = await get(`${source}assets/audio/hi/${file}`);
    await writeFile(path.join(root, 'public/audio/hi', file), Buffer.from(await response.arrayBuffer()));
  }
}));
await writeFile(path.join(root, 'public/lessons/hi-course.json'), JSON.stringify({ version: 2, language: 'hi', source: `https://github.com/${repository}`, commit, topics: Object.keys(topicNames).map(id => ({ id, name: topicNames[id], phraseCount: phrases.filter(phrase => phrase.topic === id).length })), phrases }, null, 2) + '\n');
console.log(`Imported ${phrases.length} Hindi phrases and ${files.size} existing MP3 clips from ${commit.slice(0, 12)}.`);
