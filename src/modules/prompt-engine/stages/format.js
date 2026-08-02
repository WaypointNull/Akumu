const { dedupeKeepOrder } = require('../../../shared/list');
const { isUsableTag, isSectionLabel } = require('../../tag-resolution');
const { formatResolutionSummary, formatFinalOutput } = require('../formatter');
const { inferTagsFromText } = require('../inference');
const { FORMAT } = require('../../../config/constants');

function finalize({ records, candidates, naturalLanguage, loraInput, tagSet }) {
  const summary = formatResolutionSummary(records);
  let validatedTags = dedupeKeepOrder(
    records
      .flatMap((r) => [r.tag, ...(r.extraTags || [])])
      .filter((tag) => tagSet.has(tag))
      .filter((tag) => !isSectionLabel(tag))
      .filter((tag) => isUsableTag(tag))
  );

  if (validatedTags.length < FORMAT.validatedMin) {
    validatedTags = dedupeKeepOrder([...validatedTags, ...candidates]).slice(0, FORMAT.validatedCap);
  }

  const promptTags = dedupeKeepOrder([...validatedTags, ...candidates, ...inferTagsFromText(naturalLanguage)])
    .filter((tag) => isUsableTag(tag))
    .slice(0, FORMAT.promptTagCap);

  const formatted = formatFinalOutput({ promptTags, loraInput });

  return { summary, formatted };
}

module.exports = { finalize };
