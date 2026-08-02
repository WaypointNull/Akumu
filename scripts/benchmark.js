const fs = require('fs');
const path = require('path');
const {
  ensureTagList,
  getTagSet,
  getAliasMap,
  resolveTag
} = require('../src/services/tagListService');
const { buildIndex, resolve, buildConceptCandidates } = require('../src/services/tagRetrievalService');
const { canonicalizeConcepts } = require('../src/services/canonicalizeService');
const { resolveWithRules } = require('../src/services/resolutionRules');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CASES_FILE = path.join(DATA_DIR, 'benchmark-cases.json');

const CATEGORY_SIZES = {
  alias: 1500,
  missing_underscore: 250,
  space: 250,
  hyphen: 250,
  typo: 250,
  truncate: 250,
  plural: 200,
  prefix: 200
};

const SEED = 20260802;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function corruptMissingUnderscore(tag) {
  const i = tag.indexOf('_');
  return i === -1 ? null : tag.slice(0, i) + tag.slice(i + 1);
}

function corruptSpace(tag) {
  const i = tag.indexOf('_');
  return i === -1 ? null : tag.slice(0, i) + ' ' + tag.slice(i + 1);
}

function corruptHyphen(tag) {
  const i = tag.indexOf('_');
  return i === -1 ? null : tag.slice(0, i) + '-' + tag.slice(i + 1);
}

function corruptTypo(rng, tag) {
  const pos = Math.floor(rng() * tag.length);
  const letter = String.fromCharCode(97 + Math.floor(rng() * 26));
  return tag.slice(0, pos) + letter + tag.slice(pos + 1);
}

function corruptTruncate(rng, tag) {
  const cut = 1 + Math.floor(rng() * 3);
  if (tag.length - cut < 4) return null;
  return tag.slice(0, tag.length - cut);
}

function corruptPlural(tag) {
  const last = tag.lastIndexOf('_');
  const base = last === -1 ? tag : tag.slice(last + 1);
  if (!base || base.endsWith('s')) return null;
  return tag + 's';
}

function corruptPrefix(rng, tag) {
  const prefixes = ['the_', 'a_', 'with_', 'of_', 'an_'];
  return pick(rng, prefixes) + tag;
}

function isValidCorruption(input, expected) {
  const result = resolveTag(input);
  if (result.status === 'unknown') return true;
  return result.tag === expected;
}

function generate() {
  const rng = mulberry32(SEED);
  const tagSet = getTagSet();
  const pool = [...tagSet].filter((tag) => tag.length >= 6 && !/^\d/.test(tag));
  const multiWord = pool.filter((tag) => tag.includes('_'));
  const seen = new Set();
  const cases = [];

  const corruptors = {
    missing_underscore: { pool: multiWord, fn: (tag) => corruptMissingUnderscore(tag) },
    space: { pool: multiWord, fn: (tag) => corruptSpace(tag) },
    hyphen: { pool: multiWord, fn: (tag) => corruptHyphen(tag) },
    typo: { pool, fn: (tag) => corruptTypo(rng, tag) },
    truncate: { pool, fn: (tag) => corruptTruncate(rng, tag) },
    plural: { pool, fn: (tag) => corruptPlural(tag) },
    prefix: { pool, fn: (tag) => corruptPrefix(rng, tag) }
  };

  for (const [category, spec] of Object.entries(corruptors)) {
    const out = [];
    let attempts = 0;
    const maxAttempts = CATEGORY_SIZES[category] * 40;
    while (out.length < CATEGORY_SIZES[category] && attempts < maxAttempts) {
      attempts++;
      const tag = pick(rng, spec.pool);
      const input = spec.fn(tag);
      if (!input || input === tag || seen.has(input)) continue;
      if (!isValidCorruption(input, tag)) continue;
      seen.add(input);
      out.push({ category, input, expected: tag });
    }
    cases.push(...out);
  }

  const entries = [...getAliasMap()].filter(([alias]) => alias.length >= 4);
  let aliasCount = 0;
  for (const [alias, canonical] of shuffle(rng, entries)) {
    if (aliasCount >= CATEGORY_SIZES.alias) break;
    if (seen.has(alias)) continue;
    if (resolveTag(alias).tag !== canonical) continue;
    seen.add(alias);
    cases.push({ category: 'alias', input: alias, expected: canonical });
    aliasCount++;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CASES_FILE, JSON.stringify({ version: 1, seed: SEED, generatedAt: new Date().toISOString(), cases }, null, 2), 'utf8');

  const byCategory = {};
  for (const c of cases) byCategory[c.category] = (byCategory[c.category] || 0) + 1;
  console.log('Generated', cases.length, 'cases ->', CASES_FILE);
  console.log(byCategory);
}

function loadCases() {
  if (!fs.existsSync(CASES_FILE)) {
    generate();
  }
  return JSON.parse(fs.readFileSync(CASES_FILE, 'utf8')).cases;
}

function pct(count, total) {
  if (total === 0) return 'n/a';
  return ((count / total) * 100).toFixed(1) + '%';
}

