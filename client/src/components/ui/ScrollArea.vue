<script setup>
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: String, default: '' },
  orientation: {
    type: String,
    default: 'vertical',
    validator: (v) => ['vertical', 'horizontal'].includes(v)
  }
});
</script>

<template>
  <div :class="cn('relative overflow-hidden', props.class)" v-bind="$attrs">
    <slot />
  </div>
</template>
