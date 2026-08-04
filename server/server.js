const { PORT } = require('./src/config/constants');
const { createApp } = require('./src/app');
const { createContainer } = require('./src/container');

async function start(options = {}) {
  const deps = createContainer();
  const summary = await deps.repository.ensureTagList();
  const indexSummary = deps.retrieval.buildIndex();

  const app = createApp(deps);
  const { host } = options;

  return new Promise((resolve, reject) => {
    const server = host ? app.listen(PORT, host, () => resolve(server)) : app.listen(PORT, () => resolve(server));
    server.on('error', reject);
    console.log(`Akumu running at http://127.0.0.1:${PORT}`);
    console.log(`Loaded ${summary.tags} tags, ${summary.aliases} aliases, ${summary.collisions} collisions.`);
    console.log(
      `Retrieval index: ${indexSummary.tags} tags, ${indexSummary.trigrams} trigrams, ${indexSummary.terms} terms.`
    );
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { start };
