const test = require('node:test');
const assert = require('node:assert');

const { normalizeComfyConfig } = require('../jobService');

test('normalizeComfyConfig returns defaults for an empty body', () => {
  const config = normalizeComfyConfig({}, []);
  assert.equal(config.enabled, true);
  assert.equal(config.width, 512);
  assert.equal(config.height, 512);
  assert.equal(config.steps, 12);
  assert.equal(config.cfg, 2.5);
  assert.equal(config.sampler, 'euler');
  assert.equal(config.scheduler, 'normal');
  assert.equal(config.clipSkip, -2);
  assert.equal(config.simpleMask, false);
});

test('normalizeComfyConfig coerces numeric strings and trims text fields', () => {
  const config = normalizeComfyConfig(
    {
      width: '640',
      height: '384',
      steps: '18',
      cfg: '4.0',
      sampler: '  dpmpp_2m  ',
      scheduler: ' karras ',
      clipSkip: '3'
    },
    []
  );
  assert.equal(config.width, 640);
  assert.equal(config.height, 384);
  assert.equal(config.steps, 18);
  assert.equal(config.cfg, 4.0);
  assert.equal(config.sampler, 'dpmpp_2m');
  assert.equal(config.scheduler, 'karras');
  assert.equal(config.clipSkip, 3);
});

test('normalizeComfyConfig falls back to defaults on non-numeric input', () => {
  const config = normalizeComfyConfig(
    { width: 'abc', steps: NaN, cfg: '1.2.3', height: undefined, clipSkip: 'nope' },
    []
  );
  assert.equal(config.width, 512);
  assert.equal(config.steps, 12);
  assert.equal(config.cfg, 2.5);
  assert.equal(config.height, 512);
  assert.equal(config.clipSkip, -2);
});

test('normalizeComfyConfig allows negative clipSkip', () => {
  const config = normalizeComfyConfig({ clipSkip: '-2' }, []);
  assert.equal(config.clipSkip, -2);
});

test('normalizeComfyConfig respects enable flags', () => {
  const config = normalizeComfyConfig({ comfyEnabled: false, simpleMask: true, enableClipSkip: true }, []);
  assert.equal(config.enabled, false);
  assert.equal(config.simpleMask, true);
  assert.equal(config.enableClipSkip, true);
});

test('normalizeComfyConfig autofills checkpoint and separate vae from discovery', () => {
  const discovery = [{ checkpoints: ['model.safetensors'], vaes: ['vae.pt'] }];
  const config = normalizeComfyConfig({ useSeparateVae: true }, discovery);
  assert.equal(config.checkpoint, 'model.safetensors');
  assert.equal(config.separateVae, 'vae.pt');
});

test('normalizeComfyConfig keeps an explicit checkpoint and separate vae', () => {
  const config = normalizeComfyConfig({ comfyCheckpoint: 'custom.safetensors', separateVae: 'custom_vae.pt' }, [
    { checkpoints: ['other.safetensors'], vaes: ['other.pt'] }
  ]);
  assert.equal(config.checkpoint, 'custom.safetensors');
  assert.equal(config.separateVae, 'custom_vae.pt');
});
