const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatResolutionSummary,
  formatPass3Breakdown,
  buildPositiveBoilerplate,
  buildNegativeBoilerplate,
  formatFinalOutput,
  mergeChannelLoras,
  formatTagBlock
} = require('../formatter');
const { REQUIRED_POSITIVE, REQUIRED_NEGATIVE } = require('../../../config/constants');

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

test('formatTagBlock: chunks tags into comma-separated lines', () => {
  assert.equal(formatTagBlock(['a', 'b', 'c', 'd'], 3), 'a, b, c\nd');
  assert.equal(formatTagBlock(['a', 'b'], 3), 'a, b');
  assert.equal(formatTagBlock([], 3), '');
});

test('formatPass3Breakdown: shows format, boilerplate, and LoRA/Descriptor sections', () => {
  const out = formatPass3Breakdown({
    promptTags: ['sitting', 'blue_hair'],
    loraInput: '<lora:test:1.0>'
  });
  assert.ok(out.includes('GLOBAL_POSITIVE = [Boilerplate] [LoRA Tags] [Descriptor tags]'));
  assert.ok(out.includes('[LoRA Tags]'));
  assert.ok(out.includes('<lora:test:1.0>'));
  assert.ok(out.includes('[Descriptor tags]'));
  assert.ok(out.includes('sitting'));
  assert.ok(out.includes('blue_hair'));
  assert.ok(buildPositiveBoilerplate().every((tag) => out.includes(tag)));
});

test('formatPass3Breakdown: dedupes boilerplate tags out of the descriptor section', () => {
  const boilerplate = buildPositiveBoilerplate();
  const out = formatPass3Breakdown({ promptTags: [...boilerplate, 'sitting'], loraInput: '' });
  const descriptorSection = out.slice(out.lastIndexOf('[Descriptor tags]'));
  assert.ok(descriptorSection.includes('sitting'));
  assert.ok(!descriptorSection.includes('masterpiece'));
});
