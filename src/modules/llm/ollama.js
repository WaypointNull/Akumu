const { OLLAMA_URL } = require('../../config/constants');

async function ollamaGenerate(model, system, prompt, temperature = 0.1) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      system,
      prompt,
      options: {
        temperature,
        top_p: 0.9,
        num_ctx: 8192
      },
      stream: false
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${text}`);
  }

  const json = await response.json();
  return (json.response || '').trim();
}

module.exports = { ollamaGenerate };
