const { DEFAULTS } = require('../../config/constants');
const infer = require('./stages/infer');
const retrieve = require('./stages/retrieve');
const canonicalize = require('./stages/canonicalize');
const format = require('./stages/format');

async function runSinglePipeline({ naturalLanguage, loraInput = '', modelTranslate, modelValidate }, deps) {
  const selectedModelTranslate = (modelTranslate || DEFAULTS.modelTranslate).trim();
  const selectedModelValidate = (modelValidate || DEFAULTS.modelValidate).trim();
  const tagSet = deps.repository.getTagSet();

  const translated = await infer.translate(naturalLanguage, { model: selectedModelTranslate }, deps);
  const candidates = infer.candidatesFromTagList(translated.tags, tagSet);
  const resolution = retrieve.resolveAll(translated.tags, naturalLanguage, deps);
  const records = await canonicalize.apply(
    resolution.records,
    resolution.pending,
    naturalLanguage,
    { model: selectedModelValidate, enabled: false },
    deps
  );
  const { summary, formatted, promptTags } = format.finalize({ records, candidates, loraInput, tagSet });

  const review = records
    .filter((r) => r.status === 'ambiguous' || r.status === 'unknown')
    .map((r) => ({
      original: r.original,
      status: r.status,
      candidates: (r.candidates || []).slice(0, 3).map((c) => c.tag),
      decomposed: r.decomposed || []
    }));

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
    final: {
      ...formatted,
      promptTags
    },
    review
  };
}

module.exports = { runSinglePipeline };
