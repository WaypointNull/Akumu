const { PORT } = require('./src/config/constants');
const { createApp } = require('./src/app');
const { ensureTagList, getTagSet } = require('./src/services/tagListService');

async function start() {
  await ensureTagList();

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Prompt workflow UI running at http://127.0.0.1:${PORT}`);
    console.log(`Loaded ${getTagSet().size} danbooru tags`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
