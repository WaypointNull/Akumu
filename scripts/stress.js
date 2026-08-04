const fs = require('fs');
const path = require('path');
const { createContainer } = require('../server/src/container');
const { runSinglePipeline, loraTriggerPhrases, isLoraEcho } = require('../server/src/modules/prompt-engine');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_PATH = process.env.AKUMU_DATA_DIR
  ? path.join(process.env.AKUMU_DATA_DIR, 'ambiguous-log.ndjson')
  : path.join(DATA_DIR, 'ambiguous-log.ndjson');

const MODEL = process.env.AKUMU_MODEL || 'qwen2.5:7b';

// WORKAROUND: LoRA trigger lists are a separate input from the prompt — the LLM sees them as
// context ("do NOT output these") while the final formatter appends them verbatim. But qwen loves
// to echo the trigger phrases back into the descriptor tags, so each case can carry a made-up
// trigger list and the run reports how many output tags are exact echoes of it.
const CASES = [
  {
    prompt: 'a young knight standing at the edge of a dark forest at dusk, torch in hand, looking into the trees',
    lora: 'gareth (knight), silver plate armor, blue cape, torch, lion crest, holly crown'
  },
  {
    prompt: 'a catgirl sitting on a rock by a lake, wearing a red flannel jacket, holding a fishing rod',
    lora: 'mochi (catgirl), cream fur, pink nose, bell collar, striped tail, paw gloves, red flannel jacket'
  },
  {
    prompt: 'an astronaut floating in space with a broken visor, stars reflecting in the glass, earth below',
    lora: 'nova (astronaut), white space suit, broken visor, star decals, earth patch'
  },
  {
    prompt: 'a gothic lolita girl in a graveyard holding an umbrella, moonlight, fog rolling over tombstones',
    lora: 'moridef, veil, tiara, long black sleeveless dress, cleavage, side slit, torn black cape, shoulder spikes, single black thighhigh, detached sleeves, see-through sleeve'
  },
  {
    prompt: 'a samurai meditating under a waterfall, cherry blossom petals caught in the spray, morning light',
    lora: 'kenji (samurai), blue hakama, katana, cherry blossom crest, wooden sandals, topknot'
  },
  'a cyberpunk street vendor at night, neon signs reflecting in puddles, rain, holographic ramen stand',
  'a witch brewing potions in a candlelit cottage, glowing jars, a black cat on the counter',
  {
    prompt: 'a knight in shining armor kneeling before a dragon, offering a sword, smoky mountain lair',
    lora: ''
  },
  'a girl in a school uniform with headphones around her neck, looking at a smartphone, train window',
  'a desert nomad wrapped in scarves walking across dunes at sunset, carrying a lantern, sandstorm in distance',
  'an old fisherman mending nets on a dock at golden hour, seagulls, wooden boats bobbing',
  {
    prompt: 'a vampire girl in a victorian dress reading an old book by candelight, red eyes, gothic library',
    lora: 'lilith (vampire), victorian dress, red eyes, bat brooch, lace gloves, old book'
  },
  {
    prompt: 'a ninja perched on a rooftop at night, grappling hook, city lights, moonlit clouds',
    lora: 'shiro (ninja), dark blue ninja suit, hood, grappling hook, moon emblem'
  },
  'a girl with blue hair playing an electric guitar on stage, crowd silhouettes, confetti, spotlights',
  'a robot butler serving tea in a sunlit victorian parlor, gears visible, dusty beams of light',
  {
    prompt: 'a mermaid with a treasure chest sitting on a shipwreck, coral reef, shafts of underwater light',
    lora: 'coral (mermaid), teal tail, sea shell bra, treasure chest, pearl necklace'
  },
  'a winter fairy with snowflakes in her hair standing in a frozen pine forest, aurora overhead',
  'a biker girl leaning on a motorcycle in an alley, leather jacket, neon bar sign, wet asphalt',
  {
    prompt: 'an elf archer drawing a glowing bow in a misty ancient forest, mossy ruins, fireflies',
    lora: 'aylin (elf archer), pointed ears, green cloak, glowing bow, quiver, ivy crown'
  },
  {
    prompt: 'a girl in a kimono holding a paper lantern at a summer festival, fireworks, yukata crowd',
    lora: 'sakura (kimono), pink kimono, paper lantern, geta sandals, hair ornaments'
  },
  'Test tag, please ignore'
];

// WORKAROUND: count output tags that echo the LoRA trigger list. Same matcher the pipeline strip uses,
// so the metric directly measures what the strip removes.
function countLoraEcho(promptTags, loraInput) {
  return promptTags.filter((tag) => isLoraEcho(tag, loraInput)).length;
}

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
      loraEcho: 0,
      loraPhrases: 0,
      loraCases: 0,
      failures: 0
    };
  }

  const logBefore = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).length : 0;

  for (let i = 0; i < CASES.length; i++) {
    const entry = CASES[i];
    const prompt = typeof entry === 'string' ? entry : entry.prompt;
    const lora = typeof entry === 'string' ? '' : entry.lora;
    console.log(`[${i + 1}/${CASES.length}] ${truncate(prompt)}${lora ? ` | LoRA: ${truncate(lora, 60)}` : ''}`);
    for (const mode of modes) {
      const start = Date.now();
      let result;
      try {
        result = await runSinglePipeline(
          { naturalLanguage: prompt, modelTranslate: MODEL, mode, loraInput: lora || '' },
          deps
        );
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
      let echo = '';
      if (lora) {
        const phrases = loraTriggerPhrases(lora).length;
        const echoed = countLoraEcho(result.final.promptTags, lora);
        r.loraEcho += echoed;
        r.loraPhrases += phrases;
        r.loraCases++;
        echo = ` | loraEcho ${echoed}/${phrases}`;
      }
      console.log(`  ${mode}: ${n} tags, ${result.review.length} review (${parts}) in ${elapsed.toFixed(1)}s${echo}`);
    }
  }

  const logAfter = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).length : 0;
  console.log('');
  console.log('=== Summary ===');
  for (const mode of modes) {
    const r = results[mode];
    const avg = r.totalTags / CASES.length;
    const echo = r.loraCases > 0 ? ` | loraEcho ${r.loraEcho}/${r.loraPhrases} across ${r.loraCases} cases` : '';
    console.log(
      `${mode}: avg ${avg.toFixed(1)} tags/prompt | total review ${r.reviewItems}${echo} | ambiguous log entries: ${logAfter - logBefore}`
    );
  }
  console.log(`Ambiguous log grew by ${logAfter - logBefore} entries (total ${logAfter}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
