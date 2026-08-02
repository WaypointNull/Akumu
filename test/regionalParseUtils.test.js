const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseRegionalText } = require('../src/utils/regionalParseUtils');

test('parseRegionalText: extracts all four channel lines', () => {
  const text = [
    'RED: 1girl, red_hair',
    'GREEN: 1boy, green_hair',
    'BLUE: 1girl, blue_hair',
    'GLOBAL_NEGATIVE: bad_quality, watermark'
  ].join('\n');

  assert.deepEqual(parseRegionalText(text), {
    red: '1girl, red_hair',
    green: '1boy, green_hair',
    blue: '1girl, blue_hair',
    globalNegative: 'bad_quality, watermark'
  });
});

test('parseRegionalText: is case-insensitive and tolerant of extra prose', () => {
  const text = 'Intro text here\nred: foo\nGREEN : bar\nAnything else\nBLUE: baz\nGLOBAL_NEGATIVE: neg';
  assert.deepEqual(parseRegionalText(text), {
    red: 'foo',
    green: 'bar',
    blue: 'baz',
    globalNegative: 'neg'
  });
});

test('parseRegionalText: missing channels become empty strings', () => {
  assert.deepEqual(parseRegionalText('RED: only_red'), {
    red: 'only_red',
    green: '',
    blue: '',
    globalNegative: ''
  });
  assert.deepEqual(parseRegionalText(''), {
    red: '',
    green: '',
    blue: '',
    globalNegative: ''
  });
});
