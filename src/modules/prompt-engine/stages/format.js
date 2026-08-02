const { dedupeKeepOrder } = require('../../../shared/list');
const { isUsableTag, isSectionLabel } = require('../../tag-resolution');
const { formatResolutionSummary, formatFinalOutput } = require('../formatter');
const { inferTagsFromText } = require('../inference');

function finalize({ records, candidates, naturalLanguage, loraInput, tagSet }) {
  const summary = formatResolutionSummary(records);
  let validatedTags = dedupeKeepOrder(
    records
      .flatMap((r) => [r.tag, ...(r.extraTags || [])])
      .filter((tag) => tagSet.has(tag))
      .filter((tag) => !isSectionLabel(tag))
      .filter((tag) => isUsableTag(tag))
  );

  if (validatedTags.length < 24) {
    validatedTags = dedupeKeepOrder([...validatedTags, ...candidates]).slice(0, 60);
  }

  const promptTags = dedupeKeepOrder([...validatedTags, ...candidates, ...inferTagsFromText(naturalLanguage)])
    .filter((tag) => isUsableTag(tag))
    .slice(0, 85);

  const formatted = formatFinalOutput({ promptTags, loraInput });

  return { summary, formatted };
}

module.exports = { finalize };
