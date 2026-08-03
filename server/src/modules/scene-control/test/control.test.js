const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isSupportedCombo, parseImageDataUrl, buildControlImage } = require('../control');

test('isSupportedCombo: sketch accepts the line-based control modes', () => {
  assert.equal(isSupportedCombo('sketch', 'scribble'), true);
  assert.equal(isSupportedCombo('sketch', 'lineart'), true);
  assert.equal(isSupportedCombo('sketch', 'canny'), true);
  assert.equal(isSupportedCombo('sketch', 'openpose'), false);
  assert.equal(isSupportedCombo('sketch', 'depth'), false);
  assert.equal(isSupportedCombo('sketch', 'segmentation'), false);
});

test('isSupportedCombo: source none is always allowed', () => {
  assert.equal(isSupportedCombo('none', 'scribble'), true);
  assert.equal(isSupportedCombo('none', ''), true);
});

test('isSupportedCombo: unknown sources and modes are rejected', () => {
  assert.equal(isSupportedCombo('pose_library', 'openpose'), false);
  assert.equal(isSupportedCombo('upload', 'lineart'), false);
  assert.equal(isSupportedCombo('sketch', ''), false);
  assert.equal(isSupportedCombo('', ''), false);
});

test('parseImageDataUrl: parses a PNG data URL', () => {
  const base64 = Buffer.from('fake-png-bytes').toString('base64');
  const parsed = parseImageDataUrl(`data:image/png;base64,${base64}`);
  assert.equal(parsed.mimeType, 'image/png');
  assert.deepEqual(parsed.buffer, Buffer.from('fake-png-bytes'));
});

test('parseImageDataUrl: accepts jpeg and webp', () => {
  for (const mime of ['image/jpeg', 'image/webp']) {
    const parsed = parseImageDataUrl(`data:${mime};base64,${Buffer.from('x').toString('base64')}`);
    assert.equal(parsed.mimeType, mime);
  }
});

test('parseImageDataUrl: rejects invalid input', () => {
  assert.equal(parseImageDataUrl(''), null);
  assert.equal(parseImageDataUrl('data:text/plain;base64,AA=='), null);
  assert.equal(parseImageDataUrl('not a data url'), null);
  assert.equal(parseImageDataUrl(null), null);
  assert.equal(parseImageDataUrl(undefined), null);
});

test('buildControlImage: sketch/scribble returns the parsed image', () => {
  const dataUrl = `data:image/png;base64,${Buffer.from('sketch').toString('base64')}`;
  const control = buildControlImage({ source: 'sketch', mode: 'scribble', sketchImage: dataUrl });
  assert.equal(control.mimeType, 'image/png');
  assert.deepEqual(control.buffer, Buffer.from('sketch'));
});

test('buildControlImage: source none returns null', () => {
  const control = buildControlImage({ source: 'none', mode: 'scribble', sketchImage: null });
  assert.equal(control, null);
});

test('buildControlImage: unsupported combos throw a 400', () => {
  assert.throws(
    () => buildControlImage({ source: 'sketch', mode: 'openpose', sketchImage: 'data:image/png;base64,AA==' }),
    /not implemented/
  );
  assert.throws(
    () => buildControlImage({ source: 'pose_library', mode: 'openpose', sketchImage: 'data:image/png;base64,AA==' }),
    /not implemented/
  );
});

test('buildControlImage: missing or invalid sketch throws a 400', () => {
  assert.throws(() => buildControlImage({ source: 'sketch', mode: 'scribble', sketchImage: '' }), /data URL/);
  assert.throws(() => buildControlImage({ source: 'sketch', mode: 'scribble', sketchImage: 'garbage' }), /data URL/);
});
