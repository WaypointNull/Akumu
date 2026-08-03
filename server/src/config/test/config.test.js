const { test } = require('node:test');
const assert = require('node:assert/strict');

const constants = require('../constants');

test('config: retrieval weights sum to 1', () => {
  const { trigram, damerau, bm25 } = constants.RETRIEVAL.weights;
  assert.ok(Math.abs(trigram + damerau + bm25 - 1) < 1e-9);
});

test('config: default models are non-empty strings', () => {
  for (const model of Object.values(constants.DEFAULTS)) {
    assert.equal(typeof model, 'string');
    assert.ok(model.trim().length > 0);
  }
});

test('config: required tag lists are non-empty', () => {
  assert.ok(constants.REQUIRED_POSITIVE.length > 0);
  assert.ok(constants.REQUIRED_NEGATIVE.length > 0);
  assert.ok(constants.EXTRA_NEGATIVE.length > 0);
});
