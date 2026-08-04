const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const adapterPath = require.resolve('../hubAdapter');
const fakeSdkPath = path.join(__dirname, 'fixtures', 'fakeSdk.js');
const callsPath = path.join(__dirname, 'fixtures', 'calls.jsonl');

function loadFreshAdapter() {
  delete require.cache[adapterPath];
  return require(adapterPath);
}

test('recordToTagList maps a pipeline result into a tag-list@1 payload', () => {
  const hubAdapter = loadFreshAdapter();
  const { schema, input, output } = hubAdapter.recordToTagList(
    { naturalLanguage: 'neeko in the forest', loraInput: ' arona ', modelTranslate: ' qwen2.5:7b ', mode: 'relaxed' },
    {
      final: {
        positiveTags: ['masterpiece', '1girl'],
        negativeTags: ['bad_quality'],
        globalPositiveText: 'masterpiece, 1girl',
        globalNegativeText: 'bad_quality, watermark',
        finalText: 'Global Positive:\nmasterpiece, 1girl'
      }
    }
  );

  assert.equal(schema, 'tag-list@1');
  assert.deepEqual(input, {
    naturalLanguage: 'neeko in the forest',
    loraInput: ' arona ',
    modelTranslate: ' qwen2.5:7b ',
    mode: 'relaxed'
  });
  assert.deepEqual(output.positiveTags, ['masterpiece', '1girl']);
  assert.deepEqual(output.negativeTags, ['bad_quality']);
  assert.equal(output.globalPositiveText, 'masterpiece, 1girl');
  assert.equal(output.globalNegativeText, 'bad_quality, watermark');
  assert.equal(output.finalText, 'Global Positive:\nmasterpiece, 1girl');
});

test('recordToTagList tolerates a missing final block and missing request fields', () => {
  const hubAdapter = loadFreshAdapter();
  const { input, output } = hubAdapter.recordToTagList({}, {});
  assert.deepEqual(input, { naturalLanguage: undefined, loraInput: '', modelTranslate: '', mode: 'strict' });
  assert.deepEqual(output, {
    positiveTags: [],
    negativeTags: [],
    globalPositiveText: '',
    globalNegativeText: '',
    finalText: ''
  });
});

test('emitting is a no-op in standalone mode (no USAGI_HUB_URL)', async () => {
  delete process.env.USAGI_HUB_URL;
  delete process.env.USAGI_SDK_PATH;
  const hubAdapter = loadFreshAdapter();
  assert.equal(hubAdapter.isEnabled(), false);
  assert.equal(await hubAdapter.signalReady(), null);
  assert.equal(await hubAdapter.emitRunRecord({ body: {} }, { final: {} }), null);
});

test('emitRunRecord pushes a record through the SDK when a hub URL is present', async (t) => {
  t.after(() => {
    if (fs.existsSync(callsPath)) {
      fs.unlinkSync(callsPath);
    }
  });
  if (fs.existsSync(callsPath)) {
    fs.unlinkSync(callsPath);
  }
  process.env.USAGI_HUB_URL = 'http://127.0.0.1:5178';
  process.env.USAGI_SDK_PATH = fakeSdkPath;
  const hubAdapter = loadFreshAdapter();

  const result = await hubAdapter.emitRunRecord(
    { body: { naturalLanguage: 'neeko', mode: 'strict' } },
    {
      final: {
        positiveTags: ['masterpiece'],
        negativeTags: [],
        globalPositiveText: 'masterpiece',
        globalNegativeText: '',
        finalText: 'masterpiece'
      }
    }
  );
  delete process.env.USAGI_HUB_URL;
  delete process.env.USAGI_SDK_PATH;

  assert.equal(result, undefined);
  const calls = fs
    .readFileSync(callsPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].schema, 'tag-list@1');
  assert.deepEqual(calls[0].payload.output.positiveTags, ['masterpiece']);
  assert.deepEqual(calls[0].payload.input, {
    naturalLanguage: 'neeko',
    loraInput: '',
    modelTranslate: '',
    mode: 'strict'
  });
});
