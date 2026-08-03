const svg = require('./svg');
const workflow = require('./workflow');
const client = require('./client');
const discovery = require('./discovery');
const config = require('./config');

module.exports = {
  ...svg,
  ...workflow,
  ...client,
  ...discovery,
  ...config
};
