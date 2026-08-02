const parser = require('./parser');
const metrics = require('./metrics');
const repository = require('./repository');
const aliases = require('./aliases');
const retrieval = require('./retrieval');

module.exports = {
  ...parser,
  ...metrics,
  createTagListRepository: repository.createTagListRepository,
  createRuleTable: aliases.createRuleTable,
  RESOLUTIONS_PATH: aliases.RESOLUTIONS_PATH,
  createRetrievalIndex: retrieval.createRetrievalIndex
};
