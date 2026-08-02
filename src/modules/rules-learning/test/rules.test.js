const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadLogInputs, parseAnnotations, collect, applyAutoRules, applyReviewFoundRules } = require('../');

function tmpFile(name, content) {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

test('parseAnnotations handles skip, tagged, reason and invalid lines', () => {
  const raw = [
    '0: skip | no fit',
    '1: candidate_1, candidate_2 | close match',
    '2. some_tag',
    '3: #4 | bad index'
  ].join('\n');
  const out = parseAnnotations(raw);
  assert.deepEqual(out.get(0), { tags: [], reason: 'no fit' });
  assert.deepEqual(out.get(1), { tags: ['candidate_1', 'candidate_2'], reason: 'close match' });
  assert.deepEqual(out.get(2), { tags: ['some_tag'], reason: '' });
  assert.deepEqual(out.get(3), { tags: [], reason: 'bad index' });
  assert.equal(out.has(99), false);
});

test('loadLogInputs tallies concept originals and input fields', () => {
  const p = tmpFile(
    'rules-load-log.ndjson',
    [
      JSON.stringify({ input: 'foo_bar' }),
      JSON.stringify({ input: 'foo_bar' }),
      JSON.stringify({ concepts: [{ original: 'baz' }, { original: 'foo_bar' }] })
    ].join('\n')
  );
  try {
    const tally = loadLogInputs([p]);
    assert.equal(tally.get('foo_bar'), 3);
    assert.equal(tally.get('baz'), 1);
  } finally {
    fs.rmSync(p, { force: true });
  }
});

test('loadLogInputs skips malformed lines and missing files', () => {
  const p = tmpFile('rules-load-log-bad.ndjson', 'not json\n{"input": "ok"}\n');
  try {
    const tally = loadLogInputs([p, path.join(os.tmpdir(), 'does-not-exist.ndjson')]);
    assert.equal(tally.get('ok'), 1);
    assert.equal(tally.get('not'), undefined);
  } finally {
    fs.rmSync(p, { force: true });
  }
});

test('collect splits auto (candidate #1 == expected) from review, optionally including logs', () => {
  const deps = {
    retrieval: {
      resolve: (input) => ({ status: 'unknown', tag: input }),
      buildConceptCandidates: (input) => {
        if (input === 'candit1') return [{ tag: 'candidate_1', score: 0.9 }];
        if (input === 'log_only') return [{ tag: 'log_candidate', score: 0.8 }];
        return [{ tag: 'wrong', score: 0.5 }];
      }
    }
  };
  const cases = [
    { input: 'candit1', expected: 'candidate_1', category: 'typo' },
    { input: 'unres', expected: 'some_tag', category: 'typo' }
  ];

  const base = collect({ deps, cases });
  assert.equal(base.auto.length, 1);
  assert.equal(base.auto[0].candidate1, 'candidate_1');
  assert.equal(base.review.length, 1);
  assert.equal(base.review[0].input, 'unres');

  const withLogs = collect({ deps, cases, freq: new Map([['log_only', 4]]), includeLogs: true });
  assert.equal(withLogs.review.length, 2);
  assert.ok(withLogs.review.some((e) => e.input === 'log_only' && e.source === 'log' && e.freq === 4));
});

test('applyAutoRules writes resolutions and returns applied count', () => {
  const p = tmpFile('rules-resolutions-auto.json', '{}');
  try {
    const n = applyAutoRules({ filePath: p, auto: [{ input: 'candit1', candidate1: 'candidate_1' }] });
    assert.equal(n, 1);
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.deepEqual(json.candit1, ['candidate_1']);
  } finally {
    fs.rmSync(p, { force: true });
  }
});

test('applyReviewFoundRules applies expected when present in candidates, reports truly absent', () => {
  const p = tmpFile('rules-resolutions-found.json', '{}');
  const deps = {
    retrieval: {
      buildConceptCandidates: (input) => {
        if (input === 'present') return [{ tag: 'some_tag', score: 0.9 }];
        return [{ tag: 'wrong', score: 0.5 }];
      }
    }
  };
  try {
    const annotated = [
      { input: 'present', expected: 'some_tag', source: 'benchmark' },
      { input: 'gone', expected: 'missing_tag', source: 'benchmark' },
      { input: 'logcase', expected: 'some_tag', source: 'log' }
    ];
    const { applied, absent, absentList } = applyReviewFoundRules({ filePath: p, annotated, deps });
    assert.equal(applied, 1);
    assert.equal(absent, 1);
    assert.deepEqual(absentList, [{ input: 'gone', expected: 'missing_tag' }]);
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.deepEqual(json.present, ['some_tag']);
    assert.equal(json.gone, undefined);
  } finally {
    fs.rmSync(p, { force: true });
  }
});
