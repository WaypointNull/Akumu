async function request(path, options = {}) {
  const init = { ...options };
  // WORKAROUND: GET requests have no body; don't advertise a JSON content type for them.
  if (options.body && !init.headers) {
    init.headers = { 'content-type': 'application/json' };
  }
  if (options.body && typeof options.body === 'object') {
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, init);
  let data;
  // WORKAROUND: error bodies aren't always valid JSON; don't crash parsing them.
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || (data && data.error)) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  health() {
    return request('/api/health');
  },
  llmStatus() {
    return request('/api/llm/status');
  },
  run(payload) {
    return request('/api/run', { method: 'POST', body: payload });
  },
  format(tags, loraInput) {
    return request('/api/format', { method: 'POST', body: { tags, loraInput } });
  }
};
