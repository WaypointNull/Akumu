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

test('infer.translate ignores mode and uses the same dense count-free prompt in every mode', async () => {
  const calls = [];
  const deps = {
    llm: {
      ollamaGenerate: async (_model, system, prompt) => {
        calls.push({ system, prompt });
        return 'blue_hair';
      }
    }
  };
  await infer.translate('a girl', { model: 'test-model', mode: 'strict' }, deps);
  await infer.translate('a girl', { model: 'test-model', mode: 'creative' }, deps);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].system, calls[1].system);
  assert.equal(calls[0].prompt, calls[1].prompt);
  assert.match(calls[0].prompt, /dense, complete tag list/);
  assert.match(calls[0].prompt, /approximately 20-30/);
  assert.match(calls[0].prompt, /Do not invent tags/);
  assert.ok(!calls[0].system.includes('compose descriptive compound tags'));
});

test('infer.translate feeds LoRA tags to the LLM as context', async () => {
  let seenPrompt = '';
  const deps = {
    llm: {
      ollamaGenerate: async (_model, _system, prompt) => {
        seenPrompt = prompt;
        return 'blue_hair';
      }
    }
  };
  await infer.translate(
    'a knight with a torch',
    { model: 'test-model', mode: 'strict', loraInput: '<lora:palworld_sekhmet:1.0>, <lora:my_character:0.8>' },
    deps
  );
  assert.match(seenPrompt, /LoRA tags/);
  assert.match(seenPrompt, /<lora:palworld_sekhmet:1.0>/);
  assert.match(seenPrompt, /do NOT output these/);
  const requestIndex = seenPrompt.indexOf('Request:');
  assert.ok(requestIndex > -1);
});

test('infer.stripLoraEchoes drops tags that echo the LoRA trigger list', () => {
  const lora = 'moridef, veil, tiara, long black sleeveless dress, cleavage';
  const tags = ['moridef', 'veil', 'long_black_sleeveless_dress', 'cleavage', '1girl', 'holding'];
  assert.deepEqual(infer.stripLoraEchoes(tags, lora), ['1girl', 'holding']);
});

test('infer.stripLoraEchoes leaves unrelated or partial tags alone', () => {
  const lora = 'mochi (catgirl), bell collar';
  const tags = ['red_flannel_jacket', 'bell', 'catgirl', 'holding_fishing_rod'];
  assert.deepEqual(infer.stripLoraEchoes(tags, lora), tags);
});

test('infer.stripLoraEchoes is a no-op without lora input', () => {
  const tags = ['veil', '1girl'];
  assert.deepEqual(infer.stripLoraEchoes(tags, ''), tags);
});

