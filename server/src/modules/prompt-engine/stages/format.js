const { dedupeKeepOrder } = require('../../../shared/list');
const { isUsableTag, isSectionLabel } = require('../../tag-resolution');
const { formatResolutionSummary, formatFinalOutput } = require('../formatter');
const { FORMAT } = require('../../../config/constants');

// WORKAROUND: ambiguous/unknown tags are the junk bucket — tags the LLM made up that match nothing.
// When the junk outweighs the solid content, shipping it to GLOBAL_POSITIVE just pollutes the prompt;
// it stays in the review list instead until the user approves each one.
const JUNK_STATUSES = new Set(['ambiguous', 'unknown']);

// WORKAROUND: content words from the input are what a faithful translation must cover. When the LLM
// pads or hallucinates, the resolved tags barely overlap the input, so the overlap fraction separates
// "Test tag, please ignore" -> 20 invented tags (0% anchored) from a real scene (50-100% anchored).
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'in',
  'on',
  'at',
  'of',
  'to',
  'with',
  'and',
  'for',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'her',
  'his',
  'its',
  'their',
  'your',
  'my',
  'this',
  'that',
  'these',
  'those',
  'as',
  'or',
  'but',
  'not',
  'no',
  'it',
  'into',
  'before',
  'over',
  'under',
  'during'
]);

function contentWordsOf(naturalLanguage) {
  return (naturalLanguage || '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .split(/ +/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function recordAnchored(record, contentWords) {
  const text = [record.tag, ...(record.extraTags || [])].join(' ').toLowerCase();
  return contentWords.some((w) => text.includes(w));
}

// WORKAROUND: if few of the resolved tags contain any word from the description, the model hallucinated
// a scene whose tags happen to resolve — the junk must not ship, but anchored records (if any) stay.
function isHallucinated(records, contentWords) {
  if (contentWords.length === 0) return false;
  const solid = records.filter((r) => !JUNK_STATUSES.has(r.status));
  if (solid.length === 0) return false;
  const anchored = solid.filter((r) => recordAnchored(r, contentWords)).length;
  return anchored / solid.length < 0.3;
}

function finalize({ records, candidates, loraInput, tagSet, naturalLanguage = '' }) {
  const summaryBase = formatResolutionSummary(records);
  const contentWords = contentWordsOf(naturalLanguage);
  const solidRecords = records.filter((r) => !JUNK_STATUSES.has(r.status));
  const junkRecords = records.filter((r) => JUNK_STATUSES.has(r.status));
  const contentLow = junkRecords.length > 0 && solidRecords.length < junkRecords.length;
  const hallucinated = isHallucinated(records, contentWords);
  const lowContent = contentLow || hallucinated;

  const tagFor = (r) => {
    if (r.status === 'overlong') {
      return [];
    }
    if (JUNK_STATUSES.has(r.status) && lowContent) {
      return [];
    }
    if (hallucinated && !recordAnchored(r, contentWords)) {
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
