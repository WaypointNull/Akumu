const datasets = require('./datasets');
const generator = require('./generator');
const scorer = require('./scorer');

module.exports = {
  ...datasets,
  ...generator,
  ...scorer
};
