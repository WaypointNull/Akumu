const {
  formatFinalOutput,
  formatTagBlock,
  buildPositiveBoilerplate,
  buildNegativeBoilerplate
} = require('../prompt-engine');
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

function runFormat(deps) {
  const cases = ensureCases(deps);
  const positiveBoilerplate = buildPositiveBoilerplate();
  const negativeBoilerplate = buildNegativeBoilerplate();

  const unique = [];
  const seen = new Set();
  let resolvedOutOfRepo = 0;
  for (const c of cases) {
    const r = deps.repository.resolveTag(c.expected);
    if (r.status === 'unknown') {
      resolvedOutOfRepo++;
      continue;
    }
    if (!seen.has(r.tag)) {
      seen.add(r.tag);
      unique.push(r.tag);
    }
  }

  const content = unique.slice(0, 120);
  const run1 = formatFinalOutput({ promptTags: content });
  const run2 = formatFinalOutput({ promptTags: content });
  const deterministic = run1.finalText === run2.finalText;

  const structureOk =
    run1.finalText.startsWith('Global Positive:\n') &&
    run1.finalText.includes('\n\nGlobal Negative:\n') &&
    run1.globalNegativeText === formatTagBlock(negativeBoilerplate);

  const absorbed = content.filter((t) => positiveBoilerplate.includes(t));
  const capped = content.slice(0, 85);
  const survived = capped.every((t) => run1.positiveTags.includes(t) || positiveBoilerplate.includes(t));

  console.log('\n=== Boilerplate Concat (deterministic Pass 3) ===');
  console.log('Corpus:', CASES_FILE);
  console.log(
    'Cases:',
    cases.length,
    '| expected tags resolvable in repo:',
    unique.length,
    '| absent:',
    resolvedOutOfRepo
  );
  console.log('Deterministic (two identical runs):', deterministic ? 'yes' : 'NO');
  console.log('Structure (Global Positive / Global Negative):', structureOk ? 'ok' : 'BROKEN');
  console.log('Content capped at 85 - all survived:', survived ? 'yes' : 'NO');
  console.log('Content tags absorbed into boilerplate (dedup):', absorbed.length);

  console.log('\nPass 3 adds these blocks verbatim around the content:');
  console.log('--- Global Positive boilerplate (' + positiveBoilerplate.length + ' tags) ---');
  console.log('  ' + positiveBoilerplate.join(', '));
  console.log('--- Global Negative boilerplate (' + negativeBoilerplate.length + ' tags) ---');
  console.log('  ' + negativeBoilerplate.join(', '));

  const sampleContent = content.slice(0, 8);
  console.log('\nSample render (content only):');
  console.log(formatFinalOutput({ promptTags: sampleContent }).finalText);
  console.log('\nSample render (with LoRA triggers):');
  console.log(formatFinalOutput({ promptTags: sampleContent, loraInput: '<lora:Palworld_Sekhmet:1.0>' }).finalText);
  console.log('');
}

module.exports = {
  pct,
  printTable,
  run,
  runFormat
};
