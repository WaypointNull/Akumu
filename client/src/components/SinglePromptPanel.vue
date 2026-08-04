<script setup>
import { ref, watch, computed, onMounted } from 'vue';
import { Loader2, Sparkles, Copy, Check, RefreshCw, ListChecks, Bot, ShieldCheck, FileText } from '@lucide/vue';
import { api } from '../api.js';
import TagReviewList from './TagReviewList.vue';
import Button from './ui/Button.vue';
import Card from './ui/Card.vue';
import CardHeader from './ui/CardHeader.vue';
import CardTitle from './ui/CardTitle.vue';
import CardDescription from './ui/CardDescription.vue';
import CardContent from './ui/CardContent.vue';
import Label from './ui/Label.vue';
import Textarea from './ui/Textarea.vue';
import Select from './ui/Select.vue';
import Tabs from './ui/Tabs.vue';
import TabsList from './ui/TabsList.vue';
import TabsTrigger from './ui/TabsTrigger.vue';
import TabsContent from './ui/TabsContent.vue';
import { useToast } from '@/lib/toast.js';

const props = defineProps({
  defaults: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['error']);
const { toast } = useToast();

const modelTranslate = ref('');
const models = ref([]);
const ollamaState = ref('checking');
const naturalLanguage = ref('');
const loraInput = ref('');
const running = ref(false);
const copied = ref(false);
const mode = ref('strict');
const pass1 = ref('');
const pass2 = ref('');
const pass3 = ref('');
const finalText = ref('');
const promptTags = ref([]);
const reviewItems = ref([]);
const loraForReview = ref('');

const modelOptions = computed(() => {
  const list = models.value.slice();
  // WORKAROUND: keep the selected (often the persisted default) model in the dropdown even when it's not
  // in Ollama's installed list, so the default survives an Ollama model mismatch.
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

const modeOptions = [
  { label: 'Strict', value: 'strict', description: 'Every tag is fact-checked against the tag list.' },
  { label: 'Creative', value: 'creative', description: 'The AI may invent tags; you approve each one.' }
];

const modeDescription = computed(() => {
  const found = modeOptions.find((o) => o.value === mode.value);
  return found ? found.description : '';
});

const pipelineSteps = computed(() => [
  {
    key: 'pass1',
    title: 'Pass 1 · Translate',
    detail: 'The LLM turns English into tag soup.',
    icon: Bot,
    text: pass1.value
  },
  {
    key: 'pass2',
    title: 'Pass 2 · Validate',
    detail: 'Akumu stops trusting the LLM and fact-checks every tag.',
    icon: ShieldCheck,
    text: pass2.value
  },
  {
    key: 'pass3',
    title: 'Pass 3 · Format',
    detail: 'Deterministic boilerplate → GLOBAL_POSITIVE / GLOBAL_NEGATIVE.',
    icon: FileText,
    text: pass3.value
  }
]);

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
  if (!naturalLanguage.value.trim()) {
    toast({
      variant: 'warning',
      title: 'Nothing to translate',
      description: 'Believe it or not, you need to actually describe something first.'
    });
    return;
  }

  running.value = true;
  copied.value = false;
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
      modelTranslate: modelTranslate.value,
      mode: mode.value
    });
    pass1.value = data.passes.translate || '';
    pass2.value = data.passes.validate || '';
    pass3.value = data.passes.format || '';
    finalText.value = data.final.finalText || '';
    promptTags.value = (data.final.promptTags || []).slice();
    loraForReview.value = loraInput.value;
    reviewItems.value = (data.review || []).slice();

    if (data.review && data.review.length) {
      toast({
        variant: 'warning',
        title: `${data.review.length} tag${data.review.length === 1 ? '' : 's'} need a decision`,
        description: "Akumu wasn't sure about these. Check the Tag Review section below."
      });
    }
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

  toast({
    variant: 'success',
    title: replacement.length ? 'Tag replaced' : 'Tag removed',
    description: replacement.length
      ? `${original} → ${replacement.join(', ')}`
      : `${original} was removed from the output.`
  });
}

function keepOriginal(original) {
  reviewItems.value = reviewItems.value.filter((i) => i.original !== original);
  toast({ variant: 'success', title: 'Tag kept', description: `${original} stays in the output as-is.` });
}

