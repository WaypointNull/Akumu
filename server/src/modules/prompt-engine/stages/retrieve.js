const fs = require('fs');
const path = require('path');
const {
  REQUIRED_POSITIVE,
  REQUIRED_NEGATIVE,
  EXTRA_NEGATIVE,
  POSITIVE_FILLER,
  STYLE_BOOSTERS
} = require('../../../config/constants');

const AMBIGUOUS_LOG_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'ambiguous-log.ndjson');

// WORKAROUND: baseline boilerplate tags must never be rewritten by retrieval, so short-circuit them to "kept" up front.
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

function resolveAll(rawTags, naturalLanguage, deps) {
  const records = [];
  const resolver = deps.retrieval.resolve;
  const decompose = deps.retrieval.decompose || (() => null);
  const logPath = deps.logPath || AMBIGUOUS_LOG_PATH;
  for (const original of rawTags) {
    if (KNOWN_PROMPT_TAGS.has(original)) {
      records.push({ original, tag: original, status: 'kept', action: 'kept' });
      continue;
    }
    // WORKAROUND: per-tag resolution and log writes must never take down the pipeline; degrade to "unknown" instead.
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
      let dec = null;
      try {
        dec = decompose(original);
      } catch (error) {
        console.warn(`[decompose] error for "${original}":`, error.message);
      }
      if (dec && dec.full) {
        console.warn(`[decompose] "${original}" -> ${dec.parts.join(', ')}`);
        records.push({
          original,
          tag: dec.parts[0],
          extraTags: dec.parts.slice(1),
          status: 'decomposed',
          action: 'decomposed'
        });
      } else if (r.candidates && r.candidates.length) {
        records.push({
          original,
          tag: original,
          status: 'ambiguous',
          action: 'ambiguous',
          candidates: r.candidates,
          decomposed: dec ? dec.parts : []
        });
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
        records.push({
          original,
          tag: original,
          status: 'unknown',
          action: 'kept',
          decomposed: dec ? dec.parts : []
        });
      }
    }
  }

  const disambiguate = deps.retrieval.disambiguateAlias;
  if (disambiguate) {
    const contextTags = records.map((r) => r.tag);
    for (const record of records) {
      if (record.status !== 'alias') continue;
      const requalified = disambiguate({ status: 'alias', tag: record.tag }, contextTags);
      if (requalified.status === 'qualified') {
        record.tag = requalified.tag;
        record.status = 'qualified';
        record.action = 'requalified';
      }
    }
  }

  return { records };
}

module.exports = {
  resolveAll,
  appendAmbiguousLog,
  KNOWN_PROMPT_TAGS,
  AMBIGUOUS_LOG_PATH
};
