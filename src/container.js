const { createTagListRepository, createRetrievalIndex, createRuleTable } = require('./modules/tag-resolution');
const { createRegionalPainter } = require('./modules/regional-painter');
const { ollamaGenerate } = require('./modules/llm');

function createContainer() {
  const repository = createTagListRepository();
  const retrieval = createRetrievalIndex({ repository });
  const ruleTable = createRuleTable({ repository });
  const llm = { ollamaGenerate };
  const deps = { llm, repository, retrieval, ruleTable };
  deps.regionalPainter = createRegionalPainter(deps);
  return deps;
}

module.exports = { createContainer };
