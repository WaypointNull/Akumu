<script setup>
import { ref, provide, watch } from 'vue';
import { cn } from '@/lib/utils';
import { TabsKey } from '@/lib/tabs';

const props = defineProps({
  class: { type: String, default: '' },
  defaultValue: { type: String, default: '' },
  modelValue: { type: String, default: undefined }
});

const emit = defineEmits(['update:modelValue']);

const activeValue = ref(props.modelValue !== undefined ? props.modelValue : props.defaultValue);

watch(
  () => props.modelValue,
  (value) => {
    if (value !== undefined) activeValue.value = value;
  }
);

function setValue(value) {
  activeValue.value = value;
  emit('update:modelValue', value);
}

provide(TabsKey, { activeValue, setValue });
</script>

<template>
  <div :class="cn('flex flex-col gap-2', props.class)"><slot /></div>
</template>
