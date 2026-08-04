const { dedupeKeepOrder } = require('../../../shared/list');
const { isUsableTag, isSectionLabel } = require('../../tag-resolution');
const { formatResolutionSummary, formatFinalOutput } = require('../formatter');
const { FORMAT } = require('../../../config/constants');

function finalize({ records, candidates, loraInput, tagSet }) {
  const summary = formatResolutionSummary(records);
  let validatedTags = dedupeKeepOrder(
    records
      .flatMap((r) => {
        if (r.status === 'kept' || r.status === 'ambiguous' || r.status === 'unknown' || r.status === 'creative') {
          return [r.tag];
        }
        return [r.tag, ...(r.extraTags || [])].filter((tag) => tagSet.has(tag));
      })
      .filter((tag) => !isSectionLabel(tag))
      .filter((tag) => isUsableTag(tag))
  );

  if (validatedTags.length < FORMAT.validatedMin) {
    validatedTags = dedupeKeepOrder([...validatedTags, ...candidates]).slice(0, FORMAT.validatedCap);
  }

  const promptTags = dedupeKeepOrder([...validatedTags, ...candidates])
    .filter((tag) => isUsableTag(tag))
    .slice(0, FORMAT.promptTagCap);

  const formatted = formatFinalOutput({ promptTags, loraInput });

  return { summary, formatted, promptTags };
}

module.exports = { finalize };
