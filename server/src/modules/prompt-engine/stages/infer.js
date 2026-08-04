const { buildPass1System, buildPass1Prompt } = require('../templates');
const { dedupeKeepOrder } = require('../../../shared/list');
const { splitTags, isSectionLabel, isUsableTag } = require('../../tag-resolution');
const { FORMAT } = require('../../../config/constants');

// WORKAROUND: mode must never touch the LLM (same prompt, same temperature); creative mode is a
// validator-side decision only, so the translate stage is deliberately mode-agnostic.
const TRANSLATE_TEMPERATURE = 0.15;

async function translate(naturalLanguage, { model, loraInput = '' }, deps) {
  const raw = await deps.llm.ollamaGenerate(
    model,
    buildPass1System(),
    buildPass1Prompt(naturalLanguage, loraInput),
    TRANSLATE_TEMPERATURE
  );
  // WORKAROUND: the LLM tends to emit section headers ("Positive:", "Quality:") instead of pure tags; strip them.
  const tags = splitTags(raw).filter((tag) => !isSectionLabel(tag));
  return { raw, tags };
}

function candidatesFromTagList(rawTags, allowedTags) {
  const candidates = [];
  for (const tag of rawTags) {
    if (allowedTags.has(tag)) {
      candidates.push(tag);
    }
  }
  return dedupeKeepOrder(candidates)
    .filter((tag) => isUsableTag(tag))
    .slice(0, FORMAT.candidateCap);
}

module.exports = {
  translate,
  candidatesFromTagList
};
