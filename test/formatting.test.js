const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatResolutionSummary,
  buildPositiveBoilerplate,
  buildNegativeBoilerplate,
  formatFinalOutput,
  mergeChannelLoras
} = require('../src/utils/formatting');
const { REQUIRED_POSITIVE, REQUIRED_NEGATIVE } = require('../src/config/constants');

test('buildPositiveBoilerplate: includes all required positive tags', () => {
  const boilerplate = buildPositiveBoilerplate();
  for (const tag of REQUIRED_POSITIVE) {
    assert.ok(boilerplate.includes(tag), `missing ${tag}`);
  }
});

test('buildNegativeBoilerplate: includes all required negative tags', () => {
  const boilerplate = buildNegativeBoilerplate();
  for (const tag of REQUIRED_NEGATIVE) {
    assert.ok(boilerplate.includes(tag), `missing ${tag}`);
  }
});

test('formatFinalOutput: separates boilerplate from content tags', () => {
  const out = formatFinalOutput({ promptTags: ['masterpiece', 'sitting', 'blue_hair'] });
  assert.ok(out.positiveTags.includes('masterpiece'));
  assert.ok(out.positiveTags.includes('sitting'));
  assert.ok(out.finalText.includes('Global Positive:'));
  assert.ok(out.finalText.includes('Global Negative:'));
  assert.ok(out.globalNegativeText.length > 0);
});

test('formatFinalOutput: appends lora triggers verbatim', () => {
  const out = formatFinalOutput({ promptTags: ['sitting'], loraInput: '<lora:test:1.0>' });
  assert.ok(out.finalText.includes('<lora:test:1.0>'));
});

test('formatFinalOutput: respects the content cap', () => {
  const out = formatFinalOutput({ promptTags: ['sitting', 'blue_hair', 'red_hair', 'green_hair'], cap: 2 });
  const contentCount = out.positiveTags.filter((t) => !buildPositiveBoilerplate().includes(t)).length;
  assert.equal(contentCount, 2);
});

test('mergeChannelLoras: dedupes and preserves order (loras first)', () => {
  assert.deepEqual(mergeChannelLoras(['<lora:a:1.0>'], ['sitting', 'sitting', 'blue_hair']), [
    '<lora:a:1.0>',
    'sitting',
    'blue_hair'
  ]);
});

test('formatResolutionSummary: reports status counts and replacements', () => {
  const summary = formatResolutionSummary([
    { original: 'x', tag: 'x', status: 'kept' },
    { original: 'y', tag: 'yy', status: 'alias' },
    { original: 'z', tag: 'z', status: 'ambiguous' }
  ]);
  assert.ok(summary.includes('Resolved 3 tags'));
  assert.ok(summary.includes('1 kept (exact match)'));
  assert.ok(summary.includes('1 alias -> canonical'));
  assert.ok(summary.includes('y -> yy'));
  assert.ok(summary.includes('Ambiguous: z'));
});
