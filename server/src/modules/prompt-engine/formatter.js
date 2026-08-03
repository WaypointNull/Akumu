const {
  REQUIRED_POSITIVE,
  REQUIRED_NEGATIVE,
  EXTRA_NEGATIVE,
  POSITIVE_FILLER,
  FORMAT
} = require('../../config/constants');
const { dedupeKeepOrder } = require('../../shared/list');
const { isUsableTag } = require('../tag-resolution');

// WORKAROUND: chunk tags into short lines — image-generation prompt boxes (and text encoders) choke on
// one giant single-line prompt.
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
  if (counts.decomposed) lines.push(`${counts.decomposed} decomposed into known tags`);
  if (counts.ambiguous) lines.push(`${counts.ambiguous} ambiguous (kept original, logged)`);
  if (counts.unknown) lines.push(`${counts.unknown} unknown (kept original)`);

  const replaced = records.filter((r) => r.status === 'alias' || r.status === 'retrieved' || r.status === 'decomposed');
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

function formatFinalOutput({ promptTags, loraInput, cap = FORMAT.promptTagCap }) {
  const positiveBoilerplate = buildPositiveBoilerplate();
  const negativeBoilerplate = buildNegativeBoilerplate();

  // WORKAROUND: drop content tags that are already in the boilerplate (no duplicates) and cap the prompt
  // length so it stays under text-encoder token limits.
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

function formatPass3Breakdown({ promptTags, loraInput, cap = FORMAT.promptTagCap }) {
  const positiveBoilerplate = buildPositiveBoilerplate();
  const contentTags = dedupeKeepOrder(promptTags || [])
    .filter((tag) => isUsableTag(tag))
    .filter((tag) => !positiveBoilerplate.includes(tag))
    .slice(0, cap);
  const loraTriggers = (loraInput || '').trim();

  const lines = [
    'Format:',
    '  GLOBAL_POSITIVE = [Boilerplate] [LoRA Tags] [Descriptor tags]',
    '  GLOBAL_NEGATIVE = [Negative boilerplate]',
    '',
    'Boilerplate (auto-added):',
    `  Quality: ${REQUIRED_POSITIVE.join(', ')}`,
    `  Style: ${POSITIVE_FILLER.join(', ')}`,
    `  Negative: ${[...REQUIRED_NEGATIVE, ...EXTRA_NEGATIVE].join(', ')}`,
    '',
    '[LoRA Tags]',
    loraTriggers || '(none)',
    '',
    '[Descriptor tags]',
    contentTags.length ? formatTagBlock(contentTags) : '(none)'
  ];
  return lines.join('\n');
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
  formatPass3Breakdown,
  mergeChannelLoras
};