async function copy() {
  const text = finalText.value || '';
  if (!text.trim()) {
    toast({ variant: 'warning', title: 'Nothing to copy', description: 'Generate a prompt first.' });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1600);
    toast({ variant: 'success', title: 'Copied to clipboard' });
  } catch {
    toast({ variant: 'destructive', title: 'Copy failed', description: 'Your browser blocked clipboard access.' });
  }
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-5">
    <div class="space-y-6 lg:col-span-3">
      <Card>
        <CardHeader>
          <CardTitle>Model</CardTitle>
          <CardDescription>The only pass that touches a model</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
            <div class="space-y-2">
              <Label for="modelTranslate">Translate model</Label>
              <Select
                id="modelTranslate"
                v-model="modelTranslate"
                :options="modelOptions"
                :disabled="modelOptions.length === 0"
                placeholder="No models available"
              />
            </div>
            <div class="flex items-center gap-2">
              <div
                class="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                :class="{ 'text-foreground': ollamaState !== 'offline' }"
              >
                <span class="status-dot" :class="ollamaState"></span>
                <span class="whitespace-nowrap">{{ ollamaLabel }}</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                :disabled="ollamaState === 'checking'"
                aria-label="Refresh models"
                title="Refresh models"
                @click="loadModels"
              >
                <RefreshCw :class="{ 'animate-spin': ollamaState === 'checking' }" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Describe the image</CardTitle>
          <CardDescription>Like a normal human being — the LLM deals with the tag soup</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <Label for="naturalLanguage">Image description</Label>
            <Textarea
              id="naturalLanguage"
              v-model="naturalLanguage"
              :rows="6"
              placeholder="Describe the image in plain English. Example: a knight standing at the edge of a dark forest at dusk, torch in hand, looking into the trees."
            />
          </div>
          <div class="space-y-2">
            <Label for="loraInput">
              LoRA triggers
              <span class="text-muted-foreground font-normal">(optional — inserted verbatim)</span>
            </Label>
            <Textarea
              id="loraInput"
              v-model="loraInput"
              :rows="3"
              placeholder="Paste LoRA trigger lines here. Example: (my_character, short hair, red eyes, hat)."
            />
          </div>
          <div class="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
            <Button class="w-full sm:w-auto" size="lg" :disabled="running" @click="run">
              <Loader2 v-if="running" class="animate-spin" />
              <Sparkles v-else />
              {{ running ? 'Working...' : 'Generate tags' }}
            </Button>
            <div class="grid w-full grid-cols-[1fr_6fr] items-center gap-x-2 gap-y-1.5 sm:w-72">
              <Label for="generationMode">Mode:</Label>
              <Select id="generationMode" v-model="mode" :options="modeOptions">
                <template #value="{ value }">
                  {{ (modeOptions.find((o) => o.value === value) || {}).label || value }}
                </template>
              </Select>
              <p class="col-span-2 text-xs text-muted-foreground">{{ modeDescription }}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <div class="space-y-6 lg:col-span-2 lg:flex lg:flex-col">
      <Card class="lg:flex lg:flex-1 lg:flex-col lg:min-h-0">
        <CardHeader class="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle class="text-lg">Output</CardTitle>
            <CardDescription>GLOBAL_POSITIVE / GLOBAL_NEGATIVE</CardDescription>
          </div>
          <Button variant="outline" size="sm" :disabled="!finalText" @click="copy">
            <Check v-if="copied" class="text-primary" />
            <Copy v-else />
            {{ copied ? 'Copied' : 'Copy' }}
          </Button>
        </CardHeader>
        <CardContent class="lg:flex lg:flex-1 lg:flex-col lg:min-h-0">
          <Tabs defaultValue="final" class="lg:flex lg:flex-1 lg:flex-col lg:min-h-0">
            <TabsList class="grid w-full grid-cols-2">
              <TabsTrigger value="final">Final</TabsTrigger>
              <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            </TabsList>

            <TabsContent value="final" class="lg:flex lg:flex-1 lg:flex-col lg:min-h-0">
              <pre v-if="finalText" class="code-block overflow-auto lg:flex-1 lg:min-h-0">{{ finalText }}</pre>
              <div
                v-else
                class="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/30 px-4 py-10 text-center lg:flex-1"
              >
                <Sparkles class="h-5 w-5 text-muted-foreground" />
                <p class="text-sm font-medium">No output yet</p>
                <p class="text-xs text-muted-foreground">Describe something and hit generate.</p>
              </div>
            </TabsContent>

            <TabsContent value="pipeline" class="space-y-4 lg:min-h-0 lg:flex-1 overflow-y-auto">
              <div v-for="step in pipelineSteps" :key="step.key" class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <component :is="step.icon" class="h-4 w-4 text-primary" />
                  <p class="text-sm font-medium">{{ step.title }}</p>
                </div>
                <p class="text-xs text-muted-foreground">{{ step.detail }}</p>
                <pre v-if="step.text" class="code-block max-h-36 overflow-auto">{{ step.text }}</pre>
                <div
                  v-else
                  class="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground"
                >
                  Not run yet
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  </div>

  <Card v-if="reviewItems.length" class="mt-6">
    <CardHeader>
      <CardTitle class="flex items-center gap-2 text-lg">
        <ListChecks class="h-5 w-5 text-primary" />
        Tag Review
      </CardTitle>
      <CardDescription>
        Anything sketchy ends up here. Keep it, pick a candidate, or remove it — you decide.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <TagReviewList
        :items="reviewItems"
        @pick="applyReviewEdit"
        @keep="keepOriginal"
        @remove="applyReviewEdit($event, [])"
      />
    </CardContent>
  </Card>
</template>
