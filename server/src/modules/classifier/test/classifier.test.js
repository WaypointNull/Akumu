const { test } = require('node:test');
const assert = require('node:assert/strict');

const { classify, isCategory, categories } = require('../index');

test('classifier: NSFW bucket detects explicit tags', () => {
  assert.equal(isCategory('cum_on_face', 'nsfw'), true);
  assert.equal(isCategory('naked_apron', 'nsfw'), true);
  assert.equal(isCategory('blowjob', 'nsfw'), true);
  assert.equal(isCategory('futanari', 'nsfw'), true);
  assert.equal(isCategory('anal_plug', 'nsfw'), true);
  assert.equal(isCategory('anal', 'nsfw'), true);

  assert.equal(isCategory('cat', 'nsfw'), false);
  assert.equal(isCategory('blue_eyes', 'nsfw'), false);
  assert.equal(isCategory('masterpiece', 'nsfw'), false);
  assert.equal(isCategory('school_uniform', 'nsfw'), false);

  assert.deepEqual(classify('futanari'), ['nsfw']);
  assert.deepEqual(classify('cat'), []);

  assert.deepEqual(categories(), [
    { id: 'nsfw', label: 'NSFW' },
    { id: 'clothes', label: 'Clothes' },
    { id: 'composition', label: 'Composition' },
    { id: 'pose', label: 'Pose / Expression' }
  ]);
});

test('classifier: clothes bucket detects outfit tags', () => {
  assert.equal(isCategory('school_uniform', 'clothes'), true);
  assert.equal(isCategory('white_hoodie', 'clothes'), true);
  assert.equal(isCategory('long_dress', 'clothes'), true);
  assert.equal(isCategory('thighhigh_stockings', 'clothes'), true);
  assert.equal(isCategory('sailor_collar', 'clothes'), true);
  assert.equal(isCategory('red_scarf', 'clothes'), true);

  assert.equal(isCategory('cat', 'clothes'), false);
  assert.equal(isCategory('blue_eyes', 'clothes'), false);
  assert.equal(isCategory('masterpiece', 'clothes'), false);
});

test('classifier: composition bucket detects framing tags', () => {
  assert.equal(isCategory('close_up', 'composition'), true);
  assert.equal(isCategory('full_body', 'composition'), true);
  assert.equal(isCategory('from_above', 'composition'), true);
  assert.equal(isCategory('cowboy_shot', 'composition'), true);
  assert.equal(isCategory('depth_of_field', 'composition'), true);
  assert.equal(isCategory('upper_body', 'composition'), true);

  assert.equal(isCategory('cat', 'composition'), false);
  assert.equal(isCategory('blue_hair', 'composition'), false);
});

test('classifier: pose bucket detects pose and expression tags', () => {
  assert.equal(isCategory('standing', 'pose'), true);
  assert.equal(isCategory('looking_at_viewer', 'pose'), true);
  assert.equal(isCategory('arms_crossed', 'pose'), true);
  assert.equal(isCategory('blushing', 'pose'), true);
  assert.equal(isCategory('closed_eyes', 'pose'), true);
  assert.equal(isCategory('sitting', 'pose'), true);

  assert.equal(isCategory('cat', 'pose'), false);
  assert.equal(isCategory('blue_dress', 'pose'), false);
});

test('classifier: a tag can belong to more than one category', () => {
  assert.deepEqual(classify('nude_apron'), ['nsfw', 'clothes']);
  assert.deepEqual(classify('cowboy_shot'), ['composition']);
  assert.deepEqual(classify('masterpiece'), []);
});

test('classifier: excluded tags do not match despite containing a category token', () => {
  assert.equal(isCategory('bow_(weapon)', 'clothes'), false);
  assert.equal(isCategory('ring_(marking)', 'clothes'), false);
  assert.equal(isCategory('the_one_ring', 'clothes'), false);
  assert.equal(isCategory('power_glove', 'clothes'), false);
  assert.equal(isCategory('surprised_pikachu', 'pose'), false);
  assert.equal(isCategory('the_walking_dead', 'pose'), false);
  assert.equal(isCategory('angry_birds', 'pose'), false);
  assert.equal(isCategory('bag_of_holding', 'pose'), false);
  assert.equal(isCategory('cock_robin', 'nsfw'), false);
  assert.equal(isCategory('year_of_the_cock', 'nsfw'), false);
});

test('classifier: category-affirming disambiguators are still kept', () => {
  assert.equal(isCategory('shiroko_(swimsuit)_(blue_archive)', 'clothes'), true);
  assert.equal(isCategory('kayoko_(dress)_(blue_archive)', 'clothes'), true);
  assert.equal(isCategory('kabuto_(helmet)', 'clothes'), true);
  assert.equal(isCategory('masturbation_(female)', 'nsfw'), true);
  assert.equal(isCategory('crossed_legs_(sitting)', 'pose'), true);
  assert.equal(isCategory('ojigi_(bowing)', 'pose'), true);
});
