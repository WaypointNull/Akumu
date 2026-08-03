const test = require('node:test');
const assert = require('node:assert');
const { ollamaStatus } = require('../ollama');

function withFetch(fetchImpl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

test('ollamaStatus lists installed model names', async () => {
  await withFetch(
    async () => ({
      ok: true,
      json: async () => ({
        models: [{ name: 'qwen2.5:7b' }, { name: 'nomic-embed-text' }, { name: '' }]
      })
    }),
    async () => {
      const status = await ollamaStatus();
      assert.equal(status.reachable, true);
      assert.deepEqual(status.models, ['qwen2.5:7b', 'nomic-embed-text']);
    }
  );
});

test('ollamaStatus reports unreachable when the request throws', async () => {
  await withFetch(
    async () => {
      throw new Error('ECONNREFUSED');
    },
    async () => {
      const status = await ollamaStatus();
      assert.equal(status.reachable, false);
      assert.deepEqual(status.models, []);
      assert.ok(status.error);
    }
  );
});

test('ollamaStatus handles a non-ok response', async () => {
  await withFetch(
    async () => ({ ok: false, status: 503 }),
    async () => {
      const status = await ollamaStatus();
      assert.equal(status.reachable, true);
      assert.deepEqual(status.models, []);
      assert.ok(status.error);
    }
  );
});
