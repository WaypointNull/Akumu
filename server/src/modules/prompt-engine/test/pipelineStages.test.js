const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const infer = require('../stages/infer');
const retrieve = require('../stages/retrieve');
const format = require('../stages/format');
const { createTagListRepository, createRetrievalIndex, parseCsvRecords } = require('../../tag-resolution');

const ALLOWED = new Set(['blue_hair', 'blonde_hair', 'green_eyes', 'sitting', 'on_rock', '1girl', 'masterpiece']);

test('infer.translate parses raw tags and drops section labels', async () => {
  const raw = 'blue_hair, red_hair\nGLOBAL_POSITIVE: xxx\n42, sitting';
  const deps = { llm: { ollamaGenerate: async () => raw } };
  const result = await infer.translate('a girl sitting', { model: 'test-model' }, deps);
  assert.equal(result.raw, raw);
  assert.deepEqual(result.tags, ['blue_hair', 'red_hair', 'sitting']);
});

test('infer.translate uses the creative prompt when mode is creative', async () => {
  let seenSystem = '';
  const deps = {
    llm: {
      ollamaGenerate: async (_model, system, _prompt) => {
        seenSystem = system;
        return 'blue_hair';
      }
    }
  };
  await infer.translate('a girl', { model: 'test-model', mode: 'creative' }, deps);
  assert.match(seenSystem, /compose descriptive compound tags/);
});

test('infer.candidatesFromTagList filters, dedupes and caps at 120', () => {
  const rawTags = ['blue_hair', 'not_in_list', 'sitting'];
  const result = infer.candidatesFromTagList(rawTags, ALLOWED);
  assert.deepEqual(result, ['blue_hair', 'sitting']);
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
    logPath
  };
  const { records } = retrieve.resolveAll(['masterpiece', 'blue_hair', 'blonde_hair', 'xyz'], 'some request', deps);

  const byOriginal = Object.fromEntries(records.map((r) => [r.original, r]));
  assert.equal(byOriginal.masterpiece.status, 'kept');
  assert.equal(byOriginal.blue_hair.status, 'kept');
  assert.equal(byOriginal.blonde_hair.status, 'alias');
  assert.equal(byOriginal.xyz.status, 'ambiguous');
  assert.ok(fs.existsSync(logPath));
  fs.rmSync(logPath, { force: true });
});

test('retrieve.resolveAll decomposes compounds whose parts all resolve exactly', () => {
  const resolver = (tag) =>
    ['dark', 'skinned', 'female', 'confused'].includes(tag)
      ? { status: 'exact', tag }
      : { status: 'unknown', tag, candidates: [] };
  const decompose = (tag) =>
    tag === 'dark_skinned_girl'
      ? { full: true, parts: ['dark', 'skinned', 'female'] }
      : tag === 'confused_expression'
        ? { full: false, parts: ['confused'] }
        : null;
  const deps = { retrieval: { resolve: resolver, decompose } };

  const { records } = retrieve.resolveAll(['dark_skinned_girl', 'confused_expression'], 'request', deps);
  const byOriginal = Object.fromEntries(records.map((r) => [r.original, r]));

  assert.equal(byOriginal.dark_skinned_girl.status, 'decomposed');
  assert.equal(byOriginal.dark_skinned_girl.tag, 'dark');
  assert.deepEqual(byOriginal.dark_skinned_girl.extraTags, ['skinned', 'female']);
  assert.equal(byOriginal.confused_expression.status, 'unknown');
  assert.deepEqual(byOriginal.confused_expression.decomposed, ['confused']);
});

test('retrieve.resolveAll is safe when decomposition is unavailable', () => {
  const resolver = (tag) => ({ status: 'exact', tag });
  const deps = { retrieval: { resolve: resolver } };
  const { records } = retrieve.resolveAll(['blue_hair'], 'request', deps);
  assert.equal(records[0].status, 'kept');
});

test('retrieve.resolveAll in creative mode surfaces invented tags to review instead of rewriting them', () => {
  const resolver = (tag) => {
    if (tag === 'blue_hair') return { status: 'exact', tag };
    if (tag === 'red_flannel_jacket')
      return {
        status: 'retrieved',
        tag: 'flannel_jacket',
        confidence: 0.8,
        margin: 0.3,
        candidates: [{ tag: 'flannel_jacket', score: 0.8 }]
      };
    return { status: 'unknown', tag, candidates: [] };
  };
  const decompose = (tag) => (tag === 'red_flannel_jacket' ? { full: true, parts: ['red', 'flannel_jacket'] } : null);
  const deps = { retrieval: { resolve: resolver, decompose } };

  const { records } = retrieve.resolveAll(['red_flannel_jacket'], 'request', deps, 'creative');
  const record = records[0];
  assert.equal(record.status, 'creative');
  assert.equal(record.tag, 'red_flannel_jacket');
  assert.deepEqual(record.decomposed, ['red', 'flannel_jacket']);
});

