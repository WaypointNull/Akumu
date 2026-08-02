const { loadLogInputs } = require('./logs');
const { buildReviewSystem, parseAnnotations, annotate } = require('./annotate');
const { collect, writeSuggestions, applyAutoRules, applyReviewFoundRules } = require('./suggestions');

module.exports = {
  loadLogInputs,
  buildReviewSystem,
  parseAnnotations,
  annotate,
  collect,
  writeSuggestions,
  applyAutoRules,
  applyReviewFoundRules
};
