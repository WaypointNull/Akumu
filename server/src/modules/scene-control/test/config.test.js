const { test } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSceneConfig } = require('../config');

test('normalizeSceneConfig: defaults for an empty body', () => {
  const config = normalizeSceneConfig({}, []);
  assert.equal(config.width, 512);
  assert.equal(config.height, 512);
  assert.equal(config.steps, 12);
  assert.equal(config.cfg, 2.5);
  assert.equal(config.sampler, 'euler');
  assert.equal(config.scheduler, 'normal');
  assert.equal(config.controlNet.name, '');
  assert.equal(config.controlNet.strength, 0.75);
  assert.equal(config.controlNet.startPercent, 0.0);
  assert.equal(config.controlNet.endPercent, 1.0);
  assert.ok(Number.isInteger(config.seed));
});

test('normalizeSceneConfig: autofills checkpoint from discovery', () => {
  const config = normalizeSceneConfig({}, [{ checkpoints: ['model.safetensors'] }]);
  assert.equal(config.checkpoint, 'model.safetensors');
});

test('normalizeSceneConfig: clamps controlnet strength and percentages', () => {
  const config = normalizeSceneConfig({ controlStrength: '99', controlStart: '-1', controlEnd: '0.5' }, []);
  assert.equal(config.controlNet.strength, 2.0);
  assert.equal(config.controlNet.startPercent, 0.0);
  assert.equal(config.controlNet.endPercent, 0.5);
});

test('normalizeSceneConfig: ensures startPercent never exceeds endPercent', () => {
  const config = normalizeSceneConfig({ controlStart: '0.8', controlEnd: '0.2' }, []);
  assert.equal(config.controlNet.startPercent, 0.8);
  assert.equal(config.controlNet.endPercent, 0.8);
});

test('normalizeSceneConfig: accepts an explicit seed', () => {
  const config = normalizeSceneConfig({ seed: '42' }, []);
  assert.equal(config.seed, 42);
});