test('retrieve.resolveAll in creative mode keeps exact matches as kept', () => {
  const resolver = (tag) => ({ status: 'exact', tag });
  const deps = { retrieval: { resolve: resolver } };
  const { records } = retrieve.resolveAll(['blue_hair'], 'request', deps, 'creative');
  assert.equal(records[0].status, 'kept');
});

test('retrieve.resolveAll re-qualifies an alias to match a prompt franchise', () => {
  const repo = createTagListRepository();
  repo.loadFromRecords(
    parseCsvRecords(
      ['neeko_(aldehyde),4,206,neeko', 'neeko_(league_of_legends),4,533,', 'league_of_legends,3,70186,'].join('\n')
    )
  );
  const retrieval = createRetrievalIndex({ repository: repo });
  const { records } = retrieve.resolveAll(['neeko', 'league_of_legends'], 'Neeko from League of Legends', {
    retrieval
  });

  const neeko = records.find((r) => r.original === 'neeko');
  assert.equal(neeko.status, 'qualified');
  assert.equal(neeko.tag, 'neeko_(league_of_legends)');
  const league = records.find((r) => r.original === 'league_of_legends');
  assert.equal(league.status, 'kept');
});

test('retrieve.resolveAll keeps the alias default when the franchise is absent', () => {
  const repo = createTagListRepository();
  repo.loadFromRecords(
    parseCsvRecords(
      ['neeko_(aldehyde),4,206,neeko', 'neeko_(league_of_legends),4,533,', 'blue_hair,0,10000,'].join('\n')
    )
  );
  const retrieval = createRetrievalIndex({ repository: repo });
  const { records } = retrieve.resolveAll(['neeko', 'blue_hair'], 'Neeko with blue hair', { retrieval });

  const neeko = records.find((r) => r.original === 'neeko');
  assert.equal(neeko.status, 'alias');
  assert.equal(neeko.tag, 'neeko_(aldehyde)');
});

test('format.finalize returns promptTags and keeps ambiguous originals', () => {
  const records = [
    { original: 'blue_hair', tag: 'blue_hair', status: 'kept' },
    { original: 'dark_skinned_girl', tag: 'dark', extraTags: ['skinned', 'female'], status: 'decomposed' },
    { original: 'confused_expression', tag: 'confused_expression', status: 'ambiguous' }
  ];
  const { summary, formatted, promptTags } = format.finalize({
    records,
    candidates: [],
    loraInput: '',
    tagSet: new Set([...ALLOWED, 'dark', 'skinned', 'female'])
  });
  assert.match(summary, /decomposed into known tags/);
  assert.ok(promptTags.includes('dark'));
  assert.ok(promptTags.includes('skinned'));
  assert.ok(promptTags.includes('confused_expression'));
  assert.ok(formatted.finalText.includes('confused_expression'));
});

test('format.finalize keeps creative-mode originals even when not in the tag set', () => {
  const records = [
    {
      original: 'red_flannel_jacket',
      tag: 'red_flannel_jacket',
      status: 'creative',
      candidates: [{ tag: 'flannel_jacket', score: 0.8 }]
    },
    { original: 'blue_hair', tag: 'blue_hair', status: 'kept' }
  ];
  const { promptTags, formatted } = format.finalize({
    records,
    candidates: [],
    loraInput: '',
    tagSet: ALLOWED
  });
  assert.ok(promptTags.includes('red_flannel_jacket'));
  assert.ok(formatted.finalText.includes('red_flannel_jacket'));
});

test('format.finalize produces summary and capped prompt tags', () => {
  const records = [
    { original: 'blue_hair', tag: 'blue_hair', status: 'kept' },
    { original: 'blonde_hair', tag: 'blonde_hair', extraTags: ['green_eyes'], status: 'retrieved' },
    { original: 'cliff_edge', tag: 'cliff_edge', status: 'ambiguous' }
  ];
  const { summary, formatted } = format.finalize({
    records,
    candidates: [],
    loraInput: '',
    tagSet: ALLOWED
  });
  assert.match(summary, /Resolved 3 tags/);
  assert.ok(formatted.finalText.includes('Global Positive:'));
  assert.ok(formatted.positiveTags.includes('blue_hair'));
  assert.ok(formatted.positiveTags.includes('cliff_edge'));
});
