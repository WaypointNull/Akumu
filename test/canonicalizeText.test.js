const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCanonicalizeSystem,
  buildCanonicalizeUser,
  parseCanonicalizeOutput
} = require('../src/utils/canonicalizeText');

test('parseCanonicalizeOutput: parses candidate number lists', () => {
  const parsed = parseCanonicalizeOutput('3: 2, 3\n1: 1\n5: SKIP\n');
  assert.deepEqual(parsed.get(3), [2, 3]);
  assert.deepEqual(parsed.get(1), [1]);
  assert.deepEqual(parsed.get(5), []);
});

test('parseCanonicalizeOutput: tolerates separators and case', () => {
  const parsed = parseCanonicalizeOutput('3. 1  \n4- 2\n2: skip');
  assert.deepEqual(parsed.get(3), [1]);
  assert.deepEqual(parsed.get(4), [2]);
  assert.deepEqual(parsed.get(2), []);
});

test('parseCanonicalizeOutput: ignores malformed or non-numeric lines', () => {
  const parsed = parseCanonicalizeOutput('3: banana\nx: 1\nprose\n');
  assert.equal(parsed.size, 0);
});

test('parseCanonicalizeOutput: empty input yields empty map', () => {
  assert.equal(parseCanonicalizeOutput('').size, 0);
  assert.equal(parseCanonicalizeOutput(null).size, 0);
});

test('buildCanonicalizeUser: numbers concepts and lists candidates', () => {
  const user = buildCanonicalizeUser({
    request: 'a fluffy cat',
    resolvedTags: ['cat'],
    concepts: [{ index: 0, original: 'fluffy_cat', candidates: [{ tag: 'cat' }, { tag: 'fluffy' }] }]
  });
  assert.ok(user.includes('Original request: a fluffy cat'));
  assert.ok(user.includes('Already-canonical tags (do not repeat): cat'));
  assert.ok(user.includes('0. fluffy_cat -> 1: cat  2: fluffy'));
});

test('buildCanonicalizeSystem: contains the scoring rules', () => {
  const system = buildCanonicalizeSystem();
  assert.ok(system.includes('N: SKIP'));
  assert.ok(system.includes('Prefer lower candidate numbers'));
});
