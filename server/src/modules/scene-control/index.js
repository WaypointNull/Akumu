const control = require('./control');
const config = require('./config');
const workflow = require('./workflow');
const jobService = require('./jobService');

module.exports = {
  ...control,
  ...config,
  ...workflow,
  createSceneControlPainter: jobService.createSceneControlPainter
};
