const { PORT } = require('./src/config/constants');
const { createApp } = require('./src/app');
const { createContainer } = require('./src/container');

async function start() {
  const deps = createContainer();
  const summary = await deps.repository.ensureTagList();
  const indexSummary = deps.retrieval.buildIndex();

  const app = createApp(deps);
  app.listen(PORT, () => {
    console.log(`Prompt workflow UI running at http://127.0.0.1:${PORT}`);
    console.log(`Loaded ${summary.tags} tags, ${summary.aliases} aliases, ${summary.collisions} collisions.`);
    console.log(
      `Retrieval index: ${indexSummary.tags} tags, ${indexSummary.trigrams} trigrams, ${indexSummary.terms} terms.`
    );
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
