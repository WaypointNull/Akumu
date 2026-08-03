async function request(path, options = {}) {
  const init = { ...options };
  if (options.body && !init.headers) {
    init.headers = { 'content-type': 'application/json' };
  }
  if (options.body && typeof options.body === 'object') {
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, init);
  let data = null;
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

const tabSingle = document.getElementById('tabSingle');
const tabRegional = document.getElementById('tabRegional');
const panelSingle = document.getElementById('panelSingle');
const panelRegional = document.getElementById('panelRegional');

const runBtn = document.getElementById('runBtn');
const copyBtn = document.getElementById('copyBtn');
const errorEl = document.getElementById('error');

const pass1El = document.getElementById('pass1');
const pass2El = document.getElementById('pass2');
const pass3El = document.getElementById('pass3');
const finalEl = document.getElementById('final');
const reviewCardEl = document.getElementById('reviewCard');
const reviewEl = document.getElementById('review');

let promptTags = [];
let reviewItems = [];
let loraForReview = '';
let defaults = {};

const regionalStartBtn = document.getElementById('regionalStartBtn');
const regionalCopyBtn = document.getElementById('regionalCopyBtn');
const regionalModeEl = document.getElementById('regionalMode');
const regionalAdvancedPanelEl = document.getElementById('regionalAdvancedPanel');
const regionalRefreshCheckpointsBtn = document.getElementById('regionalRefreshCheckpoints');
const regionalCheckpointEl = document.getElementById('regionalCheckpoint');
const regionalComfyPathEl = document.getElementById('regionalComfyPath');
const regionalEnableClipSkipEl = document.getElementById('regionalEnableClipSkip');
const regionalClipSkipEl = document.getElementById('regionalClipSkip');
const regionalUseSeparateVaeEl = document.getElementById('regionalUseSeparateVae');
const regionalSeparateVaeEl = document.getElementById('regionalSeparateVae');
const regionalStatusEl = document.getElementById('regionalStatus');
const regionalGlobalEl = document.getElementById('regionalGlobal');
const regionalNegativeEl = document.getElementById('regionalNegative');
const regionalRedEl = document.getElementById('regionalRed');
const regionalGreenEl = document.getElementById('regionalGreen');
const regionalBlueEl = document.getElementById('regionalBlue');
const regionalMaskImageEl = document.getElementById('regionalMaskImage');
const regionalMaskStateEl = document.getElementById('regionalMaskState');

let regionalPollHandle = null;
let regionalJobId = null;

function setValue(id, value) {
  if (value == null) return;
  document.getElementById(id).value = value;
}

function switchTab(target) {
  const single = target === 'single';
  tabSingle.classList.toggle('active', single);
  tabRegional.classList.toggle('active', !single);
  panelSingle.classList.toggle('active', single);
  panelRegional.classList.toggle('active', !single);
}

function setRegionalMode() {
  const advanced = regionalModeEl.value === 'advanced';
  regionalAdvancedPanelEl.style.display = advanced ? 'block' : 'none';
}

async function loadDefaults() {
  try {
    const data = await request('/api/health');
    defaults = data.defaults || {};
    const comfy = defaults.comfy || {};
    setValue('modelTranslate', defaults.modelTranslate);
    setValue('regionalModelGlobal', defaults.modelGlobal);
    setValue('regionalModelRgb', defaults.modelRegional);
    setValue('regionalComfyUrl', defaults.comfyUrl);
    setValue('regionalWidth', comfy.width);
    setValue('regionalHeight', comfy.height);
    setValue('regionalSteps', comfy.steps);
    setValue('regionalCfg', comfy.cfg);
    setValue('regionalSampler', comfy.sampler);
    setValue('regionalScheduler', comfy.scheduler);
    setValue('regionalClipSkip', comfy.clipSkip);
  } catch (err) {
    setError(err.message || 'Failed to load defaults.');
  }
}

async function loadComfyDiscovery() {
  try {
    const data = await request('/api/comfy/discover');

    const list = Array.isArray(data.discovery) ? data.discovery : [];
    regionalCheckpointEl.innerHTML = '';

    if (list.length === 0) {
      regionalComfyPathEl.value = '';
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No checkpoints found';
      regionalCheckpointEl.appendChild(option);

      regionalSeparateVaeEl.innerHTML = '';
      const autoOption = document.createElement('option');
      autoOption.value = '';
      autoOption.textContent = 'Auto / none';
      regionalSeparateVaeEl.appendChild(autoOption);
      return;
    }

    regionalComfyPathEl.value = list[0].path || '';
    const checkpoints = list[0].checkpoints || [];
    const vaes = list[0].vaes || [];
    if (checkpoints.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No checkpoints found in models/checkpoints';
      regionalCheckpointEl.appendChild(option);
    }

    if (checkpoints.length > 0) {
      for (const ckpt of checkpoints) {
        const option = document.createElement('option');
        option.value = ckpt;
        option.textContent = ckpt;
        regionalCheckpointEl.appendChild(option);
      }
    }

    regionalSeparateVaeEl.innerHTML = '';
    const autoOption = document.createElement('option');
    autoOption.value = '';
    autoOption.textContent = 'Auto / none';
    regionalSeparateVaeEl.appendChild(autoOption);
    for (const vae of vaes) {
      const option = document.createElement('option');
      option.value = vae;
      option.textContent = vae;
      regionalSeparateVaeEl.appendChild(option);
    }
  } catch (err) {
    setError(err.message || 'Failed to discover ComfyUI/checkpoints.');
  }
}

tabSingle.addEventListener('click', () => switchTab('single'));
tabRegional.addEventListener('click', () => switchTab('regional'));
regionalModeEl.addEventListener('change', setRegionalMode);
regionalRefreshCheckpointsBtn.addEventListener('click', loadComfyDiscovery);

function setError(msg) {
  if (!msg) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    return;
  }
  errorEl.style.display = 'block';
  errorEl.textContent = msg;
}

