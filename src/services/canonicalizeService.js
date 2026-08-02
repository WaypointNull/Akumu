const fs = require('fs');
const path = require('path');
const { ollamaGenerate } = require('./ollamaService');
const { resolveTag } = require('./tagListService');
const { buildConceptCandidates } = require('./tagRetrievalService');
const { buildCanonicalizeSystem, buildCanonicalizeUser, parseCanonicalizeOutput } = require('../utils/canonicalizeText');

const PHASE_C_LOG_PATH = path.join(__dirname, '..', '..', 'data', 'phase-c-log.ndjson');

const CANONICALIZE_TEMPERATURE = 0.05;
const MAX_TAGS_PER_CONCEPT = 3;
const MAX_CANDIDATE_RANK = 5;
const MAX_BATCH = 15;

function validateEmission(tag, alreadyResolvedSet, candidateTagSet) {
  const r = resolveTag(tag);
  if (r.status === 'unknown') {
    return { ok: false, reason: 'unknown' };
  }
  if (alreadyResolvedSet.has(r.tag)) {
    return { ok: false, reason: 'already_resolved' };
  }
  return { ok: true, canonical: r.tag, outOfList: !candidateTagSet.has(r.tag) };
}

function appendPhaseCLog(entry) {
  try {
    fs.appendFileSync(PHASE_C_LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.warn('[phase-c] failed to write log:', error.message);
  }
}

async function canonicalizeConcepts({ request, resolvedTags = [], concepts = [], model, maxBatch = MAX_BATCH }) {
  if (!concepts.length) return { raw: '', batches: 0, concepts: [] };
  const alreadyResolved = new Set(resolvedTags.map((t) => resolveTag(t).tag));
  const results = [];
  const batches = [];
  const totalBatches = Math.ceil(concepts.length / maxBatch);

  for (let start = 0; start < concepts.length; start += maxBatch) {
    const batch = concepts.slice(start, start + maxBatch);
    const system = buildCanonicalizeSystem();
    const user = buildCanonicalizeUser({ request, resolvedTags: [...alreadyResolved], concepts: batch });
    const raw = await ollamaGenerate(model, system, user, CANONICALIZE_TEMPERATURE);
    const parsed = parseCanonicalizeOutput(raw);

    for (const c of batch) {
      const indices = parsed.get(c.index) || [];
      const candidateSet = new Set(c.candidates.map((x) => x.tag));
      const candidateTags = c.candidates.map((x) => x.tag);
      const proposedTags = [];
      const accepted = [];
      const rejected = [];
      for (const idx of indices) {
        if (idx < 1 || idx > candidateTags.length) {
          rejected.push({ tag: `#${idx}`, reason: 'index_out_of_range' });
          continue;
        }
        if (idx > MAX_CANDIDATE_RANK) {
          rejected.push({ tag: `#${idx}`, reason: 'rank_outside_top5' });
          continue;
        }
        const t = candidateTags[idx - 1];
        proposedTags.push(t);
        if (accepted.length >= MAX_TAGS_PER_CONCEPT) {
          rejected.push({ tag: t, reason: 'cap_exceeded' });
          continue;
        }
        const v = validateEmission(t, alreadyResolved, candidateSet);
        if (!v.ok) {
          rejected.push({ tag: t, reason: v.reason });
          continue;
        }
        alreadyResolved.add(v.canonical);
        accepted.push({ tag: v.canonical, outOfList: v.outOfList });
      }
      results.push({
        index: c.index,
        original: c.original,
        candidates: c.candidates,
        proposed: proposedTags,
        proposedIndices: indices,
        accepted,
        rejected,
        status: accepted.length ? 'resolved' : 'unresolved'
      });
    }

    batches.push({ raw, results: results.slice(-batch.length) });
  }

  const logEntry = {
    ts: new Date().toISOString(),
    request: request || null,
    batches: totalBatches,
    concepts: results.map((r) => ({
      index: r.index,
      original: r.original,
      proposed: r.proposed,
      accepted: r.accepted,
      rejected: r.rejected
    }))
  };
  appendPhaseCLog(logEntry);

  for (const r of results) {
    for (const rej of r.rejected) {
      console.warn(`[phase-c] rejected "${rej.tag}" for "${r.original}": ${rej.reason}`);
    }
    for (const acc of r.accepted) {
      if (acc.outOfList) {
        console.warn(`[phase-c] out-of-list accepted "${acc.tag}" for "${r.original}"`);
      }
    }
  }

  return { batches: totalBatches, concepts: results };
}

module.exports = {
  buildConceptCandidates,
  validateEmission,
  canonicalizeConcepts,
  CANONICALIZE_TEMPERATURE,
  MAX_TAGS_PER_CONCEPT,
  MAX_CANDIDATE_RANK,
  MAX_BATCH,
  PHASE_C_LOG_PATH
};
