const { DEFAULTS } = require('../../config/constants');
const infer = require('./stages/infer');
const retrieve = require('./stages/retrieve');
const format = require('./stages/format');
const { formatPass3Breakdown } = require('./formatter');

async function runSinglePipeline({ naturalLanguage, loraInput = '', modelTranslate, mode = 'strict' }, deps) {
  const selectedMode = mode === 'creative' ? 'creative' : 'strict';
  const selectedModelTranslate = (modelTranslate || DEFAULTS.modelTranslate).trim();
  const tagSet = deps.repository.getTagSet();

  const translated = await infer.translate(
    naturalLanguage,
    { model: selectedModelTranslate, mode: selectedMode, loraInput },
    deps
  );
  const candidates = infer.candidatesFromTagList(translated.tags, tagSet);
  const resolution = retrieve.resolveAll(translated.tags, naturalLanguage, deps, selectedMode);
  const { summary, formatted, promptTags } = format.finalize({
    records: resolution.records,
    candidates,
    loraInput,
    tagSet
  });

  const review = resolution.records
    .filter(
      (r) => r.status === 'ambiguous' || r.status === 'unknown' || r.status === 'creative' || r.status === 'overlong'
    )
    .map((r) => ({
      original: r.original,
      status: r.status,
      candidates: (r.candidates || []).slice(0, 3).map((c) => c.tag),
      decomposed: r.decomposed || []
    }));

  return {
    models: {
      modelTranslate: selectedModelTranslate,
      modelFormat: null
    },
    mode: selectedMode,
    passes: {
      translate: translated.raw,
      validate: summary,
      format: formatPass3Breakdown({ promptTags, loraInput })
    },
    final: {
      ...formatted,
      promptTags
    },
    review
  };
}

module.exports = { runSinglePipeline };
