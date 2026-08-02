const { test } = require('node:test');
const assert = require('node:assert/strict');

const { inferTagsFromText } = require('../inference');

test('inferTagsFromText: extracts known heuristics from natural language', () => {
  const tags = inferTagsFromText(
    'Neeko from above, sitting on a rock in a jungle, leaning back, innocent confused expression, looking at the camera'
  );
  assert.ok(tags.includes('neeko_(league_of_legends)'));
  assert.ok(tags.includes('from_above'));
  assert.ok(tags.includes('sitting'));
  assert.ok(tags.includes('on_rock'));
  assert.ok(tags.includes('jungle'));
  assert.ok(tags.includes('looking_at_viewer'));
  assert.ok(tags.includes('leaning_back'));
  assert.ok(tags.includes('innocent'));
  assert.ok(tags.includes('confused'));
});

test('inferTagsFromText: always includes the 1girl default', () => {
  assert.deepEqual(inferTagsFromText('totally unrelated words'), ['1girl']);
});

test('inferTagsFromText: does not duplicate tags', () => {
  const tags = inferTagsFromText('sitting, sitting');
  assert.equal(tags.filter((t) => t === 'sitting').length, 1);
});
