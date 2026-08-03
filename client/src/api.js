async function request(path, options = {}) {
  const init = { ...options };
  if (options.body && !init.headers) {
    init.headers = { 'content-type': 'application/json' };
  }
  if (options.body && typeof options.body === 'object') {
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, init);
  let data;
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
  discover() {
    return request('/api/comfy/discover');
  },
  run(payload) {
    return request('/api/run', { method: 'POST', body: payload });
  },
  format(tags, loraInput) {
    return request('/api/format', { method: 'POST', body: { tags, loraInput } });
  },
  startRegional(payload) {
    return request('/api/regional/start', { method: 'POST', body: payload });
  },
  regionalStatus(jobId) {
    return request(`/api/regional/status/${encodeURIComponent(jobId)}`);
  }
};
