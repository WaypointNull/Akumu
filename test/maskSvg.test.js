const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildComfyMaskPrompt,
  generateSimpleRgbMaskDataUri,
  getSlotPositions,
  createSilhouetteSvg
} = require('../src/utils/maskSvg');

test('buildComfyMaskPrompt: includes pose, request, and base guidance', () => {
  const prompt = buildComfyMaskPrompt('stickman, full_body', 'a girl');
  assert.ok(prompt.includes('stickman, full_body'));
  assert.ok(prompt.includes('a girl'));
  assert.ok(prompt.includes('rgb mask'));
  assert.ok(prompt.includes('red subject rgb(255,0,0)'));
});

test('getSlotPositions: slot count matches channel count', () => {
  assert.equal(getSlotPositions(0, 100, 100).length, 1);
  assert.equal(getSlotPositions(1, 100, 100).length, 1);
  assert.equal(getSlotPositions(2, 100, 100).length, 2);
  assert.equal(getSlotPositions(3, 100, 100).length, 3);
});

test('getSlotPositions: coordinates stay within canvas', () => {
  for (const count of [1, 2, 3]) {
    for (const slot of getSlotPositions(count, 512, 512)) {
      assert.ok(slot.x > 0 && slot.x < 512);
      assert.ok(slot.y > 0 && slot.y < 512);
    }
  }
});

test('generateSimpleRgbMaskDataUri: returns a base64 SVG data URI', () => {
  const uri = generateSimpleRgbMaskDataUri({
    width: 512,
    height: 512,
    channels: [{ enabled: true, color: 'rgb(255,0,0)' }]
  });
  assert.ok(uri.startsWith('data:image/svg+xml;base64,'));
  const svg = Buffer.from(uri.split(',')[1], 'base64').toString('utf8');
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('rgb(255,0,0)'));
});

test('generateSimpleRgbMaskDataUri: clamps dimensions to safe range', () => {
  const uri = generateSimpleRgbMaskDataUri({ width: 99999, height: 1, channels: [] });
  const svg = Buffer.from(uri.split(',')[1], 'base64').toString('utf8');
  assert.ok(svg.includes('width="2048"'));
  assert.ok(svg.includes('height="256"'));
});

test('createSilhouetteSvg: renders a group with the requested fill', () => {
  const svg = createSilhouetteSvg({ x: 100, y: 200, scale: 1 }, 'rgb(0,255,0)', 512, 512);
  assert.ok(svg.includes('fill="rgb(0,255,0)"'));
  assert.ok(svg.includes('<circle'));
  assert.ok(svg.includes('<rect'));
});
