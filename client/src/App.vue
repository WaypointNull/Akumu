<script setup>
import { ref, onMounted } from 'vue';
import { api } from './api.js';
import SinglePromptPanel from './components/SinglePromptPanel.vue';
import RegionalPainterPanel from './components/RegionalPainterPanel.vue';

const activeTab = ref('single');
const error = ref('');
const defaults = ref({});

onMounted(async () => {
  try {
    const data = await api.health();
    defaults.value = data.defaults || {};
  } catch (err) {
    error.value = err.message || 'Failed to load defaults.';
  }
});

function setError(msg) {
  error.value = msg || '';
}
</script>

<template>
  <main class="wrap">
    <header class="hero">
      <img class="hero-logo" src="/akumu.png" alt="Akumu" />
      <div>
        <h1>Akumu</h1>
        <p class="muted">
          Turn natural language into booru-style prompt tags with Ollama — translate, resolve against the danbooru tag
          list, and format for image generation.
        </p>
      </div>
    </header>

    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>

    <nav class="tabs" aria-label="Workflow mode">
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'single' }" @click="activeTab = 'single'">
        Single Prompt
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'regional' }"
        @click="activeTab = 'regional'"
      >
        Regional Painter
      </button>
    </nav>

    <SinglePromptPanel v-show="activeTab === 'single'" :defaults="defaults" @error="setError" />
    <RegionalPainterPanel v-show="activeTab === 'regional'" :defaults="defaults" @error="setError" />
  </main>
</template>
