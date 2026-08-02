const parser = require('./parser');
const metrics = require('./metrics');
const repository = require('./repository');
const retrieval = require('./retrieval');

module.exports = {
  ...parser,
  ...metrics,
  createTagListRepository: repository.createTagListRepository,
  createRetrievalIndex: retrieval.createRetrievalIndex
};
