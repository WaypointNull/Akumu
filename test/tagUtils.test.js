const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeTag,
  dedupeKeepOrder,
  isUsableTag,
  splitTags,
  parseLoraInput,
  isSectionLabel,
  formatTagBlock
} = require('../src/utils/tagUtils');

test('normalizeTag: trims, lowercases, and collapses separators', () => {
  assert.equal(normalizeTag('  Blue Hair  '), 'blue_hair');
  assert.equal(normalizeTag('blue--hair'), 'blue--hair');
  assert.equal(normalizeTag('a__b'), 'a_b');
  assert.equal(normalizeTag('_padded_'), 'padded');
  assert.equal(normalizeTag('1girl'), '1girl');
  assert.equal(normalizeTag('123. foo'), 'foo');
  assert.equal(normalizeTag('---leading'), 'leading');
  assert.equal(normalizeTag(null), '');
  assert.equal(normalizeTag(''), '');
});

test('dedupeKeepOrder: removes duplicates but preserves first-seen order', () => {
  assert.deepEqual(dedupeKeepOrder(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);
  assert.deepEqual(dedupeKeepOrder([]), []);
  assert.deepEqual(dedupeKeepOrder(null), []);
});

test('isUsableTag: accepts valid tags and rejects junk', () => {
  assert.equal(isUsableTag('blue_hair'), true);
  assert.equal(isUsableTag('1girl'), true);
  assert.equal(isUsableTag('2boys'), true);
  assert.equal(isUsableTag('123girl'), true);
  assert.equal(isUsableTag('ab'), false);
  assert.equal(isUsableTag('bad tag!'), false);
  assert.equal(isUsableTag('yes'), false);
  assert.equal(isUsableTag(''), false);
  assert.equal(isUsableTag(null), false);
});

test('splitTags: splits, normalizes, strips lorae and bare numbers, dedupes', () => {
  assert.deepEqual(splitTags('blue hair, red_hair\nblonde_hair'), ['blue_hair', 'red_hair', 'blonde_hair']);
  assert.deepEqual(splitTags('<lora:x:1.0>, lora:y:0.5, 42, real_tag'), ['real_tag']);
  assert.deepEqual(splitTags('blue_hair, blue_hair, red_hair'), ['blue_hair', 'red_hair']);
  assert.deepEqual(splitTags(''), []);
});

test('parseLoraInput: only keeps well-formed lora tokens', () => {
  assert.deepEqual(parseLoraInput('<lora:a:1.0>, <lora:b:0.5>'), ['<lora:a:1.0>', '<lora:b:0.5>']);
  assert.deepEqual(parseLoraInput('<lora:a:1.0>\n<lora:b:0.5>'), ['<lora:a:1.0>', '<lora:b:0.5>']);
  assert.deepEqual(parseLoraInput('not-a-lora, <malformed'), []);
  assert.deepEqual(parseLoraInput(''), []);
});

test('isSectionLabel: detects pipeline section labels', () => {
  assert.equal(isSectionLabel('global_positive'), true);
  assert.equal(isSectionLabel('pose_and_camera'), true);
  assert.equal(isSectionLabel('sitting'), false);
});

test('formatTagBlock: chunks tags into comma-separated lines', () => {
  assert.equal(formatTagBlock(['a', 'b', 'c', 'd'], 3), 'a, b, c\nd');
  assert.equal(formatTagBlock(['a', 'b'], 3), 'a, b');
  assert.equal(formatTagBlock([], 3), '');
});
