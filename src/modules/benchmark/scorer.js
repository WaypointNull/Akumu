const { canonicalizeConcepts } = require('../prompt-engine');
const { ensureCases } = require('./generator');
const { CASES_FILE } = require('./datasets');

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

function run(deps) {
  const cases = ensureCases(deps);
  const overall = { total: cases.length, recovered: 0, wrong: 0, unresolved: 0 };
  const byCategory = new Map();
  const wrongSamples = [];
  const unresolvedSamples = [];
  let reachedRetrieval = 0;
  let retrievalTop1 = 0;
  let retrievalTop5 = 0;

  for (const c of cases) {
    const result = deps.retrieval.resolve(c.input);
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

    if (outcome === 'wrong' && wrongSamples.length < 10)
      wrongSamples.push({ input: c.input, expected: c.expected, got: result.tag });
    if (outcome === 'unresolved' && unresolvedSamples.length < 10)
      unresolvedSamples.push({ input: c.input, expected: c.expected });
  }

  console.log('\n=== Danbooru Resolution Benchmark ===');
  console.log('Total cases:', overall.total, '(corpus:', CASES_FILE + ')');

  const rows = [];
  for (const [category, cat] of byCategory) {
    rows.push([category, cat.total, cat.recovered, cat.wrong, cat.unresolved, pct(cat.recovered, cat.total)]);
  }
  rows.push([
    'OVERALL',
    overall.total,
    overall.recovered,
    overall.wrong,
    overall.unresolved,
    pct(overall.recovered, overall.total)
  ]);
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

async function runPhaseC(deps) {
  const cases = ensureCases(deps);
  const targets = cases.filter((c) => deps.retrieval.resolve(c.input).status === 'unknown');
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
    candidates: deps.retrieval.buildConceptCandidates(c.input)
  }));

  const startedAt = Date.now();
  const result = await canonicalizeConcepts({ concepts, model }, deps);
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

    metrics.outOfListProposed += concept.proposed.filter(
      (t) => !candidateSet.has(deps.repository.resolveTag(t).tag)
    ).length;
    metrics.acceptedOutOfList += concept.accepted.filter((a) => a.outOfList).length;
    metrics.rejected += concept.rejected.length;

    if (acceptedTags.includes(expected)) {
      metrics.recovered++;
      if (!candidateSet.has(expected)) metrics.recoveredOutOfList++;
      if (recoveredSamples.length < 10) {
        recoveredSamples.push({
          input: target.input,
          expected,
          got: acceptedTags,
          outOfList: !candidateSet.has(expected)
        });
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
    [
      '  of which expected NOT in candidates',
      metrics.recoveredOutOfList,
      pct(metrics.recoveredOutOfList, metrics.recovered)
    ],
    ['Incorrect (accepted but wrong)', metrics.incorrect, pct(metrics.incorrect, metrics.total)],
    ['Skipped (SKIP / no output)', metrics.skipped, pct(metrics.skipped, metrics.total)]
  ];
  printTable(['Metric', 'Count', 'Rate'], rows);

  console.log(
    '\nCandidate coverage (expected tag in retrieval list):',
    metrics.expectedInCandidates,
    `(${pct(metrics.expectedInCandidates, metrics.total)})`
  );
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

function runRules(deps) {
  const cases = ensureCases(deps);
  const overall = { total: cases.length, recovered: 0, wrong: 0, unresolved: 0 };
  const byCategory = new Map();
  let rulesHit = 0;
  let rulesWrong = 0;
  const wrongSamples = [];
  const recoveredSamples = [];

  for (const c of cases) {
    const r = deps.retrieval.resolve(c.input);
    let outcome;
    if (r.tag === c.expected) {
      outcome = 'recovered';
    } else if (r.status === 'unknown') {
      const rule = deps.ruleTable.resolveWithRules(c.input);
      if (rule) {
        rulesHit++;
        const tags = [rule.tag, ...(rule.extraTags || [])];
        if (tags.length === 1 && tags[0] === c.expected) {
          outcome = 'recovered';
          if (recoveredSamples.length < 10)
            recoveredSamples.push({ input: c.input, got: tags[0], expected: c.expected });
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
  rows.push([
    'OVERALL',
    overall.total,
    overall.recovered,
    overall.wrong,
    overall.unresolved,
    pct(overall.recovered, overall.total)
  ]);
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

module.exports = {
  pct,
  printTable,
  run,
  runPhaseC,
  runRules
};
