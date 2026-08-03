const { buildPass1System, buildPass1Prompt } = require('../templates');
const { dedupeKeepOrder } = require('../../../shared/list');
const { splitTags, isSectionLabel, isUsableTag } = require('../../tag-resolution');
const { FORMAT } = require('../../../config/constants');

async function translate(naturalLanguage, { model }, deps) {
  const raw = await deps.llm.ollamaGenerate(model, buildPass1System(), buildPass1Prompt(naturalLanguage), 0.15);
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
