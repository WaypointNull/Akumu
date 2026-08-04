const fs = require('fs');
const path = require('path');
const {
  REQUIRED_POSITIVE,
  REQUIRED_NEGATIVE,
  EXTRA_NEGATIVE,
  POSITIVE_FILLER,
  STYLE_BOOSTERS,
  RETRIEVAL,
  SANITY,
  DECOMPOSE_NOISE
} = require('../../../config/constants');

// Desktop builds run from a read-only install dir, so the log folder can be redirected via env.
const AMBIGUOUS_LOG_PATH = process.env.AKUMU_DATA_DIR
  ? path.join(process.env.AKUMU_DATA_DIR, 'ambiguous-log.ndjson')
  : path.join(__dirname, '..', '..', '..', '..', '..', 'data', 'ambiguous-log.ndjson');

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
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.warn('[ambiguous] failed to write log:', error.message);
  }
}

// WORKAROUND: LLMs pad weak or empty requests by repeating a stem with numeric suffixes
// ("please_ignore_1" ... "please_ignore_20"). Real numbered tags ("figure_17") resolve in the DB,
// so only collapse runs of numbered variants where neither the base nor any variant is a known tag.
function collapseNumberedDuplicates(rawTags, isKnown) {
  const groups = new Map();
  for (const tag of rawTags) {
    const match = /^(.+)_(\d{1,3})$/.exec(tag);
    if (!match || isKnown(tag)) continue;
    const base = match[1];
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(tag);
  }
  const drop = new Set();
  for (const [base, variants] of groups) {
    if (variants.length >= 3 && !isKnown(base) && variants.every((tag) => !isKnown(tag))) {
      variants.slice(1).forEach((tag) => drop.add(tag));
    }
  }
  return rawTags.filter((tag) => !drop.has(tag));
}

function buildKnownCheck(deps) {
  const repo = deps.repository;
  if (!repo || typeof repo.getTagSet !== 'function') return () => false;
  const tagSet = repo.getTagSet();
  const aliasMap = typeof repo.getAliasMap === 'function' ? repo.getAliasMap() : new Map();
  return (tag) => tagSet.has(tag) || aliasMap.has(tag);
}

function resolveAll(rawTags, naturalLanguage, deps, mode = 'strict') {
  const records = [];
  const resolver = deps.retrieval.resolve;
  const decompose = deps.retrieval.decompose || (() => null);
  const logPath = deps.logPath || AMBIGUOUS_LOG_PATH;
  const creative = mode === 'creative';
  const collapsed = collapseNumberedDuplicates(rawTags, buildKnownCheck(deps));
  for (const original of collapsed) {
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
    // WORKAROUND: LLM runaway loops invent mega-compounds that are never in the DB. Real series titles
    // can exceed the underscore budget but exact-match, so only non-exact overlong tags get flagged.
    const overlong = (original.match(/_/g) || []).length > SANITY.maxUnderscores;
    if (overlong && r.status !== 'exact' && r.status !== 'alias') {
      let dec = null;
      try {
        dec = decompose(original);
      } catch (error) {
        console.warn(`[decompose] error for "${original}":`, error.message);
      }
      records.push({
        original,
        tag: original,
        status: 'overlong',
        action: 'review',
        candidates: r.candidates || [],
        decomposed: dec ? dec.parts : []
      });
      console.warn(
        `[overlong] "${original}" (${(original.match(/_/g) || []).length} underscores, not in DB) -> review`
      );
      continue;
    }
    if (r.status === 'exact') {
      records.push({ original, tag: r.tag, status: 'kept', action: 'kept' });
    } else if (r.status === 'alias') {
      records.push({ original, tag: r.tag, status: 'alias', action: 'alias' });
    } else if (r.status === 'retrieved') {
      if (creative) {
        // WORKAROUND: in creative mode the AI may invent semantically-correct tags ("red_flannel_jacket")
        // that aren't in the DB; never silently rewrite them — surface the originals to review instead.
        let dec = null;
        try {
          dec = decompose(original);
        } catch (error) {
          console.warn(`[decompose] error for "${original}":`, error.message);
        }
        records.push({
          original,
          tag: original,
          status: 'creative',
          action: 'review',
          candidates: r.candidates || [],
          decomposed: dec ? dec.parts : []
        });
      } else {
        records.push({
          original,
          tag: r.tag,
          status: 'retrieved',
          action: 'auto_replaced',
          confidence: r.confidence,
          margin: r.margin,
          candidates: r.candidates
        });
      }
    } else {
      let dec = null;
      try {
        dec = decompose(original);
      } catch (error) {
        console.warn(`[decompose] error for "${original}":`, error.message);
      }
      const usableDecomposition = dec && dec.full && !dec.parts.some((part) => DECOMPOSE_NOISE.has(part));
      if (usableDecomposition) {
        if (creative) {
          // WORKAROUND: ditto — a fully-decomposable tag is still a legit AI invention; let the user
          // keep the compound or swap to the known parts instead of forcing the swap.
          records.push({
            original,
            tag: original,
            status: 'creative',
            action: 'review',
            candidates: (r.candidates || []).length ? r.candidates : dec.parts.map((tag) => ({ tag, score: 1 })),
            decomposed: dec.parts
          });
        } else {
          console.warn(`[decompose] "${original}" -> ${dec.parts.join(', ')}`);
          records.push({
            original,
            tag: dec.parts[0],
            extraTags: dec.parts.slice(1),
            status: 'decomposed',
            action: 'decomposed'
          });
        }
      } else if (dec && dec.full) {
        // WORKAROUND: decomposition parts are too vague to stand alone, so don't auto-accept — surface
        // the compound to review with its parts attached.
        console.warn(`[decompose] "${original}" -> ${dec.parts.join(', ')} (noise parts, sent to review)`);
        if (r.candidates && r.candidates.length) {
          records.push({
            original,
            tag: original,
            status: 'ambiguous',
            action: 'ambiguous',
            candidates: r.candidates,
            decomposed: dec.parts
          });
        } else {
          records.push({
            original,
            tag: original,
            status: 'unknown',
            action: 'kept',
            decomposed: dec.parts
          });
        }
      } else if (r.candidates && r.candidates.length) {
        records.push({
          original,
          tag: original,
          status: 'ambiguous',
          action: 'ambiguous',
          candidates: r.candidates,
          decomposed: dec ? dec.parts : []
        });
        // WORKAROUND: candidates below logFloor are noise (LLM padding scores ~0.42 against junk);
        // an ambiguous entry whose best candidate can't clear the bar adds no signal, so skip the log.
        const topCandidate = r.candidates[0];
        if (!topCandidate || topCandidate.score < RETRIEVAL.logFloor) continue;
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
  collapseNumberedDuplicates,
  KNOWN_PROMPT_TAGS,
  AMBIGUOUS_LOG_PATH
};