function renderReview() {
  reviewCardEl.style.display = reviewItems.length ? 'block' : 'none';
  reviewEl.innerHTML = '';
  for (const item of reviewItems) {
    const div = document.createElement('div');
    div.className = 'review-item';

    const title = document.createElement('div');
    title.className = 'review-title';
    title.textContent = item.original;
    title.title = item.status;
    div.appendChild(title);

    const chips = document.createElement('div');
    chips.className = 'review-chips';
    const suggestions = [];
    for (const t of item.candidates || []) suggestions.push({ tag: t, kind: 'candidate' });
    for (const t of item.decomposed || []) suggestions.push({ tag: t, kind: 'part' });
    if (suggestions.length === 0) {
      const none = document.createElement('span');
      none.className = 'muted';
      none.textContent = 'No candidates';
      chips.appendChild(none);
    }
    for (const s of suggestions) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = s.kind === 'part' ? `${s.tag} (part)` : s.tag;
      chip.addEventListener('click', () => applyReviewEdit(item.original, [s.tag]));
      chips.appendChild(chip);
    }
    div.appendChild(chips);

    const actions = document.createElement('div');
    actions.className = 'review-actions';
    const keep = document.createElement('button');
    keep.className = 'secondary';
    keep.textContent = 'Keep Original';
    keep.addEventListener('click', () => resolveReviewItem(item.original));
    actions.appendChild(keep);
    const remove = document.createElement('button');
    remove.className = 'danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => applyReviewEdit(item.original, []));
    actions.appendChild(remove);
    div.appendChild(actions);

    reviewEl.appendChild(div);
  }
}

function resolveReviewItem(original) {
  reviewItems = reviewItems.filter((i) => i.original !== original);
  renderReview();
}

async function applyReviewEdit(original, replacement) {
  const idx = promptTags.indexOf(original);
  const next = promptTags.filter((t) => t !== original);
  if (idx !== -1) {
    next.splice(idx, 0, ...replacement);
  }
  promptTags = next;
  try {
    const data = await request('/api/format', { method: 'POST', body: { tags: promptTags, loraInput: loraForReview } });
    finalEl.textContent = data.finalText || '';
  } catch (err) {
    setError(err.message || 'Failed to re-format.');
  }
  resolveReviewItem(original);
}

runBtn.addEventListener('click', async () => {
  setError('');
  runBtn.disabled = true;
  runBtn.textContent = 'Running...';

  pass1El.textContent = '';
  pass2El.textContent = '';
  pass3El.textContent = '';
  finalEl.textContent = '';
  promptTags = [];
  reviewItems = [];
  renderReview();

  try {
    const payload = {
      naturalLanguage: document.getElementById('naturalLanguage').value,
      loraInput: document.getElementById('loraInput').value,
      modelTranslate: document.getElementById('modelTranslate').value
    };

    const data = await request('/api/run', { method: 'POST', body: payload });

    pass1El.textContent = data.passes.translate || '';
    pass2El.textContent = data.passes.validate || '';
    pass3El.textContent = data.passes.format || '';
    finalEl.textContent = data.final.finalText || '';
    promptTags = (data.final.promptTags || []).slice();
    loraForReview = payload.loraInput;
    reviewItems = (data.review || []).slice();
    renderReview();
  } catch (err) {
    setError(err.message || 'Unexpected error');
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Run 3-Pass Workflow';
  }
});

copyBtn.addEventListener('click', async () => {
  const text = finalEl.textContent || '';
  if (!text.trim()) {
    setError('No final output to copy yet.');
    return;
  }
  await navigator.clipboard.writeText(text);
});

