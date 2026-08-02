const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const infer = require('../stages/infer');
const retrieve = require('../stages/retrieve');
const canonicalize = require('../stages/canonicalize');
const format = require('../stages/format');

const ALLOWED = new Set(['blue_hair', 'blonde_hair', 'green_eyes', 'sitting', 'on_rock', '1girl', 'masterpiece']);

test('infer.translate parses raw tags and drops section labels', async () => {
  const raw = 'blue_hair, red_hair\nGLOBAL_POSITIVE: xxx\n42, sitting';
  const deps = { llm: { ollamaGenerate: async () => raw } };
  const result = await infer.translate('a girl sitting', { model: 'test-model' }, deps);
  assert.equal(result.raw, raw);
  assert.deepEqual(result.tags, ['blue_hair', 'red_hair', 'sitting']);
});

test('infer.candidatesFromTagList filters, dedupes and caps at 120', () => {
  const rawTags = ['blue_hair', 'not_in_list', 'sitting'];
  const result = infer.candidatesFromTagList(rawTags, 'a girl sitting on rock', ALLOWED);
  assert.deepEqual(result, ['blue_hair', 'sitting', 'on_rock', '1girl']);
});

test('retrieve.resolveAll classifies known, exact, alias, rule and ambiguous tags', () => {
  const resolver = (tag) => {
    if (tag === 'blue_hair') return { status: 'exact', tag };
    if (tag === 'blonde_hair') return { status: 'alias', tag };
    if (tag === 'xyz') return { status: 'unknown', tag, candidates: [{ tag: 'xy', score: 0.9 }] };
    return { status: 'unknown', tag, candidates: [] };
  };
  const logPath = path.join(os.tmpdir(), 'ambiguous-log-test.ndjson');
  const deps = {
    retrieval: { resolve: resolver },
    ruleTable: { resolveWithRules: () => null },
    logPath
  };
  const { records, pending } = retrieve.resolveAll(
    ['masterpiece', 'blue_hair', 'blonde_hair', 'xyz'],
    'some request',
    deps
  );

  const byOriginal = Object.fromEntries(records.map((r) => [r.original, r]));
  assert.equal(byOriginal.masterpiece.status, 'kept');
  assert.equal(byOriginal.blue_hair.status, 'kept');
  assert.equal(byOriginal.blonde_hair.status, 'alias');
  assert.equal(byOriginal.xyz.status, 'ambiguous');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].original, 'xyz');
  assert.ok(fs.existsSync(logPath));
  fs.rmSync(logPath, { force: true });
});

test('canonicalize.apply is a no-op when disabled', async () => {
  const records = [{ original: 'xyz', tag: 'xyz', status: 'ambiguous', pendingIndex: 0 }];
  const pending = [{ index: 0, original: 'xyz', candidates: [] }];
  let called = false;
  const result = await canonicalize.apply(
    records,
    pending,
    'request',
    {
      enabled: false,
      model: 'm',
      canonicalizer: async () => {
        called = true;
        return { concepts: [] };
      }
    },
    {}
  );
  assert.equal(result, records);
  assert.equal(called, false);
});

test('canonicalize.apply resolves ambiguous concepts when enabled', async () => {
  const records = [{ original: 'xyz', tag: 'xyz', status: 'ambiguous', pendingIndex: 0 }];
  const pending = [{ index: 0, original: 'xyz', candidates: [{ tag: 'xy' }, { tag: 'xz' }] }];
  const canonicalizer = async () => ({
    concepts: [
      { index: 0, status: 'resolved', accepted: [{ tag: 'xy' }, { tag: 'xz' }], proposed: ['xy'], rejected: [] }
    ]
  });
  const result = await canonicalize.apply(
    records,
    pending,
    'request',
    { enabled: true, model: 'm', canonicalizer },
    {}
  );
  assert.equal(result[0].status, 'canonicalized');
  assert.equal(result[0].tag, 'xy');
  assert.deepEqual(result[0].extraTags, ['xz']);
});

test('format.finalize produces summary and capped prompt tags', () => {
  const records = [
    { original: 'blue_hair', tag: 'blue_hair', status: 'kept' },
    { original: 'blonde_hair', tag: 'blonde_hair', extraTags: ['green_eyes'], status: 'rule' }
  ];
  const { summary, formatted } = format.finalize({
    records,
    candidates: [],
    naturalLanguage: '',
    loraInput: '',
    tagSet: ALLOWED
  });
  assert.match(summary, /Resolved 2 tags/);
  assert.ok(formatted.finalText.includes('Global Positive:'));
  assert.ok(formatted.positiveTags.includes('blue_hair'));
  assert.ok(formatted.positiveTags.includes('1girl'));
});
