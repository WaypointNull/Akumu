const fs = require('fs');
const { ensureTagList, buildIndex } = require('../src/modules/tag-resolution');
const { generate, run, runPhaseC, runRules, CASES_FILE } = require('../src/modules/benchmark');

const [command] = process.argv.slice(2);

(async () => {
  await ensureTagList();
  const indexStats = buildIndex();
  console.log('Tag index:', indexStats.tags, 'tags,', indexStats.trigrams, 'trigrams,', indexStats.terms, 'terms.');
  if (command === 'generate') {
    generate();
  } else if (command === 'run') {
    run();
  } else if (command === 'phase-c') {
    await runPhaseC();
  } else if (command === 'rules') {
    runRules();
  } else {
    if (!fs.existsSync(CASES_FILE)) generate();
    run();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
