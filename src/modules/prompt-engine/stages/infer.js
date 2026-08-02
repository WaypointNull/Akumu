const { buildPass1System, buildPass1Prompt } = require('../templates');
const { inferTagsFromText } = require('../inference');
const { dedupeKeepOrder } = require('../../../shared/list');
const { splitTags, isSectionLabel, isUsableTag } = require('../../tag-resolution');

async function translate(naturalLanguage, { model }, deps) {
  const raw = await deps.llm.ollamaGenerate(model, buildPass1System(), buildPass1Prompt(naturalLanguage), 0.15);
  const tags = splitTags(raw).filter((tag) => !isSectionLabel(tag));
  return { raw, tags };
}

function candidatesFromTagList(rawTags, naturalLanguage, allowedTags) {
  const candidates = [];
  for (const tag of rawTags) {
    if (allowedTags.has(tag)) {
      candidates.push(tag);
    }
  }

  const inferred = inferTagsFromText(naturalLanguage).filter((tag) => allowedTags.has(tag));
  return dedupeKeepOrder([...candidates, ...inferred])
    .filter((tag) => isUsableTag(tag))
    .slice(0, 120);
}

module.exports = {
  translate,
  candidatesFromTagList
};
