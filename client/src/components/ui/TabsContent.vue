<script setup>
import { computed, inject } from 'vue';
import { cn } from '@/lib/utils';
import { TabsKey } from '@/lib/tabs';

const props = defineProps({
  value: { type: String, required: true },
  class: { type: String, default: '' }
});

const context = inject(TabsKey, null);
const isActive = computed(() => context && context.activeValue.value === props.value);
</script>

<template>
  <div
    v-show="isActive"
    role="tabpanel"
    :class="
      cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
