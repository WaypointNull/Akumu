<script setup>
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: String, default: '' }
});
</script>

<template>
  <h3 :class="cn('text-xl font-semibold leading-none tracking-tight', props.class)" v-bind="$attrs"><slot /></h3>
</template>
