<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { api } from '../api.js';

const props = defineProps({
  defaults: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['error']);

const mode = ref('basic');
const modelGlobal = ref('');
const modelRgb = ref('');
const comfyUrl = ref('');
const comfyPath = ref('');
const checkpoint = ref('');
const checkpoints = ref([]);
const vaes = ref([]);
const naturalLanguage = ref('');
const loraRed = ref('');
const loraGreen = ref('');
const loraBlue = ref('');
const width = ref(null);
const height = ref(null);
const steps = ref(null);
const cfg = ref(null);
const sampler = ref('');
const scheduler = ref('');
const enableClipSkip = ref(true);
const clipSkip = ref(null);
const useSeparateVae = ref(false);
const separateVae = ref('');

const starting = ref(false);
const jobStatus = ref('');
const globalPrompt = ref('');
const globalNegative = ref('');
const redPrompt = ref('');
const greenPrompt = ref('');
const bluePrompt = ref('');
const maskUrl = ref('');
const maskState = ref('Awaiting input');

let pollHandle = null;

watch(
  () => props.defaults,
  (d) => {
    const comfy = d.comfy || {};
    if (!modelGlobal.value) modelGlobal.value = d.modelGlobal || '';
    if (!modelRgb.value) modelRgb.value = d.modelRegional || '';
    if (!comfyUrl.value) comfyUrl.value = d.comfyUrl || '';
    if (width.value == null) width.value = comfy.width ?? null;
    if (height.value == null) height.value = comfy.height ?? null;
    if (steps.value == null) steps.value = comfy.steps ?? null;
    if (cfg.value == null) cfg.value = comfy.cfg ?? null;
    if (!sampler.value) sampler.value = comfy.sampler || '';
    if (!scheduler.value) scheduler.value = comfy.scheduler || '';
    if (clipSkip.value == null) clipSkip.value = comfy.clipSkip ?? null;
  },
  { immediate: true }
);

async function loadDiscovery() {
  try {
    const data = await api.discover();
    const list = Array.isArray(data.discovery) ? data.discovery : [];
    checkpoints.value = [];
    vaes.value = [];
    comfyPath.value = '';

    if (list.length) {
      comfyPath.value = list[0].path || '';
      checkpoints.value = list[0].checkpoints || [];
      vaes.value = list[0].vaes || [];
      if (checkpoints.value.length && !checkpoints.value.includes(checkpoint.value)) {
        checkpoint.value = checkpoints.value[0];
      }
      if (useSeparateVae.value && !separateVae.value && vaes.value.length) {
        separateVae.value = vaes.value[0];
      }
    }
  } catch (err) {
    emit('error', err.message || 'Failed to discover ComfyUI/checkpoints.');
  }
}

function renderJob(job) {
  jobStatus.value = `Job: ${job.id}\nStatus: ${job.status}\nComfy: ${job.comfy.status}${
    job.comfy.promptId ? `\nPrompt ID: ${job.comfy.promptId}` : ''
  }${job.comfy.error ? `\nComfy Error: ${job.comfy.error}` : ''}`;
  globalPrompt.value = job.globalPrompt || '';
  globalNegative.value = job.globalNegative || '';
  redPrompt.value = job.redPrompt || '';
  greenPrompt.value = job.greenPrompt || '';
  bluePrompt.value = job.bluePrompt || '';

  if (job.comfy.image && job.comfy.image.url) {
    maskUrl.value = job.comfy.image.url;
    maskState.value = 'Mask ready';
  } else if (job.status === 'running' || ['queued', 'submitted', 'rendering'].includes(job.comfy.status)) {
    maskUrl.value = '';
    maskState.value = 'Loading mask...';
  } else {
    maskUrl.value = '';
    maskState.value = 'Awaiting input';
  }
}

function stopPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

async function poll(jobId) {
  stopPolling();
  const tick = async () => {
    try {
      const data = await api.regionalStatus(jobId);
      renderJob(data.job);
      if (data.job.status === 'done' || data.job.status === 'failed') {
        stopPolling();
        starting.value = false;
      }
    } catch (err) {
      stopPolling();
      starting.value = false;
      emit('error', err.message || 'Regional polling failed.');
    }
  };
  await tick();
  pollHandle = setInterval(tick, 2500);
}

async function start() {
  emit('error', '');
  if (!naturalLanguage.value.trim()) {
    emit('error', 'Natural language input is required.');
    return;
  }

  starting.value = true;
  jobStatus.value = '';
  globalPrompt.value = '';
  globalNegative.value = '';
  redPrompt.value = '';
  greenPrompt.value = '';
  bluePrompt.value = '';
  maskUrl.value = '';
  maskState.value = 'Loading mask...';

  const comfy = props.defaults.comfy || {};
  const payload = {
    naturalLanguage: naturalLanguage.value,
    modelGlobal: modelGlobal.value,
    modelRegional: modelRgb.value,
    comfyEnabled: true,
    comfyBaseUrl: comfyUrl.value,
    comfyCheckpoint: checkpoint.value,
    redLoraInput: loraRed.value,
    greenLoraInput: loraGreen.value,
    blueLoraInput: loraBlue.value
  };

  if (mode.value === 'advanced') {
    payload.width = Number(width.value ?? comfy.width ?? 512);
    payload.height = Number(height.value ?? comfy.height ?? 512);
    payload.steps = Number(steps.value ?? comfy.steps ?? 12);
    payload.cfg = Number(cfg.value ?? comfy.cfg ?? 2.5);
    payload.sampler = sampler.value || comfy.sampler || 'euler';
    payload.scheduler = scheduler.value || comfy.scheduler || 'normal';
    payload.enableClipSkip = enableClipSkip.value;
    payload.clipSkip = Number(clipSkip.value ?? comfy.clipSkip ?? -2);
    payload.useSeparateVae = useSeparateVae.value;
    payload.separateVae = separateVae.value || '';
  }

  try {
    const data = await api.startRegional(payload);
    await poll(data.jobId);
  } catch (err) {
    starting.value = false;
    emit('error', err.message || 'Regional start failed.');
  }
}

async function copy() {
  const text = [
    `GLOBAL_POSITIVE: ${globalPrompt.value || ''}`,
    `RED: ${redPrompt.value || ''}`,
    `GREEN: ${greenPrompt.value || ''}`,
    `BLUE: ${bluePrompt.value || ''}`,
    `GLOBAL_NEGATIVE: ${globalNegative.value || ''}`
  ].join('\n\n');

  if (!text.replace(/\s/g, '')) {
    emit('error', 'No regional output to copy yet.');
    return;
  }
  await navigator.clipboard.writeText(text);
}

onBeforeUnmount(stopPolling);

loadDiscovery();
</script>

<template>
  <section class="panel">
    <section class="card">
      <div class="mode-row">
        <label for="regionalMode">Mode</label>
        <select id="regionalMode" v-model="mode">
          <option value="basic">Basic</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>

      <div class="grid" style="margin-top: 12px">
        <div class="field">
          <label for="regionalModelGlobal">Global Model</label>
          <input id="regionalModelGlobal" v-model="modelGlobal" />
        </div>
        <div class="field">
          <label for="regionalModelRgb">Regional Model</label>
          <input id="regionalModelRgb" v-model="modelRgb" />
        </div>
        <div class="field">
          <label for="regionalComfyUrl">ComfyUI URL</label>
          <input id="regionalComfyUrl" v-model="comfyUrl" />
        </div>
      </div>

      <div class="grid" style="margin-top: 12px">
        <div class="field">
          <label for="regionalCheckpoint">Checkpoint</label>
          <select id="regionalCheckpoint" v-model="checkpoint">
            <option v-if="!checkpoints.length" value="">No checkpoints found</option>
            <option v-for="c in checkpoints" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <button type="button" class="outlined" @click="loadDiscovery">Refresh Checkpoints</button>
        </div>
        <div class="field">
          <label for="regionalComfyPath">Discovered Comfy Path</label>
          <input id="regionalComfyPath" :value="comfyPath" readonly />
        </div>
      </div>
    </section>

    <section class="card">
      <div class="field">
        <label for="regionalNaturalLanguage">Natural Language Input</label>
        <textarea
          id="regionalNaturalLanguage"
          v-model="naturalLanguage"
          placeholder="Example: 2 girls holding hands, Megumin happy, Darkness sad, in a fantasy town square."
        ></textarea>
      </div>

      <div v-if="mode === 'advanced'" class="advanced-panel">
        <div class="grid">
          <div class="field">
            <label for="regionalWidth">Mask Width</label>
            <input id="regionalWidth" v-model.number="width" type="number" />
          </div>
          <div class="field">
            <label for="regionalHeight">Mask Height</label>
            <input id="regionalHeight" v-model.number="height" type="number" />
          </div>
          <div class="field">
            <label for="regionalSteps">Comfy Steps</label>
            <input id="regionalSteps" v-model.number="steps" type="number" />
          </div>
        </div>

        <div class="grid" style="margin-top: 12px">
          <div class="field">
            <label for="regionalCfg">Comfy CFG</label>
            <input id="regionalCfg" v-model.number="cfg" type="number" step="0.1" />
          </div>
          <div class="field">
            <label for="regionalSampler">Comfy Sampler</label>
            <input id="regionalSampler" v-model="sampler" />
          </div>
          <div class="field">
            <label for="regionalScheduler">Comfy Scheduler</label>
            <input id="regionalScheduler" v-model="scheduler" />
          </div>
        </div>

        <div class="grid" style="margin-top: 12px">
          <label class="switch">
            <input id="regionalEnableClipSkip" v-model="enableClipSkip" type="checkbox" />
            <span class="track"></span>
            Enable CLIPSkip
          </label>
          <div class="field">
            <label for="regionalClipSkip">CLIPSkip Value</label>
            <input id="regionalClipSkip" v-model.number="clipSkip" type="number" step="1" />
          </div>
          <label class="switch">
            <input id="regionalUseSeparateVae" v-model="useSeparateVae" type="checkbox" />
            <span class="track"></span>
            Use Separate VAE
          </label>
        </div>

        <div class="grid" style="margin-top: 12px">
          <div class="field">
            <label for="regionalSeparateVae">Separate VAE</label>
            <select id="regionalSeparateVae" v-model="separateVae">
              <option value="">Auto / none</option>
              <option v-for="v in vaes" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
          <div></div>
          <div></div>
        </div>
      </div>

      <div class="grid" style="margin-top: 12px">
        <div class="field">
          <label for="regionalLoraRed">RED LoRA Tags</label>
          <input id="regionalLoraRed" v-model="loraRed" placeholder="<lora:red_style:1.0>" />
        </div>
        <div class="field">
          <label for="regionalLoraGreen">GREEN LoRA Tags</label>
          <input id="regionalLoraGreen" v-model="loraGreen" placeholder="<lora:green_style:1.0>" />
        </div>
        <div class="field">
          <label for="regionalLoraBlue">BLUE LoRA Tags</label>
          <input id="regionalLoraBlue" v-model="loraBlue" placeholder="<lora:blue_style:1.0>" />
        </div>
      </div>

      <div class="row">
        <button type="button" class="filled" :disabled="starting" @click="start">
          {{ starting ? 'Starting...' : 'Start Regional Workflow' }}
        </button>
        <button type="button" class="outlined" @click="copy">Copy Regional Output</button>
      </div>
    </section>

    <section class="card">
      <label>Regional Job Status</label>
      <pre>{{ jobStatus }}</pre>
    </section>

    <section class="card outputs">
      <div>
        <label>GLOBAL_POSITIVE</label>
        <pre>{{ globalPrompt }}</pre>
      </div>
      <div>
        <label>GLOBAL_NEGATIVE</label>
        <pre>{{ globalNegative }}</pre>
      </div>
    </section>

    <section class="card rgb-grid">
      <div>
        <label>RED</label>
        <pre>{{ redPrompt }}</pre>
      </div>
      <div>
        <label>GREEN</label>
        <pre>{{ greenPrompt }}</pre>
      </div>
      <div>
        <label>BLUE</label>
        <pre>{{ bluePrompt }}</pre>
      </div>
    </section>

    <section class="card">
      <label>Comfy Mask Output</label>
      <div class="mask-state">{{ maskState }}</div>
      <div class="img-wrap" style="margin-top: 10px">
        <img v-if="maskUrl" :src="maskUrl" alt="RGB mask output" />
      </div>
    </section>
  </section>
</template>
