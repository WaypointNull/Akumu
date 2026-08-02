const fs = require('fs');
const { createContainer } = require('../src/container');
const { generate, run, runPhaseC, runFormat, CASES_FILE } = require('../src/modules/benchmark');

const [command] = process.argv.slice(2);

(async () => {
  const deps = createContainer();
  await deps.repository.ensureTagList();
  const indexStats = deps.retrieval.buildIndex();
  console.log('Tag index:', indexStats.tags, 'tags,', indexStats.trigrams, 'trigrams,', indexStats.terms, 'terms.');
  if (command === 'generate') {
    generate(deps);
  } else if (command === 'run') {
    run(deps);
  } else if (command === 'phase-c') {
    await runPhaseC(deps);
  } else if (command === 'format') {
    runFormat(deps);
  } else {
    if (!fs.existsSync(CASES_FILE)) generate(deps);
    run(deps);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
