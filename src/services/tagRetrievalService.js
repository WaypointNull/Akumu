const { RETRIEVAL } = require('../config/constants');
const { normalizeTag } = require('../utils/tagUtils');
const { resolveTag, getTagSet, getCanonicalAliases } = require('./tagListService');

let index = null;

function trigrams(str) {
  const out = new Set();
  if (str.length < 3) {
    if (str.length > 0) out.add(str);
    return out;
  }
  for (let i = 0; i <= str.length - 3; i++) {
    out.add(str.slice(i, i + 3));
  }
  return out;
}

function tokenize(text) {
  return (text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function damerauLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev2 = new Array(n + 1);
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prev2[j - 2] + 1);
      }
    }
    const swap = prev2;
    prev2 = prev;
    prev = curr;
    curr = swap;
  }
  return prev[n];
}

function buildIndex() {
  const tagSet = getTagSet();
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
    const aliases = getCanonicalAliases(tag);
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
  if (key.includes('_')) {
    const parts = key.split('_').filter(Boolean);
    for (const part of parts) {
      absorb(retrieve(part, { limit: Math.max(5, Math.ceil((limit * 1.5) / parts.length)) }));
    }
  }
  const out = [...byTag.values()].sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function resolve(query) {
  const pre = resolveTag(query);
  if (pre.status !== 'unknown') return pre;

  const candidates = retrieve(query);
  if (candidates.length === 0) {
    return { status: 'unknown', tag: pre.tag, candidates: [] };
  }

  const best = candidates[0];
  const second = candidates[1];
  const ratio = second ? best.score / second.score : Infinity;
  const margin = second ? best.score - second.score : best.score;

  const hasPrefixExtension = candidates.some(
    (c) => c.tag.length > pre.tag.length && c.tag.startsWith(pre.tag)
  );
  const topIsPrefixExtension =
    best.tag.length > pre.tag.length && best.tag.startsWith(pre.tag);

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

module.exports = {
  buildIndex,
  retrieve,
  resolve,
  buildConceptCandidates
};
