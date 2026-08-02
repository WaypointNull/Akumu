const fs = require('fs');
const path = require('path');
const {
  REQUIRED_POSITIVE,
  REQUIRED_NEGATIVE,
  EXTRA_NEGATIVE,
  POSITIVE_FILLER,
  STYLE_BOOSTERS
} = require('../../../config/constants');
const { resolve, resolveWithRules } = require('../../tag-resolution');

const AMBIGUOUS_LOG_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'ambiguous-log.ndjson');

const KNOWN_PROMPT_TAGS = new Set([
  ...REQUIRED_POSITIVE,
  ...REQUIRED_NEGATIVE,
  ...EXTRA_NEGATIVE,
  ...POSITIVE_FILLER,
  ...STYLE_BOOSTERS
]);

function appendAmbiguousLog(logPath, entry) {
  try {
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.warn('[ambiguous] failed to write log:', error.message);
  }
}

function resolveAll(
  rawTags,
  naturalLanguage,
  { resolver = resolve, rules = resolveWithRules, logPath = AMBIGUOUS_LOG_PATH } = {}
) {
  const records = [];
  const pending = [];
  for (const original of rawTags) {
    if (KNOWN_PROMPT_TAGS.has(original)) {
      records.push({ original, tag: original, status: 'kept', action: 'kept' });
      continue;
    }
    let r;
    try {
      r = resolver(original);
    } catch (error) {
      console.warn(`[resolve] error for "${original}":`, error.message);
      r = { status: 'unknown', tag: original, candidates: [] };
    }

    if (r.status === 'exact') {
      records.push({ original, tag: r.tag, status: 'kept', action: 'kept' });
    } else if (r.status === 'alias') {
      records.push({ original, tag: r.tag, status: 'alias', action: 'alias' });
    } else if (r.status === 'retrieved') {
      records.push({
        original,
        tag: r.tag,
        status: 'retrieved',
        action: 'auto_replaced',
        confidence: r.confidence,
        margin: r.margin,
        candidates: r.candidates
      });
    } else {
      const rule = rules(original);
      if (rule) {
        records.push({
          original,
          tag: rule.tag,
          extraTags: rule.extraTags,
          status: 'rule',
          action: 'rule'
        });
        console.warn(`[rule] "${original}" -> ${[rule.tag, ...(rule.extraTags || [])].join(', ')}`);
      } else if (r.candidates && r.candidates.length) {
        const pendingIndex = pending.length;
        records.push({
          original,
          tag: original,
          status: 'ambiguous',
          action: 'ambiguous',
          candidates: r.candidates,
          pendingIndex
        });
        pending.push({ index: pendingIndex, original, candidates: r.candidates });
        const entry = {
          ts: new Date().toISOString(),
          request: naturalLanguage,
          input: original,
          candidates: r.candidates.slice(0, 10).map((c) => ({
            tag: c.tag,
            score: +c.score.toFixed(3),
            stripMatch: !!c.stripMatch
          }))
        };
        appendAmbiguousLog(logPath, entry);
        console.warn(
          `[ambiguous] "${original}" (request: "${naturalLanguage}") -> ${entry.candidates
            .slice(0, 5)
            .map((c) => `${c.tag}(${c.score})`)
            .join(', ')} ...`
        );
      } else {
        records.push({ original, tag: original, status: 'unknown', action: 'kept' });
      }
    }
  }

  return { records, pending };
}

module.exports = {
  resolveAll,
  appendAmbiguousLog,
  KNOWN_PROMPT_TAGS,
  AMBIGUOUS_LOG_PATH
};
