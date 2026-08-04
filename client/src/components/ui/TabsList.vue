<script setup>
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: String, default: '' }
});
</script>

<template>
  <div
    role="tablist"
    :class="
      cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', props.class)
    "
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
