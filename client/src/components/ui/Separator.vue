<script setup>
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: String, default: '' },
  orientation: {
    type: String,
    default: 'horizontal',
    validator: (v) => ['horizontal', 'vertical'].includes(v)
  },
  decorative: { type: Boolean, default: true }
});
</script>

<template>
  <hr
    :role="decorative ? 'none' : 'separator'"
    :aria-orientation="orientation"
    :class="cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', props.class)"
    v-bind="$attrs"
  />
</template>
