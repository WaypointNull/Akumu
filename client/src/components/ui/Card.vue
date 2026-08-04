<script setup>
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: String, default: '' }
});
</script>

<template>
  <div
    :class="
      cn(
        'rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md',
        props.class
      )
    "
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
