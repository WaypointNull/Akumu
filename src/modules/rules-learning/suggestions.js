const fs = require('fs');
const path = require('path');
const { normalizeTag } = require('../tag-resolution');

function collect({ deps, cases, freq = new Map(), includeLogs = false }) {
  const expectedByInput = new Map(cases.map((c) => [normalizeTag(c.input), c.expected]));
  const targets = cases.filter((c) => deps.retrieval.resolve(c.input).status === 'unknown');
  const seen = new Set();
  const auto = [];
  const review = [];

  for (const c of targets) {
    const input = normalizeTag(c.input);
    if (seen.has(input)) continue;
    seen.add(input);
    const candidates = deps.retrieval.buildConceptCandidates(c.input, { limit: 20 });
    const top = candidates[0] || null;
    const entry = {
      index: 0,
      input: c.input,
      freq: freq.get(input) || 0,
      source: 'benchmark',
      expected: c.expected,
      candidates: candidates.slice(0, 10),
      candidate1: top ? top.tag : null
    };
    if (top && top.tag === c.expected) auto.push(entry);
    else review.push(entry);
  }

  if (includeLogs) {
    for (const [input, count] of freq) {
      if (seen.has(input)) continue;
      if (expectedByInput.has(input)) continue;
      seen.add(input);
      const candidates = deps.retrieval.buildConceptCandidates(input, { limit: 20 });
      review.push({
        index: 0,
        input,
        freq: count,
        source: 'log',
        expected: null,
        candidates: candidates.slice(0, 10),
        candidate1: candidates[0] ? candidates[0].tag : null
      });
    }
  }

  return { auto, review };
}

function readResolutions(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeSuggestions({ filePath, auto, review, model }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    model,
    auto: auto.map((e) => ({
      index: e.index,
      input: e.input,
      freq: e.freq,
      expected: e.expected,
      proposal: e.candidate1
    })),
    review: review.map((e) => ({
      index: e.index,
      input: e.input,
      freq: e.freq,
      source: e.source,
      expected: e.expected,
      candidate1: e.candidate1,
      candidates: e.candidates.slice(0, 10).map((c) => c.tag),
      llm: e.llm || null
    }))
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function applyAutoRules({ filePath, auto }) {
  const existing = readResolutions(filePath);
  for (const e of auto) {
    existing[normalizeTag(e.input)] = [e.candidate1];
  }
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf8');
  return auto.length;
}

function applyReviewFoundRules({ filePath, annotated, deps }) {
  const existing = readResolutions(filePath);
  let applied = 0;
  let absent = 0;
  const absentList = [];
  for (const e of annotated) {
    if (!e.expected || e.source !== 'benchmark') continue;
    if (existing[normalizeTag(e.input)]) continue;
    const cands = deps.retrieval.buildConceptCandidates(e.input, { limit: 20 });
    const idx = cands.findIndex((c) => c.tag === e.expected);
    if (idx >= 0) {
      existing[normalizeTag(e.input)] = [e.expected];
      applied++;
    } else {
      absent++;
      absentList.push({ input: e.input, expected: e.expected });
    }
  }
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf8');
  return { applied, absent, absentList };
}

module.exports = { collect, writeSuggestions, applyAutoRules, applyReviewFoundRules };
