const test = require('node:test');
const assert = require('node:assert');

const { classifyTag, orderTags, recognizeMode } = require('../stages/order');

test('classifyTag buckets tags into the study categories', () => {
  const cases = [
    ['masterpiece', 'quality'],
    ['best_quality', 'quality'],
    ['ultra_detailed', 'quality'],
    ['1girl', 'count'],
    ['2boys', 'count'],
    ['solo', 'count'],
    ['multiple_girls', 'count'],
    ['rem_(re_zero)', 'character'],
    ['league_of_legends', 'character'],
    ['blue_hair', 'appearance'],
    ['green_eyes', 'appearance'],
    ['large_breasts', 'appearance'],
    ['soft_sweat', 'appearance'],
    ['cozy_reading_nook', 'environment'],
    ['mountain_range', 'environment'],
    ['rainy_autumn_afternoon', 'environment'],
    ['paper_lantern', 'environment'],
    ['kimono', 'clothing'],
    ['red_flannel_jacket', 'clothing'],
    ['white_tank_top', 'clothing'],
    ['sitting', 'pose'],
    ['holding_fishing_rod', 'pose'],
    ['arched_back', 'pose'],
    ['confused_expression', 'expression'],
    ['biting_lip', 'expression'],
    ['dim_lighting', 'composition'],
    ['depth_of_field', 'composition'],
    ['cinematic_lighting', 'composition'],
    ['moonlight', 'composition'],
    ['not_a_real_tag_xyz', 'other']
  ];
  for (const [tag, expected] of cases) {
    assert.equal(classifyTag(tag), expected, `expected ${tag} -> ${expected}`);
  }
});

test('classifyTag treats qualified character tags as character identity', () => {
  assert.equal(classifyTag('neeko_(league_of_legends)'), 'character');
  assert.equal(classifyTag('sakura_kinomoto_(cardcaptor_sakura)'), 'character');
});

test('orderTags front-loads quality then count then appearance', () => {
  const ordered = orderTags(['sitting', 'blue_hair', '1girl', 'masterpiece', 'dim_lighting']);
  assert.deepEqual(ordered, ['masterpiece', '1girl', 'blue_hair', 'sitting', 'dim_lighting']);
});

test('orderTags keeps relative order within a category (stable)', () => {
  const ordered = orderTags(['bed', 'lake', 'mountain', 'river']);
  assert.deepEqual(ordered, ['bed', 'lake', 'mountain', 'river']);
});

test('orderTags is deterministic for the same input', () => {
  const tags = ['fireworks', 'kimono', '1girl', 'paper_lantern'];
  assert.deepEqual(orderTags(tags), orderTags(tags));
  assert.deepEqual(orderTags(tags), ['1girl', 'fireworks', 'paper_lantern', 'kimono']);
});

test('orderTags puts unclassified tags at the tail', () => {
  const ordered = orderTags(['zzz_junk', 'blue_hair', '1girl']);
  assert.deepEqual(ordered, ['1girl', 'blue_hair', 'zzz_junk']);
});

test('orderTags is idempotent', () => {
  const tags = ['sitting', 'blue_hair', '1girl', 'masterpiece', 'dim_lighting'];
  const once = orderTags(tags);
  assert.deepEqual(orderTags(once), once);
});

test('orderTags tolerates empty and non-array input', () => {
  assert.deepEqual(orderTags([]), []);
  assert.deepEqual(orderTags(null), []);
  assert.deepEqual(orderTags(undefined), []);
});

test('recognizeMode picks nsfw for explicit content', () => {
  assert.equal(recognizeMode(['nude', '1girl', 'bed']), 'nsfw');
  assert.equal(recognizeMode(['masterpiece', 'lingerie', 'sitting']), 'nsfw');
});

test('recognizeMode picks scenic when there is no count or character tag', () => {
  assert.equal(recognizeMode(['mountain_range', 'fog', 'sunrise']), 'scenic');
  assert.equal(recognizeMode(['orange_cat', 'sleeping']), 'scenic');
});

test('recognizeMode defaults for character SFW prompts', () => {
  assert.equal(recognizeMode(['1girl', 'kimono', 'sitting']), 'default');
  assert.equal(recognizeMode(['sakura_kinomoto_(cardcaptor_sakura)', 'kimono']), 'default');
});

test('orderTags uses the nsfw subject-first profile for explicit tags', () => {
  const ordered = orderTags(['dim_lighting', 'bed', '1girl', 'nude', 'lying', 'masterpiece', 'soft_sweat']);
  assert.deepEqual(ordered, ['masterpiece', '1girl', 'nude', 'soft_sweat', 'lying', 'bed', 'dim_lighting']);
});

test('orderTags uses the scenic scene-first profile without characters', () => {
  const ordered = orderTags(['wide_shot', 'mountain_range', 'masterpiece', 'fog', 'dim_lighting']);
  assert.deepEqual(ordered, ['masterpiece', 'mountain_range', 'fog', 'wide_shot', 'dim_lighting']);
});

test('orderTags honors an explicit mode override', () => {
  const tags = ['dim_lighting', '1girl', 'nude'];
  assert.deepEqual(orderTags(tags, { mode: 'nsfw' }), ['1girl', 'nude', 'dim_lighting']);
  assert.deepEqual(orderTags(tags, { mode: 'default' }), ['1girl', 'nude', 'dim_lighting']);
});
