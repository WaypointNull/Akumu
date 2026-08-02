const fs = require('fs');
const path = require('path');
const {
  ensureTagList,
  buildIndex,
  resolve,
  buildConceptCandidates,
  normalizeTag,
  RESOLUTIONS_PATH
} = require('../src/modules/tag-resolution');
const { ollamaGenerate } = require('../src/modules/llm');
const { loadCases } = require('../src/modules/benchmark');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SUGGESTIONS_FILE = path.join(DATA_DIR, 'rule-suggestions.json');
const AMBIGUOUS_LOG = path.join(DATA_DIR, 'ambiguous-log.ndjson');
const PHASE_C_LOG = path.join(DATA_DIR, 'phase-c-log.ndjson');

const ANNOTATE_MODEL = process.env.ANNOTATE_MODEL || 'qwen2.5:7b';
const BATCH = 15;

function loadLogInputs() {
  const tally = new Map();
  for (const f of [AMBIGUOUS_LOG, PHASE_C_LOG]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').trim().split(/\r?\n/).filter(Boolean)) {
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      const inputs = e.concepts ? e.concepts.map((c) => c.original) : [e.input];
      for (const i of inputs) {
        const key = normalizeTag(i);
        if (!key) continue;
        tally.set(key, (tally.get(key) || 0) + 1);
      }
    }
  }
  return tally;
}

function buildReviewSystem() {
  return [
    'You are an offline tag-curation assistant for the Danbooru vocabulary.',
    'Each line is: INDEX. input -> 1: candidate, 2: candidate, ...',
    'The input is an unresolved or invented tag. Recommend the best existing Danbooru tag(s) that express the same concept, or SKIP if none fit.',
    'For each input line, reply exactly one line that STARTS with the same INDEX number (e.g. if the input line starts with "3.", your reply line starts with "3:").',
    'Example input:',
    '0. kashick -> 1: kashi-k, 2: kashi, 3: kashia',
    'Example reply:',
    '0: kashi-k | exact typo',
    'Never invent tags; only use candidate tags or well-known real Danbooru tags.',
    'Prefer the lowest-numbered candidates (strongest retrieval matches).',
    'Use at most 2 tags per input.',
    'No other text.'
  ].join(' ');
}

function parseAnnotations(raw) {
  const out = new Map();
  for (const line of String(raw || '').split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,3})\s*[:.-]\s*(.+)$/i);
    if (!m) continue;
    const index = parseInt(m[1], 10);
    const content = m[2];
    const reasonMatch = content.match(/^(.+?)\s*\|\s*(.+)$/);
    const body = reasonMatch ? reasonMatch[1].trim() : content.trim();
    const reason = reasonMatch ? reasonMatch[2].trim() : '';
    if (/^skip$/i.test(body)) {
      out.set(index, { tags: [], reason });
      continue;
    }
    const tags = body
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => /^[a-z0-9_()'-]+$/.test(t));
    out.set(index, { tags, reason });
  }
  return out;
}

async function annotate(review) {
  const annotated = [];
  for (let start = 0; start < review.length; start += BATCH) {
    const batch = review.slice(start, start + BATCH);
    const lines = [];
    for (const e of batch) {
      const cands = e.candidates.map((c, i) => `${i + 1}: ${c.tag}`).join('  ');
      lines.push(`${e.index}. ${e.input} -> ${cands}`);
    }
    const raw = await ollamaGenerate(ANNOTATE_MODEL, buildReviewSystem(), lines.join('\n'), 0.05);
    const parsed = parseAnnotations(raw);
    for (const e of batch) {
      const ann = parsed.get(e.index) || { tags: [], reason: '(no annotation parsed)' };
      const byCand = new Map(e.candidates.map((c, i) => [String(i + 1), c.tag]));
      ann.tags = ann.tags.map((t) => byCand.get(t) || t);
      annotated.push({ ...e, llm: ann });
    }
  }
  return annotated;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  await ensureTagList();
  buildIndex();

  const freq = loadLogInputs();
  const cases = loadCases() || [];
  const expectedByInput = new Map(cases.map((c) => [normalizeTag(c.input), c.expected]));

  const targets = cases.filter((c) => resolve(c.input).status === 'unknown');
  const seen = new Set();
  const auto = [];
  const review = [];

  for (const c of targets) {
    const input = normalizeTag(c.input);
    if (seen.has(input)) continue;
    seen.add(input);
    const candidates = buildConceptCandidates(c.input, { limit: 20 });
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

  if (args.has('--include-logs')) {
    for (const [input, count] of freq) {
      if (seen.has(input)) continue;
      if (expectedByInput.has(input)) continue;
      seen.add(input);
      const candidates = buildConceptCandidates(input, { limit: 20 });
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

  let annotated = review;
  if (args.has('--llm') && review.length) {
    review.forEach((e, i) => (e.index = i));
    console.log(`Annotating ${review.length} review cases with ${ANNOTATE_MODEL}...`);
    annotated = await annotate(review);
  }

  auto.forEach((e, i) => (e.index = i));
  annotated.forEach((e, i) => (e.index = i));

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    SUGGESTIONS_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: args.has('--llm') ? ANNOTATE_MODEL : null,
        auto: auto.map((e) => ({
          index: e.index,
          input: e.input,
          freq: e.freq,
          expected: e.expected,
          proposal: e.candidate1
        })),
        review: annotated.map((e) => ({
          index: e.index,
          input: e.input,
          freq: e.freq,
          source: e.source,
          expected: e.expected,
          candidate1: e.candidate1,
          candidates: e.candidates.slice(0, 10).map((c) => c.tag),
          llm: e.llm || null
        }))
      },
      null,
      2
    ),
    'utf8'
  );

  console.log('Wrote', SUGGESTIONS_FILE);
  console.log('  auto (candidate #1 == expected):', auto.length);
  console.log('  review (needs judgment):', annotated.length);

  if (args.has('--apply-auto')) {
    const existing = fs.existsSync(RESOLUTIONS_PATH) ? JSON.parse(fs.readFileSync(RESOLUTIONS_PATH, 'utf8')) : {};
    for (const e of auto) existing[normalizeTag(e.input)] = [e.candidate1];
    fs.writeFileSync(RESOLUTIONS_PATH, JSON.stringify(existing, null, 2), 'utf8');
    console.log('Applied', auto.length, 'auto rules ->', RESOLUTIONS_PATH);
  }

  if (args.has('--apply-review-found')) {
    const existing = fs.existsSync(RESOLUTIONS_PATH) ? JSON.parse(fs.readFileSync(RESOLUTIONS_PATH, 'utf8')) : {};
    let applied = 0;
    let absent = 0;
    for (const e of annotated) {
      if (!e.expected || e.source !== 'benchmark') continue;
      if (existing[normalizeTag(e.input)]) continue;
      const cands = buildConceptCandidates(e.input, { limit: 20 });
      const idx = cands.findIndex((c) => c.tag === e.expected);
      if (idx >= 0) {
        existing[normalizeTag(e.input)] = [e.expected];
        applied++;
      } else {
        absent++;
        console.log('  ABSENT', e.input, '->', e.expected);
      }
    }
    fs.writeFileSync(RESOLUTIONS_PATH, JSON.stringify(existing, null, 2), 'utf8');
    console.log(
      'Applied',
      applied,
      'review-found rules (expected in candidates) ->',
      RESOLUTIONS_PATH,
      '| truly absent:',
      absent
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
