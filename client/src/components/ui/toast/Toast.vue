<script setup>
import { computed } from 'vue';
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from '@lucide/vue';
import { cn } from '@/lib/utils';
import { dismiss } from '@/lib/toast';

const props = defineProps({
  toast: { type: Object, required: true }
});

const iconMap = {
  default: Info,
  success: CheckCircle2,
  destructive: CircleAlert,
  warning: TriangleAlert
};

const Icon = computed(() => iconMap[props.toast.variant] || Info);

const iconStyles = computed(() =>
  cn(
    'h-5 w-5 shrink-0',
    props.toast.variant === 'success' && 'text-emerald-500',
    props.toast.variant === 'destructive' && 'text-destructive',
    props.toast.variant === 'warning' && 'text-amber-500',
    props.toast.variant === 'default' && 'text-muted-foreground'
  )
);
</script>

<template>
  <div
    role="status"
    class="pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border bg-background p-4 shadow-lg animate-scale-in"
  >
    <component :is="Icon" :class="iconStyles" />
    <div class="flex-1 space-y-1">
      <p v-if="toast.title" class="text-sm font-semibold leading-none">{{ toast.title }}</p>
      <p v-if="toast.description" class="text-sm leading-relaxed text-muted-foreground">{{ toast.description }}</p>
    </div>
    <button
      type="button"
      aria-label="Dismiss notification"
      class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      @click="dismiss(toast.id)"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
</template>
