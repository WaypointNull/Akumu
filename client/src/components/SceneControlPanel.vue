<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import { api } from '../api.js';
import SketchCanvas from './SketchCanvas.vue';

const props = defineProps({
  defaults: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['error']);

const SOURCES = [
  { value: 'sketch', label: 'Sketch', enabled: true },
  { value: 'pose', label: 'Pose Library', enabled: false },
  { value: 'upload', label: 'Upload Reference', enabled: false },
  { value: 'none', label: 'None', enabled: true }
];

const MODES = [
  { value: 'lineart', label: 'Lineart' },
  { value: 'openpose', label: 'OpenPose' },
  { value: 'depth', label: 'Depth' },
  { value: 'scribble', label: 'Scribble' },
  { value: 'segmentation', label: 'Segmentation' }
];

const source = ref('sketch');
const mode = ref('scribble');
const sketchImage = ref('');
const naturalLanguage = ref('');
const negative = ref('');
const comfyUrl = ref('');
const checkpoint = ref('');
const checkpoints = ref([]);
const controlNet = ref('');
const controlNets = ref([]);
const vaes = ref([]);
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
const controlStrength = ref(0.75);
const controlStart = ref(0);
const controlEnd = ref(1);
const advanced = ref(false);

const generating = ref(false);
const jobStatus = ref('');
const resultUrl = ref('');
const resultState = ref('Awaiting input');
const comfyState = ref('checking');
const comfyError = ref('');

let pollHandle = null;
let statusHandle = null;

const validModes = computed(() => {
  if (source.value === 'none') {
    return MODES.map((m) => m.value);
  }
  if (source.value === 'sketch') {
    return ['scribble', 'lineart', 'canny'];
  }
  return [];
});

function isModeEnabled(value) {
  return validModes.value.includes(value);
}

watch(source, (value) => {
  if (!validModes.value.includes(mode.value)) {
    mode.value = value === 'sketch' ? 'scribble' : MODES[0].value;
  }
});

watch(
  () => props.defaults,
  (d) => {
    const comfy = d.comfy || {};
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

function onSketchChange(dataUrl) {
  sketchImage.value = dataUrl;
}

async function refreshStatus() {
  comfyState.value = 'checking';
  comfyError.value = '';
  try {
    const data = await api.sceneStatus(comfyUrl.value || undefined);
    comfyState.value = data.comfy && data.comfy.reachable ? 'online' : 'offline';
    if (data.comfy && data.comfy.error) {
      comfyError.value = data.comfy.error;
    }

    const list = Array.isArray(data.discovery) ? data.discovery : [];
    checkpoints.value = [];
    controlNets.value = [];
    vaes.value = [];
    if (list.length) {
      checkpoints.value = list[0].checkpoints || [];
      controlNets.value = list[0].controlnets || [];
      vaes.value = list[0].vaes || [];
      if (checkpoints.value.length && !checkpoints.value.includes(checkpoint.value)) {
        checkpoint.value = checkpoints.value[0];
      }
      if (controlNets.value.length && !controlNets.value.includes(controlNet.value)) {
        controlNet.value = controlNets.value[0];
      }
      if (useSeparateVae.value && !separateVae.value && vaes.value.length) {
        separateVae.value = vaes.value[0];
      }
    }
  } catch (err) {
    comfyState.value = 'offline';
    emit('error', err.message || 'Failed to check ComfyUI status.');
  }
}

function renderJob(job) {
  jobStatus.value = `Job: ${job.id}\nStatus: ${job.status}\nComfy: ${job.comfy.status}${
    job.comfy.promptId ? `\nPrompt ID: ${job.comfy.promptId}` : ''
  }${job.comfy.error ? `\nComfy Error: ${job.comfy.error}` : ''}`;

  if (job.comfy.image && job.comfy.image.url) {
    resultUrl.value = job.comfy.image.url;
    resultState.value = 'Image ready';
  } else if (job.status === 'running') {
    resultUrl.value = '';
    resultState.value = 'Generating...';
  } else {
    resultUrl.value = '';
    resultState.value = 'Awaiting input';
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
      const data = await api.sceneJob(jobId);
      renderJob(data.job);
      if (data.job.status === 'done' || data.job.status === 'failed') {
        stopPolling();
        generating.value = false;
        refreshStatus();
      }
    } catch (err) {
      stopPolling();
      generating.value = false;
      emit('error', err.message || 'Scene polling failed.');
    }
  };
  await tick();
  pollHandle = setInterval(tick, 2500);
}

async function generate() {
  emit('error', '');
  if (!naturalLanguage.value.trim()) {
    emit('error', 'Natural language input is required.');
    return;
  }
  if (!sketchImage.value) {
    emit('error', 'Draw a sketch first.');
    return;
  }
  if (source.value !== 'none' && !controlNet.value) {
    emit('error', 'Select a ControlNet model.');
    return;
  }

  generating.value = true;
  jobStatus.value = '';
  resultUrl.value = '';
  resultState.value = 'Generating...';

  const comfy = props.defaults.comfy || {};
  const payload = {
    naturalLanguage: naturalLanguage.value,
    negative: negative.value,
    source: source.value,
    mode: mode.value,
    sketchImage: sketchImage.value,
    comfyBaseUrl: comfyUrl.value,
    comfyCheckpoint: checkpoint.value,
    controlNetModel: controlNet.value,
    controlStrength: Number(controlStrength.value ?? 0.75),
    controlStart: Number(controlStart.value ?? 0),
    controlEnd: Number(controlEnd.value ?? 1)
  };

  if (advanced.value) {
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
    const data = await api.generateScene(payload);
    await poll(data.jobId);
  } catch (err) {
    generating.value = false;
    emit('error', err.message || 'Scene generation failed.');
  }
}

onMounted(() => {
  refreshStatus();
  statusHandle = setInterval(refreshStatus, 15000);
});

onBeforeUnmount(() => {
  stopPolling();
  if (statusHandle) {
    clearInterval(statusHandle);
    statusHandle = null;
  }
});
</script>

<template>
  <section class="panel">
    <section class="card scene-layout">
      <div class="scene-sidebar">
        <div class="field">
          <label>Control Source</label>
          <div class="choice-list">
            <label
              v-for="s in SOURCES"
              :key="s.value"
              class="choice"
              :class="{ active: source === s.value, disabled: !s.enabled }"
            >
              <input type="radio" v-model="source" :value="s.value" :disabled="!s.enabled" />
              <span class="choice-dot"></span>
              <span>{{ s.label }}</span>
              <span v-if="!s.enabled" class="choice-note">soon</span>
            </label>
          </div>
        </div>

        <div class="field" style="margin-top: 18px">
          <label>Stable Diffusion Provider</label>
          <div class="status-pill" :class="comfyState">
            <span class="status-dot"></span>
            <span>{{
              comfyState === 'online'
                ? 'ComfyUI Running'
                : comfyState === 'checking'
                  ? 'Checking ComfyUI...'
                  : comfyError || 'ComfyUI Offline'
            }}</span>
          </div>
        </div>
      </div>

      <div class="scene-main">
        <div class="field">
          <label>Control Mode</label>
          <div class="choice-list">
            <label
              v-for="m in MODES"
              :key="m.value"
              class="choice"
              :class="{ active: mode === m.value, disabled: !isModeEnabled(m.value) }"
            >
              <input type="radio" v-model="mode" :value="m.value" :disabled="!isModeEnabled(m.value)" />
              <span class="choice-dot"></span>
              <span>{{ m.label }}</span>
              <span v-if="!isModeEnabled(m.value)" class="choice-note">—</span>
            </label>
          </div>
        </div>
      </div>
    </section>

    <section class="card">
      <div v-if="source === 'sketch'" class="scene-sketch-row">
        <div class="field">
          <label>Sketch</label>
          <SketchCanvas @change="onSketchChange" />
          <p class="muted" style="margin-top: 8px">
            Draw rough figures and poses; the scribble ControlNet will follow these lines.
          </p>
        </div>
        <div class="field">
          <label>Control Image Preview</label>
          <div class="img-wrap">
            <img v-if="sketchImage" :src="sketchImage" alt="Control image preview" />
            <div v-else class="mask-state">No control image yet</div>
          </div>
        </div>
      </div>
      <div v-else class="mask-state">
        {{
          source === 'none' ? 'No control source selected - text-to-image only.' : 'Control source not implemented yet.'
        }}
      </div>

      <div class="grid" style="margin-top: 12px">
        <div class="field">
          <label for="scenePrompt">Natural Language Prompt</label>
          <textarea
            id="scenePrompt"
            v-model="naturalLanguage"
            placeholder="Example: 2 girls hugging in a field, one tall one short, sunset lighting."
          ></textarea>
        </div>
        <div class="field">
          <label for="sceneNegative">Negative Prompt</label>
          <textarea id="sceneNegative" v-model="negative" placeholder="Optional: tags to avoid."></textarea>
        </div>
      </div>

      <div class="grid" style="margin-top: 12px">
        <div class="field">
          <label for="sceneStrength">Control Strength</label>
          <input id="sceneStrength" v-model.number="controlStrength" type="range" min="0" max="2" step="0.05" />
          <span class="muted">{{ controlStrength }}</span>
        </div>
        <div class="field">
          <label for="sceneStart">Control Start %</label>
          <input id="sceneStart" v-model.number="controlStart" type="range" min="0" max="1" step="0.05" />
          <span class="muted">{{ controlStart }}</span>
        </div>
        <div class="field">
          <label for="sceneEnd">Control End %</label>
          <input id="sceneEnd" v-model.number="controlEnd" type="range" min="0" max="1" step="0.05" />
          <span class="muted">{{ controlEnd }}</span>
        </div>
      </div>

      <div class="grid" style="margin-top: 12px">
        <div class="field">
          <label for="sceneComfyUrl">ComfyUI URL</label>
          <input id="sceneComfyUrl" v-model="comfyUrl" />
        </div>
        <div class="field">
          <label for="sceneCheckpoint">Checkpoint</label>
          <select id="sceneCheckpoint" v-model="checkpoint">
            <option v-if="!checkpoints.length" value="">No checkpoints found</option>
            <option v-for="c in checkpoints" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="field">
          <label for="sceneControlNet">ControlNet Model</label>
          <select id="sceneControlNet" v-model="controlNet" :disabled="source === 'none'">
            <option v-if="!controlNets.length" value="">No ControlNet models found</option>
            <option v-for="m in controlNets" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
      </div>

      <div class="row">
        <button type="button" class="outlined small" @click="refreshStatus">Refresh Provider</button>
        <label class="switch">
          <input v-model="advanced" type="checkbox" />
          <span class="track"></span>
          Advanced
        </label>
      </div>

      <div v-if="advanced" class="advanced-panel">
        <div class="grid">
          <div class="field">
            <label for="sceneWidth">Width</label>
            <input id="sceneWidth" v-model.number="width" type="number" />
          </div>
          <div class="field">
            <label for="sceneHeight">Height</label>
            <input id="sceneHeight" v-model.number="height" type="number" />
          </div>
          <div class="field">
            <label for="sceneSteps">Steps</label>
            <input id="sceneSteps" v-model.number="steps" type="number" />
          </div>
        </div>

        <div class="grid" style="margin-top: 12px">
          <div class="field">
            <label for="sceneCfg">CFG</label>
            <input id="sceneCfg" v-model.number="cfg" type="number" step="0.1" />
          </div>
          <div class="field">
            <label for="sceneSampler">Sampler</label>
            <input id="sceneSampler" v-model="sampler" />
          </div>
          <div class="field">
            <label for="sceneScheduler">Scheduler</label>
            <input id="sceneScheduler" v-model="scheduler" />
          </div>
        </div>

        <div class="grid" style="margin-top: 12px">
          <label class="switch">
            <input id="sceneEnableClipSkip" v-model="enableClipSkip" type="checkbox" />
            <span class="track"></span>
            Enable CLIPSkip
          </label>
          <div class="field">
            <label for="sceneClipSkip">CLIPSkip Value</label>
            <input id="sceneClipSkip" v-model.number="clipSkip" type="number" step="1" />
          </div>
          <label class="switch">
            <input id="sceneUseSeparateVae" v-model="useSeparateVae" type="checkbox" />
            <span class="track"></span>
            Use Separate VAE
          </label>
        </div>

        <div class="grid" style="margin-top: 12px">
          <div class="field">
            <label for="sceneSeparateVae">Separate VAE</label>
            <select id="sceneSeparateVae" v-model="separateVae">
              <option value="">Auto / none</option>
              <option v-for="v in vaes" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
          <div></div>
          <div></div>
        </div>
      </div>

      <div class="row">
        <button type="button" class="filled" :disabled="generating" @click="generate">
          {{ generating ? 'Generating...' : 'Generate Scene' }}
        </button>
      </div>
    </section>

    <section class="card">
      <label>Scene Job Status</label>
      <pre>{{ jobStatus }}</pre>
    </section>

    <section class="card">
      <label>Result</label>
      <div class="mask-state">{{ resultState }}</div>
      <div class="img-wrap" style="margin-top: 10px">
        <img v-if="resultUrl" :src="resultUrl" alt="Scene output" />
      </div>
    </section>
  </section>
</template>
