const { OLLAMA_BASE_URL, OLLAMA_URL } = require('../../config/constants');

async function ollamaStatus() {
  let response;
  // WORKAROUND: Node fetch has no default timeout; an unreachable Ollama would hang the status pill otherwise.
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
  } catch {
    return { reachable: false, models: [], error: 'Ollama unreachable' };
  }

  // WORKAROUND: a live-but-broken server should not read as "offline", which would misdirect troubleshooting.
  if (!response.ok) {
    return { reachable: true, models: [], error: `Ollama responded ${response.status}` };
  }

  const json = await response.json();
  const models = Array.isArray(json.models) ? json.models.map((m) => m.name || '').filter(Boolean) : [];
  return { reachable: true, models };
}

async function ollamaGenerate(model, system, prompt, temperature = 0.1) {
  let response;
  try {
    response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        system,
        prompt,
        options: {
          temperature,
          // WORKAROUND: Ollama's default context (2048) truncates long system+prompt combos and corrupts
          // JSON-ish tag output; cap top_p to fight tail randomness that splits otherwise-valid tags.
          top_p: 0.9,
          num_ctx: 8192
        },
        stream: false
      })
    });
  } catch (cause) {
    const error = new Error(`Ollama unreachable (${cause.message})`);
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Ollama request failed (${response.status}): ${text}`);
    error.statusCode = 502;
    throw error;
  }

  const json = await response.json();
  return (json.response || '').trim();
}

module.exports = { ollamaGenerate, ollamaStatus };
