<script setup>
import { ref, watch, computed, onMounted } from 'vue';
import { api } from '../api.js';
import TagReviewList from './TagReviewList.vue';

const props = defineProps({
  defaults: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['error']);

const modelTranslate = ref('');
const models = ref([]);
const ollamaState = ref('checking');
const naturalLanguage = ref('');
const loraInput = ref('');
const running = ref(false);
const pass1 = ref('');
const pass2 = ref('');
const pass3 = ref('');
const finalText = ref('');
const promptTags = ref([]);
const reviewItems = ref([]);
const loraForReview = ref('');

const modelOptions = computed(() => {
  const list = models.value.slice();
  if (modelTranslate.value && !list.includes(modelTranslate.value)) list.push(modelTranslate.value);
  return list;
});

const ollamaLabel = computed(() => {
  if (ollamaState.value === 'checking') return 'Checking Ollama...';
  if (ollamaState.value === 'offline') return 'Ollama offline';
  return models.value.length
    ? `Ollama online · ${models.value.length} model${models.value.length === 1 ? '' : 's'}`
    : 'Ollama online · no models';
});

watch(
  () => props.defaults,
  (d) => {
    if (!modelTranslate.value) modelTranslate.value = d.modelTranslate || '';
  },
  { immediate: true }
);

async function loadModels() {
  ollamaState.value = 'checking';
  try {
    const data = await api.llmStatus();
    models.value = data.models || [];
    ollamaState.value = data.reachable ? 'online' : 'offline';
  } catch {
    models.value = [];
    ollamaState.value = 'offline';
  }
}

onMounted(loadModels);

async function run() {
  emit('error', '');
  if (!naturalLanguage.value.trim()) {
    emit('error', 'Natural language input is required.');
    return;
  }

  running.value = true;
  pass1.value = '';
  pass2.value = '';
  pass3.value = '';
  finalText.value = '';
  promptTags.value = [];
  reviewItems.value = [];

  try {
    const data = await api.run({
      naturalLanguage: naturalLanguage.value,
      loraInput: loraInput.value,
      modelTranslate: modelTranslate.value
    });
    pass1.value = data.passes.translate || '';
    pass2.value = data.passes.validate || '';
    pass3.value = data.passes.format || '';
    finalText.value = data.final.finalText || '';
    promptTags.value = (data.final.promptTags || []).slice();
    loraForReview.value = loraInput.value;
    reviewItems.value = (data.review || []).slice();
  } catch (err) {
    emit('error', err.message || 'Unexpected error');
  } finally {
    running.value = false;
  }
}

async function applyReviewEdit(original, replacement) {
  const idx = promptTags.value.indexOf(original);
  const next = promptTags.value.filter((t) => t !== original);
  if (idx !== -1) next.splice(idx, 0, ...replacement);
  promptTags.value = next;

  try {
    const data = await api.format(promptTags.value, loraForReview.value);
    finalText.value = data.finalText || '';
  } catch (err) {
    emit('error', err.message || 'Failed to re-format.');
  }

  reviewItems.value = reviewItems.value.filter((i) => i.original !== original);
}

function keepOriginal(original) {
  reviewItems.value = reviewItems.value.filter((i) => i.original !== original);
}

async function copy() {
  const text = finalText.value || '';
  if (!text.trim()) {
    emit('error', 'No final output to copy yet.');
    return;
  }
  await navigator.clipboard.writeText(text);
}
</script>

<template>
  <section class="panel">
    <section class="card">
      <div class="model-grid">
        <div class="field">
          <label for="modelTranslate">Model (Translate)</label>
          <select id="modelTranslate" v-model="modelTranslate">
            <option v-if="!modelOptions.length" value="">No models available</option>
            <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <div class="field">
          <label for="ollamaStatus">Ollama</label>
          <div id="ollamaStatus" class="status-pill" :class="ollamaState">
            <span class="status-dot"></span>
            <span>{{ ollamaLabel }}</span>
          </div>
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <button type="button" class="outlined" :disabled="ollamaState === 'checking'" @click="loadModels">
            Refresh Models
          </button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="field">
        <label for="naturalLanguage">Natural Language Input</label>
        <textarea
          id="naturalLanguage"
          v-model="naturalLanguage"
          placeholder="Example: Anime image featuring Neeko from League of Legends, from above, sitting on a rock in a jungle, innocent confused expression, leaning back, looking at viewer."
        ></textarea>
      </div>
      <div class="field">
        <label for="loraInput">LoRA Triggers (optional, verbatim into LoRA Triggers section)</label>
        <textarea
          id="loraInput"
          v-model="loraInput"
          placeholder="(Palworld_Sekhmet, short hair, bob cut, blue hair, red eyes, cat ears, cat tail, cat girl, furry female, choker, hair ornament, dress, navel cutout, detached sleeves, blue_pantyhose, paws, claws)"
        ></textarea>
      </div>
      <div class="row">
        <button type="button" class="filled" :disabled="running" @click="run">
          {{ running ? 'Running...' : 'Run 3-Pass Workflow' }}
        </button>
        <button type="button" class="outlined" @click="copy">Copy Final Output</button>
      </div>
    </section>

    <section class="card outputs">
      <div>
        <label>Pass 1 - Translate</label>
        <pre>{{ pass1 }}</pre>
      </div>
      <div>
        <label>Pass 2 - Validate</label>
        <pre>{{ pass2 }}</pre>
      </div>
    </section>

    <section class="card">
      <label>Pass 3 - Boilerplate Format (deterministic, no LLM)</label>
      <pre>{{ pass3 }}</pre>
    </section>

    <section v-if="reviewItems.length" class="card">
      <label>Tag Review</label>
      <p class="muted">
        These tags couldn't be confidently resolved. Keep the original, pick a candidate, or remove it.
      </p>
      <TagReviewList
        :items="reviewItems"
        @pick="applyReviewEdit"
        @keep="keepOriginal"
        @remove="applyReviewEdit($event, [])"
      />
    </section>

    <section class="card">
      <label>Final Output</label>
      <pre>{{ finalText }}</pre>
    </section>
  </section>
</template>
