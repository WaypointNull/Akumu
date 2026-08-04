<script setup>
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  rows: { type: Number, default: 4 },
  modelValue: { type: [String, Number], default: '' }
});

const emit = defineEmits(['update:modelValue', 'blur', 'focus']);

function onInput(event) {
  emit('update:modelValue', event.target.value);
}
</script>

<template>
  <textarea
    :placeholder="placeholder"
    :disabled="disabled"
    :rows="rows"
    :value="modelValue"
    :class="
      cn(
        'flex min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
    v-bind="$attrs"
    @input="onInput"
  />
</template>
