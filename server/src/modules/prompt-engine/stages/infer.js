const { buildPass1System, buildPass1Prompt } = require('../templates');
const { dedupeKeepOrder } = require('../../../shared/list');
const { splitTags, isSectionLabel, isUsableTag } = require('../../tag-resolution');
const { FORMAT } = require('../../../config/constants');

// WORKAROUND: mode must never touch the LLM (same prompt, same temperature); creative mode is a
// validator-side decision only, so the translate stage is deliberately mode-agnostic.
const TRANSLATE_TEMPERATURE = 0.15;

function loraTriggerPhrases(loraInput) {
  return (loraInput || '')
    .trim()
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function canonicalize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// WORKAROUND: qwen echoes the LoRA trigger list (fed as context) back into the tag list. The formatter
// already appends the trigger list verbatim, so an echoed descriptor tag is pure duplication — the strip
// below drops it. A tag is an echo when it equals a trigger phrase, or contains a whole multi-word phrase.
function isLoraEcho(tag, loraInput) {
  const canonicalTag = canonicalize(tag);
  return loraTriggerPhrases(loraInput).some((phrase) => {
    const canonicalPhrase = canonicalize(phrase);
    return (
      canonicalPhrase.length > 0 &&
      (canonicalTag === canonicalPhrase || (canonicalPhrase.includes(' ') && canonicalTag.includes(canonicalPhrase)))
    );
  });
}

function stripLoraEchoes(tags, loraInput) {
  if (!loraInput || !loraInput.trim()) return tags;
  return tags.filter((tag) => !isLoraEcho(tag, loraInput));
}

async function translate(naturalLanguage, { model, loraInput = '' }, deps) {
  const raw = await deps.llm.ollamaGenerate(
    model,
    buildPass1System(),
    buildPass1Prompt(naturalLanguage, loraInput),
    TRANSLATE_TEMPERATURE
  );
  // WORKAROUND: the LLM tends to emit section headers ("Positive:", "Quality:") instead of pure tags; strip them.
  const tags = stripLoraEchoes(
    splitTags(raw).filter((tag) => !isSectionLabel(tag)),
    loraInput
  );
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
  candidatesFromTagList,
  loraTriggerPhrases,
  isLoraEcho,
  stripLoraEchoes
};
