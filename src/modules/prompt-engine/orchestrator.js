const { DEFAULTS } = require('../../config/constants');
const { getTagSet } = require('../tag-resolution');
const infer = require('./stages/infer');
const retrieve = require('./stages/retrieve');
const canonicalize = require('./stages/canonicalize');
const format = require('./stages/format');

async function runSinglePipeline({ naturalLanguage, loraInput = '', modelTranslate, modelValidate }) {
  const selectedModelTranslate = (modelTranslate || DEFAULTS.modelTranslate).trim();
  const selectedModelValidate = (modelValidate || DEFAULTS.modelValidate).trim();
  const tagSet = getTagSet();

  const translated = await infer.translate(naturalLanguage, { model: selectedModelTranslate });
  const candidates = infer.candidatesFromTagList(translated.tags, naturalLanguage, tagSet);
  const resolution = retrieve.resolveAll(translated.tags, naturalLanguage);
  const records = await canonicalize.apply(resolution.records, resolution.pending, naturalLanguage, {
    model: selectedModelValidate,
    enabled: false
  });
  const { summary, formatted } = format.finalize({ records, candidates, naturalLanguage, loraInput, tagSet });

  return {
    models: {
      modelTranslate: selectedModelTranslate,
      modelValidate: selectedModelValidate,
      modelFormat: null
    },
    passes: {
      translate: translated.raw,
      validate: summary,
      format: '[deterministic] boilerplate formatter applied (no LLM)'
    },
    final: formatted
  };
}

module.exports = { runSinglePipeline };
