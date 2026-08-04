<script setup>
import { inject } from 'vue';
import { cn } from '@/lib/utils';
import { TabsKey } from '@/lib/tabs';

const props = defineProps({
  value: { type: String, required: true },
  disabled: { type: Boolean, default: false },
  class: { type: String, default: '' }
});

const context = inject(TabsKey, null);

function isActive() {
  return context && context.activeValue.value === props.value;
}
</script>

<template>
  <button
    type="button"
    role="tab"
    :aria-selected="isActive()"
    :data-state="isActive() ? 'active' : 'inactive'"
    :disabled="disabled"
    :class="
      cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        props.class
      )
    "
    @click="context && context.setValue(value)"
  >
    <slot />
  </button>
</template>
