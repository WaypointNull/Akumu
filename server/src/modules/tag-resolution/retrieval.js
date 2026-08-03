const { RETRIEVAL, TAG_CATEGORY_COPYRIGHT } = require('../../config/constants');
const { normalizeTag } = require('./parser');
const { trigrams, tokenize, damerauLevenshtein } = require('./metrics');

function createRetrievalIndex({ repository }) {
  let index = null;

  function buildIndex() {
    const tagSet = repository.getTagSet();
    const tags = [...tagSet];
    const tagId = new Map();
    tags.forEach((tag, id) => tagId.set(tag, id));

    const trigramIndex = new Map();
    const trigramCounts = new Int32Array(tags.length);
    const enriched = new Array(tags.length);

    for (let id = 0; id < tags.length; id++) {
      const tag = tags[id];
      const tagTrigrams = trigrams(tag);
      trigramCounts[id] = tagTrigrams.size;
      for (const tg of tagTrigrams) {
        const postings = trigramIndex.get(tg);
        if (postings) postings.push(id);
        else trigramIndex.set(tg, [id]);
      }
      const aliases = repository.getCanonicalAliases(tag);
      enriched[id] = aliases.length ? `${tag} ${aliases.join(' ')}` : tag;
    }

    const df = new Map();
    let totalLength = 0;
    for (let id = 0; id < tags.length; id++) {
      const tokens = tokenize(enriched[id]);
      totalLength += tokens.length;
      for (const term of new Set(tokens)) {
        df.set(term, (df.get(term) || 0) + 1);
      }
    }

    index = {
      tags,
      tagId,
      trigramIndex,
      trigramCounts,
      enriched,
      df,
      avgLen: totalLength / Math.max(1, tags.length),
      docCount: tags.length
    };

    return {
      tags: tags.length,
      trigrams: trigramIndex.size,
      terms: df.size
    };
  }

  function ensureIndex() {
    if (!index) buildIndex();
  }

  function bm25Score(queryTokens, candidateId) {
    const { enriched, df, avgLen, docCount } = index;
    const tokens = tokenize(enriched[candidateId]);
    const len = tokens.length;
    const tf = new Map();
    for (const term of tokens) tf.set(term, (tf.get(term) || 0) + 1);

    let score = 0;
    for (const term of queryTokens) {
      const count = tf.get(term);
      if (!count) continue;
      const docFreq = df.get(term) || 0;
      const idf = Math.log(1 + (docCount - docFreq + 0.5) / (docFreq + 0.5));
      const denom = count + RETRIEVAL.bm25.k1 * (1 - RETRIEVAL.bm25.b + (RETRIEVAL.bm25.b * len) / Math.max(1, avgLen));
      score += (idf * count * (RETRIEVAL.bm25.k1 + 1)) / denom;
    }
    return score;
  }

  function retrieve(query, { limit = RETRIEVAL.resultLimit } = {}) {
    ensureIndex();
    const key = normalizeTag(query);
    if (!key) return [];

    const queryTrigrams = [...trigrams(key)];
    if (queryTrigrams.length === 0) return [];

    const overlap = new Map();
    for (const tg of queryTrigrams) {
      const postings = index.trigramIndex.get(tg);
      if (!postings) continue;
      for (const id of postings) overlap.set(id, (overlap.get(id) || 0) + 1);
    }

    const pool = [];
    for (const [id, count] of overlap) {
      const dice = (2 * count) / (queryTrigrams.length + index.trigramCounts[id]);
      if (dice < RETRIEVAL.poolFloor) continue;
      pool.push({ id, dice });
    }
    pool.sort((a, b) => b.dice - a.dice);

    const top = pool.slice(0, RETRIEVAL.poolLimit);
    const queryTokens = tokenize(key);
    // WORKAROUND: tags differing only by separators ("silver_hair" / "silverhair" / "silver-hair") should match each other.
    const keyStrip = key.replace(/[^a-z0-9]/g, '');
    let maxBm25 = 0;
    const scored = top.map(({ id, dice }) => {
      const tag = index.tags[id];
      const dl = damerauLevenshtein(key, tag);
      const dlSim = 1 - dl / Math.max(key.length, tag.length);
      const bm25 = queryTokens.length ? bm25Score(queryTokens, id) : 0;
      if (bm25 > maxBm25) maxBm25 = bm25;
      const stripMatch = keyStrip.length > 0 && tag.replace(/[^a-z0-9]/g, '') === keyStrip;
      return { tag, dice, dlSim, bm25, stripMatch };
    });

    for (const s of scored) {
      const bm25Norm = maxBm25 > 0 ? s.bm25 / maxBm25 : 0;
      s.score =
        RETRIEVAL.weights.trigram * s.dice +
        RETRIEVAL.weights.damerau * s.dlSim +
        RETRIEVAL.weights.bm25 * bm25Norm +
        (s.stripMatch ? RETRIEVAL.stripBonus : 0);
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ tag, score, dice, dlSim, bm25, stripMatch }) => ({
      tag,
      score,
      stripMatch,
      components: { trigram: dice, damerau: dlSim, bm25 }
    }));
  }

  function buildConceptCandidates(concept, { limit = 20 } = {}) {
    const key = normalizeTag(concept);
    if (!key) return [];
    const byTag = new Map();
    const absorb = (list) => {
      for (const c of list) {
        if (!byTag.has(c.tag)) byTag.set(c.tag, c);
      }
    };
    absorb(retrieve(key, { limit }));
    // WORKAROUND: split compound concepts on "_" and retrieve each part so suggestions surface useful single-part candidates.
    if (key.includes('_')) {
      const parts = key.split('_').filter(Boolean);
      for (const part of parts) {
        absorb(retrieve(part, { limit: Math.max(5, Math.ceil((limit * 1.5) / parts.length)) }));
      }
    }
    const out = [...byTag.values()].sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  function disambiguateAlias(aliasResult, contextTags) {
    if (!aliasResult || aliasResult.status !== 'alias') return aliasResult;
    const match = /^(.*?)_\(([^)]+)\)$/.exec(aliasResult.tag);
    if (!match) return aliasResult;
    const variants = repository.getQualifiedVariants(match[1]);
    if (variants.length < 2) return aliasResult;
    const context = new Set(contextTags.map(normalizeTag));
    let best = null;
    for (const variant of variants) {
      if (variant.tag === aliasResult.tag) continue;
      if (!context.has(variant.qualifier)) continue;
      const qualifierMeta = repository.getTagMeta(variant.qualifier);
      if (!qualifierMeta || Number(qualifierMeta.category) !== TAG_CATEGORY_COPYRIGHT) continue;
      if (!best || variant.postCount > best.postCount) best = variant;
    }
    if (!best) return aliasResult;
    return { status: 'qualified', tag: best.tag };
  }

  function resolve(query) {
    const pre = repository.resolveTag(query);
    if (pre.status !== 'unknown') return pre;

    const candidates = retrieve(query);
    if (candidates.length === 0) {
      return { status: 'unknown', tag: pre.tag, candidates: [] };
    }

    const best = candidates[0];
    const second = candidates[1];
    const ratio = second ? best.score / second.score : Infinity;
    const margin = second ? best.score - second.score : best.score;

    // WORKAROUND: never auto-replace a short tag with a longer compound extension ("red" -> "red_eyes")
    // unless the extension is the clear top pick; otherwise fuzzy retrieval over-matches short tags.
    const hasPrefixExtension = candidates.some((c) => c.tag.length > pre.tag.length && c.tag.startsWith(pre.tag));
    const topIsPrefixExtension = best.tag.length > pre.tag.length && best.tag.startsWith(pre.tag);

    if (
      best.score >= RETRIEVAL.gateFloor &&
      ratio >= RETRIEVAL.gateGapRatio &&
      (!hasPrefixExtension || topIsPrefixExtension)
    ) {
      return {
        status: 'retrieved',
        tag: best.tag,
        confidence: best.score,
        margin,
        candidates
      };
    }

    return { status: 'unknown', tag: pre.tag, candidates };
  }

  function decompose(query) {
    const key = normalizeTag(query);
    if (!key) return null;
    const parts = key.split('_').filter(Boolean);
    if (parts.length < 2) return null;
    const resolved = parts.map((p) => repository.resolveTag(p));
    const exactParts = resolved.filter((r) => r.status === 'exact').map((r) => r.tag);
    if (exactParts.length === 0) return null;
    return { full: exactParts.length === parts.length, parts: exactParts };
  }

  return {
    buildIndex,
    retrieve,
    resolve,
    disambiguateAlias,
    decompose,
    buildConceptCandidates,
    isBuilt: () => !!index
  };
}

module.exports = { createRetrievalIndex };
