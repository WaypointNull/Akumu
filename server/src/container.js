const { createTagListRepository, createRetrievalIndex } = require('./modules/tag-resolution');
const { createRegionalPainter } = require('./modules/regional-painter');
const { ollamaGenerate } = require('./modules/llm');

function createContainer() {
  const repository = createTagListRepository();
  const retrieval = createRetrievalIndex({ repository });
  const llm = { ollamaGenerate };
  const deps = { llm, repository, retrieval };
  deps.regionalPainter = createRegionalPainter(deps);
  return deps;
}

module.exports = { createContainer };
