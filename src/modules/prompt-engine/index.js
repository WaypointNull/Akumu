const { runSinglePipeline } = require('./orchestrator');
const { generateGlobalPrompt, generateRegionalPrompts, generateMaskPosePrompt } = require('./stages/regional');
const { canonicalizeConcepts } = require('./canonicalize/service');
const {
  formatResolutionSummary,
  formatFinalOutput,
  buildPositiveBoilerplate,
  buildNegativeBoilerplate,
  formatTagBlock,
  mergeChannelLoras
} = require('./formatter');

module.exports = {
  runSinglePipeline,
  generateGlobalPrompt,
  generateRegionalPrompts,
  generateMaskPosePrompt,
  canonicalizeConcepts,
  formatResolutionSummary,
  formatFinalOutput,
  buildPositiveBoilerplate,
  buildNegativeBoilerplate,
  formatTagBlock,
  mergeChannelLoras
};