function printTable(header, rows) {
  const widths = header.map((_, col) => Math.max(...rows.map((row) => String(row[col]).length), header[col].length));
  const fmt = (row) => row.map((cell, col) => String(cell).padEnd(widths[col])).join('  ');
  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(fmt(row));
}

function run() {
  const cases = loadCases();
  const overall = { total: cases.length, recovered: 0, wrong: 0, unresolved: 0 };
  const byCategory = new Map();
  const wrongSamples = [];
  const unresolvedSamples = [];
  let reachedRetrieval = 0;
  let retrievalTop1 = 0;
  let retrievalTop5 = 0;

  for (const c of cases) {
    const result = resolve(c.input);
    let outcome;
    if (result.tag === c.expected) outcome = 'recovered';
    else if (result.status === 'unknown') outcome = 'unresolved';
    else outcome = 'wrong';
    overall[outcome]++;

    if (!byCategory.has(c.category)) byCategory.set(c.category, { total: 0, recovered: 0, wrong: 0, unresolved: 0 });
    const cat = byCategory.get(c.category);
    cat.total++;
    cat[outcome]++;

    if (result.candidates && result.candidates.length) {
      reachedRetrieval++;
      if (result.candidates[0].tag === c.expected) retrievalTop1++;
      if (result.candidates.slice(0, 5).some((candidate) => candidate.tag === c.expected)) retrievalTop5++;
    }

    if (outcome === 'wrong' && wrongSamples.length < 10) wrongSamples.push({ input: c.input, expected: c.expected, got: result.tag });
    if (outcome === 'unresolved' && unresolvedSamples.length < 10) unresolvedSamples.push({ input: c.input, expected: c.expected });
  }

  console.log('\n=== Danbooru Resolution Benchmark ===');
  console.log('Total cases:', overall.total, '(corpus:', CASES_FILE + ')');

  const rows = [];
  for (const [category, cat] of byCategory) {
    rows.push([category, cat.total, cat.recovered, cat.wrong, cat.unresolved, pct(cat.recovered, cat.total)]);
  }
  rows.push(['OVERALL', overall.total, overall.recovered, overall.wrong, overall.unresolved, pct(overall.recovered, overall.total)]);
  printTable(['Category', 'Total', 'Recovered', 'Wrong', 'Unresolved', 'Rate'], rows);

  console.log('\nRetrieval quality (cases reaching retrieval):', reachedRetrieval);
  console.log('  top-1 correct:', retrievalTop1, `(${pct(retrievalTop1, reachedRetrieval)})`);
  console.log('  top-5 correct:', retrievalTop5, `(${pct(retrievalTop5, reachedRetrieval)})`);

  console.log('\nWrong (precision failures - auto-accept danger):');
  if (wrongSamples.length === 0) {
    console.log('  none');
  } else {
    for (const s of wrongSamples) console.log(`  ${s.input} -> ${s.got} (expected ${s.expected})`);
  }

  console.log('\nUnresolved (retrieval-layer targets):');
  if (unresolvedSamples.length === 0) {
    console.log('  none');
  } else {
    for (const s of unresolvedSamples) console.log(`  ${s.input} -> (expected ${s.expected})`);
  }
  console.log('');
}

