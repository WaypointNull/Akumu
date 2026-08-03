const { test } = require('node:test');
const assert = require('node:assert/strict');

const { trigrams, tokenize, damerauLevenshtein } = require('../metrics');

test('trigrams: produces sliding windows of 3', () => {
  assert.deepEqual([...trigrams('abc')], ['abc']);
  assert.deepEqual([...trigrams('abcde')], ['abc', 'bcd', 'cde']);
});

test('trigrams: short and empty strings', () => {
  assert.deepEqual([...trigrams('ab')], ['ab']);
  assert.deepEqual([...trigrams('')], []);
});

test('tokenize: splits on non-alphanumeric, lowercases', () => {
  assert.deepEqual(tokenize('Foo bar_baz 42!'), ['foo', 'bar', 'baz', '42']);
  assert.deepEqual(tokenize(''), []);
});

test('damerauLevenshtein: classic edit distances', () => {
  assert.equal(damerauLevenshtein('kitten', 'sitting'), 3);
  assert.equal(damerauLevenshtein('book', 'back'), 2);
  assert.equal(damerauLevenshtein('ab', 'ba'), 1);
  assert.equal(damerauLevenshtein('same', 'same'), 0);
});

test('damerauLevenshtein: empty string handling', () => {
  assert.equal(damerauLevenshtein('', 'abc'), 3);
  assert.equal(damerauLevenshtein('abc', ''), 3);
  assert.equal(damerauLevenshtein('', ''), 0);
});
