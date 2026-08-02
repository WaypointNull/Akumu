const { PORT } = require('./src/config/constants');
const { createApp } = require('./src/app');
const { ensureTagList } = require('./src/services/tagListService');
const { buildIndex } = require('./src/services/tagRetrievalService');

async function start() {
  const summary = await ensureTagList();
  const indexSummary = buildIndex();

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Prompt workflow UI running at http://127.0.0.1:${PORT}`);
    console.log(`Loaded ${summary.tags} tags, ${summary.aliases} aliases, ${summary.collisions} collisions.`);
    console.log(`Retrieval index: ${indexSummary.tags} tags, ${indexSummary.trigrams} trigrams, ${indexSummary.terms} terms.`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
