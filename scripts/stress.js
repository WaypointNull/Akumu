const fs = require('fs');
const path = require('path');
const { createContainer } = require('../server/src/container');
const { runSinglePipeline } = require('../server/src/modules/prompt-engine');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_PATH = process.env.AKUMU_DATA_DIR
  ? path.join(process.env.AKUMU_DATA_DIR, 'ambiguous-log.ndjson')
  : path.join(DATA_DIR, 'ambiguous-log.ndjson');

const MODEL = process.env.AKUMU_MODEL || 'qwen2.5:7b';

const PROMPTS = [
  'a young knight standing at the edge of a dark forest at dusk, torch in hand, looking into the trees',
  'a catgirl sitting on a rock by a lake, wearing a red flannel jacket, holding a fishing rod',
  'an astronaut floating in space with a broken visor, stars reflecting in the glass, earth below',
  'a gothic lolita girl in a graveyard holding an umbrella, moonlight, fog rolling over tombstones',
  'a samurai meditating under a waterfall, cherry blossom petals caught in the spray, morning light',
  'a cyberpunk street vendor at night, neon signs reflecting in puddles, rain, holographic ramen stand',
  'a witch brewing potions in a candlelit cottage, glowing jars, a black cat on the counter',
  'a knight in shining armor kneeling before a dragon, offering a sword, smoky mountain lair',
  'a girl in a school uniform with headphones around her neck, looking at a smartphone, train window',
  'a desert nomad wrapped in scarves walking across dunes at sunset, carrying a lantern, sandstorm in distance',
  'an old fisherman mending nets on a dock at golden hour, seagulls, wooden boats bobbing',
  'a vampire girl in a victorian dress reading an old book by candelight, red eyes, gothic library',
  'a ninja perched on a rooftop at night, grappling hook, city lights, moonlit clouds',
  'a girl with blue hair playing an electric guitar on stage, crowd silhouettes, confetti, spotlights',
  'a robot butler serving tea in a sunlit victorian parlor, gears visible, dusty beams of light',
  'a mermaid with a treasure chest sitting on a shipwreck, coral reef, shafts of underwater light',
  'a winter fairy with snowflakes in her hair standing in a frozen pine forest, aurora overhead',
  'a biker girl leaning on a motorcycle in an alley, leather jacket, neon bar sign, wet asphalt',
  'an elf archer drawing a glowing bow in a misty ancient forest, mossy ruins, fireflies',
  'a girl in a kimono holding a paper lantern at a summer festival, fireworks, yukata crowd'
];

function truncate(s, n = 120) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function main() {
  const deps = createContainer();
  await deps.repository.ensureTagList();
  deps.retrieval.buildIndex();
  console.log(`Tags: ${deps.repository.getTagSet().size} | Model: ${MODEL}`);
  console.log(`Ambiguous log: ${LOG_PATH}`);
  console.log('');

  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

  const modes = ['strict', 'creative'];
  const results = {};
  for (const mode of modes) {
    results[mode] = {
      totalTags: 0,
      tagCounts: [],
      kept: 0,
      ambiguous: 0,
      unknown: 0,
      creative: 0,
      retrieved: 0,
      decomposed: 0,
      alias: 0,
      reviewItems: 0,
      failures: 0
    };
  }

  const logBefore = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).length : 0;

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    console.log(`[${i + 1}/${PROMPTS.length}] ${truncate(prompt)}`);
    for (const mode of modes) {
      const start = Date.now();
      let result;
      try {
        result = await runSinglePipeline({ naturalLanguage: prompt, modelTranslate: MODEL, mode }, deps);
      } catch (error) {
        results[mode].failures++;
        console.log(`  ${mode}: FAILED (${error.message})`);
        continue;
      }
      const elapsed = (Date.now() - start) / 1000;
      const r = results[mode];
      const n = result.final.promptTags.length;
      r.totalTags += n;
      r.tagCounts.push(n);
      r.reviewItems += result.review.length;
      for (const item of result.review) r[item.status]++;
      const counts = result.review.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});
      const parts = Object.entries(counts)
        .map(([k, v]) => `${k}:${v}`)
        .join(' ');
      console.log(`  ${mode}: ${n} tags, ${result.review.length} review (${parts}) in ${elapsed.toFixed(1)}s`);
    }
  }

  const logAfter = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).length : 0;
  console.log('');
  console.log('=== Summary ===');
  for (const mode of modes) {
    const r = results[mode];
    const avg = r.totalTags / PROMPTS.length;
    console.log(
      `${mode}: avg ${avg.toFixed(1)} tags/prompt | total review ${r.reviewItems} | ambiguous log entries: ${logAfter - logBefore}`
    );
  }
  console.log(`Ambiguous log grew by ${logAfter - logBefore} entries (total ${logAfter}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