function renderRegional(job) {
  regionalStatusEl.textContent = `Job: ${job.id}\nStatus: ${job.status}\nComfy: ${job.comfy.status}${job.comfy.promptId ? `\nPrompt ID: ${job.comfy.promptId}` : ''}${job.comfy.error ? `\nComfy Error: ${job.comfy.error}` : ''}`;
  regionalGlobalEl.textContent = job.globalPrompt || '';
  regionalNegativeEl.textContent = job.globalNegative || '';
  regionalRedEl.textContent = job.redPrompt || '';
  regionalGreenEl.textContent = job.greenPrompt || '';
  regionalBlueEl.textContent = job.bluePrompt || '';

  if (job.comfy.image && job.comfy.image.url) {
    regionalMaskImageEl.src = job.comfy.image.url;
    regionalMaskStateEl.textContent = 'Mask ready';
  } else if (job.status === 'running' || job.comfy.status === 'queued' || job.comfy.status === 'submitted' || job.comfy.status === 'rendering') {
    regionalMaskStateEl.textContent = 'Loading mask...';
  } else {
    regionalMaskStateEl.textContent = 'Awaiting input';
  }
}

async function pollRegionalJob(jobId) {
  if (regionalPollHandle) {
    clearInterval(regionalPollHandle);
    regionalPollHandle = null;
  }

  const tick = async () => {
    try {
      const data = await request(`/api/regional/status/${encodeURIComponent(jobId)}`);

      renderRegional(data.job);

      if (data.job.status === 'done' || data.job.status === 'failed') {
        clearInterval(regionalPollHandle);
        regionalPollHandle = null;
        regionalStartBtn.disabled = false;
        regionalStartBtn.textContent = 'Start Regional Workflow';
      }
    } catch (err) {
      setError(err.message || 'Regional polling failed.');
    }
  };

  await tick();
  regionalPollHandle = setInterval(tick, 2500);
}

regionalStartBtn.addEventListener('click', async () => {
  setError('');
  regionalStartBtn.disabled = true;
  regionalStartBtn.textContent = 'Starting...';
  regionalStatusEl.textContent = '';
  regionalGlobalEl.textContent = '';
  regionalNegativeEl.textContent = '';
  regionalRedEl.textContent = '';
  regionalGreenEl.textContent = '';
  regionalBlueEl.textContent = '';
  regionalMaskImageEl.removeAttribute('src');
  regionalMaskStateEl.textContent = 'Loading mask...';

  try {
    const comfy = defaults.comfy || {};
    const payload = {
      naturalLanguage: document.getElementById('regionalNaturalLanguage').value,
      modelGlobal: document.getElementById('regionalModelGlobal').value,
      modelRegional: document.getElementById('regionalModelRgb').value,
      comfyEnabled: true,
      comfyBaseUrl: document.getElementById('regionalComfyUrl').value,
      comfyCheckpoint: regionalCheckpointEl.value,
      redLoraInput: document.getElementById('regionalLoraRed').value,
      greenLoraInput: document.getElementById('regionalLoraGreen').value,
      blueLoraInput: document.getElementById('regionalLoraBlue').value,
      width: Number(document.getElementById('regionalWidth').value || comfy.width || 512),
      height: Number(document.getElementById('regionalHeight').value || comfy.height || 512),
      steps: Number(document.getElementById('regionalSteps').value || comfy.steps || 12),
      cfg: Number(document.getElementById('regionalCfg').value || comfy.cfg || 2.5),
      sampler: document.getElementById('regionalSampler').value || comfy.sampler || 'euler',
      scheduler: document.getElementById('regionalScheduler').value || comfy.scheduler || 'normal',
      enableClipSkip: regionalEnableClipSkipEl.value === 'true',
      clipSkip: Number(regionalClipSkipEl.value || comfy.clipSkip || -2),
      useSeparateVae: regionalUseSeparateVaeEl.value === 'true',
      separateVae: regionalSeparateVaeEl.value || ''
    };

    if (regionalModeEl.value !== 'advanced') {
      delete payload.width;
      delete payload.height;
      delete payload.steps;
      delete payload.cfg;
      delete payload.sampler;
      delete payload.scheduler;
      delete payload.enableClipSkip;
      delete payload.clipSkip;
      delete payload.useSeparateVae;
      delete payload.separateVae;
    }

    const data = await request('/api/regional/start', { method: 'POST', body: payload });

    regionalJobId = data.jobId;
    await pollRegionalJob(regionalJobId);
  } catch (err) {
    regionalStartBtn.disabled = false;
    regionalStartBtn.textContent = 'Start Regional Workflow';
    setError(err.message || 'Regional start failed.');
  }
});

regionalCopyBtn.addEventListener('click', async () => {
  const text = [
    `GLOBAL_POSITIVE: ${regionalGlobalEl.textContent || ''}`,
    `RED: ${regionalRedEl.textContent || ''}`,
    `GREEN: ${regionalGreenEl.textContent || ''}`,
    `BLUE: ${regionalBlueEl.textContent || ''}`,
    `GLOBAL_NEGATIVE: ${regionalNegativeEl.textContent || ''}`
  ].join('\n\n');

  if (!text.replace(/\s/g, '')) {
    setError('No regional output to copy yet.');
    return;
  }
  await navigator.clipboard.writeText(text);
});

setRegionalMode();
loadDefaults();
loadComfyDiscovery();
