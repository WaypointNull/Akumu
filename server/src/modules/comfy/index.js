const svg = require('./svg');
const workflow = require('./workflow');
const client = require('./client');
const discovery = require('./discovery');

module.exports = {
  ...svg,
  ...workflow,
  ...client,
  ...discovery
};
