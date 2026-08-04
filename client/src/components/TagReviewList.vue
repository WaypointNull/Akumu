<script setup>
import { Check, X } from '@lucide/vue';
import Button from './ui/Button.vue';
import Badge from './ui/Badge.vue';
import Separator from './ui/Separator.vue';

defineProps({
  items: { type: Array, default: () => [] }
});

const emit = defineEmits(['pick', 'keep', 'remove']);

function suggestionsFor(item) {
  const suggestions = [];
  for (const t of item.candidates || []) suggestions.push({ tag: t, kind: 'candidate' });
  for (const t of item.decomposed || []) suggestions.push({ tag: t, kind: 'part' });
  return suggestions;
}
</script>

<template>
  <div class="divide-y divide-border">
    <div
      v-for="item in items"
      :key="item.original"
      class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex min-w-0 items-center gap-2">
        <code class="truncate font-mono text-sm font-medium" :title="item.status">{{ item.original }}</code>
        <Badge variant="secondary">{{ item.status }}</Badge>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <template v-if="suggestionsFor(item).length">
          <Button
            v-for="s in suggestionsFor(item)"
            :key="s.tag"
            variant="outline"
            size="sm"
            class="font-mono"
            @click="emit('pick', item.original, [s.tag])"
          >
            {{ s.tag }}
            <span v-if="s.kind === 'part'" class="text-muted-foreground">· part</span>
          </Button>
        </template>
        <span v-else class="text-xs text-muted-foreground">No candidates</span>

        <Separator orientation="vertical" class="mx-1 hidden h-4 sm:block" />

        <Button variant="ghost" size="sm" @click="emit('keep', item.original)">
          <Check class="text-primary" />
          Keep
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="text-destructive hover:text-destructive"
          @click="emit('remove', item.original)"
        >
          <X />
          Remove
        </Button>
      </div>
    </div>
  </div>
</template>
