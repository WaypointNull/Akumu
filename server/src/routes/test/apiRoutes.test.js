const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { createApp } = require('../../app');

function fakeDeps({ llm } = {}) {
  return {
    repository: {
      getTagSet: () => new Set(['a_tag', 'b_tag', 'blue_eyes'])
    },
    retrieval: {
      resolve: (q) => ({ status: 'exact', tag: q }),
      decompose: () => null
    },
    llm: llm || {
      ollamaGenerate: async () => 'a_tag, b_tag'
    }
  };
}

function startServer(deps) {
  const app = createApp(deps);
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function parseJson(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function request(server, { method = 'GET', path: routePath = '/', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request({ host: '127.0.0.1', port, method, path: routePath, headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, json: parseJson(data) });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const JSON_HEADERS = { 'content-type': 'application/json' };

test('GET /api/health returns the loaded tag count', async (t) => {
  const server = await startServer(fakeDeps());
  t.after(() => server.close());
  const res = await request(server, { path: '/api/health' });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.tagCount, 3);
});

test('GET /api/health exposes frontend defaults', async (t) => {
  const server = await startServer(fakeDeps());
  t.after(() => server.close());
  const res = await request(server, { path: '/api/health' });
  assert.equal(res.status, 200);
  const d = res.json.defaults;
  assert.equal(typeof d.modelTranslate, 'string');
});

test('POST /api/run without naturalLanguage returns 400', async (t) => {
  const server = await startServer(fakeDeps());
  t.after(() => server.close());
  const res = await request(server, { method: 'POST', path: '/api/run', headers: JSON_HEADERS, body: '{}' });
  assert.equal(res.status, 400);
  assert.match(res.json.error, /naturalLanguage is required/);
});

test('POST /api/run with malformed JSON returns a JSON 400', async (t) => {
  const server = await startServer(fakeDeps());
  t.after(() => server.close());
  const res = await request(server, { method: 'POST', path: '/api/run', headers: JSON_HEADERS, body: '{' });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, 'Invalid JSON body.');
});

test('POST /api/run with non-JSON content type is normalized, not a 500', async (t) => {
  const server = await startServer(fakeDeps());
  t.after(() => server.close());
  const res = await request(server, {
    method: 'POST',
    path: '/api/run',
    headers: { 'content-type': 'text/plain' },
    body: 'not json'
  });
  assert.equal(res.status, 400);
  assert.match(res.json.error, /naturalLanguage is required/);
});

test('POST /api/run returns the full pipeline result', async (t) => {
  const server = await startServer(fakeDeps());
  t.after(() => server.close());
  const res = await request(server, {
    method: 'POST',
    path: '/api/run',
    headers: JSON_HEADERS,
    body: JSON.stringify({ naturalLanguage: 'a girl' })
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.ok(res.json.final.finalText.includes('Global Positive:'));
  assert.ok(Array.isArray(res.json.final.promptTags));
  assert.ok(Array.isArray(res.json.review));
  assert.ok(res.json.passes.translate);
  assert.equal(res.json.mode, 'strict');
  assert.equal(res.json.lowContent, false);
});

test('POST /api/run defaults to strict mode and echoes an invalid mode as strict', async (t) => {
  const server = await startServer(fakeDeps());
  t.after(() => server.close());
  const strict = await request(server, {
    method: 'POST',
    path: '/api/run',
    headers: JSON_HEADERS,
    body: JSON.stringify({ naturalLanguage: 'a girl', mode: 'creative' })
  });
  assert.equal(strict.status, 200);
  assert.equal(strict.json.mode, 'creative');
  const bogus = await request(server, {
    method: 'POST',
    path: '/api/run',
    headers: JSON_HEADERS,
    body: JSON.stringify({ naturalLanguage: 'a girl', mode: 'banana' })
  });
  assert.equal(bogus.json.mode, 'strict');
});

test('POST /api/run maps upstream Ollama failures to 502', async (t) => {
  t.mock.method(console, 'error', () => {});
  const failingLlm = {
    ollamaGenerate: async () => {
      const error = new Error('Ollama request failed (500): boom');
      error.statusCode = 502;
      throw error;
    }
  };
  const server = await startServer(fakeDeps({ llm: failingLlm }));
  t.after(() => server.close());
  const res = await request(server, {
    method: 'POST',
    path: '/api/run',
    headers: JSON_HEADERS,
    body: JSON.stringify({ naturalLanguage: 'a girl' })
  });
  assert.equal(res.status, 502);
  assert.match(res.json.error, /^Ollama/);
});

test('POST /api/format validates tags and returns formatted output', async (t) => {
  const server = await startServer(fakeDeps());
  t.after(() => server.close());

  const empty = await request(server, { method: 'POST', path: '/api/format', headers: JSON_HEADERS, body: '{}' });
  assert.equal(empty.status, 400);
  assert.match(empty.json.error, /tags is required/);

  const ok = await request(server, {
    method: 'POST',
    path: '/api/format',
    headers: JSON_HEADERS,
    body: JSON.stringify({ tags: ['blue_eyes', 'a_tag'] })
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.finalText.includes('Global Positive:'));
});

test('unknown /api routes return a JSON 404', async (t) => {
  const server = await startServer(fakeDeps());
  t.after(() => server.close());
  const res = await request(server, { path: '/api/nonexistent' });
  assert.equal(res.status, 404);
  assert.equal(res.json.error, 'API route not found.');
});
