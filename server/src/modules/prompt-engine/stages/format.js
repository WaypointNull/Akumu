const { dedupeKeepOrder } = require('../../../shared/list');
const { isUsableTag, isSectionLabel } = require('../../tag-resolution');
const { formatResolutionSummary, formatFinalOutput } = require('../formatter');
const { FORMAT } = require('../../../config/constants');

// WORKAROUND: ambiguous/unknown tags are the junk bucket — tags the LLM made up that match nothing.
// When the junk outweighs the solid content, shipping it to GLOBAL_POSITIVE just pollutes the prompt;
// it stays in the review list instead until the user approves each one.
const JUNK_STATUSES = new Set(['ambiguous', 'unknown']);

function finalize({ records, candidates, loraInput, tagSet }) {
  const summaryBase = formatResolutionSummary(records);
  const solidRecords = records.filter((r) => !JUNK_STATUSES.has(r.status));
  const junkRecords = records.filter((r) => JUNK_STATUSES.has(r.status));
  const lowContent = junkRecords.length > 0 && solidRecords.length < junkRecords.length;

  const tagFor = (r) => {
    if (r.status === 'overlong') {
      return [];
    }
    if (JUNK_STATUSES.has(r.status) && lowContent) {
      return [];
    }
    if (r.status === 'kept' || r.status === 'ambiguous' || r.status === 'unknown' || r.status === 'creative') {
      return [r.tag];
    }
    return [r.tag, ...(r.extraTags || [])].filter((tag) => tagSet.has(tag));
  };

  let validatedTags = dedupeKeepOrder(
    records
      .flatMap(tagFor)
      .filter((tag) => !isSectionLabel(tag))
      .filter((tag) => isUsableTag(tag))
  );

  // WORKAROUND: when the raw output is junk-dominated, the model's own tag suggestions are just as
  // untrustworthy as the flagged records — don't smuggle candidates back in past the low-content guard.
  const candidateSource = lowContent ? [] : candidates;

  if (validatedTags.length < FORMAT.validatedMin) {
    validatedTags = dedupeKeepOrder([...validatedTags, ...candidateSource]).slice(0, FORMAT.validatedCap);
  }

  const promptTags = dedupeKeepOrder([...validatedTags, ...candidateSource])
    .filter((tag) => isUsableTag(tag))
    .slice(0, FORMAT.promptTagCap);

  const formatted = formatFinalOutput({ promptTags, loraInput });
  const summary = lowContent
    ? `${summaryBase}\nLow content: the flagged tags were withheld from the output pending your review.`
    : summaryBase;

  return { summary, formatted, promptTags, lowContent };
}

module.exports = { finalize };