async function runPhaseC() {
  const cases = loadCases();
  const targets = cases.filter((c) => resolve(c.input).status === 'unknown');
  if (!targets.length) {
    console.log('\n=== Phase C offline eval ===');
    console.log('No unresolved cases to canonicalize.');
    return;
  }

  const model = process.env.PHASE_C_MODEL || 'qwen2.5:7b';
  console.log('\n=== Phase C offline eval ===');
  console.log('Model:', model);
  console.log('Targets:', targets.length, '(frozen unresolved cases)');

  const concepts = targets.map((c, i) => ({
    index: i,
    original: c.input,
    candidates: buildConceptCandidates(c.input)
  }));

  const startedAt = Date.now();
  const result = await canonicalizeConcepts({ concepts, model });
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  const metrics = {
    total: targets.length,
    recovered: 0,
    incorrect: 0,
    skipped: 0,
    recoveredOutOfList: 0,
    expectedInCandidates: 0,
    outOfListProposed: 0,
    acceptedOutOfList: 0,
    rejected: 0
  };
  const incorrectSamples = [];
  const recoveredSamples = [];

  for (const concept of result.concepts) {
    const target = targets[concept.index];
    const expected = target.expected;
    const candidateSet = new Set(concept.candidates.map((x) => x.tag));
    const acceptedTags = concept.accepted.map((a) => a.tag);

    if (candidateSet.has(expected)) metrics.expectedInCandidates++;

    metrics.outOfListProposed += concept.proposed.filter((t) => !candidateSet.has(resolveTag(t).tag)).length;
    metrics.acceptedOutOfList += concept.accepted.filter((a) => a.outOfList).length;
    metrics.rejected += concept.rejected.length;

    if (acceptedTags.includes(expected)) {
      metrics.recovered++;
      if (!candidateSet.has(expected)) metrics.recoveredOutOfList++;
      if (recoveredSamples.length < 10) {
        recoveredSamples.push({ input: target.input, expected, got: acceptedTags, outOfList: !candidateSet.has(expected) });
      }
    } else if (acceptedTags.length) {
      metrics.incorrect++;
      if (incorrectSamples.length < 10) {
        incorrectSamples.push({ input: target.input, expected, got: acceptedTags, proposed: concept.proposed });
      }
    } else {
      metrics.skipped++;
    }
  }

  console.log(`Elapsed: ${elapsed}s (${result.batches} batched LLM calls)`);
  const rows = [
    ['Recovered (expected in accepted)', metrics.recovered, pct(metrics.recovered, metrics.total)],
    ['  of which expected NOT in candidates', metrics.recoveredOutOfList, pct(metrics.recoveredOutOfList, metrics.recovered)],
    ['Incorrect (accepted but wrong)', metrics.incorrect, pct(metrics.incorrect, metrics.total)],
    ['Skipped (SKIP / no output)', metrics.skipped, pct(metrics.skipped, metrics.total)]
  ];
  printTable(['Metric', 'Count', 'Rate'], rows);

  console.log('\nCandidate coverage (expected tag in retrieval list):', metrics.expectedInCandidates, `(${pct(metrics.expectedInCandidates, metrics.total)})`);
  console.log('\nDeviation monitoring:');
  console.log('  out-of-list proposals:', metrics.outOfListProposed);
  console.log('  accepted out-of-list:', metrics.acceptedOutOfList);
  console.log('  rejected proposals:', metrics.rejected);

  console.log('\nRecovered samples:');
  for (const s of recoveredSamples) {
    console.log(`  ${s.input} -> ${s.got.join(', ')} (expected ${s.expected})${s.outOfList ? ' [OUT-OF-LIST]' : ''}`);
  }

  console.log('\nIncorrect (precision danger - must review):');
  if (incorrectSamples.length === 0) {
    console.log('  none');
  } else {
    for (const s of incorrectSamples) console.log(`  ${s.input} -> ${s.got.join(', ')} (expected ${s.expected})`);
  }
  console.log('');
}

function runRules() {
  const cases = loadCases();
  const overall = { total: cases.length, recovered: 0, wrong: 0, unresolved: 0 };
  const byCategory = new Map();
  let rulesHit = 0;
  let rulesWrong = 0;
  const wrongSamples = [];
  const recoveredSamples = [];

  for (const c of cases) {
    const r = resolve(c.input);
    let outcome;
    if (r.tag === c.expected) {
      outcome = 'recovered';
    } else if (r.status === 'unknown') {
      const rule = resolveWithRules(c.input);
      if (rule) {
        rulesHit++;
        const tags = [rule.tag, ...(rule.extraTags || [])];
        if (tags.length === 1 && tags[0] === c.expected) {
          outcome = 'recovered';
          if (recoveredSamples.length < 10) recoveredSamples.push({ input: c.input, got: tags[0], expected: c.expected });
        } else {
          outcome = 'wrong';
          rulesWrong++;
          if (wrongSamples.length < 10) wrongSamples.push({ input: c.input, got: tags, expected: c.expected });
        }
      } else {
        outcome = 'unresolved';
      }
    } else {
      outcome = 'wrong';
    }
    overall[outcome]++;

    if (!byCategory.has(c.category)) byCategory.set(c.category, { total: 0, recovered: 0, wrong: 0, unresolved: 0 });
    const cat = byCategory.get(c.category);
    cat.total++;
    cat[outcome]++;
  }

  console.log('\n=== Danbooru Resolution Benchmark (rules mode) ===');
  const rows = [];
  for (const [category, cat] of byCategory) {
    rows.push([category, cat.total, cat.recovered, cat.wrong, cat.unresolved, pct(cat.recovered, cat.total)]);
  }
  rows.push(['OVERALL', overall.total, overall.recovered, overall.wrong, overall.unresolved, pct(overall.recovered, overall.total)]);
  printTable(['Category', 'Total', 'Recovered', 'Wrong', 'Unresolved', 'Rate'], rows);

  console.log('\nRules applied:', rulesHit, '| rule-induced wrong:', rulesWrong);

  console.log('\nRecovered by rules:');
  for (const s of recoveredSamples) console.log(`  ${s.input} -> ${s.got} (expected ${s.expected})`);

  console.log('\nWrong (rules inject non-expected tag - must be 0):');
  if (wrongSamples.length === 0) {
    console.log('  none');
  } else {
    for (const s of wrongSamples) console.log(`  ${s.input} -> ${s.got.join(', ')} (expected ${s.expected})`);
  }
  console.log('');
}

const [command] = process.argv.slice(2);

(async () => {
  await ensureTagList();
  const indexStats = buildIndex();
  console.log('Tag index:', indexStats.tags, 'tags,', indexStats.trigrams, 'trigrams,', indexStats.terms, 'terms.');
  if (command === 'generate') {
    generate();
  } else if (command === 'run') {
    run();
  } else if (command === 'phase-c') {
    await runPhaseC();
  } else if (command === 'rules') {
    runRules();
  } else {
    if (!fs.existsSync(CASES_FILE)) generate();
    run();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
