<script setup>
import { ref, onMounted } from 'vue';
import { Moon, Sun, Heart, TriangleAlert, Sparkles, CircleAlert, FileText } from '@lucide/vue';
import { api } from './api.js';
import SinglePromptPanel from './components/SinglePromptPanel.vue';
import BuyMeACoffeeIcon from './components/BuyMeACoffeeIcon.vue';
import Button from './components/ui/Button.vue';
import Card from './components/ui/Card.vue';
import CardHeader from './components/ui/CardHeader.vue';
import CardTitle from './components/ui/CardTitle.vue';
import CardDescription from './components/ui/CardDescription.vue';
import CardContent from './components/ui/CardContent.vue';
import Toaster from './components/ui/toast/Toaster.vue';
import { useToast } from './lib/toast.js';

const { toast } = useToast();
const defaults = ref({});
const isDark = ref(true);

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/waypointnull';

function openBuyMeACoffee() {
  window.open(BUY_ME_A_COFFEE_URL, '_blank', 'noopener,noreferrer');
}

onMounted(async () => {
  try {
    const data = await api.health();
    defaults.value = data.defaults || {};
  } catch (err) {
    toast({
      variant: 'destructive',
      title: 'Backend unreachable',
      description: err.message || 'Failed to load defaults.'
    });
  }
});

function onPanelError(msg) {
  if (!msg) return;
  toast({ variant: 'destructive', title: 'Something went wrong', description: msg });
}

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle('dark', isDark.value);
  try {
    localStorage.setItem('akumu-theme', isDark.value ? 'dark' : 'light');
  } catch (e) {}
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <Button
      variant="outline"
      size="icon"
      class="fixed right-4 top-4 z-50"
      :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="toggleTheme"
    >
      <Sun v-if="isDark" />
      <Moon v-else />
    </Button>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <section class="mb-12 flex flex-col items-center text-center">
        <div class="relative">
          <div
            class="pointer-events-none absolute -inset-10 rounded-full bg-primary/15 blur-3xl"
            aria-hidden="true"
          ></div>
          <img
            src="/akumu.png"
            alt="Akumu logo"
            class="logo-duotone relative h-28 w-28 object-contain drop-shadow-lg"
          />
        </div>
        <p class="mt-6 text-sm text-muted-foreground">Booru Prompt Studio</p>
        <div
          class="mt-5 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground"
        >
          <span class="status-dot online"></span>
          Local · No cloud · No accounts
        </div>
        <h1 class="mt-6 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Describe the image like a normal person.
          <span class="text-primary">Get Danbooru tags back.</span>
        </h1>
        <p class="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          No tag autocomplete. No tag soup. Akumu asks your local Ollama model for tags, fact-checks every one against
          ~320,000 real Danbooru tags, and hands you a clean prompt.
        </p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <span class="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1.5">
            <Sparkles class="h-3.5 w-3.5 text-primary" />
            Pass 1 · LLM makes tag soup
          </span>
          <span class="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1.5">
            <CircleAlert class="h-3.5 w-3.5 text-amber-500" />
            Pass 2 · Akumu stops trusting it
          </span>
          <span class="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1.5">
            <FileText class="h-3.5 w-3.5" />
            Pass 3 · Clean GLOBAL sections
          </span>
        </div>
      </section>

      <SinglePromptPanel :defaults="defaults" @error="onPanelError" />

      <Card class="mt-6">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-lg">
            <TriangleAlert class="h-5 w-5 text-primary" />
            Known issues
          </CardTitle>
          <CardDescription>Akumu is honest about its weaknesses.</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div
            class="space-y-1 rounded-md border bg-muted/40 p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
          >
            <p class="text-sm font-semibold">Characters</p>
            <p class="text-sm leading-relaxed text-muted-foreground">
              Characters sometimes get destroyed by disambiguation. Use LoRAs and manually reject any wrong tag.
            </p>
          </div>
          <div
            class="space-y-1 rounded-md border bg-muted/40 p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
          >
            <p class="text-sm font-semibold">Scenes &amp; lighting</p>
            <p class="text-sm leading-relaxed text-muted-foreground">
              Scenes and lighting are a hard task. Use the tag disambiguation or manually insert your tags later.
            </p>
          </div>
          <div
            class="space-y-1 rounded-md border bg-muted/40 p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
          >
            <p class="text-sm font-semibold">Model coverage</p>
            <p class="text-sm leading-relaxed text-muted-foreground">
              This was only tested on Qwen 2.5. I cannot attest personally for any other models. Good luck
            </p>
          </div>
        </CardContent>
      </Card>
    </main>

    <footer class="border-t">
      <div class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:items-start">
          <p class="text-xs text-muted-foreground">Akumu · runs 100% locally via Ollama</p>
          <div class="flex flex-col items-center gap-2">
            <p class="text-xs text-muted-foreground">Tired of having money?</p>
            <Button variant="outline" size="sm" class="gap-2" @click="openBuyMeACoffee">
              <BuyMeACoffeeIcon class="h-4 w-4 text-amber-400" />
              I'll gladly take it!
            </Button>
          </div>
          <div class="flex justify-center sm:justify-end">
            <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Heart class="h-3 w-3 fill-primary text-primary" />
              Made from my deepest nightmares
            </p>
          </div>
        </div>
      </div>
    </footer>

    <Toaster />
  </div>
</template>
