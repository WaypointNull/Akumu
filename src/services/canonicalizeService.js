const fs = require('fs');
const path = require('path');
const { ollamaGenerate } = require('./ollamaService');
const { resolveTag } = require('./tagListService');
const { buildConceptCandidates } = require('./tagRetrievalService');

const PHASE_C_LOG_PATH = path.join(__dirname, '..', '..', 'data', 'phase-c-log.ndjson');

const CANONICALIZE_TEMPERATURE = 0.05;
const MAX_TAGS_PER_CONCEPT = 3;
const MAX_CANDIDATE_RANK = 5;
const MAX_BATCH = 15;

function buildCanonicalizeSystem() {
  return [
    'You pick which Danbooru tags best express an image concept.',
    'Each pending concept line is: N. concept -> 1: candidate, 2: candidate, ...',
    'N is the concept number (the number before the dot). Candidates are numbered 1, 2, ... sorted by retrieval relevance (strongest match first).',
    'For each concept, output exactly one line:',
    'N: candidate numbers you choose',
    'or',
    'N: SKIP',
    'using the same N (the number before the dot).',
    'Example:',
    '  3. fluffy_cat -> 1: cat  2: fluffy  3: cat_ears  4: white_cat',
    'Output:',
    '  3: 2, 3',
    'Rules:',
    '- Never output tag text. Output only candidate numbers.',
    '- Prefer lower candidate numbers: they are stronger retrieval matches.',
    '- Select at most 3 candidate numbers per concept; prefer 1 or 2.',
    '- Do not select candidates that already appear in the already-canonical list.',
    '- Emit SKIP if no candidate confidently expresses the concept.',
    'No prose or explanations.'
  ].join(' ');
}

function buildCanonicalizeUser({ request, resolvedTags, concepts }) {
  const lines = [];
  if (request) lines.push(`Original request: ${request}`);
  if (resolvedTags && resolvedTags.length) {
    lines.push(`Already-canonical tags (do not repeat): ${resolvedTags.join(', ')}`);
  }
  lines.push('Pending concepts to canonicalize:');
  for (const c of concepts) {
    const cands = c.candidates.map((x, i) => `${i + 1}: ${x.tag}`).join('  ');
    lines.push(`${c.index}. ${c.original} -> ${cands}`);
  }
  return lines.join('\n');
}

function parseCanonicalizeOutput(raw) {
  const out = new Map();
  for (const line of String(raw || '').split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,3})\s*[:.\-]\s*(.+)$/i);
    if (!m) continue;
    const index = parseInt(m[1], 10);
    const content = m[2].trim();
    if (/^skip$/i.test(content)) {
      out.set(index, []);
      continue;
    }
    if (!/^\d+(\s*,\s*\d+)*$/.test(content)) continue;
    out.set(index, content.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1));
  }
  return out;
}

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
  buildCanonicalizeSystem,
  parseCanonicalizeOutput,
  validateEmission,
  canonicalizeConcepts,
  CANONICALIZE_TEMPERATURE,
  MAX_TAGS_PER_CONCEPT,
  MAX_CANDIDATE_RANK,
  MAX_BATCH,
  PHASE_C_LOG_PATH
};
