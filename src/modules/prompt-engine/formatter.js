const { REQUIRED_POSITIVE, REQUIRED_NEGATIVE, EXTRA_NEGATIVE, POSITIVE_FILLER } = require('../../config/constants');
const { dedupeKeepOrder } = require('../../shared/list');
const { isUsableTag } = require('../tag-resolution');

function formatTagBlock(tags, chunkSize = 14) {
  const lines = [];
  for (let index = 0; index < tags.length; index += chunkSize) {
    lines.push(tags.slice(index, index + chunkSize).join(', '));
  }
  return lines.join('\n');
}

function formatResolutionSummary(records) {
  const counts = {};
  for (const r of records) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }
  const lines = [`Resolved ${records.length} tags (deterministic).`];
  if (counts.kept) lines.push(`${counts.kept} kept (exact match)`);
  if (counts.alias) lines.push(`${counts.alias} alias -> canonical`);
  if (counts.retrieved) lines.push(`${counts.retrieved} auto-replaced (retrieval)`);
  if (counts.rule) lines.push(`${counts.rule} resolved by curated rules`);
  if (counts.canonicalized) lines.push(`${counts.canonicalized} canonicalized (Phase C)`);
  if (counts.ambiguous) lines.push(`${counts.ambiguous} ambiguous (kept original, logged)`);
  if (counts.unknown) lines.push(`${counts.unknown} unknown (kept original)`);

  const replaced = records.filter(
    (r) => r.status === 'alias' || r.status === 'retrieved' || r.status === 'rule' || r.status === 'canonicalized'
  );
  if (replaced.length) {
    lines.push(
      'Replacements: ' +
        replaced.map((r) => `${r.original} -> ${[r.tag, ...(r.extraTags || [])].join(', ')}`).join('; ')
    );
  }
  const amb = records.filter((r) => r.status === 'ambiguous');
  if (amb.length) {
    lines.push('Ambiguous: ' + amb.map((r) => r.original).join(', '));
  }
  return lines.join('\n');
}

function buildPositiveBoilerplate() {
  return dedupeKeepOrder([...REQUIRED_POSITIVE, ...POSITIVE_FILLER]);
}

function buildNegativeBoilerplate() {
  return dedupeKeepOrder([...REQUIRED_NEGATIVE, ...EXTRA_NEGATIVE]);
}

function formatFinalOutput({ promptTags, loraInput, cap = 85 }) {
  const positiveBoilerplate = buildPositiveBoilerplate();
  const negativeBoilerplate = buildNegativeBoilerplate();

  const contentTags = dedupeKeepOrder(promptTags || [])
    .filter((tag) => isUsableTag(tag))
    .filter((tag) => !positiveBoilerplate.includes(tag))
    .slice(0, cap);

  const positiveTags = dedupeKeepOrder([...positiveBoilerplate, ...contentTags]);
  const boilerplatePositiveText = formatTagBlock(positiveBoilerplate);
  const promptText = formatTagBlock(contentTags);
  const loraTriggers = (loraInput || '').trim();

  const positiveBlocks = [boilerplatePositiveText, promptText];
  if (loraTriggers) {
    positiveBlocks.push(loraTriggers);
  }
  const globalPositiveText = positiveBlocks.join('\n\n');
  const globalNegativeText = formatTagBlock(negativeBoilerplate);

  return {
    positiveTags,
    negativeTags: negativeBoilerplate,
    globalPositiveText,
    globalNegativeText,
    finalText: `Global Positive:\n${globalPositiveText}\n\nGlobal Negative:\n${globalNegativeText}`
  };
}

function mergeChannelLoras(channelLoraTags, channelPromptTags) {
  return dedupeKeepOrder([...(channelLoraTags || []), ...(channelPromptTags || [])]);
}

module.exports = {
  formatTagBlock,
  formatResolutionSummary,
  buildPositiveBoilerplate,
  buildNegativeBoilerplate,
  formatFinalOutput,
  mergeChannelLoras
};
