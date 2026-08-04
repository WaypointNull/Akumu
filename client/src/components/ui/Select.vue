<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { cn } from '@/lib/utils';
import { ChevronDown } from '@lucide/vue';

const props = defineProps({
  class: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:modelValue']);
const open = ref(false);
const rootRef = ref(null);

function onDocumentClick(event) {
  if (!rootRef.value || rootRef.value.contains(event.target)) return;
  open.value = false;
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
});

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) open.value = false;
  }
);

function toggle() {
  if (!props.disabled) open.value = !open.value;
}

function selectOption(value) {
  emit('update:modelValue', value);
  open.value = false;
}

const triggerStyles = computed(() =>
  cn(
    'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
    props.class
  )
);

const contentStyles = computed(() =>
  cn(
    'absolute z-50 mt-1 min-w-[8rem] w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
    'animate-scale-in'
  )
);

const itemStyles = cn(
  'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground'
);
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <button
      type="button"
      role="combobox"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :disabled="disabled"
      :class="triggerStyles"
      @click="toggle"
    >
      <span class="truncate text-left">
        <slot name="value" :value="modelValue">{{ modelValue }}</slot>
        <span v-if="modelValue === ''" class="text-muted-foreground">{{ placeholder }}</span>
      </span>
      <ChevronDown
        class="h-4 w-4 shrink-0 text-muted-foreground transition-transform"
        :class="{ 'rotate-180': open }"
      />
    </button>

    <div v-if="open" role="listbox" :class="contentStyles">
      <div class="p-1">
        <slot>
          <div
            v-for="option in options"
            :key="option.value || option"
            role="option"
            :class="itemStyles"
            @click="selectOption(option.value || option)"
          >
            {{ option.label || option }}
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>
