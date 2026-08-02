const { PORT } = require('./src/config/constants');
const { createApp } = require('./src/app');
const { ensureTagList } = require('./src/services/tagListService');

async function start() {
  const summary = await ensureTagList();

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Prompt workflow UI running at http://127.0.0.1:${PORT}`);
    console.log(`Loaded ${summary.tags} tags, ${summary.aliases} aliases, ${summary.collisions} collisions.`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
