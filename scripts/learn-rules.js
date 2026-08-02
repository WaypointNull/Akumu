const path = require('path');
const { createContainer } = require('../src/container');
const { RESOLUTIONS_PATH } = require('../src/modules/tag-resolution');
const { loadCases } = require('../src/modules/benchmark');
const {
  loadLogInputs,
  annotate,
  collect,
  writeSuggestions,
  applyAutoRules,
  applyReviewFoundRules
} = require('../src/modules/rules-learning');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SUGGESTIONS_FILE = path.join(DATA_DIR, 'rule-suggestions.json');
const AMBIGUOUS_LOG = path.join(DATA_DIR, 'ambiguous-log.ndjson');
const PHASE_C_LOG = path.join(DATA_DIR, 'phase-c-log.ndjson');

const ANNOTATE_MODEL = process.env.ANNOTATE_MODEL || 'qwen2.5:7b';
const BATCH = 15;

async function main() {
  const args = new Set(process.argv.slice(2));
  const deps = createContainer();
  await deps.repository.ensureTagList();
  deps.retrieval.buildIndex();

  const freq = loadLogInputs([AMBIGUOUS_LOG, PHASE_C_LOG]);
  const cases = loadCases() || [];
  const { auto, review } = collect({ deps, cases, freq, includeLogs: args.has('--include-logs') });

  let annotated = review;
  if (args.has('--llm') && review.length) {
    review.forEach((e, i) => (e.index = i));
    console.log(`Annotating ${review.length} review cases with ${ANNOTATE_MODEL}...`);
    annotated = await annotate(review, deps, { model: ANNOTATE_MODEL, batchSize: BATCH });
  }

  auto.forEach((e, i) => (e.index = i));
  annotated.forEach((e, i) => (e.index = i));

  writeSuggestions({
    filePath: SUGGESTIONS_FILE,
    auto,
    review: annotated,
    model: args.has('--llm') ? ANNOTATE_MODEL : null
  });

  console.log('Wrote', SUGGESTIONS_FILE);
  console.log('  auto (candidate #1 == expected):', auto.length);
  console.log('  review (needs judgment):', annotated.length);

  if (args.has('--apply-auto')) {
    const count = applyAutoRules({ filePath: RESOLUTIONS_PATH, auto });
    console.log('Applied', count, 'auto rules ->', RESOLUTIONS_PATH);
  }

  if (args.has('--apply-review-found')) {
    const { applied, absent, absentList } = applyReviewFoundRules({ filePath: RESOLUTIONS_PATH, annotated, deps });
    for (const a of absentList) {
      console.log('  ABSENT', a.input, '->', a.expected);
    }
    console.log(
      'Applied',
      applied,
      'review-found rules (expected in candidates) ->',
      RESOLUTIONS_PATH,
      '| truly absent:',
      absent
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
