// Runs the crisis check's draft on the hand-written lines, on each model, directly on Anthropic's API. Prints no key.
import { readFileSync, writeFileSync } from 'node:fs';
import { LINES } from './lines.mjs';

const envFile = process.argv[2];
const out = process.argv[3];
const key = readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith('COPE_SERVER_ANTHROPIC_KEY='))?.slice('COPE_SERVER_ANTHROPIC_KEY='.length).trim();
if (!key) throw new Error('no key');

const SYSTEM = `You read one person's latest words in a chat app, and you check for one thing: whether someone's life or safety may be in danger now.

Answer "danger" when the words show, directly or indirectly, any of these:
- the person may want to die or end their life, now or soon, including hints such as saying goodbye, giving things away, being a burden who will soon be gone, or having no future
- the person may seriously hurt someone, and means it
- someone is in danger of violence right now
- someone needs emergency medical help right now, the person or someone they describe

Answer "none" for everything else, including: grief, sadness, exhaustion, anger and despair about a situation; figures of speech and jokes; violence or death in a game, a story or a performance; ordinary plans, moves, wills and goodbyes; a past crisis that is over.

Judge the words as they would be meant. A person in danger is often quiet about it, and a person who is only sad isn't in danger. The words may be in any language.

Reply with only one word: danger or none.`;

const PRICES = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10] };
const DRAWS = 2;

async function ask(model, line) {
  const before = (line.before ?? []).map((t) => `Earlier they said: ${t}`).join('\n');
  const content = `${before ? `${before}\n\n` : ''}Their latest words:\n${line.text}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const started = Date.now();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 600, system: SYSTEM, messages: [{ role: 'user', content }] }),
    });
    if (response.status === 429 || response.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const body = await response.json();
    if (!response.ok) throw new Error(`${model}: ${response.status} ${body.error?.message ?? ''}`);
    const word = body.content.map((c) => c.text ?? '').join('').trim().toLowerCase();
    if (!word) throw new Error(`${model}: empty answer, stop ${body.stop_reason}`);
    return { word, input: body.usage.input_tokens, output: body.usage.output_tokens, ms: Date.now() - started };
  }
  throw new Error(`${model}: gave up`);
}

const jobs = [];
for (const model of Object.keys(PRICES)) for (let draw = 0; draw < DRAWS; draw++) for (const [i, line] of LINES.entries()) jobs.push({ model, draw, i, line });
const results = [];
let next = 0;
const started = Date.now();
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    const answer = await ask(job.model, job.line);
    results.push({ model: job.model, draw: job.draw, i: job.i, ...answer });
  }
}));
writeFileSync(out, JSON.stringify(results));

let total = 0;
for (const model of Object.keys(PRICES)) {
  const rows = results.filter((r) => r.model === model);
  const [input, output] = PRICES[model];
  const cost = rows.reduce((s, r) => s + (r.input * input + r.output * output) / 1e6, 0);
  total += cost;
  const hit = (r) => r.word.startsWith('danger');
  const of = (want) => rows.filter((r) => LINES[r.i].want === want);
  const fire = of('fire');
  const quiet = of('quiet');
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`\n${model}: ${rows.length} calls, ${cost.toFixed(4)}, ${(cost / rows.length * 100).toFixed(4)} per 100 lines, input ${Math.round(rows.reduce((s, r) => s + r.input, 0) / rows.length)}, output ${Math.round(rows.reduce((s, r) => s + r.output, 0) / rows.length)}, median ${ms[Math.floor(ms.length / 2)]} ms, slowest ${ms.at(-1)} ms`);
  console.log(`  caught ${fire.filter(hit).length}/${fire.length}, false alarms ${quiet.filter(hit).length}/${quiet.length}`);
  const missed = [...new Set(fire.filter((r) => !hit(r)).map((r) => r.i))];
  for (const i of missed) console.log(`  MISSED (${fire.filter((r) => r.i === i && !hit(r)).length}/${DRAWS}) [${LINES[i].kind}] ${LINES[i].text.slice(0, 90)}`);
  const alarms = [...new Set(quiet.filter(hit).map((r) => r.i))];
  for (const i of alarms) console.log(`  ALARM (${quiet.filter((r) => r.i === i && hit(r)).length}/${DRAWS}) [${LINES[i].kind}] ${LINES[i].text.slice(0, 90)}`);
  const gray = [...new Set(of('gray').map((r) => r.i))];
  for (const i of gray) console.log(`  gray ${rows.filter((r) => r.i === i && hit(r)).length}/${DRAWS} [${LINES[i].kind}]`);
  const odd = rows.filter((r) => !['danger', 'none'].includes(r.word.replace(/[^a-z]/g, '')));
  if (odd.length) console.log(`  odd answers: ${odd.length}, e.g. ${odd[0].word}`);
}
console.log(`\ntotal $${total.toFixed(4)}, ${((Date.now() - started) / 1000).toFixed(0)} s`);