test('infer.translate strips LoRA trigger echoes from the returned tags', async () => {
  const deps = {
    llm: {
      ollamaGenerate: async () => 'veil, tiara, 1girl, blue_hair'
    }
  };
  const result = await infer.translate('a girl', { model: 'test-model', loraInput: 'moridef, veil, tiara' }, deps);
  assert.deepEqual(result.tags, ['1girl', 'blue_hair']);
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

test('retrieve.resolveAll routes invented overlong tags to review instead of keeping them', () => {
  const resolver = (tag) => ({ status: 'unknown', tag, candidates: [{ tag: 'motorcycle', score: 0.9 }] });
  const deps = { retrieval: { resolve: resolver } };
  const { records } = retrieve.resolveAll(
    ['motorcycle_brake_fluid_thermal_cycling_optimization_test_sim_run'],
    'a biker girl',
    deps
  );
  const record = records[0];
  assert.equal(record.status, 'overlong');
  assert.equal(record.action, 'review');
  assert.equal(record.tag, 'motorcycle_brake_fluid_thermal_cycling_optimization_test_sim_run');
  assert.equal(record.candidates.length, 1);
});

test('retrieve.resolveAll keeps exact overlong series titles as kept', () => {
  const resolver = (tag) =>
    tag === 'ore_no_imouto_ga_konna_ni_kawaii_wake_ga_nai' ? { status: 'exact', tag } : { status: 'unknown', tag };
  const deps = { retrieval: { resolve: resolver } };
  const { records } = retrieve.resolveAll(['ore_no_imouto_ga_konna_ni_kawaii_wake_ga_nai'], 'request', deps);
  const record = records[0];
  assert.equal(record.status, 'kept');
  assert.equal(record.action, 'kept');
});

test('format.finalize excludes overlong tags from the output', () => {
  const records = [
    { original: 'blue_hair', tag: 'blue_hair', status: 'kept' },
    {
      original: 'motorcycle_brake_fluid_thermal_cycling_optimization_test_sim_run',
      tag: 'motorcycle_brake_fluid_thermal_cycling_optimization_test_sim_run',
      status: 'overlong'
    }
  ];
  const { summary, promptTags, formatted } = format.finalize({
    records,
    candidates: [],
    loraInput: '',
    tagSet: ALLOWED
  });
  assert.match(summary, /flagged \(overlong, sent to review\)/);
  assert.ok(!promptTags.includes('motorcycle_brake_fluid_thermal_cycling_optimization_test_sim_run'));
  assert.ok(!formatted.finalText.includes('motorcycle_brake_fluid_thermal_cycling_optimization_test_sim_run'));
  assert.ok(promptTags.includes('blue_hair'));
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

test('retrieve.resolveAll refuses to auto-accept decompositions whose parts are noise words', () => {
  const resolver = (tag) =>
    ['library', 'setting', 'light', 'clothed'].includes(tag)
      ? { status: 'exact', tag }
      : { status: 'unknown', tag, candidates: [] };
  const decompose = (tag) =>
    tag === 'library_setting'
      ? { full: true, parts: ['library', 'setting'] }
      : tag === 'light_clothed'
        ? { full: true, parts: ['light', 'clothed'] }
        : null;
  const deps = { retrieval: { resolve: resolver, decompose } };

  const { records } = retrieve.resolveAll(['library_setting', 'light_clothed'], 'request', deps);
  assert.equal(records.length, 2);
  for (const r of records) {
    assert.notEqual(r.status, 'decomposed');
    assert.ok(r.decomposed && r.decomposed.length > 0);
  }
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

test('retrieve.collapseNumberedDuplicates collapses invented numbered padding into a single tag', () => {
  const isKnown = (tag) => ['figure_17'].includes(tag);
  const input = [
    'please_ignore_1',
    'please_ignore_2',
    'please_ignore_3',
    'please_ignore_4',
    'figure_17',
    'figure_18',
    'figure_19',
    'test_tag'
  ];
  const out = retrieve.collapseNumberedDuplicates(input, isKnown);
  assert.deepEqual(out, ['please_ignore_1', 'figure_17', 'figure_18', 'figure_19', 'test_tag']);
});

test('retrieve.collapseNumberedDuplicates leaves fewer than three variants alone', () => {
  const out = retrieve.collapseNumberedDuplicates(['please_ignore_1', 'please_ignore_2'], () => false);
  assert.deepEqual(out, ['please_ignore_1', 'please_ignore_2']);
});

test('retrieve.resolveAll collapses padded numbering and skips weak ambiguous log spam', () => {
  const resolver = (tag) => {
    if (tag === 'test_tag') return { status: 'unknown', tag, candidates: [{ tag: 'test_tube', score: 0.6 }] };
    if (tag === 'please_ignore_1')
      return { status: 'unknown', tag, candidates: [{ tag: 'please_respond', score: 0.42 }] };
    return { status: 'unknown', tag, candidates: [] };
  };
  const logPath = path.join(os.tmpdir(), 'ambiguous-log-padding.ndjson');
  const deps = { retrieval: { resolve: resolver }, logPath };
  const tags = ['test_tag', ...Array.from({ length: 20 }, (_, i) => `please_ignore_${i + 1}`)];

  const { records } = retrieve.resolveAll(tags, 'Test tag, please ignore', deps);
  assert.equal(records.length, 2);
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean) : [];
  assert.equal(log.length, 1);
  assert.ok(log[0].includes('test_tag'));
  fs.rmSync(logPath, { force: true });
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

test('format.finalize withholds junk tags from the output when content is low', () => {
  const records = [
    { original: 'test_tag', tag: 'test_tag', status: 'ambiguous', candidates: [{ tag: 'test_tube', score: 0.6 }] },
    { original: 'please_ignore_1', tag: 'please_ignore_1', status: 'unknown' },
    { original: 'blue_hair', tag: 'blue_hair', status: 'kept' }
  ];
  const { promptTags, summary, formatted, lowContent } = format.finalize({
    records,
    candidates: [],
    loraInput: '',
    tagSet: ALLOWED
  });
  assert.equal(lowContent, true);
  assert.ok(promptTags.includes('blue_hair'));
  assert.ok(!promptTags.includes('test_tag'));
  assert.ok(!promptTags.includes('please_ignore_1'));
  assert.ok(!formatted.finalText.includes('test_tag'));
  assert.match(summary, /Low content/);
});

test('format.finalize does not smuggle raw candidates past the low-content guard', () => {
  const records = [
    { original: 'test_tag', tag: 'test_tag', status: 'ambiguous', candidates: [{ tag: 'test_tube', score: 0.6 }] },
    { original: 'please_ignore', tag: 'please_ignore', status: 'unknown' },
    { original: 'testing', tag: 'testing', status: 'ambiguous' }
  ];
  const { promptTags, lowContent } = format.finalize({
    records,
    candidates: ['1girl', 'blue_hair'],
    loraInput: '',
    tagSet: ALLOWED
  });
  assert.equal(lowContent, true);
  assert.deepEqual(promptTags, []);
});

test('format.finalize still keeps raw candidates when content is solid', () => {
  const records = [
    { original: 'blue_hair', tag: 'blue_hair', status: 'kept' },
    { original: 'green_eyes', tag: 'green_eyes', status: 'kept' }
  ];
  const { promptTags, lowContent } = format.finalize({
    records,
    candidates: ['sitting', '1girl'],
    loraInput: '',
    tagSet: ALLOWED
  });
  assert.equal(lowContent, false);
  assert.ok(promptTags.includes('sitting'));
  assert.ok(promptTags.includes('1girl'));
});

test('format.finalize keeps ambiguous tags when solid content outweighs the junk', () => {
  const records = [
    { original: 'blue_hair', tag: 'blue_hair', status: 'kept' },
    { original: 'blonde_hair', tag: 'blonde_hair', status: 'kept' },
    { original: 'confused_expression', tag: 'confused_expression', status: 'ambiguous' }
  ];
  const { promptTags, lowContent } = format.finalize({
    records,
    candidates: [],
    loraInput: '',
    tagSet: ALLOWED
  });
  assert.equal(lowContent, false);
  assert.ok(promptTags.includes('confused_expression'));
});

test('format.finalize withholds hallucinated tags that share no input words', () => {
  const records = [
    { original: '1girl', tag: '1girl', status: 'kept' },
    { original: 'brown_hair', tag: 'brown_hair', status: 'kept' },
    { original: 'wading', tag: 'wading', status: 'kept' },
    { original: 'white_tank_top', tag: 'white_tank_top', status: 'kept' }
  ];
  const { promptTags, lowContent } = format.finalize({
    records,
    candidates: [],
    loraInput: '',
    tagSet: ALLOWED,
    naturalLanguage: 'Test tag, please ignore'
  });
  assert.equal(lowContent, true);
  assert.deepEqual(promptTags, []);
});

test('format.finalize keeps anchored tags even when other tags are hallucinated', () => {
  const records = [
    { original: 'cat', tag: 'cat', status: 'kept' },
    { original: 'wading', tag: 'wading', status: 'kept' },
    { original: 'mountain', tag: 'mountain', status: 'kept' },
    { original: 'large_breasts', tag: 'large_breasts', status: 'kept' }
  ];
  const { promptTags, lowContent } = format.finalize({
    records,
    candidates: [],
    loraInput: '',
    tagSet: ALLOWED,
    naturalLanguage: 'a cat'
  });
  assert.equal(lowContent, true);
  assert.deepEqual(promptTags, ['cat']);
});

test('format.finalize does not flag well-anchored content as hallucinated', () => {
  const records = [
    { original: '1girl', tag: '1girl', status: 'kept' },
    { original: 'kimono', tag: 'kimono', status: 'kept' },
    { original: 'paper_lantern', tag: 'paper_lantern', status: 'kept' },
    { original: 'fireworks', tag: 'fireworks', status: 'kept' }
  ];
  const { promptTags, lowContent } = format.finalize({
    records,
    candidates: [],
    loraInput: '',
    tagSet: ALLOWED,
    naturalLanguage: 'a girl in a kimono holding a paper lantern at a festival with fireworks'
  });
  assert.equal(lowContent, false);
  assert.deepEqual(promptTags, ['1girl', 'paper_lantern', 'fireworks', 'kimono']);
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
