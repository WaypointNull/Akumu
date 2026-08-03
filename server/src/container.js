const { createTagListRepository, createRetrievalIndex } = require('./modules/tag-resolution');
const { ollamaGenerate } = require('./modules/llm');

function createContainer() {
  const repository = createTagListRepository();
  const retrieval = createRetrievalIndex({ repository });
  const llm = { ollamaGenerate };
  return { llm, repository, retrieval };
}

module.exports = { createContainer };
