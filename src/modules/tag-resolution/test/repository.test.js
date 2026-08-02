const test = require('node:test');
const assert = require('node:assert');

const { createTagListRepository, createRetrievalIndex } = require('../');
const { parseCsvRecords } = require('../parser');

const CSV = [
  'blue_hair,general,10000,"blue locks"',
  'blonde_hair,general,9000,blonde_locks',
  'winter_gloves,general,1000,gloves',
  'mittens,general,5000,gloves',
  'green_eyes,general,5000,'
].join('\n');

test('loadFromRecords builds tag set, aliases and collision winners', () => {
  const repo = createTagListRepository();
  const summary = repo.loadFromRecords(parseCsvRecords(CSV));

  assert.equal(repo.isLoaded(), true);
  assert.equal(summary.tags, 5);
  assert.ok(repo.getTagSet().has('blue_hair'));
  assert.deepEqual(repo.resolveTag('blue_hair'), { status: 'exact', tag: 'blue_hair' });
  assert.deepEqual(repo.resolveTag('blue_locks'), { status: 'alias', tag: 'blue_hair' });
  assert.equal(repo.resolveTag('zzz').status, 'unknown');
  assert.deepEqual(repo.resolveTag('gloves'), { status: 'alias', tag: 'mittens' });
  assert.ok(repo.getCanonicalAliases('mittens').includes('gloves'));
  assert.equal(repo.getAliasCollisions().size, 1);
});

test('repositories are isolated instances (no shared state)', () => {
  const a = createTagListRepository();
  const b = createTagListRepository();
  a.loadFromRecords(parseCsvRecords(CSV));
  assert.equal(a.isLoaded(), true);
  assert.equal(b.isLoaded(), false);
  assert.equal(b.getTagSet().size, 0);
});

test('retrieval index resolves exact, alias and fuzzy matches from a repository', () => {
  const repo = createTagListRepository();
  repo.loadFromRecords(parseCsvRecords(CSV));
  const index = createRetrievalIndex({ repository: repo });

  const stats = index.buildIndex();
  assert.equal(stats.tags, 5);
  assert.equal(index.isBuilt(), true);

  assert.deepEqual(index.resolve('blue_hair'), { status: 'exact', tag: 'blue_hair' });
  assert.deepEqual(index.resolve('blue_locks'), { status: 'alias', tag: 'blue_hair' });

  const candidates = index.retrieve('blond_hair');
  assert.ok(candidates.length >= 1);
  assert.equal(candidates[0].tag, 'blonde_hair');

  const fuzzy = index.resolve('blond_hair');
  assert.equal(fuzzy.status, 'retrieved');
  assert.equal(fuzzy.tag, 'blonde_hair');
});
