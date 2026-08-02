const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseCsvLine, parseCsvRecords } = require('../parser');

test('parseCsvLine: splits plain fields', () => {
  assert.deepEqual(parseCsvLine('tag,general,123'), ['tag', 'general', '123']);
});

test('parseCsvLine: handles quoted fields with commas and escaped quotes', () => {
  assert.deepEqual(parseCsvLine('tag,"a, b",5'), ['tag', 'a, b', '5']);
  assert.deepEqual(parseCsvLine('"x""y",z'), ['x"y', 'z']);
});

test('parseCsvRecords: builds records with aliases and skips junk lines', () => {
  const text = [
    'tag1,general,100,"alias1,alias2"',
    'tag2,character,50',
    '',
    'bad_row',
    'tag3,general,10,"quoted alias"'
  ].join('\n');

  const records = parseCsvRecords(text);
  assert.equal(records.length, 3);
  assert.deepEqual(records[0], { tag: 'tag1', category: 'general', posts: '100', aliases: ['alias1', 'alias2'] });
  assert.deepEqual(records[1], { tag: 'tag2', category: 'character', posts: '50', aliases: [] });
  assert.deepEqual(records[2], { tag: 'tag3', category: 'general', posts: '10', aliases: ['quoted alias'] });
});

test('parseCsvRecords: returns empty array for empty input', () => {
  assert.deepEqual(parseCsvRecords(''), []);
});
