const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildControlNetWorkflow } = require('../workflow');

const BASE = {
  comfy: {
    checkpoint: 'model.safetensors',
    width: 512,
    height: 512,
    steps: 20,
    cfg: 5.5,
    sampler: 'euler',
    scheduler: 'normal',
    enableClipSkip: false,
    useSeparateVae: false
  },
  positive: 'a girl',
  negative: 'bad quality',
  seed: 123
};

test('buildControlNetWorkflow: wires ControlNet into the sampler when used', () => {
  const workflow = buildControlNetWorkflow({
    ...BASE,
    controlNet: { name: 'scribble.safetensors', strength: 0.75, startPercent: 0.0, endPercent: 1.0 },
    controlImage: 'scene_control.png'
  });

  assert.equal(workflow['13'].class_type, 'LoadImage');
  assert.equal(workflow['13'].inputs.image, 'scene_control.png');
  assert.equal(workflow['14'].class_type, 'ControlNetLoader');
  assert.equal(workflow['14'].inputs.control_net_name, 'scribble.safetensors');
  assert.equal(workflow['15'].class_type, 'ControlNetApplyAdvanced');
  assert.equal(workflow['15'].inputs.strength, 0.75);
  assert.equal(workflow['15'].inputs.start_percent, 0.0);
  assert.equal(workflow['15'].inputs.end_percent, 1.0);
  assert.deepEqual(workflow['15'].inputs.positive, ['6', 0]);
  assert.deepEqual(workflow['15'].inputs.negative, ['7', 0]);
  assert.deepEqual(workflow['15'].inputs.control_net, ['14', 0]);
  assert.deepEqual(workflow['15'].inputs.image, ['13', 0]);
  assert.deepEqual(workflow['3'].inputs.model, ['4', 0]);
  assert.deepEqual(workflow['3'].inputs.positive, ['15', 0]);
  assert.deepEqual(workflow['3'].inputs.negative, ['15', 1]);
});

test('buildControlNetWorkflow: omits ControlNet nodes without a control image', () => {
  const workflow = buildControlNetWorkflow({ ...BASE, controlNet: null, controlImage: null });
  assert.equal(workflow['13'], undefined);
  assert.equal(workflow['14'], undefined);
  assert.equal(workflow['15'], undefined);
  assert.deepEqual(workflow['3'].inputs.model, ['4', 0]);
  assert.deepEqual(workflow['3'].inputs.positive, ['6', 0]);
  assert.deepEqual(workflow['3'].inputs.negative, ['7', 0]);
});

test('buildControlNetWorkflow: controlnet requires both a model name and an image', () => {
  const workflow = buildControlNetWorkflow({
    ...BASE,
    controlNet: { name: 'scribble.safetensors', strength: 0.75, startPercent: 0.0, endPercent: 1.0 },
    controlImage: null
  });
  assert.equal(workflow['15'], undefined);
});

test('buildControlNetWorkflow: adds CLIPSetLastLayer when clip skip is enabled', () => {
  const workflow = buildControlNetWorkflow({
    ...BASE,
    comfy: { ...BASE.comfy, enableClipSkip: true, clipSkip: -2 }
  });
  assert.equal(workflow['10'].class_type, 'CLIPSetLastLayer');
  assert.equal(workflow['10'].inputs.stop_at_clip_layer, -2);
  assert.deepEqual(workflow['6'].inputs.clip, ['10', 0]);
});

test('buildControlNetWorkflow: adds VAELoader when a separate vae is used', () => {
  const workflow = buildControlNetWorkflow({
    ...BASE,
    comfy: { ...BASE.comfy, useSeparateVae: true, separateVae: 'vae.pt' }
  });
  assert.equal(workflow['11'].class_type, 'VAELoader');
  assert.deepEqual(workflow['8'].inputs.vae, ['11', 0]);
});
